"""
roadtrip_focus.py — Roadtrip Focus: cross-country focus timer.

Extends the QuotePomodoro pattern from flightproductivity.py:
  - Tkinter threading via root.after(0, ...) for thread-safe UI updates
  - Dark theme, presets, pause/resume, beeps/notifications
Adds:
  - Road-trip metaphor (route = duration), intent field
  - Spatial progress: endless Slow Roads-style cruise — a procedurally
    winding road through parallax hill layers with scrolling roadside
    scenery (trees/poles). World scrolls; car stays fixed near the
    bottom-center with a subtle engine bob. Pure tk.Canvas, no assets.
  - Continuous ambient road hum (sounds.py) with quiet default + fallback
  - Trip Log (local sessions.json) + vault sync hook (optional import)

Run:  python roadtrip_focus.py
Deps: tkinter (stdlib), plyer (optional), winsound (Windows), numpy+sounddevice (optional)
"""
from __future__ import annotations

import json
import argparse
import math
import random
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
import threading
import time
import tkinter as tk
from tkinter import ttk

try:
    from plyer import notification
except ImportError:
    notification = None

try:
    import winsound
except ImportError:
    winsound = None

import sessions
import sounds

# ---------------------------------------------------------------------------
# Quotes — road-trip flavored + carry-overs from the original
# ---------------------------------------------------------------------------
QUOTES = [
    "Focus is a muscle; train it every day.",
    "Small consistent sessions beat long distracted ones.",
    "Deep work now, freedom later.",
    "Discipline is choosing what you want most.",
    "One mile at a time.",
    "Silence the noise, follow the road.",
    "You don't rise to your goals, you fall to your systems.",
    "Future you is grateful for this focus.",
    "Less scrolling, more solving.",
    "Progress, not perfection.",
    "The highway rewards the steady driver.",
    "Keep your eyes on the road — the destination will come.",
    "Miles are earned, not given.",
    "Stay in your lane. Finish what you started.",
]

# Route = (label, minutes, tagline)
ROUTES = [
    ("Coastal Hop", 25, "Quick sprint — one focused stretch"),
    ("Desert Stretch", 50, "Deep work block — stay with it"),
    ("Mountain Pass", 90, "Long haul — settle in"),
    ("Cross-Country", 120, "Marathon — the scenic way"),
]

# Canvas constants
CANVAS_W = 620
CANVAS_H = 150
ROAD_COLOR = "#1a1a1a"
ROAD_EDGE = "#2a2a2a"
LANE_COLOR = "#00ff88"
SHOULDER_COLOR = "#3a3a3a"
CAR_COLOR = "#ffcc33"
MARKER_COLOR = "#888888"
LANDMARK_COLORS = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#a78bfa"]
# Slow Roads vibe — hill/terrain/scenery palette (dark, low-saturation)
HILL_FAR = "#0d1612"
HILL_MID = "#132019"
HILL_NEAR = "#1a2e22"
HILL_FAR_LINE = "#16261d"
TREE_COLOR = "#1c3a2a"
TREE_COLOR_2 = "#234832"
TREE_TRUNK = "#2b1a0e"
POLE_COLOR = "#3a3a3a"
BUSH_COLOR = "#1e3320"
ROCK_COLOR = "#2a2a2e"
SKY_TOP = "#060a0e"
SKY_HORIZON = "#0e1e18"
FOG_COLOR = "#0a1410"
SCENERY_SPEED = 18.0  # world units per second; road scroll speed

# Route biomes — subtle palette shift per route (Slow Roads vibe)
ROUTE_BIOMES = {
    "Coastal Hop":   {"sky_top": (6, 12, 18), "sky_hor": (16, 28, 34), "hill_far": "#0d1618", "hill_mid": "#14302a", "hill_near": "#1e3a32", "tree_mul": 0.6, "bush_mul": 0.3},
    "Desert Stretch":{"sky_top": (12, 10, 8),  "sky_hor": (28, 24, 18), "hill_far": "#1a1510", "hill_mid": "#2a2418", "hill_near": "#3a3020", "tree_mul": 0.25,"bush_mul": 0.7},
    "Mountain Pass": {"sky_top": (5, 8, 12),   "sky_hor": (12, 18, 16), "hill_far": "#0a1210", "hill_mid": "#102018", "hill_near": "#162618", "tree_mul": 1.2, "bush_mul": 0.4},
    "Cross-Country":{"sky_top": (6, 10, 14),  "sky_hor": (14, 30, 24), "hill_far": HILL_FAR, "hill_mid": HILL_MID, "hill_near": HILL_NEAR, "tree_mul": 0.9, "bush_mul": 0.5},
}

# UI theming — dark default (night) + light (screenshot)
THEME_DARK = {
    "bg": "#070a0e", "fg": "#e6f0e6", "muted": "#7a8a7a", "card": "#0f1419", "card2": "#141b22",
    "outline": "#1e2a33", "outline2": "#243242",
    "header_fg": "#00e69a", "phase_fg": "#9ab0a0", "accent": "#00e69a", "accent2": "#6ae8b5",
    "entry_bg": "#0f1419", "entry_fg": "#e6f0e6", "hint": "#5a6a5a",
    "btn_bg": "#141b22", "btn_fg": "#e6f0e6", "btn_outline": "#1e2a33", "stats": "#7a8a7a",
    "shadow": "#000000",
}
THEME = THEME_DARK  # dark-only

# Squircle helper — polished curved not fully round (r 6-10, not pill)
def _round_rect(canvas, x0, y0, x1, y1, r=10, fill="#0f1419", outline="#1e2a33", width=1):
    # clamp r
    r = min(r, (x1-x0)//3, (y1-y0)//3)
    # corners
    canvas.create_oval(x0, y0, x0+2*r, y0+2*r, fill=fill, outline=outline, width=width)
    canvas.create_oval(x1-2*r, y0, x1, y0+2*r, fill=fill, outline=outline, width=width)
    canvas.create_oval(x0, y1-2*r, x1-2*r if False else x0+2*r, y1, fill=fill, outline=outline, width=width)  # placeholder
    # Actually draw 4 corners + 2 rects + outline smooth
    # Use polygon for outline with smooth
    # Simplified: 4 ovals + 2 rects
    canvas.delete("round_bg")
    # This helper is used via _draw_rounded_bg wrapper that handles <Configure>
    pass

def _draw_rounded_bg(frame, r=10):
    # Make a Frame look squircle by putting a Canvas behind it that draws rounded rect
    try:
        parent = frame.master
        # Create canvas sibling if not exists
        if hasattr(frame, "_bg_canvas"):
            c = frame._bg_canvas
        else:
            c = tk.Canvas(parent, highlightthickness=0, bd=0, bg=THEME["bg"])
            c.place(in_=frame, x=0, y=0, relwidth=1, relheight=1)
            c.lower(frame)
            frame._bg_canvas = c
            def redraw(e=None):
                try:
                    w = frame.winfo_width(); h = frame.winfo_height()
                    if w < 10 or h < 10: return
                    c.delete("all")
                    # draw rounded rect
                    # 4 corners
                    r2 = min(r, 12)
                    # use create_oval + rectangle technique
                    c.create_rectangle(r2, 0, w-r2, h, fill=THEME["card"], outline="", tags="bg")
                    c.create_rectangle(0, r2, w, h-r2, fill=THEME["card"], outline="", tags="bg")
                    c.create_oval(0, 0, 2*r2, 2*r2, fill=THEME["card"], outline=THEME["outline"], width=1, tags="bg")
                    c.create_oval(w-2*r2, 0, w, 2*r2, fill=THEME["card"], outline=THEME["outline"], width=1, tags="bg")
                    c.create_oval(0, h-2*r2, 2*r2, h, fill=THEME["card"], outline=THEME["outline"], width=1, tags="bg")
                    c.create_oval(w-2*r2, h-2*r2, w, h, fill=THEME["card"], outline=THEME["outline"], width=1, tags="bg")
                    # edges
                    c.create_line(r2, 0, w-r2, 0, fill=THEME["outline"], width=1, tags="bg")
                    c.create_line(r2, h, w-r2, h, fill=THEME["outline"], width=1, tags="bg")
                    c.create_line(0, r2, 0, h-r2, fill=THEME["outline"], width=1, tags="bg")
                    c.create_line(w, r2, w, h-r2, fill=THEME["outline"], width=1, tags="bg")
                except Exception:
                    pass
            frame.bind("<Configure>", redraw)
            c.bind("<Configure>", redraw)
    except Exception:
        pass

CONFIG_PATH = Path.home() / ".roadtrip_focus" / "config.json"
def _load_config():
    try:
        if CONFIG_PATH.exists():
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"dark": True, "fullscreen": False}
def _save_config(cfg):
    try:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    except Exception:
        pass

# --- Fluid animation helpers (state-of-the-art, GH refs: motion/react-spring/anime/GSAP) ---
def _ease_out_cubic(t: float) -> float:
    return 1 - (1 - t) ** 3
def _ease_in_out_cubic(t: float) -> float:
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
def _ease_out_expo(t: float) -> float:
    return 1 if t >= 1 else 1 - 2 ** (-10 * t)
def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t
def _lerp_color(c1: str, c2: str, t: float) -> str:
    try:
        r1,g1,b1 = int(c1[1:3],16), int(c1[3:5],16), int(c1[5:7],16)
        r2,g2,b2 = int(c2[1:3],16), int(c2[3:5],16), int(c2[5:7],16)
        r = int(_lerp(r1,r2,t)); g = int(_lerp(g1,g2,t)); b = int(_lerp(b1,b2,t))
        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        return c2




def play_beep_start():
    if winsound and sys.platform.startswith("win"):
        try:
            winsound.Beep(800, 160)
        except Exception:
            pass
    else:
        print("\a", end="")


def play_beep_end():
    if winsound and sys.platform.startswith("win"):
        try:
            winsound.Beep(600, 220)
            winsound.Beep(450, 220)
        except Exception:
            pass
    else:
        print("\a\a", end="")


class RoadtripFocus:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Roadtrip Focus — Drive into deep work")
        self.root.geometry("680x620")
        self._config = _load_config()
        self.dark_mode = True  # dark-only
        self.is_fullscreen = False
        self._hud_frames: list[tk.Frame] = []
        self._pre_full_geo: str = ""
        palette = THEME
        self.root.configure(bg=palette["bg"])
        self.root.resizable(True, True)
        # allow fullscreen toggle
        self.root.bind("<F11>", lambda e: self.toggle_fullscreen())
        self.root.bind("<Escape>", lambda e: self._exit_fullscreen() if self.is_fullscreen else None)
        self.root.bind("<F>", lambda e: self.toggle_fullscreen())

        # state
        self.is_running = False
        self.remaining = 0
        self.total = 0
        self.started_at_iso = ""
        self.selected_route_name = ROUTES[0][0]
        self.selected_route_min = ROUTES[0][1]
        # Slow Roads endless-cruise state
        self.dist: float = 0.0
        self._dist_render: float = 0.0
        self._dist_vel: float = 0.0
        self._curve_seed: float = random.random()
        self._curve_params: tuple = self._make_curve_params(self._curve_seed)
        self.sound_enabled = tk.BooleanVar(value=False)
        self._sound_available = sounds.available()

        self.build_ui()
        self._apply_theme()
        self.refresh_trip_stats()
        self.draw_road(0.0)
        self._anim_job = None
        self._last_tick_time = time.monotonic()
        self._pack_state = {}
        # squircle polish — use highlight border for soft curved feel (r~8-10, not pill)
        # Tk Frame can't do true radius without Canvas, so we fake with highlight + padding
        for _fr in [getattr(self, "_intent_row", None), getattr(self, "_route_row", None), getattr(self, "_timer_row", None), getattr(self, "_ctrl", None), getattr(self, "_sound_row", None), getattr(self, "_presets", None), getattr(self, "_quote_wrap", None), getattr(self, "_stats_row", None), getattr(self, "_canvas_wrap", None)]:
            if _fr is not None:
                try:
                    _fr.configure(highlightthickness=1, highlightbackground=THEME["outline"], highlightcolor=THEME["outline"], bd=0, relief="flat")
                except Exception:
                    pass
        # fluid per-touch bindings (theme btn removed, fs now in HUD)
        # also bind control buttons after they exist (deferred)
        self.root.after(200, self._bind_control_fluid)
        if not hasattr(self, "_chrome_order") or not self._chrome_order:
            self._chrome_order = getattr(self, "_chrome_order", [])
        if not hasattr(self, "_pack_state"):
            self._pack_state = {}
        # smooth 60fps loop (fluid) — was 32ms
        self.root.after(200, self._schedule_anim)

    # ------------------------------------------------------------------
    # UI
    # ------------------------------------------------------------------
    def build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TButton", background="#222222", foreground="#ffffff", padding=6, borderwidth=0)
        style.map("TButton", background=[("active", "#333333")])
        style.configure("Horizontal.TProgressbar", troughcolor="#111111", background="#00ff88", bordercolor="#000000")
        style.configure("Road.TButton", background="#00ff88", foreground="#000000", padding=6, borderwidth=0)
        style.map("Road.TButton", background=[("active", "#00cc6a")])

        # --- Header ---
        header = tk.Frame(self.root, bg=palette["bg"] if 'palette' in locals() else ("#000000" if self.dark_mode else "#ededed"))
        header.pack(fill="x", pady=(12, 0))
        self._header = header
        # top bar — mac minimal, centered title + Fullscreen entry (HUD only in fullscreen, so topbar keeps entry)
        topbar = tk.Frame(header, bg=header["bg"])
        topbar.pack(fill="x", padx=16, pady=(4,0))
        tk.Label(topbar, text="ROADTRIP FOCUS", fg=THEME["header_fg"], bg=header["bg"], font=("Segoe UI", 18, "bold")).pack(side="left", expand=True)
        p_ = THEME
        self._fs_btn_top = tk.Button(topbar, text="Fullscreen", command=self.toggle_fullscreen,
                                     fg=p_["fg"], bg=p_["card"], activebackground=p_["card2"], bd=0, highlightthickness=1, highlightbackground=p_["outline"], highlightcolor=p_["outline"],
                                     padx=10, pady=4, font=("Segoe UI", 8, "bold"), cursor="hand2")
        self._fs_btn_top.pack(side="right")
        try: self._bind_fluid(self._fs_btn_top)
        except: pass
        tk.Label(header, text="pick a route · set your intent · drive", fg=THEME["muted"], bg=header["bg"], font=("Segoe UI", 8)).pack()
        self.phase_label = tk.Label(header, text="Ready to roll", fg=THEME["phase_fg"], bg=header["bg"], font=("Segoe UI", 10))
        self.phase_label.pack(pady=(4, 0))

        # --- Intent + Route row ---
        intent_row = tk.Frame(self.root, bg=palette["bg"] if 'palette' in locals() else ("#000000" if self.dark_mode else "#ededed"))
        self._intent_row = intent_row
        intent_row.pack(fill="x", padx=20, pady=(10, 6))

        tk.Label(intent_row, text="Intent", fg="#888888", bg="#000000", font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky="w")
        self.intent_var = tk.StringVar(value="")
        self.intent_entry = tk.Entry(
            intent_row, textvariable=self.intent_var, fg=THEME["entry_fg"], bg=THEME["entry_bg"],
            insertbackground=THEME["accent"], relief="flat", highlightthickness=1, highlightbackground=THEME["outline"], highlightcolor=THEME["accent"], bd=0, font=("Segoe UI", 10), width=44,
        )
        self.intent_entry.grid(row=0, column=1, padx=(8, 0), sticky="w")
        self.intent_entry.insert(0, "")
        # placeholder hint via binding
        hint = tk.Label(intent_row, text='e.g. "finish problem set 3.1"', fg="#444444", bg="#000000", font=("Segoe UI", 8))
        hint.grid(row=1, column=1, sticky="w", padx=(8, 0))

        # Route selector
        route_row = tk.Frame(self.root, bg=palette["bg"] if 'palette' in locals() else ("#000000" if self.dark_mode else "#ededed"))
        self._route_row = route_row
        route_row.pack(fill="x", padx=20, pady=(2, 6))

        tk.Label(route_row, text="Route", fg="#888888", bg="#000000", font=("Segoe UI", 9, "bold")).pack(side="left")
        self.route_var = tk.StringVar(value=f"{ROUTES[0][0]} · {ROUTES[0][1]} min")
        route_menu = tk.OptionMenu(route_row, self.route_var, *[f"{n} · {m} min" for n, m, _ in ROUTES], command=self.on_route_pick)
        route_menu.config(bg=THEME["card"], fg=THEME["fg"], activebackground=THEME["card2"], bd=0, highlightthickness=0, font=("Segoe UI", 9))
        route_menu["menu"].config(bg=THEME["card"], fg=THEME["fg"], bd=0)
        route_menu.pack(side="left", padx=(8, 0))

        self.route_tagline = tk.Label(route_row, text=ROUTES[0][2], fg="#555555", bg="#000000", font=("Segoe UI", 8))
        self.route_tagline.pack(side="left", padx=(10, 0))

        # --- Canvas road ---
        canvas_wrap = tk.Frame(self.root, bg=palette["bg"] if 'palette' in locals() else ("#000000" if self.dark_mode else "#ededed"))
        canvas_wrap.pack(fill="both", expand=True, pady=(6, 4), padx=8)
        self._canvas_wrap = canvas_wrap
        # keep original size for windowed; fullscreen will expand via place
        self.canvas = tk.Canvas(canvas_wrap, width=CANVAS_W, height=CANVAS_H, bg="#0a0a0a", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self._canvas_holder_bg = canvas_wrap["bg"]

        # --- Time + progress ---
        timer_row = tk.Frame(self.root, bg=palette["bg"] if 'palette' in locals() else ("#000000" if self.dark_mode else "#ededed"))
        self._timer_row = timer_row
        timer_row.pack(pady=(4, 0))

        self.time_var = tk.StringVar(value=self.format_time(self.selected_route_min * 60))
        self.time_entry = tk.Entry(
            timer_row, textvariable=self.time_var, fg=THEME["accent"], bg=THEME["card"],
            font=("Consolas", 36, "bold"), justify="center", insertbackground=THEME["accent"],
            relief="flat", highlightthickness=1, highlightbackground=THEME["outline"], highlightcolor=THEME["accent"], bd=0, width=7,
        )
        self.time_entry.grid(row=0, column=0, padx=(0, 12))
        tk.Label(timer_row, text="mm:ss  (click to edit)", fg="#444444", bg="#000000", font=("Segoe UI", 8)).grid(row=1, column=0)

        self.progress = ttk.Progressbar(timer_row, mode="determinate", length=260, style="Horizontal.TProgressbar")
        self.progress.grid(row=0, column=1, rowspan=2, padx=(8, 0), sticky="ns")
        self.progress["maximum"] = self.selected_route_min * 60
        self.progress["value"] = 0

        # --- Controls ---
        ctrl = tk.Frame(self.root, bg=palette["bg"] if 'palette' in locals() else ("#000000" if self.dark_mode else "#ededed"))
        self._ctrl = ctrl
        ctrl.pack(pady=(10, 2))

        self.start_btn = tk.Button(ctrl, text="▶  Hit the road", command=self.start_timer,
                                   fg="#000000", bg="#00ff88", activebackground="#00cc6a",
                                   font=("Segoe UI", 11, "bold"), bd=0, padx=16, pady=6)
        self.start_btn.grid(row=0, column=0, padx=4)

        self.pause_btn = tk.Button(ctrl, text=" Pause", command=self.toggle_pause, state="disabled",
                                   fg="#ffffff", bg="#222222", activebackground="#333333",
                                   font=("Segoe UI", 10), bd=0, padx=12, pady=6)
        self.pause_btn.grid(row=0, column=1, padx=4)

        self.reset_btn = tk.Button(ctrl, text="↻ Reset", command=self.reset_timer, state="disabled",
                                   fg="#ffffff", bg="#222222", activebackground="#333333",
                                   font=("Segoe UI", 10), bd=0, padx=12, pady=6)
        self.reset_btn.grid(row=0, column=2, padx=4)

        # Sound toggle — white-noise for studying
        sound_row = tk.Frame(self.root, bg=THEME["bg"])
        self._sound_row = sound_row
        sound_row.pack(pady=(4, 0))
        self.sound_check = tk.Checkbutton(
            sound_row, text="Road hum", variable=self.sound_enabled, command=self.on_sound_toggle,
            fg=THEME["muted"], bg=THEME["bg"], selectcolor=THEME["card"], activebackground=THEME["bg"],
            font=("Segoe UI", 9), bd=0, highlightthickness=0, activeforeground=THEME["fg"]
        )
        self.sound_check.pack(side="left")
        if not self._sound_available:
            self.sound_check.config(state="disabled")
            tk.Label(sound_row, text="(install numpy + sounddevice for audio)", fg=THEME["muted"], bg=THEME["bg"], font=("Segoe UI", 7)).pack(side="left", padx=(6, 0))
        self.volume_var = tk.DoubleVar(value=float(self._config.get("vol", sounds.DEFAULT_VOLUME)))
        self.volume_scale = tk.Scale(sound_row, from_=0.0, to=0.5, resolution=0.02, orient="horizontal",
                                     variable=self.volume_var, command=lambda _: self.on_volume_change(),
                                     bg=THEME["bg"], fg=THEME["muted"], troughcolor=THEME["card2"],
                                     highlightthickness=0, bd=0, length=90, font=("Segoe UI", 7), activebackground=THEME["accent"])
        self.volume_scale.pack(side="left", padx=(8, 0))
        tk.Label(sound_row, text="vol", fg=THEME["muted"], bg=THEME["bg"], font=("Segoe UI", 7)).pack(side="left")
        # kind menu already handled via noise_kind, ensure it exists
        if not hasattr(self, "noise_kind"):
            self.noise_kind = __import__("tkinter").StringVar(value=self._config.get("noise_kind", "brown"))
            self._hum_kind_menu = __import__("tkinter").OptionMenu(sound_row, self.noise_kind, "brown", "pink", "white", "rain", command=self.on_noise_kind)
            self._hum_kind_menu.config(bg=THEME["card"], fg=THEME["fg"], activebackground=THEME["card2"], bd=0, highlightthickness=1, highlightbackground=THEME["outline"], font=("Segoe UI", 8))
            self._hum_kind_menu["menu"].config(bg=THEME["card"], fg=THEME["fg"], bd=0)
            self._hum_kind_menu.pack(side="left", padx=(8,0))
            __import__("tkinter").Label(sound_row, text="kind", fg=THEME["muted"], bg=THEME["bg"], font=("Segoe UI", 7)).pack(side="left")

        # Presets row (quick overrides)
        presets = tk.Frame(self.root, bg=THEME["bg"])
        self._presets = presets
        presets.pack(pady=(6, 0))
        tk.Label(presets, text="Quick:", fg=THEME["muted"], bg=THEME["bg"], font=("Segoe UI", 8)).pack(side="left", padx=(0, 6))
        for label, mins in [("25", 25), ("50", 50), ("90", 90), ("Custom", None)]:
            if mins is not None:
                btn = tk.Button(presets, text=f"{mins}m", command=lambda m=mins: self.apply_preset_minutes(m),
                                fg=THEME["fg"], bg=THEME["card"], activebackground=THEME["card2"], bd=0, highlightthickness=1, highlightbackground=THEME["outline"], padx=8, pady=3, font=("Segoe UI", 8))
            else:
                btn = tk.Button(presets, text="Custom", command=self.focus_time_entry,
                                fg=THEME["fg"], bg=THEME["card"], activebackground=THEME["card2"], bd=0, highlightthickness=1, highlightbackground=THEME["outline"], padx=8, pady=3, font=("Segoe UI", 8))
            btn.pack(side="left", padx=2)

        # --- Quote ---
        quote_wrap = tk.Frame(self.root, bg=THEME["bg"])
        self._quote_wrap = quote_wrap
        quote_wrap.pack(fill="x", padx=30, pady=(8, 0))
        self.quote_label = tk.Label(quote_wrap, text=f'"{random.choice(QUOTES)}"', wraplength=620, justify="center",
                                    fg="#666666", bg="#000000", font=("Segoe UI", 9, "italic"))
        self.quote_label.pack()

        # --- Stats + Trip Log ---
        stats_row = tk.Frame(self.root, bg=palette["bg"] if 'palette' in locals() else ("#000000" if self.dark_mode else "#ededed"))
        stats_row.pack(fill="x", padx=20, pady=(6, 8))
        self._stats_row = stats_row
        self.stats_label = tk.Label(stats_row, text="", fg=(THEME)["stats"], bg=stats_row["bg"], font=("Segoe UI", 8))
        self.stats_label.pack(side="left")
        tk.Button(stats_row, text="Trip Log", command=self.open_trip_log,
                  fg=(THEME)["accent"], bg=(THEME)["card"], activebackground="#222222", bd=0, padx=10, pady=3, font=("Segoe UI", 8)).pack(side="right")
        tk.Button(stats_row, text="Clear log", command=self.clear_log,
                  fg=(THEME)["muted"], bg=(THEME)["card"], activebackground="#222222", bd=0, padx=10, pady=3, font=("Segoe UI", 8)).pack(side="right", padx=(0, 6))
        # canonical chrome order — matches visual pack order for exact restore after fullscreen
        self._chrome_order = [getattr(self, "_header", None), getattr(self, "_intent_row", None), getattr(self, "_route_row", None), self._canvas_wrap, getattr(self, "_timer_row", None), getattr(self, "_ctrl", None), getattr(self, "_sound_row", None), getattr(self, "_presets", None), getattr(self, "_quote_wrap", None), stats_row]
        # filter None
        self._chrome_order = [f for f in self._chrome_order if f is not None]
        self._chrome_frames = list(self._chrome_order)
        self._pack_state = {}
        # fluid per-touch bindings (theme btn removed, fs now in HUD)
        # also bind control buttons after they exist (deferred)
        self.root.after(200, self._bind_control_fluid)

    # ------------------------------------------------------------------
    # Theme + Fullscreen (FocusFlight-style HUD)
    # ------------------------------------------------------------------
    def _apply_theme(self):
        p = THEME
        try:
            self.root.configure(bg=p["bg"])
            # header
            if hasattr(self, "_header"):
                self._header.configure(bg=p["bg"])
                for w in self._header.winfo_children():
                    try:
                        if isinstance(w, tk.Label):
                            if "ROADTRIP" in w.cget("text"):
                                w.configure(bg=p["bg"], fg=p["header_fg"])
                            else:
                                w.configure(bg=p["bg"], fg=p["muted"] if "pick a route" in w.cget("text") else p["phase_fg"])
                        elif isinstance(w, tk.Frame):
                            w.configure(bg=p["bg"])
                            for ch in w.winfo_children():
                                if isinstance(ch, tk.Button):
                                    ch.configure(bg=p["card"], fg=p["fg"], activebackground=p["card2"], highlightbackground=p["outline"])
                    except Exception:
                        pass
                if hasattr(self, "_theme_btn"):
                    self._theme_btn.configure(text="Light" if self.dark_mode else "Dark", bg=p["card"], fg=p["fg"], activebackground=p["card2"], highlightbackground=p["outline"])
                if hasattr(self, "_fs_btn_top"):
                    self._fs_btn_top.configure(bg=p["card"], fg=p["fg"], activebackground=p["card2"], highlightbackground=p["outline"])
                if hasattr(self, "_fs_btn"):
                    self._fs_btn.configure(bg=p["card"], fg=p["fg"], activebackground=p["card2"], highlightbackground=p["outline"])
            # chrome cards — surface + outline for elevation
            for name in ("_intent_row","_route_row","_timer_row","_ctrl","_sound_row","_presets","_quote_wrap","_stats_row","_canvas_wrap"):
                fr = getattr(self, name, None)
                if fr is not None:
                    try:
                        # cards get surface, wrappers get bg
                        is_card = name in ("_intent_row","_route_row","_timer_row","_ctrl","_presets")
                        fr.configure(bg=p["card"] if is_card else p["bg"], highlightthickness=1 if is_card else 0, highlightbackground=p["outline"] if is_card else p["bg"])
                    except Exception:
                        pass
            # entries — keep time/intent themed (dark midnight)
            try:
                self.intent_entry.configure(bg=p["entry_bg"], fg=p["entry_fg"], insertbackground=p["accent"], highlightbackground=p["outline"], highlightcolor=p["accent"])
                self.time_entry.configure(bg=p["card"], fg=p["accent"], insertbackground=p["accent"], highlightbackground=p["outline"], highlightcolor=p["accent"])
                # route menu
                if hasattr(self, "route_var"):
                    try:
                        for ch in self._route_row.winfo_children():
                            if isinstance(ch, tk.OptionMenu):
                                ch.configure(bg=p["card"], fg=p["fg"], activebackground=p["card2"], highlightbackground=p["outline"])
                                ch["menu"].configure(bg=p["card"], fg=p["fg"])
                    except Exception:
                        pass
                # kind menu
                if hasattr(self, "_hum_kind_menu"):
                    try:
                        self._hum_kind_menu.configure(bg=p["card"], fg=p["fg"], activebackground=p["card2"], highlightbackground=p["outline"])
                        self._hum_kind_menu["menu"].configure(bg=p["card"], fg=p["fg"])
                    except Exception:
                        pass
            except Exception:
                pass
            # labels
            try:
                self.stats_label.configure(bg=p["bg"], fg=p["stats"])
            except Exception:
                pass
            try:
                self.quote_label.configure(bg=p["bg"], fg=p["muted"])
            except Exception:
                pass
            # ttk style refresh
            try:
                style = ttk.Style()
                style.configure("Horizontal.TProgressbar", troughcolor=p["card2"], background=p["accent"], bordercolor=p["bg"])
            except Exception:
                pass
            self.root.update_idletasks()
        except Exception:
            pass

    def _animate_button(self, btn: tk.Button, press: bool = True):
        # micro press: scale bg lerp + slight y offset via padding tween
        try:
            p = THEME
            orig_bg = p["card"]
            press_bg = p["card2"] if press else orig_bg
            # instant press, then ease back
            btn.configure(bg=press_bg)
            if press:
                self.root.after(90, lambda: btn.configure(bg=orig_bg))
        except Exception:
            pass

    def _bind_fluid(self, btn: tk.Button):
        try:
            btn.bind("<Enter>", lambda e: btn.configure(bg=(THEME)["card2"]))
            btn.bind("<Leave>", lambda e: btn.configure(bg=(THEME)["card"]))
            btn.bind("<ButtonPress-1>", lambda e: self._animate_button(btn, True))
            btn.bind("<ButtonRelease-1>", lambda e: self._animate_button(btn, False))
        except Exception:
            pass

    def _bind_control_fluid(self):
        for attr in ("start_btn","pause_btn","reset_btn"):
            b = getattr(self, attr, None)
            if b: self._bind_fluid(b)
        # Quick pills
        try:
            if hasattr(self, "_presets"):
                for ch in self._presets.winfo_children():
                    if isinstance(ch, tk.Button):
                        self._bind_fluid(ch)
        except Exception:
            pass

    def _tween_progress(self, target: float, dur: int = 420):
        # smooth progress bar tween
        try:
            start = float(self.progress["value"])
            delta = target - start
            t0 = time.monotonic()
            def step():
                t = min(1.0, (time.monotonic() - t0) / (dur/1000))
                e = _ease_out_cubic(t)
                self.progress["value"] = start + delta * e
                if t < 1:
                    self.root.after(16, step)
            step()
        except Exception:
            try:
                self.progress["value"] = target
            except Exception:
                pass

    def toggle_theme(self):
        # dark-only — keep for compat, no light mode
        self.dark_mode = True
        return

    def toggle_fullscreen(self):
        if self.is_fullscreen:
            self._exit_fullscreen()
        else:
            self._enter_fullscreen()

    def _enter_fullscreen(self):
        if self.is_fullscreen:
            return
        # snapshot exact pack_info before hiding — fixes scrambled spacing after exit
        try:
            self._pack_state = {fr: fr.pack_info() for fr in getattr(self, "_chrome_order", []) if fr.winfo_manager() == "pack"}
            self._pre_full_geo = self.root.geometry()
        except Exception:
            self._pack_state = {}
        self.is_fullscreen = True
        try:
            self.root.attributes("-fullscreen", True)
        except Exception:
            try:
                self.root.state("zoomed")
            except Exception:
                pass
        # hide chrome except canvas, show floating HUD
        self._set_chrome_visible(False)
        self._show_hud(True)
        # expand canvas to fullscreen size
        try:
            sw = self.root.winfo_screenwidth()
            sh = self.root.winfo_screenheight()
            # canvas will fill via pack expand; force redraw
            self.canvas.configure(width=sw, height=sh-120)
            prog = 1.0 - (self.remaining / self.total) if self.total else 0.0
            self.draw_road(max(0.0, min(1.0, prog)))
        except Exception:
            pass
        self._config["fullscreen"] = True
        _save_config(self._config)

    def _exit_fullscreen(self):
        if not self.is_fullscreen:
            return
        self.is_fullscreen = False
        try:
            self.root.attributes("-fullscreen", False)
        except Exception:
            pass
        try:
            if self._pre_full_geo:
                self.root.geometry(self._pre_full_geo)
            else:
                self.root.geometry("680x620")
        except Exception:
            pass
        self._set_chrome_visible(True)
        self._show_hud(False)
        try:
            self.canvas.configure(width=CANVAS_W, height=CANVAS_H)
            prog = 1.0 - (self.remaining / self.total) if self.total else 0.0
            self.draw_road(max(0.0, min(1.0, prog)))
        except Exception:
            pass
        self._config["fullscreen"] = False
        _save_config(self._config)

    def _set_chrome_visible(self, visible: bool):
        # Use canonical order + saved pack_info for exact restore — fixes scrambled spacing
        order = getattr(self, "_chrome_order", [])
        if not order:
            # fallback to old frames list
            order = []
            for n in ("_header","_intent_row","_route_row","_timer_row","_ctrl","_sound_row","_presets","_quote_wrap","_stats_row"):
                fr = getattr(self, n, None)
                if fr is not None:
                    order.append(fr)
            if hasattr(self, "_canvas_wrap") and self._canvas_wrap not in order:
                # insert canvas_wrap in correct visual position (after route)
                try:
                    idx = order.index(getattr(self, "_route_row", None)) + 1 if hasattr(self, "_route_row") else 3
                    order.insert(idx, self._canvas_wrap)
                except Exception:
                    order.append(self._canvas_wrap)
        if visible:
            for fr in order:
                try:
                    info = self._pack_state.get(fr)
                    if info:
                        # pack_info returns strings; pack() accepts same keys
                        # filter to valid pack options
                        valid = {k: info[k] for k in ("side","fill","expand","padx","pady","ipadx","ipady","anchor") if k in info}
                        # pady/padx may be tuple strings; pack handles strings
                        fr.pack(**valid)
                    else:
                        # fallback generic
                        fr.pack(fill="x" if fr != self._canvas_wrap else "both", expand=(fr==self._canvas_wrap))
                except Exception:
                    try:
                        fr.pack(fill="x")
                    except Exception:
                        pass
            # ensure canvas_wrap has correct padding after restore
            try:
                # restore its original padding from pack_state if available
                info = self._pack_state.get(self._canvas_wrap, {})
                padx = info.get("padx", 8) if info else 8
                pady = info.get("pady", (6,4)) if info else (6,4)
                self._canvas_wrap.configure(padx=padx, pady=pady)
            except Exception:
                pass
        else:
            for fr in order:
                if fr == getattr(self, "_canvas_wrap", None):
                    continue
                try:
                    fr.pack_forget()
                except Exception:
                    pass
            # make canvas fill entire window
            try:
                self._canvas_wrap.pack(fill="both", expand=True, pady=0, padx=0)
                self._canvas_wrap.configure(padx=0, pady=0)
            except Exception:
                pass

    def _show_hud(self, show: bool):
        # Apple Music floating HUD — squircle, bottom pill holds playback + Fullscreen, top shows intent/route
        p = THEME
        if show:
            # Top — intent + route (subtle)
            self._hud_top = tk.Frame(self.root, bg=p["card"], bd=0, highlightthickness=1, highlightbackground=p["outline"], relief="flat")
            self._hud_top.place(relx=0.5, rely=0.02, anchor="n", width=640, height=32)
            try:
                tk.Label(self._hud_top, textvariable=self.intent_var, fg=p["fg"], bg=p["card"], font=("Segoe UI", 9)).pack(side="left", padx=10, pady=4)
                tk.Label(self._hud_top, textvariable=self.route_var, fg=p["muted"], bg=p["card"], font=("Segoe UI", 8)).pack(side="right", padx=10, pady=4)
                self._hud_phase = tk.Label(self._hud_top, text=self.phase_label.cget("text"), fg=p["accent"], bg=p["card"], font=("Segoe UI", 8, "bold"))
                self._hud_phase.pack(side="right", padx=(6,0), pady=4)
            except Exception:
                pass
            # Bottom — Apple Music floating playback pill: time + progress + controls + Fullscreen
            self._hud_bottom = tk.Frame(self.root, bg=p["card"], bd=0, highlightthickness=1, highlightbackground=p["outline"], relief="flat")
            self._hud_bottom.place(relx=0.5, rely=0.92, anchor="s", width=720, height=52)
            try:
                tk.Label(self._hud_bottom, textvariable=self.time_var, fg=p["accent"], bg=p["card"], font=("Consolas", 15, "bold")).pack(side="left", padx=10, pady=6)
                hud_prog = ttk.Progressbar(self._hud_bottom, mode="determinate", length=180, style="Horizontal.TProgressbar")
                hud_prog.pack(side="left", padx=8, pady=8)
                def _sync(*_):
                    try:
                        hud_prog["value"] = self.progress["value"]
                        hud_prog["maximum"] = self.progress["maximum"]
                    except Exception:
                        pass
                self._hud_sync = _sync
                self.root.after(200, _sync)
                # floating playback controls inside HUD (Apple Music)
                for txt_btn, cmd in [("▶", self.start_timer), ("⏸", self.toggle_pause), ("↻", self.reset_timer)]:
                    b = tk.Button(self._hud_bottom, text=txt_btn, command=cmd, bg=p["card2"] if txt_btn=="▶" else p["card"], fg=p["fg"] if txt_btn!="▶" else p["bg"], activebackground=p["accent"] if txt_btn=="▶" else p["card2"], bd=0, highlightthickness=1, highlightbackground=p["outline"], padx=8, pady=4, font=("Segoe UI", 9, "bold"), cursor="hand2")
                    b.pack(side="left", padx=3, pady=6)
                    try: self._bind_fluid(b)
                    except: pass
                self._hud_fs_btn = tk.Button(self._hud_bottom, text="Exit Fullscreen (Esc)" if self.is_fullscreen else "Fullscreen", command=self.toggle_fullscreen, bg=p["card"], fg=p["muted"], activebackground=p["card2"], bd=0, highlightthickness=1, highlightbackground=p["outline"], padx=8, pady=4, font=("Segoe UI", 8))
                self._hud_fs_btn.pack(side="right", padx=8, pady=6)
                try: self._bind_fluid(self._hud_fs_btn)
                except: pass
            except Exception:
                pass
            self._hud_frames = [self._hud_top, self._hud_bottom]
        else:
            for fr in getattr(self, "_hud_frames", []):
                try:
                    fr.destroy()
                except Exception:
                    pass
            self._hud_frames = []
            if hasattr(self, "_hud_fs_btn"):
                try: delattr(self, "_hud_fs_btn")
                except: pass

    def _show_completion_popup(self, session):
        # Top-right slide-in, Apple Music style, dark squircle
        try:
            if hasattr(self, "_popup") and self._popup.winfo_exists():
                try: self._popup.destroy()
                except: pass
            p = THEME
            popup = tk.Frame(self.root, bg=p["card"], bd=0, highlightthickness=1, highlightbackground=p["outline"], relief="flat")
            # content
            tk.Label(popup, text="Journey completed ✓", fg=p["accent"], bg=p["card"], font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=12, pady=(10,2))
            tk.Label(popup, text=f"{session.route} · {session.duration_min} min", fg=p["fg"], bg=p["card"], font=("Segoe UI", 9)).pack(anchor="w", padx=12)
            tk.Label(popup, text=session.intent[:48] if len(session.intent) < 48 else session.intent[:45]+"...", fg=p["muted"], bg=p["card"], font=("Segoe UI", 8, "italic")).pack(anchor="w", padx=12, pady=(2,6))
            btn_row = tk.Frame(popup, bg=p["card"])
            btn_row.pack(fill="x", padx=8, pady=(4,8))
            tk.Button(btn_row, text="Trip Log", command=lambda: (self.open_trip_log(), popup.destroy()), bg=p["card2"], fg=p["accent"], activebackground=p["accent"], bd=0, highlightthickness=1, highlightbackground=p["outline"], padx=8, pady=3, font=("Segoe UI", 8)).pack(side="left", padx=4)
            tk.Button(btn_row, text="Dismiss", command=popup.destroy, bg=p["card"], fg=p["muted"], activebackground=p["card2"], bd=0, highlightthickness=1, highlightbackground=p["outline"], padx=8, pady=3, font=("Segoe UI", 8)).pack(side="right", padx=4)
            # place off-screen right
            sw = self.root.winfo_width() or 680
            # need to update to get width
            popup.update_idletasks()
            pw = popup.winfo_reqwidth()
            ph = popup.winfo_reqheight()
            start_x = sw
            end_x = sw - pw - 16
            y = 16
            popup.place(x=start_x, y=y, width=pw, height=ph, anchor="nw")
            self._popup = popup
            # animate slide
            steps = 16
            delay = 16
            def slide(i=0):
                try:
                    if not popup.winfo_exists(): return
                    t = i / steps
                    e = 1 - (1 - t) ** 3  # easeOutCubic
                    x = int(start_x + (end_x - start_x) * e)
                    popup.place(x=x, y=y)
                    if i < steps:
                        self.root.after(delay, lambda: slide(i+1))
                    else:
                        # auto dismiss after 4s
                        self.root.after(4000, lambda: (popup.destroy() if popup.winfo_exists() else None))
                except: pass
            slide()
            # pause on hover
            def _cancel(*_):
                try: popup._after_id and self.root.after_cancel(popup._after_id)
                except: pass
            popup.bind("<Enter>", lambda e: setattr(popup, "_paused", True))
            popup.bind("<Leave>", lambda e: setattr(popup, "_paused", False))
        except Exception as e:
            print(f"[popup] {e}")

    # ------------------------------------------------------------------
    # Route / preset helpers

    # ------------------------------------------------------------------
    def on_route_pick(self, value: str):
        # value like "Desert Stretch · 50 min"
        name = value.split(" ·")[0]
        for n, m, tag in ROUTES:
            if n == name:
                self.selected_route_name = n
                self.selected_route_min = m
                self.route_tagline.config(text=tag)
                if not self.is_running:
                    self.time_var.set(self.format_time(m * 60))
                    self.progress["maximum"] = m * 60
                    self.progress["value"] = 0
                    self.draw_road(0.0)
                break

    def apply_preset_minutes(self, mins: int):
        if self.is_running:
            return
        # Find matching route or keep custom label
        for n, m, tag in ROUTES:
            if m == mins:
                self.selected_route_name = n
                self.selected_route_min = m
                self.route_var.set(f"{n} · {m} min")
                self.route_tagline.config(text=tag)
                break
        else:
            self.selected_route_name = f"Custom · {mins}m"
            self.selected_route_min = mins
            self.route_var.set(f"Custom · {mins} min")
            self.route_tagline.config(text="Your pace")
        self.time_var.set(self.format_time(mins * 60))
        self.progress["maximum"] = mins * 60
        self.progress["value"] = 0
        self.draw_road(0.0)

    def focus_time_entry(self):
        self.time_entry.focus_set()
        self.time_entry.select_range(0, tk.END)

    # ------------------------------------------------------------------
    # Sound
    # ------------------------------------------------------------------
    def on_sound_toggle(self):
        if self.sound_enabled.get():
            vol = float(self.volume_var.get())
            kind = getattr(self, "noise_kind", tk.StringVar(value="brown")).get() if hasattr(self, "noise_kind") else "brown"
            ok = sounds.start(volume=vol, kind=kind, hum=True)
            if not ok:
                self.sound_enabled.set(False)
            else:
                self._config["noise_kind"] = kind
                self._config["vol"] = vol
                _save_config(self._config)
        else:
            sounds.stop()

    def on_volume_change(self):
        if self.sound_enabled.get() and sounds.is_playing():
            kind = getattr(self, "noise_kind", tk.StringVar(value="brown")).get() if hasattr(self, "noise_kind") else "brown"
            vol = float(self.volume_var.get())
            sounds.stop()
            sounds.start(volume=vol, kind=kind, hum=True)
            self._config["vol"] = vol
            _save_config(self._config)

    def on_noise_kind(self, value=None):
        kind = self.noise_kind.get() if hasattr(self, "noise_kind") else "brown"
        self._config["noise_kind"] = kind
        _save_config(self._config)
        if self.sound_enabled.get() and sounds.is_playing():
            vol = float(self.volume_var.get())
            sounds.stop()
            sounds.start(volume=vol, kind=kind, hum=True)

    # ------------------------------------------------------------------
    # Slow Roads helpers — curve + terrain + scenery
    # ------------------------------------------------------------------
    def _make_curve_params(self, seed: float):
        """Derive smooth winding parameters from a seed in [0,1)."""
        rnd = random.Random(seed)
        # Two sine components: long gentle bends + shorter kicker
        # Third very slow drift for long variation
        return (
            rnd.uniform(42, 68),   # A1: long amplitude
            rnd.uniform(14, 26),   # A2: short amplitude
            rnd.uniform(0.028, 0.048),  # w1: long frequency (per world unit)
            rnd.uniform(0.11, 0.17),    # w2: short frequency
            rnd.uniform(0, math.pi * 2),  # p1
            rnd.uniform(0, math.pi * 2),  # p2
        )

    def _road_center(self, world_d: float) -> float:
        A1, A2, w1, w2, p1, p2 = self._curve_params
        return A1 * math.sin(world_d * w1 + p1) + A2 * math.sin(world_d * w2 + p2)

    def _road_center_smooth(self, world_d: float) -> float:
        """Slightly eased center for car lean — average of two nearby samples."""
        return (self._road_center(world_d) * 0.6 +
                self._road_center(world_d + 6) * 0.25 +
                self._road_center(world_d - 6) * 0.15)

    def _dist_for_progress(self, progress: float) -> float:
        total = getattr(self, "total", 0) or (self.selected_route_min * 60)
        total = max(1, int(total))
        return max(0.0, min(1.0, progress)) * total * (SCENERY_SPEED * 0.35)

    def _dist_for_time(self) -> float:
        # time-driven, not progress-driven — continuous 60fps, no 1s stutter
        try:
            if not getattr(self, "is_running", False):
                return getattr(self, "_dist0", 0.0)
            now = __import__("time").monotonic()
            t0 = getattr(self, "_t0", now)
            paused = getattr(self, "_paused_acc", 0.0)
            return getattr(self, "_dist0", 0.0) + max(0.0, now - t0 - paused) * SCENERY_SPEED * 0.35
        except Exception:
            return getattr(self, "dist", 0.0)

    def _perspective_t(self, linear_t: float) -> float:
        """Map linear 0..1 to perspective-correct t (ease-out for depth)."""
        # pow gives more resolution near horizon, like 1/(z)
        return 1 - (1 - linear_t) ** 1.65

    def _schedule_anim(self):
        if getattr(self, "_anim_job", None):
            try:
                self.root.after_cancel(self._anim_job)
            except Exception:
                pass
        self._anim_job = self.root.after(16, self._anim_frame)

    def _anim_frame(self):
        # Proper 60fps — time-driven, not 1s stair-step, with spring
        try:
            if self.is_running and self.pause_btn.cget("state") != "disabled" and self.pause_btn["text"] != "Resume":
                dist_target = self._dist_for_time()
                dt = 0.016
                f = (dist_target - self._dist_render) * 60
                a = f
                self._dist_vel = (self._dist_vel + a*dt) * (1 - 22*dt*0.06)
                self._dist_render += self._dist_vel * dt
                if abs(dist_target - self._dist_render) < 0.05:
                    self._dist_render = dist_target
                self.dist = dist_target
                try:
                    prog = max(0.0, min(1.0, self._dist_render / max(1, self.total * SCENERY_SPEED * 0.35)))
                    cur = float(self.progress["value"])
                    tgt = prog * self.total
                    self.progress["value"] = cur + (tgt - cur) * 0.14
                except Exception:
                    pass
                prog_draw = max(0.0, min(1.0, self._dist_render / max(1, self.total * SCENERY_SPEED * 0.35))) if self.total else 0.0
                self.draw_road(prog_draw)
                if self.is_fullscreen and hasattr(self, "_hud_phase"):
                    try:
                        self._hud_phase.configure(text=self.phase_label.cget("text"))
                    except:
                        pass
                self._schedule_anim()
                return
        except Exception:
            pass
        # idle decay
        try:
            self._dist_vel *= 0.92
        except Exception:
            pass
        self._schedule_anim()

    # ------------------------------------------------------------------
    # Canvas — Slow Roads endless cruise
    # ------------------------------------------------------------------
    def draw_road(self, progress: float):
        """progress 0..1. Redraws the entire canvas.

        World is endless: distance = progress * total * k; the road center
        winds via _road_center(world_d), hills parallax at 3 depths, and
        deterministic roadside scenery scrolls past. The car is fixed near
        the bottom-center while the world moves.
        """
        c = self.canvas
        c.delete("all")
        # Fullscreen aware — use actual canvas size when available; when fullscreen
        # prefer screen size immediately so the road fills even before winfo updates
        try:
            if getattr(self, "is_fullscreen", False):
                sw = self.root.winfo_screenwidth()
                sh = self.root.winfo_screenheight()
                # leave room for HUD overlay
                w = sw if sw and sw > 100 else CANVAS_W
                h = sh if sh and sh > 100 else CANVAS_H
                # ensure canvas widget matches
                try:
                    self.canvas.configure(width=w, height=h)  # road touches bottom now
                except Exception:
                    pass
            else:
                cw = self.canvas.winfo_width()
                ch = self.canvas.winfo_height()
                w = cw if cw > 100 else CANVAS_W
                h = ch if ch > 80 else CANVAS_H
        except Exception:
            w, h = CANVAS_W, CANVAS_H
        horizon_y = int(h * 0.28)  # keep horizon at ~28% height regardless of fullscreen
        progress = max(0.0, min(1.0, progress))
        # use spring-smoothed dist when running for jitter-free scroll
        dist_target = self._dist_for_progress(progress)
        if getattr(self, "is_running", False) and hasattr(self, "_dist_render"):
            dist = self._dist_render
        else:
            dist = dist_target
            # keep render in sync when not running
            self._dist_render = dist_target

# Sky gradient — route-biome aware + light/dark blend
        biome = ROUTE_BIOMES.get(self.selected_route_name, ROUTE_BIOMES["Cross-Country"])
        if self.dark_mode:
            top_r, top_g, top_b = biome["sky_top"]
            hor_r, hor_g, hor_b = biome["sky_hor"]
        else:
            # light mode — bright day sky, override with screenshot palette
            top_r, top_g, top_b = 74, 154, 212  # #4a9ad4
            hor_r, hor_g, hor_b = 135, 206, 235  # #87ceeB horizon
        for i in range(22):
            t = i / 21
            r = int(top_r * (1-t) + hor_r * t)
            g_ = int(top_g * (1-t) + hor_g * t)
            b = int(top_b * (1-t) + hor_b * t)
            y0 = int(i * (horizon_y / 22))
            y1 = int((i+1) * (horizon_y / 22))
            c.create_rectangle(0, y0, w, y1, fill=f"#{r:02x}{g_:02x}{b:02x}", outline="")
        # subtle stars — deterministic hash, twinkle via dist
        for sx in range(0, w, 47):
            hsh = hash((sx, int(self._curve_seed*1000))) & 0xFF
            if hsh < 38:
                tw = 0.6 + 0.4 * math.sin(dist*0.02 + sx*0.13)
                if tw > 0.4:
                    sy = (hsh % (horizon_y - 8)) + 3
                    alpha = int(90 + 90*tw)
                    c.create_oval(sx, sy, sx+1, sy+1, fill=f"#{alpha:02x}{alpha:02x}{alpha:02x}", outline="")

        # Parallax hills — 3 layers: far (slow), mid, near (faster). Each is a
        # tiled sine silhouette whose x offset is -(dist * speed) mod tile.
        # Keep palette very dark so the road stays the focal color.
        # Biome-adjusted hills (light mode = lighter, screenshot greens)
        biome = ROUTE_BIOMES.get(self.selected_route_name, ROUTE_BIOMES["Cross-Country"])
        if self.dark_mode:
            # subtle green-tinted dark hills (matching #00e69a accent)
            hill_defs = [
                ("#051510",  0.22, 420, 22, 0.018, 0),
                ("#0a201a",  0.45, 360, 18, 0.024, 1.1),
                ("#153025",  0.85, 300, 14, 0.032, 2.4),
            ]
        else:
            # light day — muted distant hills, green fields near
            hill_defs = [
                ("#4a7c59",  0.22, 420, 22, 0.018, 0),   # soft sage green far
                ("#6aa07a",  0.45, 360, 18, 0.024, 1.1),  # medium sage green mid
                ("#8ab59a",  0.85, 300, 14, 0.032, 2.4),  # light sage green near
            ]
        for color, speed, tile_w, amp, freq, phase in hill_defs:
            offset = (-dist * speed) % tile_w
            # Build a poly that spans the canvas plus one tile each side
            points: list[float] = []
            # start below horizon to close the polygon
            x = -tile_w + offset - 20
            points.extend([x, horizon_y])
            while x < w + tile_w + 20:
                # hill y: horizon minus a sine bump + a slow undulation
                bump = amp * math.sin((x + offset*0.7) * freq + phase)
                bump += (amp * 0.45) * math.sin((x + offset*0.4) * freq * 2.3 + phase * 1.7)
                # keep hills above horizon
                y = horizon_y - max(0, bump) - (2 if color == HILL_FAR else 0)
                points.extend([x, y])
                x += 10
            points.extend([w + tile_w + 20, horizon_y, -tile_w + offset - 20, horizon_y])
            c.create_polygon(points, fill=color, outline="")

        # Horizon fog — soft haze that lifts the hills off the road
        for fi in range(6):
            fa = int(10 + fi * 5)
            c.create_rectangle(0, horizon_y + fi*2, w, horizon_y + fi*2 + 2,
                               fill=f"#{fa:02x}{fa+4:02x}{fa+2:02x}", outline="", stipple="gray50" if fi>2 else "")
        c.create_line(0, horizon_y, w, horizon_y, fill="#1e2e28", width=1)

        # Winding road ribbon — sample the curve at 18 depth stations from
        # far (horizon) to near (bottom). Each station's center = W/2 + curve
        # at (dist + depth_along_road). Width tapers with perspective.
        n_stations = 18
        visible_world = 140  # world units visible from horizon to bumper
        # road width scales with canvas width in fullscreen
        base_half_near = 262
        base_half_far = 42
        scale_w = w / CANVAS_W if w != CANVAS_W else 1.0
        road_half_near = int(base_half_near * scale_w)
        road_half_far = int(base_half_far * max(0.8, min(1.4, scale_w)))
        shoulder = 8
        centers: list[float] = []
        ys: list[float] = []
        half_ws: list[float] = []
        for i in range(n_stations):
            t_lin = i / (n_stations - 1)  # 0=far (horizon), 1=near (bottom)
            # perspective-correct t for y and width (more road near camera)
            pt = self._perspective_t(t_lin)
            depth_world = (1 - pt) * visible_world  # distance ahead
            world_d = dist + depth_world
            cx = w / 2 + self._road_center(world_d)
            # Clamp so the road never exits the canvas
            max_offset = (w / 2 - road_half_far - 18) if pt < 0.15 else (w / 2 - 30)
            cx = max(w / 2 - max_offset, min(w / 2 + max_offset, cx))
            centers.append(cx)
            # y uses perspective pt
            y = int(horizon_y * (1 - pt) + h * pt)
            ys.append(y)
            half = road_half_far * (1 - pt) + road_half_near * pt
            # perspective: curve amplitude visually shrinks near horizon — already
            # clamped above; keep half consistent
            half_ws.append(half)

        # Road fill — build polygon from left edge far->near then right edge near->far
        road_points: list[float] = []
        for i in range(n_stations):
            road_points.extend([centers[i] - half_ws[i], ys[i]])
        for i in range(n_stations - 1, -1, -1):
            road_points.extend([centers[i] + half_ws[i], ys[i]])
        # road color depends on theme (dark night vs light day white road from screenshot)
        road_fill = ROAD_COLOR if self.dark_mode else "#ffffff"
        road_edge = ROAD_EDGE if self.dark_mode else "#2a2a2a"
        shoulder_col = SHOULDER_COLOR if self.dark_mode else "#c0c0c0"
        lane_col = LANE_COLOR if self.dark_mode else "#5a5a5a"
        c.create_polygon(road_points, fill=road_fill, outline=road_edge, width=1)

        # Shoulder lines — follow the ribbon edges
        for side_sign in (-1, 1):
            pts: list[float] = []
            for i in range(n_stations):
                edge = centers[i] + side_sign * (half_ws[i] - shoulder)
                # inset slightly toward center so shoulders stay inside fill
                pts.extend([edge, ys[i]])
            c.create_line(pts, fill=shoulder_col, width=2, smooth=True, splinesteps=12)

        # Center dashed line — follow the winding center and SCROLL with dist
        # for a genuine forward-motion feel (Slow Roads reference).
        dash_phase = (dist * 0.09) % 1.0  # slower for less jitter  # 0..1 scroll
        # draw many small dashes along the ribbon, offset by phase
        # sample the centerline densely for smooth scrolled dashes
        total_len = 0
        seg_lens = []
        for i in range(n_stations-1):
            dx = centers[i+1]-centers[i]
            dy = ys[i+1]-ys[i]
            seg_lens.append(math.hypot(dx, dy))
            total_len += seg_lens[-1]
        # dash pattern: 14px dash, 14px gap in world-ish screen terms
        dash_len = 14
        gap_len = 14
        pattern = dash_len + gap_len
        # walk along segments projecting dash/gap
        acc = 0
        # offset by phase
        offset = dash_phase * pattern
        for i in range(n_stations-1):
            seg = seg_lens[i]
            # determine where in pattern this segment starts
            seg_start = acc
            seg_end = acc + seg
            # find first dash start inside segment
            # dash intervals are [k*pattern, k*pattern+dash_len)
            k0 = math.floor((seg_start - offset) / pattern)
            k1 = math.ceil((seg_end - offset) / pattern)
            for k in range(k0, k1+1):
                d0 = k*pattern + offset
                d1 = d0 + dash_len
                # clip to segment
                cs = max(seg_start, d0)
                ce = min(seg_end, d1)
                if ce - cs < 2:
                    continue
                # interpolate along segment to screen coords
                f0 = (cs - seg_start) / seg if seg else 0
                f1 = (ce - seg_start) / seg if seg else 0
                x0 = centers[i] * (1 - f0) + centers[i+1] * f0
                y0 = ys[i] * (1 - f0) + ys[i+1] * f0
                x1 = centers[i] * (1 - f1) + centers[i+1] * f1
                y1 = ys[i] * (1 - f1) + ys[i+1] * f1
                # perspective width fades near horizon
                tmid = (i + f0*0.5 + f1*0.5) / n_stations
                lw = max(1, int(3.2 * (0.35 + 0.65 * tmid)))
                c.create_line(x0, y0, x1, y1, fill=lane_col, width=lw)
            acc += seg

        # Mile posts — minimal, no label text (removed per request)
        # Keep side markers only at 25% intervals, no labels
        for pct in (0.25, 0.75):
            t = pct
            idx = int(round(t * (n_stations - 1)))
            idx = max(0, min(n_stations - 1, idx))
            y = ys[idx]
            left_x = centers[idx] - half_ws[idx] - 10
            right_x = centers[idx] + half_ws[idx] + 10
            for x in (left_x, right_x):
                c.create_rectangle(x - 2, y - 6, x + 2, y + 6, fill=MARKER_COLOR, outline="")

        # Scrolling scenery — deterministic poles/trees beside the road.
        # Each world object has a fixed world_d; depth_to_cam = world_d - dist.
        # Map depth_to_cam 0..visible_world -> screen t 1..0, then to y/cx.
        # Spacing is pseudo-random but stable per seed via a hash of index.
        visible_ahead = visible_world
        spacing = 18
        # generate candidates a bit before and after the visible window so Pop-in is smooth
        start_world = math.floor((dist - 12) / spacing) * spacing
        end_world = dist + visible_ahead + 18
        sc_idx = 0
        world_d = start_world
        # precompute tree colors (windowed mode uses original constants)
        fs_trunk = TREE_TRUNK
        fs_foliage = TREE_COLOR
        fs_foliage2 = TREE_COLOR_2
        fs_bush = BUSH_COLOR
        fs_pole_cap = POLE_COLOR
        while world_d < end_world:
            depth = world_d - dist  # 0 = at bumper, visible_ahead = at horizon
            if 4 <= depth <= visible_ahead - 2:
                t = 1 - (depth / visible_ahead)  # 0 far, 1 near
                # pseudo-random per-object: side + kind + lateral jitter
                h = hash((int(self._curve_seed * 100000), int(world_d))) & 0xFFFFFF
                side_sign = -1 if (h & 1) else 1
                kind = h % 10  # 0..2 tree, 3 bush, 4..5 pole, 6 tall, 7 rock, else skip
                # biome density tweak
                biome = ROUTE_BIOMES.get(self.selected_route_name, ROUTE_BIOMES["Cross-Country"])
                if kind <=2 and (h>>8)%100 >= int(biome["tree_mul"]*100):
                    kind = 9  # skip tree
                if kind==3 and (h>>12)%100 >= int(biome["bush_mul"]*100):
                    kind = 9
                if kind <= 6:
                    idxf = t * (n_stations - 1)
                    lo = int(math.floor(idxf))
                    hi = min(n_stations - 1, lo + 1)
                    frac = idxf - lo
                    cx = centers[lo] * (1 - frac) + centers[hi] * frac
                    half = half_ws[lo] * (1 - frac) + half_ws[hi] * frac
                    y0 = ys[lo] * (1 - frac) + ys[hi] * frac
                    # scale with perspective (far = tiny, near = larger)
                    scale = 0.28 + 0.72 * t
                    # jitter so trees don't line up perfectly
                    jitter = ((h >> 4) % 11) - 5
                    base_x = cx + side_sign * (half + 14 * scale + jitter * scale * 0.5)
                    # keep inside canvas
                    # distance fade — far objects slightly dimmer (blend to hill)
                    fade = max(0.0, min(1.0, (t - 0.15) / 0.65))
                    if 6 <= base_x <= w - 6:
                        if kind <= 2:
                            # tree — classic pine, two-tone foliage for depth
                            trunk_w = max(1, int(2 * scale))
                            trunk_h = int(10 * scale)
                            foliage_h = int(18 * scale)
                            foliage_w = int(14 * scale)
                            # trunk
                            c.create_rectangle(base_x - trunk_w, y0 - trunk_h,
                                               base_x + trunk_w, y0,
                                               fill=TREE_TRUNK, outline="")
                            # lower foliage
                            c.create_polygon(base_x, y0 - trunk_h - foliage_h + 4*scale,
                                             base_x - foliage_w, y0 - trunk_h,
                                             base_x + foliage_w, y0 - trunk_h,
                                             fill=TREE_COLOR, outline="#1e3a2a")
                            # upper foliage highlight
                            c.create_polygon(base_x, y0 - trunk_h - foliage_h,
                                             base_x - foliage_w*0.6, y0 - trunk_h - foliage_h*0.55,
                                             base_x + foliage_w*0.6, y0 - trunk_h - foliage_h*0.55,
                                             fill=TREE_COLOR_2, outline="")
                        elif kind == 3:
                            # bush — rounded cluster
                            bw = int(12 * scale)
                            bh = int(8 * scale)
                            c.create_oval(base_x - bw, y0 - bh, base_x + bw, y0,
                                          fill=BUSH_COLOR, outline="#24402e")
                            c.create_oval(base_x - bw*0.6, y0 - bh*1.2, base_x + bw*0.5, y0 - bh*0.2,
                                          fill="#244a33", outline="")
                        elif kind == 6:
                            # tall pine
                            trunk_w = max(1, int(2 * scale))
                            trunk_h = int(14 * scale)
                            foliage_h = int(24 * scale)
                            foliage_w = int(16 * scale)
                            c.create_rectangle(base_x - trunk_w, y0 - trunk_h,
                                                base_x + trunk_w, y0,
                                                fill=TREE_TRUNK, outline="")
                            c.create_polygon(base_x, y0 - trunk_h - foliage_h,
                                             base_x - foliage_w, y0 - trunk_h,
                                             base_x + foliage_w, y0 - trunk_h,
                                             fill=TREE_COLOR, outline="#1e3a2a")
                            c.create_polygon(base_x, y0 - trunk_h - foliage_h,
                                             base_x - foliage_w*0.55, y0 - trunk_h - foliage_h*0.5,
                                             base_x + foliage_w*0.55, y0 - trunk_h - foliage_h*0.5,
                                             fill=TREE_COLOR_2, outline="")
                        elif kind in (4,5):
                            # pole — thin vertical + tiny cap, fades with distance
                            pole_h = int(16 * scale)
                            cap_c = "#c9a86a" if fade > 0.5 else "#8a7350"
                            c.create_line(base_x, y0, base_x, y0 - pole_h, fill=POLE_COLOR, width=max(1, int(2 * scale)))
                            c.create_oval(base_x - 2 * scale, y0 - pole_h - 2 * scale,
                                          base_x + 2 * scale, y0 - pole_h + 1 * scale,
                                          fill=cap_c, outline="")
                        elif kind == 7:
                            # rock — low boulder
                            rw = int(10 * scale)
                            rh = int(6 * scale)
                            c.create_oval(base_x - rw, y0 - rh, base_x + rw, y0,
                                          fill=ROCK_COLOR, outline="#3a3a40")
                            c.create_oval(base_x - rw*0.4, y0 - rh*0.7, base_x + rw*0.3, y0 - rh*0.2,
                                          fill="#35353a", outline="")
            world_d += spacing
            sc_idx += 1
            if sc_idx > 80:
                break

        # Mini car — 3/4 tiny model (polished, not flat box) — jitter-free spring
        _dr = getattr(self, "_dist_render", dist)
        near_cx = centers[-1]
        lean = 0
        if n_stations >= 3:
            lean = (centers[-1] - centers[-3]) * 0.10
        t = time.monotonic()
        bob = 0.35 * math.sin(t * 2.2 + progress * 3.0)
        steer = 0
        if n_stations >= 6:
            steer = (self._road_center_smooth(_dr + 22) - self._road_center_smooth(_dr + 6)) * 0.05
        scale = 0.85
        car_w = int(14 * scale)
        car_h = int(8 * scale)
        car_x = int(max(car_w+6, min(w-car_w-6, near_cx + lean + steer)))
        car_y = int((h - 14) + bob)
        c.create_oval(car_x - car_w, car_y + car_h - 1,
                      car_x + car_w, car_y + car_h + 3,
                      fill="#000000", outline="", stipple="gray50")
        if centers and getattr(self, "dark_mode", True):
            cx_ahead = centers[-3] if len(centers) >= 4 else centers[-1]
            y_ahead = ys[-4] if len(ys) >= 5 else ys[-2]
            for sx in (-5, 5):
                c.create_polygon(
                    car_x + sx*scale*0.7, car_y - 2,
                    cx_ahead + sx*4, y_ahead,
                    cx_ahead + sx*1.2, y_ahead,
                    car_x + sx*0.35*scale, car_y - 2,
                    fill="#0f2a1e", outline="", stipple="gray25")
        c.create_polygon(
            car_x - car_w, car_y - 2,
            car_x + car_w, car_y - 2,
            car_x + car_w - 2, car_y + car_h - 2,
            car_x - car_w + 2, car_y + car_h - 2,
            fill=CAR_COLOR, outline="#ffaa00", width=1, smooth=False)
        c.create_polygon(
            car_x - car_w + 4, car_y - car_h + 1,
            car_x + car_w - 4, car_y - car_h + 1,
            car_x + car_w - 6, car_y - 2,
            car_x - car_w + 6, car_y - 2,
            fill="#1a1e1c", outline="#2a2a2a", width=1)
        c.create_polygon(
            car_x - car_w + 6, car_y - car_h + 2,
            car_x + car_w - 6, car_y - car_h + 2,
            car_x + car_w - 7, car_y - 3,
            car_x - car_w + 7, car_y - 3,
            fill="#7ec8e3", outline="")
        c.create_line(car_x - 4, car_y - car_h + 3, car_x - 1, car_y - 4, fill="#eafff5", width=1)
        c.create_line(car_x - car_w + 5, car_y - car_h + 1, car_x + car_w -5, car_y - car_h + 1, fill="#2a2a2a", width=1)
        wheel_r = 2
        for dx in (-car_w + 4, car_w - 4):
            for dy in (-1, car_h - 4):
                c.create_oval(car_x + dx - wheel_r, car_y + dy - wheel_r, car_x + dx + wheel_r, car_y + dy + wheel_r,
                              fill="#0a0a0a", outline="#333333", width=1)
                c.create_oval(car_x + dx -1, car_y + dy -1, car_x + dx +1, car_y + dy +1, fill="#777777", outline="")
        c.create_oval(car_x - car_w + 1, car_y - 2, car_x - car_w + 4, car_y + 1, fill="#fff7b2", outline="#ffd54f")
        c.create_oval(car_x + car_w -4, car_y - 2, car_x + car_w -1, car_y + 1, fill="#fff7b2", outline="#ffd54f")
        c.create_oval(car_x - car_w + 2, car_y + car_h -4, car_x - car_w + 4, car_y + car_h -2, fill="#ff3b30", outline="")
        c.create_oval(car_x + car_w -4, car_y + car_h -4, car_x + car_w -2, car_y + car_h -2, fill="#ff3b30", outline="")
        c.create_oval(car_x +1, car_y - car_h - 2, car_x + 5*scale//2, car_y - car_h + 1,
                      fill="#fff7b2", outline="")

        # Overlays — keep progress + route label (manual-verification flags apply)
        pct_int = int(progress * 100)
        c.create_text(w - 44, h - 14, text=f"{pct_int}%", fill="#666666", font=("Consolas", 9, "bold"), anchor="e")
        c.create_text(10, h - 14, text=self.selected_route_name.upper(), fill="#444444", font=("Segoe UI", 7, "bold"), anchor="w")
        # Distance readout (km-ish world units) + cruise tag — bottom-left above route
        dist_km = dist / 42.0
        c.create_text(w - 44, 12, text=f"{dist_km:.1f} km  ·  CRUISE",
                      fill="#2a5a44", font=("Segoe UI", 6, "bold"), anchor="e")

    # ------------------------------------------------------------------
    # Time helpers
    # ------------------------------------------------------------------
    def parse_time(self, s: str) -> int:
        s = s.strip()
        if ":" in s:
            parts = s.split(":")
            if len(parts) != 2:
                raise ValueError
            m = int(parts[0]); sec = int(parts[1])
        else:
            m = int(s); sec = 0
        total = m * 60 + sec
        if total <= 0:
            raise ValueError
        # clamp 1 min .. 180 min
        total = max(60, min(180 * 60, total))
        return total

    def format_time(self, seconds: int) -> str:
        m, s = divmod(max(0, seconds), 60)
        return f"{m:02d}:{s:02d}"

    # ------------------------------------------------------------------
    # Timer
    # ------------------------------------------------------------------
    def start_timer(self):
        if self.is_running:
            return
        try:
            total_sec = self.parse_time(self.time_var.get())
        except ValueError:
            total_sec = self.selected_route_min * 60
            self.time_var.set(self.format_time(total_sec))

        # Update selected route name if custom duration
        mins = total_sec // 60
        if total_sec % 60 != 0:
            # non-round custom — keep as custom label
            self.selected_route_name = f"Custom · {mins}m {total_sec % 60}s"

        # Slow Roads vibe: new winding landscape per session so each drive
        # feels different without adding UI — re-seed the curve.
        self._curve_seed = random.random()
        self._curve_params = self._make_curve_params(self._curve_seed)
        self.dist = 0.0
        self._dist_render = 0.0
        self._dist_vel = 0.0
        self._t0 = __import__("time").monotonic()
        self._paused_acc = 0.0
        self._dist0 = 0.0
        self.total = total_sec
        self.remaining = total_sec
        self.is_running = True
        self.started_at_iso = sessions.now_iso()

        self._last_tick_time = time.monotonic()
        self.phase_label.config(text=f"On the road — {self.selected_route_name}")
        self.time_var.set(self.format_time(self.remaining))
        self.progress["maximum"] = self.total
        self.progress["value"] = 0
        self.dist = 0.0
        self.draw_road(0.0)

        self.start_btn.config(state="disabled")
        self.pause_btn.config(state="normal", text="Pause")
        self.reset_btn.config(state="normal")
        self.intent_entry.config(state="disabled")

        self.quote_label.config(text=f'"{random.choice(QUOTES)}"')
        play_beep_start()
        if self.sound_enabled.get():
            sounds.start(volume=float(self.volume_var.get()))

        threading.Thread(target=self.loop, daemon=True).start()

    def loop(self):
        next_quote_at = self.remaining - min(300, max(60, self.total // 2))
        while self.is_running and self.remaining > 0:
            time.sleep(1)
            if not self.is_running:
                break
            if self.pause_btn["text"] == "Resume":
                continue
            self.remaining -= 1
            self.root.after(0, self.tick_ui)
            if self.remaining <= next_quote_at and self.remaining > 0:
                next_quote_at -= 300
                self.root.after(0, self.update_quote)
        if self.is_running:
            self.root.after(0, self.finish_phase)

    def tick_ui(self):
        self.time_var.set(self.format_time(self.remaining))
        # smooth progress tween
        target = self.total - self.remaining
        self._tween_progress(float(target))
        prog = 1.0 - (self.remaining / self.total) if self.total else 0.0
        prog = max(0.0, min(1.0, prog))
        self.dist = self._dist_for_progress(prog)
        self._dist_render = self.dist
        self._dist_vel = 0
        self._last_tick_time = time.monotonic()
        self.draw_road(prog)

    def update_quote(self):
        # fade out/in
        try:
            self.quote_label.configure(fg=(THEME)["bg"])
            self.root.after(140, lambda: self.quote_label.configure(text=f'"{random.choice(QUOTES)}"', fg=(THEME)["muted"]))
        except Exception:
            self.quote_label.config(text=f'"{random.choice(QUOTES)}"')

    def finish_phase(self):
        play_beep_end()
        sounds.stop()
        # persist
        intent = self.intent_var.get().strip() or "(no intent)"
        s = sessions.Session(
            started_at=self.started_at_iso,
            finished_at=sessions.now_iso(),
            duration_min=self.total // 60 if self.total % 60 == 0 else round(self.total / 60),
            intent=intent,
            route=self.selected_route_name,
            completed=True,
            sound_on=self.sound_enabled.get(),
        )
        sessions.save_session(s)
        self.try_vault_sync(s, completed=True)

        if notification:
            try:
                notification.notify(title="Arrived", message=f"{self.selected_route_name} complete — {intent}", timeout=5)
            except Exception:
                pass

        self.is_running = False
        self.start_btn.config(state="normal")
        self.pause_btn.config(state="disabled", text="Pause")
        self.reset_btn.config(state="normal")
        self.intent_entry.config(state="normal")
        self.phase_label.config(text=f"Arrived — {self.selected_route_name} ✓")
        self.draw_road(1.0)
        self.refresh_trip_stats()
        self.update_quote()
        # slide-in popup top-right
        try:
            self.root.after(180, lambda: self._show_completion_popup(s))
        except: pass
        # celebration: flash the car color briefly
        self.root.after(200, lambda: self.canvas.config(bg="#0f1a14"))
        self.root.after(500, lambda: self.canvas.config(bg="#0a0a0a"))

    def toggle_pause(self):
        if not self.is_running:
            return
        if self.pause_btn["text"] == "Pause":
            self.pause_btn.config(text="Resume")
            self._paused_at = __import__("time").monotonic()
            self.phase_label.config(text="Paused — engine idling")
            if sounds.is_playing():
                sounds.stop()
        else:
            self.pause_btn.config(text="Pause")
            try:
                self._paused_acc += __import__("time").monotonic() - getattr(self, "_paused_at", __import__("time").monotonic())
            except: pass
            self._last_tick_time = time.monotonic()
            self.phase_label.config(text=f"On the road — {self.selected_route_name}")
            if self.sound_enabled.get():
                kind = getattr(self, "noise_kind", None)
                k = kind.get() if hasattr(kind, "get") else "brown"
                sounds.start(volume=float(self.volume_var.get()), kind=k, hum=True)

    def reset_timer(self):
        was_running = self.is_running
        self.is_running = False
        sounds.stop()
        # If we were mid-session, log as abandoned (optional)
        if was_running and self.total and self.remaining < self.total and self.remaining > 0:
            try:
                intent = self.intent_var.get().strip() or "(no intent)"
                s = sessions.Session(
                    started_at=self.started_at_iso,
                    finished_at=sessions.now_iso(),
                    duration_min=(self.total - self.remaining) // 60,
                    intent=intent + " (abandoned)",
                    route=self.selected_route_name,
                    completed=False,
                    sound_on=self.sound_enabled.get(),
                )
                sessions.save_session(s)
            except Exception:
                pass
        self.pause_btn.config(text="Pause", state="disabled")
        self.start_btn.config(state="normal")
        self.reset_btn.config(state="disabled")
        self.intent_entry.config(state="normal")
        self.phase_label.config(text="Ready to roll")
        self.dist = 0.0
        # Reset animation state so road returns to stationary
        self._dist_render = 0.0
        self._dist_vel = 0.0
        # restore time to selected route
        try:
            sec = self.parse_time(self.time_var.get())
        except ValueError:
            sec = self.selected_route_min * 60
        # but if no valid parse, reset to route default
        if self.remaining == 0 or self.total == 0:
            sec = self.selected_route_min * 60
        self.time_var.set(self.format_time(sec if sec else self.selected_route_min * 60))
        self.progress["value"] = 0
        self.draw_road(0.0)
        self.refresh_trip_stats()

    # ------------------------------------------------------------------
    # Vault hook (optional — no hard dep)
    # ------------------------------------------------------------------
    def try_vault_sync(self, session: sessions.Session, completed: bool):
        try:
            import vault_sync  # local file, created in Phase 2

            vault_sync.sync_session(session)
        except ImportError:
            pass
        except Exception as e:
            # never crash the timer on vault failure
            print(f"[vault_sync] failed: {e}")

    # ------------------------------------------------------------------
    # Trip Log window
    # ------------------------------------------------------------------
    def refresh_trip_stats(self):
        all_s = sessions.load_sessions()
        c = sessions.completed_count(all_s)
        mins = sessions.total_minutes(all_s)
        hrs = mins / 60
        self.stats_label.config(text=f"Trips: {c}  ·  Road time: {mins} min ({hrs:.1f} h)")

    def open_trip_log(self):
        all_s = sessions.load_sessions()
        win = tk.Toplevel(self.root)
        win.title("Trip Log")
        win.geometry("620x360")
        win.configure(bg="#0a0a0a")
        tk.Label(win, text="TRIP LOG", fg="#00ff88", bg="#0a0a0a", font=("Segoe UI", 12, "bold")).pack(pady=(10, 4))
        tk.Label(win, text=f"{len(all_s)} records  ·  {sessions.completed_count(all_s)} completed  ·  {sessions.total_minutes(all_s)} min total",
                 fg="#666666", bg="#0a0a0a", font=("Segoe UI", 8)).pack()

        cols = ("finished", "route", "min", "intent", "done")
        tree = ttk.Treeview(win, columns=cols, show="headings", height=14)
        for col, w in zip(cols, (140, 140, 50, 200, 50)):
            tree.heading(col, text=col.upper())
            tree.column(col, width=w, anchor="w" if col != "min" else "center")
        tree.pack(fill="both", expand=True, padx=10, pady=10)

        # style
        style = ttk.Style(win)
        style.configure("Treeview", background="#111111", foreground="#cccccc", rowheight=22, fieldbackground="#111111")
        style.configure("Treeview.Heading", background="#1a1a1a", foreground="#888888")

        for s in reversed(all_s[-200:]):
            # show date part of ISO
            date = s.finished_at[:16].replace("T", " ")
            tree.insert("", "end", values=(date, s.route, s.duration_min, s.intent[:48], "✓" if s.completed else "—"))

        tk.Button(win, text="Close", command=win.destroy, fg="#ffffff", bg="#222222", bd=0, padx=12, pady=4).pack(pady=(0, 10))

    def clear_log(self):
        # confirm
        win = tk.Toplevel(self.root)
        win.title("Clear log?")
        win.geometry("320x120")
        win.configure(bg="#0a0a0a")
        tk.Label(win, text="Clear all trip history?", fg="#ff6b6b", bg="#0a0a0a", font=("Segoe UI", 10, "bold")).pack(pady=(14, 4))
        tk.Label(win, text="This cannot be undone.", fg="#666666", bg="#0a0a0a", font=("Segoe UI", 8)).pack()
        btns = tk.Frame(win, bg="#0a0a0a")
        btns.pack(pady=10)
        def do_clear():
            try:
                if sessions.SESSIONS_FILE.exists():
                    sessions.SESSIONS_FILE.unlink()
            except Exception:
                pass
            self.refresh_trip_stats()
            win.destroy()
        tk.Button(btns, text="Cancel", command=win.destroy, fg="#ffffff", bg="#222222", bd=0, padx=12, pady=4).pack(side="left", padx=4)
        tk.Button(btns, text="Clear", command=do_clear, fg="#ffffff", bg="#cc3333", bd=0, padx=12, pady=4).pack(side="left", padx=4)


class Api:
    """JS bridge for pywebview — reuses sessions/vault_sync/sounds"""
    def __init__(self, app_ref=None):
        self.app_ref = app_ref
    def get_config(self):
        try:
            return _load_config()
        except Exception:
            return {"dark": True}
    def save_config(self, cfg):
        try:
            if isinstance(cfg, str):
                import json as _j
                cfg = _j.loads(cfg)
            _save_config(cfg)
            return True
        except Exception as e:
            return str(e)
    def get_state(self):
        # Called from JS to get timer state
        try:
            app = self.app_ref
            if app and hasattr(app, 'remaining'):
                return {"remaining": int(app.remaining), "total": int(app.total), "is_running": bool(app.is_running), "route": app.selected_route_name, "intent": app.intent_var.get() if hasattr(app, 'intent_var') else ""}
        except Exception:
            pass
        return {"remaining": 0, "total": 0, "is_running": False}
    def save_session(self, data):
        try:
            import json as _j
            if isinstance(data, str):
                data = _j.loads(data)
            s = sessions.Session(
                started_at=data.get("started_at", sessions.now_iso()),
                finished_at=data.get("finished_at", sessions.now_iso()),
                duration_min=int(data.get("duration_min", 0)),
                intent=str(data.get("intent", "(no intent)")),
                route=str(data.get("route", "Web")),
                completed=bool(data.get("completed", True)),
                sound_on=bool(data.get("sound_on", False))
            )
            sessions.save_session(s)
            try:
                import vault_sync
                vault_sync.sync_session(s)
            except Exception:
                pass
            return True
        except Exception as e:
            return str(e)
    def play_hum(self, vol):
        try:
            if vol:
                sounds.start(volume=float(vol))
            else:
                sounds.stop()
            return True
        except Exception as e:
            return str(e)

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--web", action="store_true", help="Launch web (React+motion) via pywebview if available")
    args, _ = ap.parse_known_args()
    if args.web:
        try:
            import webview  # pywebview
            import pathlib as _pl
            html = _pl.Path(__file__).with_name("roadtrip_web.html")
            # also check docs/roadtrip.html as fallback for Pages
            if not html.exists():
                html = _pl.Path(__file__).parents[2] / "Second-Brain" / "Second-Brain" / "docs" / "roadtrip.html"
            url = html.as_uri() if html.exists() else "https://anirudh-2810.github.io/Second-Brain/roadtrip.html"
            # Create a hidden Tk app to own sessions state for Api
            # Use a dummy root for state
            api = Api()
            # Try to create window
            webview.create_window("Roadtrip Focus — Drive into deep work", url, width=900, height=700, js_api=api)
            webview.start()
            return
        except Exception as e:
            print(f"[web] pywebview not available or failed ({e}), falling back to Tk")
    root = tk.Tk()
    app = RoadtripFocus(root)
    root.mainloop()


if __name__ == "__main__":
    main()

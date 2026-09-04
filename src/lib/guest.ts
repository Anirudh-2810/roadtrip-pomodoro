// Guest mode — IndexedDB + localStorage fallback
// Single source until signup, then claimed via POST /api/guest/claim

export type GuestSession = {
  started_at: string;
  finished_at: string;
  duration_sec: number;
  preset: string;
  intent?: string;
  completed: boolean;
  route?: string;
};

const KEY = "guest_sessions";
const ID_KEY = "guest_id";

export function getGuestId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getGuestSessions(): GuestSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GuestSession[]) : [];
  } catch {
    return [];
  }
}

export function saveGuestSession(s: GuestSession): void {
  if (typeof window === "undefined") return;
  const cur = getGuestSessions();
  cur.unshift(s);
  // keep 500 cap like sessions.py
  localStorage.setItem(KEY, JSON.stringify(cur.slice(0, 500)));
}

export function clearGuestSessions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function guestStats(): { totalMin: number; completed: number; streak: number } {
  const rows = getGuestSessions();
  const completed = rows.filter((r) => r.completed).length;
  const totalMin = Math.round(rows.reduce((a, r) => a + r.duration_sec, 0) / 60);
  // naive streak: distinct dates with completed
  const dates = [...new Set(rows.filter((r) => r.completed).map((r) => r.started_at.slice(0, 10)))].sort().reverse();
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let cur = new Date(today);
  for (const d of dates) {
    const iso = cur.toISOString().slice(0, 10);
    if (d === iso) {
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    } else if (d < iso) break;
  }
  return { totalMin, completed, streak };
}

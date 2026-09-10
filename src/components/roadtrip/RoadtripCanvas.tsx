"use client";
import { useEffect, useRef } from "react";

type Props = {
  distRef: React.MutableRefObject<number>;
  distRenderRef: React.MutableRefObject<number>;
  seed: number;
  progress: number;
  isRunningRef: React.MutableRefObject<boolean>;
  isPausedRef: React.MutableRefObject<boolean>;
  pausedOffRef: React.MutableRefObject<number>;
  parkedRef: React.MutableRefObject<boolean>;
  parkTRef: React.MutableRefObject<number>;
  parkAnimRef: React.MutableRefObject<{ from: number; t0: number; dir: boolean }>;
};

const SCENERY_SPEED = 18;

export default function RoadtripCanvas({ distRef: _distRef, distRenderRef, seed, progress, isRunningRef, isPausedRef, pausedOffRef, parkedRef, parkTRef, parkAnimRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const idlePhaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const persp = (t: number) => 1 - Math.pow(1 - t, 1.65);
    // curve params memoized from seed
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647, (s - 1) / 2147483646);
    const params: [number, number, number, number, number, number] = [
      42 + rnd() * 26,
      14 + rnd() * 12,
      0.028 + rnd() * 0.02,
      0.11 + rnd() * 0.06,
      rnd() * 6.28,
      rnd() * 6.28,
    ];
    const roadCenter = (d: number) => params[0] * Math.sin(d * params[2] + params[4]) + params[1] * Math.sin(d * params[3] + params[5]);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const W = w, H = h, horizon = H * 0.28, d = distRenderRef.current;
      let idlePhase = idlePhaseRef.current;
      if (!isPausedRef.current && !isRunningRef.current) {
        idlePhase = (idlePhase + 0.016 * 0.02 * SCENERY_SPEED) % 1;
        idlePhaseRef.current = idlePhase;
      }
      ctx.clearRect(0, 0, W, H);
      const grad = ctx.createLinearGradient(0, 0, 0, horizon);
      grad.addColorStop(0, "#060a0e");
      grad.addColorStop(1, "#0e1e18");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, horizon);
      ctx.fillStyle = "#a0a0a0";
      for (let sx = 0; sx < W; sx += 47 * dpr) {
        const hsh = (sx * 7 + Math.floor(seed * 1000)) % 255;
        if (hsh < 38) {
          const tw = 0.6 + 0.4 * Math.sin(d * 0.02 + sx * 0.013);
          if (tw > 0.4) {
            const sy = (hsh % (horizon - 8 * dpr)) + 3 * dpr;
            ctx.globalAlpha = 0.6 + 0.4 * tw;
            ctx.beginPath();
            ctx.arc(sx, sy, 1 * dpr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      const hills: Array<[string, number, number, number, number]> = [
        ["#051510", 0.22, 420 * dpr, 22 * dpr, 0.018 / dpr],
        ["#0a201a", 0.45, 360 * dpr, 18 * dpr, 0.024 / dpr],
        ["#153025", 0.85, 300 * dpr, 14 * dpr, 0.032 / dpr],
      ];
      hills.forEach(([col, speed, tile, amp, freq]) => {
        const off = (-d * speed) % tile;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-tile + off - 20 * dpr, horizon);
        for (let x = -tile + off - 20 * dpr; x < W + tile + 20 * dpr; x += 10 * dpr) {
          const bump = amp * Math.sin((x + off * 0.7) * freq) + amp * 0.45 * Math.sin((x + off * 0.4) * freq * 2.3 + 1.7);
          ctx.lineTo(x, horizon - Math.max(0, bump));
        }
        ctx.lineTo(W + tile + 20 * dpr, horizon);
        ctx.lineTo(-tile + off - 20 * dpr, horizon);
        ctx.closePath();
        ctx.fill();
      });
      ctx.fillStyle = "rgba(10,20,16,0.5)";
      for (let i = 0; i < 6; i++) ctx.fillRect(0, horizon + i * 2 * dpr, W, 2 * dpr);
      ctx.strokeStyle = "#1e2e28";
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(W, horizon);
      ctx.stroke();
      const n = 18, visible = 140, halfNear = 260 * dpr * (W / 620), halfFar = 42 * dpr * (W / 620);
      const centers: number[] = [], ys: number[] = [], halfs: number[] = [];
      for (let i = 0; i < n; i++) {
        const tlin = i / (n - 1), pt = persp(tlin);
        const depth = (1 - pt) * visible, wd = d + depth;
        let cx = W / 2 + roadCenter(wd);
        const maxOff = pt < 0.15 ? W / 2 - halfFar - 18 * dpr : W / 2 - 30 * dpr;
        cx = Math.max(W / 2 - maxOff, Math.min(W / 2 + maxOff, cx));
        centers.push(cx);
        ys.push(horizon * (1 - pt) + H * pt);
        halfs.push(halfFar * (1 - pt) + halfNear * pt);
      }
      ctx.fillStyle = "#1a1a1a";
      ctx.strokeStyle = "#2a2a2a";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.lineTo(centers[i] - halfs[i], ys[i]);
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(centers[i] + halfs[i], ys[i]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = 2 * dpr;
      ([-1, 1] as const).forEach((sg) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = centers[i] + sg * (halfs[i] - 8 * dpr);
          if (i === 0) ctx.moveTo(x, ys[i]);
          else ctx.lineTo(x, ys[i]);
        }
        ctx.stroke();
      });
      ctx.strokeStyle = "#00e69a";
      const segLens: number[] = [];
      for (let i = 0; i < n - 1; i++) segLens.push(Math.hypot(centers[i + 1] - centers[i], ys[i + 1] - ys[i]));
      const dash = 14 * dpr, gap = 14 * dpr, pat = dash + gap;
      let off: number;
      if (parkedRef.current || isPausedRef.current) off = pausedOffRef.current;
      else if (isRunningRef.current) { off = (d * 0.18) % pat; pausedOffRef.current = off; }
      else { off = idlePhase * pat; pausedOffRef.current = off; }
      let acc = 0;
      for (let i = 0; i < n - 1; i++) {
        const seg = segLens[i], a = acc, b = acc + seg;
        const k0 = Math.floor((a - off) / pat), k1 = Math.ceil((b - off) / pat);
        for (let k = k0; k <= k1; k++) {
          const d0 = k * pat + off, d1 = d0 + dash, cs = Math.max(a, d0), ce = Math.min(b, d1);
          if (ce - cs < 2 * dpr) continue;
          const f0 = (cs - a) / seg, f1 = (ce - a) / seg;
          const x0 = centers[i] * (1 - f0) + centers[i + 1] * f0, y0 = ys[i] * (1 - f0) + ys[i + 1] * f0;
          const x1 = centers[i] * (1 - f1) + centers[i + 1] * f1, y1 = ys[i] * (1 - f1) + ys[i + 1] * f1;
          const tmid = (i + 0.5) / n, lw = Math.max(1 * dpr, 3.2 * dpr * (0.35 + 0.65 * tmid));
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        acc += seg;
      }
      const spacing = 18, start = Math.floor((d - 12) / spacing) * spacing, end = d + visible + 18;
      for (let wd = start; wd < end; wd += spacing) {
        const depth = wd - d;
        if (depth < 4 || depth > visible - 2) continue;
        const t = 1 - depth / visible;
        const hsh = (Math.floor(seed * 100000) + Math.floor(wd)) % 100000 & 0xffffff;
        let kind = hsh % 10;
        if (kind <= 2 && ((hsh >> 8) % 100) >= 60) kind = 9 as unknown as number;
        if (kind === 3 && ((hsh >> 12) % 100) >= 50) kind = 9 as unknown as number;
        if (kind > 7 && (kind as number) !== 9) continue;
        if ((kind as number) === 9) continue;
        const idxf = t * (n - 1), lo = Math.floor(idxf), hi = Math.min(n - 1, lo + 1), f = idxf - lo;
        const cx = centers[lo] * (1 - f) + centers[hi] * f, half = halfs[lo] * (1 - f) + halfs[hi] * f, y0 = ys[lo] * (1 - f) + ys[hi] * f;
        const scale = 0.28 + 0.72 * t, jitter = ((hsh >> 4) % 11) - 5, side = (hsh & 1 ? -1 : 1);
        const baseX = cx + side * (half + 14 * scale * dpr + jitter * scale * 0.5 * dpr);
        if (baseX < 6 * dpr || baseX > W - 6 * dpr) continue;
        if (kind <= 2) {
          const trW = 2 * scale * dpr, trH = 10 * scale * dpr, folH = 18 * scale * dpr, folW = 14 * scale * dpr;
          ctx.fillStyle = "#2b1a0e";
          ctx.fillRect(baseX - trW, y0 - trH, 2 * trW, trH);
          ctx.fillStyle = "#1c3a2a";
          ctx.beginPath();
          ctx.moveTo(baseX, y0 - trH - folH);
          ctx.lineTo(baseX - folW, y0 - trH);
          ctx.lineTo(baseX + folW, y0 - trH);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#2b1a0e";
          ctx.beginPath();
          ctx.moveTo(baseX, y0 - trH - folH);
          ctx.lineTo(baseX - folW * 0.6, y0 - trH - folH * 0.55);
          ctx.lineTo(baseX + folW * 0.6, y0 - trH - folH * 0.55);
          ctx.closePath();
          ctx.fill();
        } else if (kind === 3) {
          const bw = 12 * scale * dpr, bh = 8 * scale * dpr;
          ctx.fillStyle = "#1e3320";
          ctx.beginPath();
          ctx.ellipse(baseX, y0 - bh * 0.6, bw, bh * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#244a33";
          ctx.beginPath();
          ctx.ellipse(baseX - bw * 0.15, y0 - bh * 0.9, bw * 0.55, bh * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind >= 4) {
          ctx.strokeStyle = "#3a3a3a";
          ctx.lineWidth = 2 * scale * dpr;
          const ph = 16 * scale * dpr;
          ctx.beginPath();
          ctx.moveTo(baseX, y0);
          ctx.lineTo(baseX, y0 - ph);
          ctx.stroke();
          ctx.fillStyle = "#c9a86a";
          ctx.beginPath();
          ctx.ellipse(baseX, y0 - ph, 2 * scale * dpr, 2 * scale * dpr, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const nearCx = centers[n - 1], lean = (centers[n - 1] - centers[n - 3]) * 0.1;
      // Break mode: slow cinematic pull-over onto the road's edge line.
      // Time-based smootherstep tween (4.5s out, 3s back) — survives effect
      // re-subscribes because tween state lives in parkAnimRef, not the closure.
      const parked = parkedRef.current;
      const nowMs = performance.now();
      const anim = parkAnimRef.current;
      if (anim.dir !== parked) { anim.dir = parked; anim.from = parkTRef.current; anim.t0 = nowMs; }
      const parkDur = parked ? 4500 : 3000;
      const k = Math.min(1, (nowMs - anim.t0) / parkDur);
      const s = k * k * k * (k * (k * 6 - 15) + 10);
      parkTRef.current = anim.from + ((parked ? 1 : 0) - anim.from) * s;
      const parkT = parkTRef.current;
      const bob = 0.35 * Math.sin(Date.now() * 0.0022 + progress * 3) * (1 - parkT);
      let steer = 0;
      if (n >= 6) steer = (roadCenter(d + 22) - roadCenter(d + 6)) * 0.05;
      const scaleCar = 0.85, carW = 14 * scaleCar * dpr, carH = 8 * scaleCar * dpr;
      const cruiseX = Math.max(carW + 6 * dpr, Math.min(W - carW - 6 * dpr, nearCx + lean + steer));
      // shoulder = straddling the right edge line (wheels on asphalt, not in the grass)
      const shoulderX = Math.max(carW + 6 * dpr, Math.min(W - carW - 6 * dpr, centers[n - 1] + halfs[n - 1] - carW * 1.1));
      const carX = cruiseX + (shoulderX - cruiseX) * parkT, carY = H - 14 * dpr + bob * dpr;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.ellipse(carX, carY + carH - 1 * dpr, carW, 3 * dpr, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffcc33";
      ctx.strokeStyle = "#ffaa00";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(carX - carW, carY - 2 * dpr);
      ctx.lineTo(carX + carW, carY - 2 * dpr);
      ctx.lineTo(carX + carW - 2 * dpr, carY + carH - 2 * dpr);
      ctx.lineTo(carX - carW + 2 * dpr, carY + carH - 2 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1a1e1c";
      ctx.beginPath();
      ctx.moveTo(carX - carW + 4 * dpr, carY - carH + 1 * dpr);
      ctx.lineTo(carX + carW - 4 * dpr, carY - carH + 1 * dpr);
      ctx.lineTo(carX + carW - 6 * dpr, carY - 2 * dpr);
      ctx.lineTo(carX - carW + 6 * dpr, carY - 2 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7ec8e3";
      ctx.beginPath();
      ctx.moveTo(carX - carW + 6 * dpr, carY - carH + 2 * dpr);
      ctx.lineTo(carX + carW - 6 * dpr, carY - carH + 2 * dpr);
      ctx.lineTo(carX + carW - 7 * dpr, carY - 3 * dpr);
      ctx.lineTo(carX - carW + 7 * dpr, carY - 3 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0a0a0a";
      for (const dx of [-carW + 4 * dpr, carW - 4 * dpr]) for (const dy of [-1 * dpr, carH - 4 * dpr]) { ctx.beginPath(); ctx.arc(carX + dx, carY + dy, 2 * dpr, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#fff7b2";
      ctx.beginPath();
      ctx.ellipse(carX - carW + 2 * dpr, carY - 0.5 * dpr, 1.5 * dpr, 1.2 * dpr, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(carX + carW - 2 * dpr, carY - 0.5 * dpr, 1.5 * dpr, 1.2 * dpr, 0, 0, Math.PI * 2);
      ctx.fill();
      if (parkT > 0.6) {
        // hazard blink while parked: alternate amber/red at ~2Hz
        const phase = Math.floor(Date.now() / 500) % 2 === 0;
        ctx.fillStyle = phase ? "#ffaa00" : "#ff3b30";
        ctx.globalAlpha = 0.9;
        for (const dx of [-carW + 1 * dpr, carW - 1 * dpr]) { ctx.beginPath(); ctx.arc(carX + dx, carY - carH - 0.5 * dpr, 1.6 * dpr, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [seed, progress, distRenderRef, isRunningRef, isPausedRef, pausedOffRef, parkedRef, parkTRef, parkAnimRef]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

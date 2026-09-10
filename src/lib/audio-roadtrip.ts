// Roadtrip audio — mirrors roadtrip_web.html / sounds.py
// 4 kinds: white / pink (Kellet 6-pole) / brown (leak) / rain (pink + droplets) + optional hum 55+110 Hz
// 4s gapless stereo AudioBuffer loop via Web Audio, live-vol without rebuild, kind/hum rebuilds seamlessly

export type NoiseKind = "white" | "pink" | "brown" | "rain";

type Handle = { ctx: AudioContext; src: AudioBufferSourceNode; gain: GainNode } | null;

let handle: Handle = null;
let currentKind: NoiseKind | null = null;
let currentHum: boolean | null = null;

function buildBuffer(ctx: AudioContext, kind: NoiseKind, humOn: boolean, vol: number): AudioBuffer {
  const bufferSize = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let brown = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      brown = brown + white * 0.02;
      brown *= 0.998;
      let v: number;
      if (kind === "white") v = white;
      else if (kind === "pink") v = pink;
      else if (kind === "brown") v = brown * 3.5;
      else v = pink * 0.8 + (Math.random() < 0.002 ? Math.random() * 0.5 : 0);
      const t = i / ctx.sampleRate;
      const drone = humOn ? (0.35 * Math.sin(2 * Math.PI * 55 * t) + 0.18 * Math.sin(2 * Math.PI * 110 * t)) * 0.6 : 0;
      data[i] = (v * 0.45 + drone * 0.5) * vol * 0.9;
    }
  }
  return buf;
}

export function startRoadtripAudio(kind: NoiseKind, humOn: boolean, vol: number): void {
  if (handle) stopRoadtripAudio();
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    const buf = buildBuffer(ctx, kind, humOn, vol);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    // start silent — the caller (RAF tick / vol effect) sets the true level
    // via setRoadtripVol within a frame. Starting at 1 caused a full-volume
    // flash on every resume before the ramp-down could apply (2026-09-10).
    gain.gain.value = 0;
    src.connect(gain).connect(ctx.destination);
    if (ctx.state === "suspended") void ctx.resume();
    try { src.start(0); } catch {}
    handle = { ctx, src, gain };
    currentKind = kind;
    currentHum = humOn;
  } catch (e) {
    console.warn("[audio] start fail", e);
    handle = null;
  }
}

export function stopRoadtripAudio(): void {
  try {
    if (!handle) return;
    try { handle.src.stop(); } catch {}
    try { handle.ctx.close(); } catch {}
  } catch {}
  handle = null;
  currentKind = null;
  currentHum = null;
}

export function setRoadtripVol(vol: number): void {
  if (!handle) return;
  try { handle.gain.gain.setValueAtTime(vol, handle.ctx.currentTime); } catch {}
  // also need to clamp? handled by caller 0-0.5
}

export function ensureRoadtripAudio(kind: NoiseKind, humOn: boolean, vol: number, shouldPlay: boolean): void {
  if (!shouldPlay) {
    if (handle) stopRoadtripAudio();
    return;
  }
  const needsRebuild = handle && (kind !== currentKind || humOn !== currentHum);
  if (needsRebuild) stopRoadtripAudio();
  if (!handle) startRoadtripAudio(kind, humOn, vol);
  else setRoadtripVol(vol);
}

export function isAudioPlaying(): boolean {
  return handle !== null;
}

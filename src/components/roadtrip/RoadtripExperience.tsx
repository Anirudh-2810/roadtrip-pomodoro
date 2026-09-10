"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import RoadtripCanvas from "./RoadtripCanvas";
import { ensureRoadtripAudio, setRoadtripVol } from "@/lib/audio-roadtrip";
import { saveGuestSession, removeGuestSession } from "@/lib/guest";
import { parsePreset } from "@/lib/validation";
import { formatIST } from "@/lib/datetime";

type NoiseKind = "brown" | "pink" | "white" | "rain";
const ROUTES: Array<{ name: string; mins: number; desc: string; order: string; km: string }> = [
  { name: "Coastal Hop", mins: 25, desc: "Quick sprint — one focused stretch", order: "RO-252500", km: "3.8 km" },
  { name: "Desert Stretch", mins: 50, desc: "Deep work block — stay with it", order: "RO-505000", km: "7.5 km" },
  { name: "Mountain Pass", mins: 90, desc: "Long haul — settle in", order: "RO-909000", km: "13.5 km" },
  { name: "Cross-Country", mins: 120, desc: "Marathon — the scenic way", order: "RO-12012000", km: "18.0 km" },
];
const SCENERY_SPEED = 18;
function fmt(s: number) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }

export default function RoadtripExperience({ userEmail }: { userEmail: string | null }) {
  const [intent, setIntent] = useState("");
  const [routeName, setRouteName] = useState(ROUTES[0].name);
  const [routeMin, setRouteMin] = useState(ROUTES[0].mins);
  const [remaining, setRemaining] = useState(ROUTES[0].mins*60);
  const [total, setTotal] = useState(ROUTES[0].mins*60);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seed, setSeed] = useState(()=>Math.random());
  const [showCover, setShowCover] = useState(()=>{ try{ return !sessionStorage.getItem("rf_cover_dismissed"); }catch{ return true; }});
  const [showDone, setShowDone] = useState(false);
  const [doneInfo, setDoneInfo] = useState<Record<string,unknown>|null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logRows, setLogRows] = useState<Array<Record<string,unknown>>>([]);
  const [noiseKind, setNoiseKind] = useState<NoiseKind>("brown");
  const [humOn, setHumOn] = useState(true);
  const [vol, setVolV] = useState(0.28);
  const [sheetTab, setSheetTab] = useState<"onroad"|"delivered">("onroad");
  const [csrf, setCsrf] = useState<string|null>(null);
  const [customMin, setCustomMin] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState(0);
  const [buildLines, setBuildLines] = useState<string[]>([]);

  const distRef = useRef(0);
  const distRenderRef = useRef(0);
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const pausedOffRef = useRef(0);
  const startedAtRef = useRef<string|null>(null);
  const t0Ref = useRef(performance.now());
  const pausedRef = useRef(0);
  const pausedAt = useRef<number|null>(null);
  const canvasWrapRef = useRef<HTMLDivElement|null>(null);
  const hideTimerRef = useRef<number|null>(null);
  const buildingTimerRef = useRef<number|null>(null);
  const lastBuildRef = useRef<string>("");
  // one-fire guard: the RAF tick can invoke onFinish on back-to-back frames
  // with a stale `remaining` closure before React re-subscribes the effect.
  // Keyed on a stable per-run id (NOT startedAtRef — finish nulls that, which
  // let the second fire mint a fresh timestamp and slip past the old guard).
  const runIdRef = useRef(0);
  const finishedRunRef = useRef<number|null>(null);
  // Break mode (Option A manual pull-over): parked car + local countdown.
  // Never creates sessions rows; run clock stays frozen via the pause path.
  const parkedRef = useRef(false);
  const parkTRef = useRef(0);
  const [breakState, setBreakState] = useState<{ total: number; remaining: number; settled: boolean } | null>(null);
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const breakTimerRef = useRef<number|null>(null);
  const breakLeftRef = useRef(0);
  const breakPendingRef = useRef(0);
  const breakResumeRef = useRef(false);
  const mergingRef = useRef(false);
  const chimeRef = useRef(true);
  // Drive model for smooth pull-over: cruise → pull → park → merge → cruise.
  // Pull/merge freeze the wall clock and integrate distance manually with a
  // ramped speed factor, so the car steers over WHILE the world decelerates.
  const speedRef = useRef(1);
  const pullPhaseRef = useRef<"cruise"|"pull"|"park"|"merge">("cruise");
  const phaseT0Ref = useRef(0);
  const lastTickRef = useRef(0);
  const lastVolRef = useRef(-1);
  const manualOffsetRef = useRef(0);
  const mergeFromRef = useRef(1);
  const smoother = useCallback((t:number)=> t*t*t*(t*(t*6-15)+10),[]);
  const volRef = useRef(vol);
  useEffect(()=>{ volRef.current=vol; },[vol]);
  const driveVol = useCallback((v:number)=>{ const q=Math.round(v*60); if(q!==lastVolRef.current){ lastVolRef.current=q; try{ setRoadtripVol(v); }catch{} } },[]);
  const [syncState, setSyncState] = useState<"idle"|"saving"|"saved"|"local"|"failed">("idle");
  const progress = total ? (total-remaining)/total : 0;

  useEffect(()=>{ fetch("/api/csrf").then(r=>r.json()).then(j=>setCsrf(j.csrf as string)).catch(()=>{}); }, []);
  const dismissCover = useCallback(()=>{ try{ sessionStorage.setItem("rf_cover_dismissed","1"); }catch{}; setShowCover(false); }, []);

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("rf_state");
      if(!raw) return;
      const s=JSON.parse(raw) as Record<string,unknown>;
      if(Date.now()-(Number(s.ts)||0) > 24*3600*1000) return;
      if(typeof s.intent==="string") setIntent(s.intent as string);
      if(typeof s.routeName==="string") setRouteName(s.routeName as string);
      if(typeof s.routeMin==="number") setRouteMin(s.routeMin as number);
      if(typeof s.total==="number") setTotal(s.total as number);
      if(typeof s.remaining==="number") setRemaining(s.remaining as number);
      if(typeof s.vol==="number") setVolV(s.vol as number);
      if(typeof s.noiseKind==="string") setNoiseKind(s.noiseKind as NoiseKind);
      if(typeof s.humOn==="boolean") setHumOn(s.humOn as boolean);
      if(typeof s.seed==="number") setSeed(s.seed as number);
      if(s.isRunning){ setIsRunning(true); if(s.isPaused) setIsPaused(true); startedAtRef.current=(s.startedAt as string)||new Date().toISOString(); t0Ref.current=performance.now()-(((s.total as number)-(Number(s.remaining)||0))*1000)-(Number(s.pausedRef)||0); pausedRef.current=Number(s.pausedRef)||0; if(s.isPaused) pausedAt.current=performance.now(); }
    }catch{}
  }, []);
  useEffect(()=>{ try{ localStorage.setItem("rf_state", JSON.stringify({ ts:Date.now(), intent, routeName, routeMin, total, remaining, vol, noiseKind, humOn, seed, isRunning, isPaused, startedAt:startedAtRef.current, pausedRef:pausedRef.current })); }catch{} }, [intent, routeName, routeMin, total, remaining, vol, noiseKind, humOn, seed, isRunning, isPaused]);
  useEffect(()=>{ if(!isRunning && !isPaused && remaining===total) try{ localStorage.removeItem("rf_state"); }catch{} }, [isRunning,isPaused,remaining,total]);
  useEffect(()=>{ ensureRoadtripAudio(noiseKind,humOn,vol, isRunning && !isPaused); }, [isRunning,isPaused,noiseKind,humOn,vol]);
  useEffect(()=>{ if(isRunning && !isPaused) setRoadtripVol(vol); }, [vol,isRunning,isPaused]);
  useEffect(()=>{ if(isRunning && !isPaused){ if(pausedAt.current){ pausedRef.current+=performance.now()-pausedAt.current; pausedAt.current=null; } } else if(isPaused) pausedAt.current=performance.now(); }, [isPaused,isRunning]);
  useEffect(()=>{ isRunningRef.current=isRunning; },[isRunning]);
  useEffect(()=>{ isPausedRef.current=isPaused; if(isPaused) pausedOffRef.current=(distRenderRef.current*0.18)%28; },[isPaused]);
  useEffect(()=>{
    const getFS=()=> (document.fullscreenElement || (document as unknown as {webkitFullscreenElement:Element|null}).webkitFullscreenElement) as Element|null;
    const h=()=>{
      const el=getFS(); const wrap=canvasWrapRef.current;
      const isFS= wrap ? (el===wrap || wrap.classList.contains("fs-fallback")) : !!el;
      setIsFullscreen(isFS); if(isFS) setControlsVisible(true);
    };
    h(); document.addEventListener("fullscreenchange",h); document.addEventListener("webkitfullscreenchange" as never,h);
    return()=>{ document.removeEventListener("fullscreenchange",h); document.removeEventListener("webkitfullscreenchange" as never,h); };
  }, []);
  const enterFS=useCallback(()=>{
    const wrap=canvasWrapRef.current; if(!wrap) return;
    const req=(wrap.requestFullscreen || (wrap as unknown as {webkitRequestFullscreen:()=>Promise<void>}).webkitRequestFullscreen)?.bind(wrap);
    if(req) req().catch(()=>{ wrap.classList.add("fs-fallback"); setIsFullscreen(true); setControlsVisible(true); });
    else{ wrap.classList.add("fs-fallback"); setIsFullscreen(true); setControlsVisible(true); }
  },[]);
  const exitFS=useCallback(()=>{
    const wrap=canvasWrapRef.current;
    if(wrap && wrap.classList.contains("fs-fallback")){ wrap.classList.remove("fs-fallback"); setIsFullscreen(false); return; }
    const exit=(document.exitFullscreen || (document as unknown as {webkitExitFullscreen:()=>Promise<void>}).webkitExitFullscreen)?.bind(document);
    if(document.fullscreenElement || (document as unknown as {webkitFullscreenElement:Element|null}).webkitFullscreenElement) exit?.().catch(()=>{});
    else setIsFullscreen(false);
  },[]);
  const resetHideTimer=useCallback(()=>{
    if(!isFullscreen) return;
    setControlsVisible(true);
    if(hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if(isRunning && !isPaused) hideTimerRef.current= window.setTimeout(()=>setControlsVisible(false),3000) as unknown as number;
  },[isFullscreen,isRunning,isPaused]);
  useEffect(()=>{ if(isFullscreen && isRunning && !isPaused) resetHideTimer(); else if(isFullscreen){ setControlsVisible(true); if(hideTimerRef.current) window.clearTimeout(hideTimerRef.current); } return()=>{ if(hideTimerRef.current) window.clearTimeout(hideTimerRef.current); }; },[isFullscreen,isRunning,isPaused,resetHideTimer]);
  // placeholder - actual onKey effect moved after handlers to avoid forward refs

  const loadLogs=useCallback(()=>{
    try{
      const arr=JSON.parse(localStorage.getItem("rf_sessions")||"[]") as Array<Record<string,unknown>>;
      const rev=arr.slice().reverse(); setLogRows(rev); return rev;
    }catch{ setLogRows([]); return []; }
  },[]);
  useEffect(()=>{ if(showLog) loadLogs(); },[showLog,loadLogs]);
  useEffect(()=>{ loadLogs(); },[loadLogs]);
  const clearLogs=()=>{ if(!confirm("Clear all trip history?")) return; localStorage.removeItem("rf_sessions"); setLogRows([]); };
  const deleteTransit=(finished_at:unknown)=>{ if(!confirm("Delete this trip?")) return; try{ const arr=JSON.parse(localStorage.getItem("rf_sessions")||"[]") as Array<Record<string,unknown>>; const nxt=arr.filter(r=>String(r.finished_at)!==String(finished_at)); localStorage.setItem("rf_sessions", JSON.stringify(nxt)); loadLogs(); }catch{} };
  const exportLogs=()=>{
    const rows=logRows.length? logRows : (JSON.parse(localStorage.getItem("rf_sessions")||"[]") as Array<Record<string,unknown>>).slice().reverse();
    if(!rows.length) return;
    const header="| Date | Route | Min | Intent | Done |\n|---|---|---|---|---|\n";
    const body=rows.map(r=> `| ${(String(r.finished_at)||"").slice(0,16).replace("T"," ")} | ${String(r.route??"")} | ${Number(r.duration_min??0)} | ${String(r.intent??"").replace(/\|/g,"/").slice(0,60)} | ${(r.completed?"✓":"—")} |`).join("\n");
    const blob=new Blob([header+body+"\n"],{type:"text/markdown"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`roadtrip-log-${new Date().toISOString().slice(0,10)}.md`; a.click(); URL.revokeObjectURL(url);
  };

  // --- Custom live sync: typing 1 or 1:30 updates timer — allow when paused, block while running/building ---
  const handleCustomChange = (v: string) => {
    setCustomMin(v);
    const raw = v.trim();
    if (!raw) return;
    const t = parsePreset(raw);
    if (t === null) return;
    // block while actively running (not paused), building, or on a break
    if ((isRunning && !isPaused) || isBuilding || breakState) return;
    setRouteName("Custom");
    setRouteMin(t/60);
    setTotal(t);
    setRemaining(t);
    // if paused, reset elapsed so resume starts from new total
    if (isPaused) {
      t0Ref.current = performance.now();
      pausedRef.current = 0;
      pausedAt.current = performance.now();
      distRef.current = 0;
      distRenderRef.current = 0;
    }
  };

  // --- 5s varied building phase for every start ---
  const BUILD_POOL_0 = ["Charting the road...", "Plotting the route...", "Mapping the miles...", "Scouting the highway..."] as const;
  const BUILD_POOL_1 = ["Optimizing for focus...", "Clearing the lane...", "Tuning the engine...", "Calibrating the cruise..."] as const;
  const BUILD_POOL_2_BASE = ["Locking in intent...", "Committing to finish...", "Fueling dedication...", "Earning the miles...", "Sealing the promise..."] as const;

  const pick = <T,>(arr: readonly T[], exclude?: string): T => {
    const filtered = exclude ? (arr as readonly string[]).filter(x=>x!==exclude) as unknown as readonly T[] : arr;
    const pool = filtered.length ? filtered : arr;
    return pool[Math.floor(Math.random()*pool.length)];
  };

  const doStart = useCallback(()=>{
    // called after 5s build
    setIsBuilding(false);
    setBuildStep(0);
    setBuildLines([]);
    startedAtRef.current=new Date().toISOString();
    runIdRef.current+=1; finishedRunRef.current=null; setSyncState("idle");
    setIsRunning(true);
    setIsPaused(false);
    setSeed(Math.random());
    dismissCover();
  },[dismissCover]);

  const startBuild = useCallback(()=>{
    if(isRunning || isBuilding) return;
    // ensure current total is valid (custom already live-synced, but re-parse to be safe)
    let t = total;
    const raw = customMin.trim();
    if(raw){
      const parsed = parsePreset(raw);
      if(parsed !== null) t = parsed;
    }
    if(t<60||t>10800) return;
    // ensure state reflects t (in case user hit Go with valid custom that hasn't synced due to race)
    if(t!==total){
      setRouteName("Custom");
      setRouteMin(t/60);
      setTotal(t);
      setRemaining(t);
    }
    // pick 3 varied lines
    const a = pick(BUILD_POOL_0, lastBuildRef.current.split("|")[0]);
    const b = pick(BUILD_POOL_1, lastBuildRef.current.split("|")[1]);
    let cBase: string = pick(BUILD_POOL_2_BASE, lastBuildRef.current.split("|")[2]);
    // 30% inject intent
    if(intent.trim() && Math.random()<0.3){
      cBase = `Heading for "${intent.trim().slice(0,28)}" — ${cBase.toLowerCase()}`;
    }
    const lines = [a,b,cBase];
    lastBuildRef.current = lines.join("|");
    setBuildLines(lines);
    setBuildStep(0);
    setIsBuilding(true);
    // schedule steps: 0 0-1.5s, 1 1.5-3s, 2 3-4.5s, 3 Ready 4.5-5s
    if(buildingTimerRef.current) window.clearTimeout(buildingTimerRef.current);
    const t1 = window.setTimeout(()=> setBuildStep(1), 1500);
    const t2 = window.setTimeout(()=> setBuildStep(2), 3000);
    const t3 = window.setTimeout(()=> setBuildStep(3), 4500);
    const t4 = window.setTimeout(()=> { doStart(); }, 5000);
    // store last for cleanup; keep chain by reusing buildingTimerRef as final
    buildingTimerRef.current = t4 as unknown as number;
    // also need to clear intermediate on unmount/cancel
    // stash t1-t3 on same ref via array? simply clear all on cancel
    (buildingTimerRef as unknown as { _t1:number; _t2:number; _t3:number })._t1 = t1 as unknown as number;
    (buildingTimerRef as unknown as { _t1:number; _t2:number; _t3:number })._t2 = t2 as unknown as number;
    (buildingTimerRef as unknown as { _t1:number; _t2:number; _t3:number })._t3 = t3 as unknown as number;
  },[isRunning,isBuilding,total,customMin,intent,doStart]);

  const cancelBuild = useCallback(()=>{
    if(!isBuilding) return;
    setIsBuilding(false);
    setBuildStep(0);
    setBuildLines([]);
    if(buildingTimerRef.current) window.clearTimeout(buildingTimerRef.current);
    const r = buildingTimerRef as unknown as { _t1?:number; _t2?:number; _t3?:number };
    if(r._t1) window.clearTimeout(r._t1);
    if(r._t2) window.clearTimeout(r._t2);
    if(r._t3) window.clearTimeout(r._t3);
  },[isBuilding]);

  const onFinish=useCallback(async()=>{
    // one-fire: ignore repeat invocations for the same run, keyed on the
    // stable run id assigned at doStart (survives startedAtRef nulling)
    if(finishedRunRef.current===runIdRef.current) return;
    finishedRunRef.current=runIdRef.current;
    const startedAt=startedAtRef.current||new Date().toISOString();
    const finishedAt=new Date().toISOString();
    // actual elapsed minus paused time (not the full route total)
    const elapsedSec=Math.min(10800, Math.max(1, Math.round((performance.now()-t0Ref.current-pausedRef.current)/1000)));
    const elapsedMin=Math.max(1, Math.round(elapsedSec/60));
    const km=Number((distRenderRef.current/42).toFixed(1));
    const data:Record<string,unknown>={ started_at:startedAt, finished_at:finishedAt, duration_min:elapsedMin, duration_sec:elapsedSec, intent:intent||"(no intent)", route:routeName, preset:routeName, completed:true, sound_on:humOn, km };
    setDoneInfo({...data,km}); setShowDone(true); setTimeout(()=>setShowDone(false),5000);
    startedAtRef.current=null;
    try{ const arr=JSON.parse(localStorage.getItem("rf_sessions")||"[]") as unknown[]; (arr as unknown[]).push(data); localStorage.setItem("rf_sessions", JSON.stringify((arr as unknown[]).slice(-50))); if(showLog) loadLogs(); }catch{}
    const row={ started_at:startedAt, finished_at:data.finished_at as string, duration_sec:elapsedSec, preset:routeName, intent:intent||undefined, completed:true, route:routeName };
    saveGuestSession(row as unknown as Parameters<typeof saveGuestSession>[0]);
    if(userEmail){
      setSyncState("saving");
      const headers:Record<string,string>={"Content-Type":"application/json"}; if(csrf) headers["x-csrf-token"]=csrf;
      fetch("/api/sessions",{method:"POST",headers,body:JSON.stringify(row)}).then(async res=>{ let mocked=false; try{ mocked=(await res.json()).mocked===true; }catch{} if(res.ok && !mocked){ removeGuestSession(startedAt); setSyncState("saved"); fetch("/api/email/session",{method:"POST",headers,body:JSON.stringify({to:userEmail, ...row})}).catch(()=>{}); } else setSyncState("failed"); }).catch(()=>setSyncState("failed"));
    } else setSyncState("local");
    try{ if("Notification" in window && Notification.permission==="granted"){ const n=new Notification("Journey completed",{body:`${routeName} · ${elapsedMin} min — ${intent||"No intent"} · ${km} km`}); setTimeout(()=>n.close(),5000); } }catch{}
    try{ const Ctx=(window.AudioContext || (window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext) as typeof AudioContext; const ctx2=new Ctx(); const o=ctx2.createOscillator(), g=ctx2.createGain(); o.type="sine"; o.frequency.value=880; o.connect(g).connect(ctx2.destination); g.gain.setValueAtTime(0,ctx2.currentTime); g.gain.linearRampToValueAtTime(0.18,ctx2.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.001,ctx2.currentTime+0.6); o.start(); o.stop(ctx2.currentTime+0.65); }catch{}
    try{ localStorage.removeItem("rf_state"); }catch{}
  },[total,remaining,intent,routeName,humOn,showLog,loadLogs,userEmail,csrf]);

  // --- Break sounds (declared before the RAF tick, which calls them) ---
  const playEngineOffClick = useCallback(()=>{
    try{
      const Ctx=(window.AudioContext || (window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext) as typeof AudioContext;
      const ctx=new Ctx(); const o=ctx.createOscillator(), g=ctx.createGain();
      o.type="square"; o.frequency.value=160; o.connect(g).connect(ctx.destination);
      g.gain.setValueAtTime(0.12,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.09);
      o.start(); o.stop(ctx.currentTime+0.1); setTimeout(()=>ctx.close().catch(()=>{}),400);
    }catch{}
  },[]);
  const playBreakChime = useCallback(()=>{
    try{
      const Ctx=(window.AudioContext || (window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext) as typeof AudioContext;
      const ctx=new Ctx();
      for(const [f,at] of [[660,0],[880,0.18]] as Array<[number,number]>){
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.type="sine"; o.frequency.value=f; o.connect(g).connect(ctx.destination);
        g.gain.setValueAtTime(0,ctx.currentTime+at); g.gain.linearRampToValueAtTime(0.16,ctx.currentTime+at+0.02); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+at+0.5);
        o.start(ctx.currentTime+at); o.stop(ctx.currentTime+at+0.55);
      }
      setTimeout(()=>ctx.close().catch(()=>{}),1200);
    }catch{}
  },[]);
  // --- Break mode, Option A manual "Pull over" (local-only, zero sessions rows) ---
  // (declared before the RAF tick — the tick drives pull/settle/merge)
  const endBreak = useCallback((withChime:boolean)=>{
    if(mergingRef.current) return; // merge already in flight — ignore double-taps
    if(breakTimerRef.current){ window.clearInterval(breakTimerRef.current); breakTimerRef.current=null; }
    const phase=pullPhaseRef.current;
    if(phase!=="pull" && phase!=="park") return;
    // merge from wherever the car is now (handles Back-on-road mid-pull-over)
    mergeFromRef.current=parkTRef.current; chimeRef.current=withChime;
    pullPhaseRef.current="merge"; phaseT0Ref.current=performance.now(); lastTickRef.current=performance.now();
    mergingRef.current=true;
    setBreakState(null); setShowBreakPicker(false);
    // rejoin while merging: hum swells with speed, wall stays frozen till merge ends
    if(breakResumeRef.current){ breakResumeRef.current=false; setIsPaused(false); }
  },[]);
  const beginBreakCountdown = useCallback(()=>{
    const secs=breakPendingRef.current;
    breakLeftRef.current=secs;
    setBreakState(prev=> prev ? { ...prev, total: secs, remaining: secs, settled: true } : prev);
    if(breakTimerRef.current) window.clearInterval(breakTimerRef.current);
    breakTimerRef.current = window.setInterval(()=>{
      breakLeftRef.current-=1; const left=breakLeftRef.current;
      if(left<=0){ endBreak(true); } // auto-return + chime at merge end
      else setBreakState(prev=> prev? {...prev, remaining:left} : prev);
    },1000) as unknown as number;
  },[endBreak]);
  const settleBreak = useCallback(()=>{
    // pull-over complete: car settled on the edge line — now the break begins
    pullPhaseRef.current="park"; speedRef.current=0; parkTRef.current=1; driveVol(0);
    if(isRunningRef.current) setIsPaused(true); // wall already frozen; this stops the hum
    playEngineOffClick();
    beginBreakCountdown();
  },[playEngineOffClick,beginBreakCountdown,driveVol]);
  const startBreak = useCallback((mins:number)=>{
    if(breakState || isBuilding || mergingRef.current) return;
    const secs=Math.max(60, Math.min(1800, Math.round(mins*60)));
    breakPendingRef.current=secs; breakResumeRef.current=isRunning;
    if(isRunning && isPaused) setIsPaused(false); // pull-over drives; pause lands at settle
    parkedRef.current=true;
    pullPhaseRef.current="pull"; phaseT0Ref.current=performance.now(); lastTickRef.current=performance.now();
    setBreakState({ total: secs, remaining: secs, settled: false }); setShowBreakPicker(false);
  },[breakState,isBuilding,isRunning,isPaused]);
  useEffect(()=>{
    let raf=0;
    const tick=()=>{
      const phase=pullPhaseRef.current;
      const inTransition=phase==="pull"||phase==="merge";
      if((isRunning && !isPaused)||(!isRunning && inTransition)){
        const now=performance.now();
        const dt=Math.min(0.1, lastTickRef.current ? (now-lastTickRef.current)/1000 : 0.016);
        lastTickRef.current=now;
        if(inTransition){
          // wall clock frozen — integrate distance manually with ramped speed
          t0Ref.current+=dt*1000;
          const t=(now-phaseT0Ref.current)/1000;
          if(phase==="pull"){
            const kk=Math.min(1,t/4.5), s=smoother(kk), speed=1-s;
            speedRef.current=speed; parkTRef.current=s;
            if(isRunning){ const incr=SCENERY_SPEED*0.35*speed*dt; distRef.current+=incr; manualOffsetRef.current+=incr; driveVol(volRef.current*speed); }
            if(kk>=1) settleBreak();
          } else {
            const dur=3*Math.max(0.25,mergeFromRef.current);
            const kk=Math.min(1,t/dur), s=smoother(kk);
            const park=mergeFromRef.current*(1-s), speed=1-park;
            speedRef.current=speed; parkTRef.current=park;
            if(isRunning){ const incr=SCENERY_SPEED*0.35*speed*dt; distRef.current+=incr; manualOffsetRef.current+=incr; driveVol(volRef.current*speed); }
            if(kk>=1){
              pullPhaseRef.current="cruise"; parkedRef.current=false;
              speedRef.current=(isRunningRef.current && !isPausedRef.current)?1:0; parkTRef.current=0;
              mergingRef.current=false; driveVol(volRef.current);
              if(chimeRef.current) playBreakChime();
            }
          }
        } else {
          speedRef.current=(isRunning && !isPaused)?1:0;
          if(isRunning && !isPaused){
            const elapsed=(now-t0Ref.current-pausedRef.current)/1000;
            const raw=Math.min(elapsed*SCENERY_SPEED*0.35, total*SCENERY_SPEED*0.35);
            const p=Math.min(elapsed/total,1);
            const ease=(t:number)=>1-Math.pow(1-t,3);
            const eased= p>0.88 ? total*SCENERY_SPEED*0.35*(0.88+0.12*ease((p-0.88)/0.12)) : raw;
            distRef.current=eased+manualOffsetRef.current;
            const nextRemaining=Math.max(0, total-Math.floor(elapsed));
            if(nextRemaining!==remaining){
              if(nextRemaining<=0){ setRemaining(0); setIsRunning(false); void onFinish(); }
              else setRemaining(nextRemaining);
            } else if(elapsed>=total){ if(remaining!==0){ setRemaining(0); setIsRunning(false); void onFinish(); } }
          }
        }
        distRenderRef.current+=(distRef.current-distRenderRef.current)*0.14;
      }
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[isRunning,isPaused,total,remaining,onFinish,smoother,driveVol,playBreakChime,settleBreak]);
  useEffect(()=>{ if(isRunning && !isPaused && remaining===total){ t0Ref.current=performance.now(); pausedRef.current=0; distRef.current=0; distRenderRef.current=0; manualOffsetRef.current=0; speedRef.current=1; pullPhaseRef.current="cruise"; parkTRef.current=0; } },[isRunning,isPaused,remaining,total]);

  const handleHitRoad=useCallback(()=>{
    if(isRunning || isBuilding || breakState) return;
    startBuild();
  },[isRunning,isBuilding,breakState,startBuild]);
  const handlePauseToggle=useCallback(()=>{ if(!isRunning || breakState) return; setIsPaused(p=>!p); },[isRunning,breakState]);
  const handleReset=useCallback(()=>{
    // resetting during a break ends the break quietly (no resume, no row)
    if(breakState){
      if(breakTimerRef.current){ window.clearInterval(breakTimerRef.current); breakTimerRef.current=null; }
      mergingRef.current=false;
      pullPhaseRef.current="cruise"; speedRef.current=1; parkTRef.current=0; manualOffsetRef.current=0;
      parkedRef.current=false; breakResumeRef.current=false; setBreakState(null);
    }
    if(isRunning && remaining>0 && remaining<total){
      const elapsedMin=Math.max(1, Math.round((total-remaining)/60));
      const data:Record<string,unknown>={ started_at:startedAtRef.current||new Date().toISOString(), finished_at:new Date().toISOString(), duration_min:elapsedMin, intent:intent||"(no intent)", route:routeName, completed:false, sound_on:humOn, km:Number((distRenderRef.current/42).toFixed(1)) };
      try{ const arr=JSON.parse(localStorage.getItem("rf_sessions")||"[]") as unknown[]; (arr as unknown[]).push(data); localStorage.setItem("rf_sessions", JSON.stringify((arr as unknown[]).slice(-50))); if(showLog) loadLogs(); }catch{}
      const row={ started_at:data.started_at as string, finished_at:data.finished_at as string, duration_sec:elapsedMin*60, preset:routeName, intent:intent||undefined, completed:false, route:routeName };
      saveGuestSession(row as unknown as Parameters<typeof saveGuestSession>[0]);
      // incomplete rows also belong to the cloud (no email for breaks)
      if(userEmail){
        const headers:Record<string,string>={"Content-Type":"application/json"}; if(csrf) headers["x-csrf-token"]=csrf;
        fetch("/api/sessions",{method:"POST",headers,body:JSON.stringify(row)}).then(async res=>{ try{ const j=await res.json(); if(res.ok && j.mocked!==true) removeGuestSession(row.started_at); }catch{} }).catch(()=>{});
      }
    }
    // cancel building if resetting during build
    if(isBuilding) cancelBuild();
    setIsRunning(false); setIsPaused(false); setRemaining(routeMin*60); setTotal(routeMin*60); startedAtRef.current=null; distRef.current=0; distRenderRef.current=0;
    try{ localStorage.removeItem("rf_state"); }catch{}
  },[isRunning,remaining,total,intent,routeName,humOn,routeMin,showLog,loadLogs,isBuilding,cancelBuild,userEmail,csrf,breakState]);

  // --- Break mode UI guards live below; handlers above feed the RAF tick ---
  // cleanup break ticker on unmount
  useEffect(()=> ()=>{ if(breakTimerRef.current) window.clearInterval(breakTimerRef.current); },[]);

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const tag=(document.activeElement?.tagName??"");
      const inInput=tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA";
      if(isBuilding && e.key==="Escape"){ e.preventDefault(); cancelBuild(); return; }
      if(e.key==="Escape" && isFullscreen){ exitFS(); return; }
      if(inInput && !isBuilding) return;
      if(isBuilding) return;
      if(e.key==="f"||e.key==="F"){ e.preventDefault(); if(isFullscreen) exitFS(); else enterFS(); return; }
      if(e.code==="Space"||e.key===" "){ e.preventDefault(); if(!isRunning) handleHitRoad(); else handlePauseToggle(); return; }
      if(e.key==="r"||e.key==="R"){ e.preventDefault(); handleReset(); return; }
      if(e.key==="m"||e.key==="M"){ e.preventDefault(); setHumOn(v=>!v); return; }
    };
    document.addEventListener("keydown",onKey); return()=>document.removeEventListener("keydown",onKey);
  },[isFullscreen,isRunning,isPaused,isBuilding,cancelBuild,handleHitRoad,handlePauseToggle,handleReset,enterFS,exitFS]);

  // cleanup building timers on unmount
  useEffect(()=> ()=> {
    if(buildingTimerRef.current) window.clearTimeout(buildingTimerRef.current);
    const r = buildingTimerRef as unknown as { _t1?:number; _t2?:number; _t3?:number };
    if(r._t1) window.clearTimeout(r._t1);
    if(r._t2) window.clearTimeout(r._t2);
    if(r._t3) window.clearTimeout(r._t3);
  },[]);

  const pct= total ? Math.round(((total-remaining)/total)*100) : 0;
  const km = (distRenderRef.current/42).toFixed(1);
  const deliveredCount = logRows.filter(r=>r.completed).length;
  const onRoadCount = ROUTES.length;

  return (
    <div className={"app-shell flex flex-col bg-[#070A0E] "+(isFullscreen?"is-fs-mode":"")} onMouseMove={resetHideTimer}>
      {showCover && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(7,10,14,0.78)] p-5 backdrop-blur-[18px]" onClick={e=>{ if(e.target===e.currentTarget) dismissCover(); }}>
          <div className="flex w-[min(440px,92vw)] flex-col gap-3.5 rounded-[18px] border border-[rgba(30,42,51,0.92)] bg-[rgba(15,20,25,0.96)] p-5 text-center shadow-xl">
            <div className="text-[11px] font-extrabold tracking-[1.2px] text-[#10B981]">READY TO ROLL</div>
            <div className="text-[22px] font-extrabold leading-tight text-white">Are you ready to hit the road?</div>
            <div className="text-[13px] leading-[1.45] text-zinc-400">Pick an intent and a route — the highway will idle behind you.</div>
            <div className="rounded-xl border border-white/10 bg-[#121212] p-3 text-left"><label className="mb-1.5 block text-[11px] font-bold text-zinc-500">Intent</label><input value={intent} onChange={e=>setIntent(e.target.value.slice(0,200))} onKeyDown={e=>{ if(e.key==="Enter") dismissCover(); }} placeholder='e.g. &quot;finish problem set 3.1&quot;' className="w-full rounded-[10px] border border-white/10 bg-white/[0.05] px-3 py-2 text-base sm:text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#10B981]" /></div>
            <button onClick={dismissCover} className="mx-auto inline-flex max-w-[280px] items-center justify-center rounded-full bg-[#10B981] px-6 py-3 text-sm font-bold text-[#00140e]">Let&apos;s roll →</button>
            <div className="text-[11px] text-zinc-500">Road keeps idling behind · Space to start/pause</div>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-0 lg:gap-3 p-0 lg:p-3 bg-[#070A0E]">
        {/* Left sidebar - exactly like Image 1 */}
        {!isFullscreen && (
          <div className="flex w-full lg:w-[380px] shrink-0 flex-col overflow-hidden rounded-none lg:rounded-2xl border-0 lg:border border-white/10 bg-[#0F1215] shadow-none lg:shadow-xl">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
              <h1 className="text-[12px] font-extrabold tracking-[1.4px] text-[#00E69A]">ROADTRIP FOCUS</h1>
              <p className="mt-0.5 text-[11px] text-zinc-500">Ready to roll</p>
            </div>
            {/* Routes heading */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[0.8px] text-[#00E69A]">Routes</span>
              <button onClick={()=>{ setSheetTab("delivered"); }} className="text-[11px] text-zinc-500 hover:text-zinc-300">Trip Log ({logRows.length})</button>
            </div>
            {/* Pills */}
            <div className="px-4 pb-3 flex gap-2">
              <button onClick={()=> setSheetTab("onroad")} className={"flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition "+(sheetTab==="onroad" ? "bg-[#00E69A] text-[#00140e]" : "bg-[#1A1E23] text-zinc-500 border border-white/10")}>On the road ({onRoadCount})</button>
              <button onClick={()=>{ setSheetTab("delivered"); loadLogs(); }} className={"flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition "+(sheetTab==="delivered" ? "bg-[#00E69A] text-[#00140e]" : "bg-[#1A1E23] text-zinc-500 border border-white/10")}>Delivered ({deliveredCount})</button>
            </div>
            {/* Intent */}
            <div className="px-4 pb-3">
              <label className="block mb-1.5 text-[11px] font-bold text-zinc-400">Intent</label>
              <input value={intent} onChange={e=>setIntent(e.target.value.slice(0,200))} placeholder='e.g. &quot;finish problem set 3.1&quot;' className="w-full rounded-full border border-white/10 bg-[#1A1E23] px-3.5 py-2 text-base sm:text-xs text-white outline-none placeholder:text-zinc-600 focus:border-[#00E69A]/40" />
            </div>

            {/* Content area */}
            {sheetTab==="onroad" ? (
              <div className="flex-1 overflow-auto px-2 pb-2 space-y-2">
                {ROUTES.map(r=> {
                  const active = routeName===r.name && !customMin;
                  return (
                    <button key={r.name} onClick={()=>{ if(isRunning || isBuilding || breakState) return; setCustomMin(""); setRouteName(r.name); setRouteMin(r.mins); setTotal(r.mins*60); setRemaining(r.mins*60); }} className={"w-full text-left rounded-xl border p-3 transition "+(active ? "bg-[#00E69A]/10 border-[#00E69A]/30" : "bg-[#1A1E23] border-white/[0.06] hover:border-white/15")}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{r.name} → {r.mins}m</span>
                        <span className={"rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-wide "+(active ? "bg-[#00E69A] text-[#00140e]" : "bg-black border border-white/10 text-zinc-600")}>READY</span>
                      </div>
                      <div className="mt-1 text-[10px] leading-tight text-zinc-500">Order #{r.order} · {r.km} · {r.desc}</div>
                    </button>
                  );
                })}
                <div className="pt-1">
                  <input value={customMin} onChange={e=>handleCustomChange(e.target.value)} placeholder="Custom minutes or mm:ss (e.g. 1 or 1:30)" disabled={(isRunning && !isPaused) || isBuilding || !!breakState} className="w-full rounded-full border border-white/10 bg-[#1A1E23] px-3.5 py-2 text-base sm:text-xs text-white outline-none placeholder:text-zinc-600 focus:border-[#00E69A]/40 disabled:opacity-50 disabled:cursor-not-allowed" />
                  {customMin.trim() && parsePreset(customMin.trim())===null && !((isRunning && !isPaused) || isBuilding) && (
                    <div className="mt-1 px-2 text-[10px] text-amber-400">Enter 1–180 or mm:ss (e.g. 1:30)</div>
                  )}
                  {(isRunning && !isPaused) || isBuilding || breakState ? (
                    <div className="mt-1 px-2 text-[10px] text-zinc-500">Custom locked while running — pause to edit</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-2 pb-2 space-y-2">
                {!logRows.length ? <div className="py-10 text-center text-xs italic text-zinc-600">No trips yet — hit the road!</div> : logRows.slice(0,50).map((r,i)=>(
                  <div key={String(r.finished_at??i)} className="rounded-xl border border-white/[0.06] bg-[#1A1E23] p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-white"><span>{String(r.route??"")} · {Number(r.duration_min??r.duration_sec ? Math.round(Number(r.duration_sec)/60) : 0)}m</span><span className={"rounded-full px-2 py-0.5 text-[9px] "+((r.completed as boolean)?"bg-[#00E69A]/20 text-[#00E69A]":"bg-white/10 text-zinc-500")}>{(r.completed as boolean)?"DELIVERED":"IN TRANSIT"}</span></div>
                    <div className="mt-1 truncate text-[10px] text-zinc-500">{String(r.intent??"")} · {formatIST(String(r.finished_at??""))}</div>
                    <button onClick={()=> deleteTransit(r.finished_at)} className="mt-1 text-[10px] text-red-400 hover:text-red-300">Delete</button>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom controls - exactly like Image 1 */}
            <div className="border-t border-white/[0.06] bg-[#0F1215] p-3 space-y-3">
              {/* Timer bar */}
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#1A1E23] px-3 py-2.5">
                <div className="font-mono text-[18px] font-extrabold leading-none text-[#00E69A] tabular-nums">{fmt(remaining)}</div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-black"><div className="h-full rounded-full bg-[#00E69A]" style={{ width: `${pct}%` }} /></div>
                  <div className="flex justify-between text-[9px] font-medium text-zinc-500"><span>{km} km · CRUISE</span><span>{pct}%</span></div>
                </div>
                <button onClick={()=> isRunning ? handlePauseToggle() : handleHitRoad()} className="touch-44 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00E69A] text-[#00140e] hover:bg-[#00D99A]">
                  <span className="text-sm leading-none">{isRunning ? (isPaused ? "▶" : "❚❚") : "▶"}</span>
                </button>
                <button onClick={handleReset} className="touch-44 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-zinc-400 hover:bg-white/15 text-xs">↻</button>
              </div>
              {/* Sound controls */}
              <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#1A1E23] px-3 py-2">
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 shrink-0">
                  <input type="checkbox" checked={humOn} onChange={e=>setHumOn(e.target.checked)} className="h-3 w-3 rounded border-white/20 bg-transparent accent-[#00E69A]" />
                  Road hum
                </label>
                <input type="range" min={0} max={0.5} step={0.01} value={vol} onChange={e=>setVolV(parseFloat(e.target.value))} className="flex-1 accent-[#00E69A] h-1" />
                <select value={noiseKind} onChange={e=>setNoiseKind(e.target.value as NoiseKind)} className="rounded-full border border-white/10 bg-[#0F1215] px-2 py-1 text-[11px] text-white outline-none">
                  <option value="brown">Brown</option><option value="pink">Pink</option><option value="white">White</option><option value="rain">Rain</option>
                </select>
              </div>
              {userEmail ? (
                <div className="flex items-center justify-between rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px]">
                  <span className="flex items-center gap-1.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Signed in as {userEmail}</span>
                  <a href="/dashboard" className="text-emerald-400 hover:text-emerald-300">Dashboard →</a>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px]">
                  <span className="text-zinc-400">Guest · Sync to save & email</span>
                  <a href="/signup" className="rounded-full bg-white px-3 py-1 text-xs font-medium text-black hover:bg-zinc-200">Sync →</a>
                </div>
              )}
              {/* Pull over — manual break (Option A): local-only, zero sessions rows */}
              {!breakState ? (
                showBreakPicker ? (
                  <div className="flex gap-1.5 justify-center items-center">
                    {[2,5,10,15].map(m=> (
                      <button key={m} onClick={()=>startBreak(m)} className="touch-44 rounded-full px-3 text-xs font-bold border bg-[#1A1E23] border-white/10 text-zinc-300 hover:border-[#00E69A]/40 min-w-[44px]">{m}m</button>
                    ))}
                    <button onClick={()=>setShowBreakPicker(false)} aria-label="Cancel break picker" className="touch-44 grid h-11 w-11 place-items-center rounded-full border border-white/10 text-zinc-500">✕</button>
                  </div>
                ) : (
                  <button onClick={()=>setShowBreakPicker(true)} disabled={isBuilding} className="touch-44 w-full rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-300 hover:border-[#00E69A]/40 disabled:opacity-50 disabled:cursor-not-allowed">🅿 Pull over · break</button>
                )
              ) : (
                <div className="rounded-xl border border-[#00E69A]/30 bg-[#00E69A]/10 p-3 text-center">
                  <div className="text-xs font-bold text-white">{breakState.settled ? `🅿 Parked · break ${fmt(breakState.remaining)}` : "Pulling over…"}</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black"><div className="h-full rounded-full bg-[#00E69A]" style={{ width: `${breakState.total ? Math.round(((breakState.total-breakState.remaining)/breakState.total)*100) : 0}%` }} /></div>
                  <div className="mt-0.5 text-[9px] font-medium text-zinc-500">fuel {breakState.total ? Math.round(((breakState.total-breakState.remaining)/breakState.total)*100) : 0}% · auto-returns + chime</div>
                  <button onClick={()=>endBreak(true)} className="touch-44 mt-2 w-full rounded-full bg-[#00E69A] px-3 text-xs font-bold text-[#00140e]">Back on road →</button>
                </div>
              )}
              {/* Quick pills */}
              <div className="flex gap-1.5 justify-center">
                {[25,50,90].map(m=> (
                  <button key={m} onClick={()=>{ if(isRunning || isBuilding || breakState) return; const r=ROUTES.find(x=>x.mins===m); if(r){ setCustomMin(""); setRouteName(r.name); setRouteMin(r.mins); setTotal(r.mins*60); setRemaining(r.mins*60); }}} className={"rounded-full px-3 py-1 text-xs font-bold border "+(routeMin===m && !customMin ? "bg-[#00E69A] border-[#00E69A] text-[#00140e]" : "bg-[#1A1E23] border-white/10 text-zinc-400")}>{m}m</button>
                ))}
                <button onClick={()=>{ if((isRunning && !isPaused) || isBuilding || breakState) return; const v=prompt("Custom minutes (1-180) or mm:ss"); if(v){ handleCustomChange(v); } }} disabled={(isRunning && !isPaused) || isBuilding || !!breakState} className={"rounded-full px-3 py-1 text-xs font-bold border disabled:opacity-50 disabled:cursor-not-allowed "+(routeName==="Custom" ? "bg-[#00E69A] border-[#00E69A] text-[#00140e]" : "bg-[#1A1E23] border-white/10 text-zinc-400")}>Custom</button>
              </div>
              <div className="text-center text-[11px] italic text-zinc-600">“Deep work now, freedom later”</div>
            </div>
          </div>
        )}

        {/* Canvas - right side like Image 1, fullscreen like Image 2 */}
        <div ref={canvasWrapRef} className={"relative flex flex-1 overflow-hidden bg-[#040709] "+(isFullscreen ? "fixed inset-0 z-30 rounded-none border-0 fs-full" : "rounded-none lg:rounded-2xl border-0 lg:border border-white/10")}>
          <RoadtripCanvas distRef={distRef} distRenderRef={distRenderRef} seed={seed} progress={progress} isRunningRef={isRunningRef} isPausedRef={isPausedRef} pausedOffRef={pausedOffRef} parkedRef={parkedRef} parkTRef={parkTRef} />
          {/* Top pill - fullscreen shows "No intent ..." like Image 2, windowed shows intent */}
          <div className={"absolute left-1/2 z-10 -translate-x-1/2 "+(isFullscreen ? "top-3" : "top-3 hidden lg:flex")+" "+(!controlsVisible && isFullscreen ? "opacity-0 pointer-events-none" : "")}>
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1A1E23]/90 px-3 py-1.5 text-xs backdrop-blur-xl">
              <b className="text-white text-[11px]">{intent || "No intent"}</b>
              <span className="text-zinc-500 text-[11px]">· {routeName} · {routeMin}m · {km} km</span>
            </div>
          </div>
          {/* Windowed: no extra controls (sidebar has them). Fullscreen: right vertical dock like Image 2 */}
          {isFullscreen && (
            <div className={"absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[#1A1E23]/90 p-2 backdrop-blur-xl "+(!controlsVisible ? "opacity-0 pointer-events-none" : "")}>
              <button onClick={()=> isRunning ? handlePauseToggle() : handleHitRoad()} className="touch-44 grid h-11 w-11 place-items-center rounded-full bg-[#00E69A] text-[#00140e] text-sm">{isRunning ? (isPaused ? "▶" : "❚❚") : "▶"}</button>
              <button onClick={handleReset} className="touch-44 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-zinc-400 text-xs">↻</button>
              <div className="text-[9px] font-mono font-bold text-zinc-400 tabular-nums">{fmt(remaining)} · {pct}%</div>
              <button onClick={exitFS} className="touch-44 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-zinc-300">⛶</button>
            </div>
          )}
          {/* Windowed fullscreen button bottom-right like Image 1 */}
          {!isFullscreen && (
            <button onClick={enterFS} className="touch-44 absolute bottom-3 right-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-[#1A1E23]/80 text-zinc-400 backdrop-blur-xl hover:bg-[#1A1E23] text-xs">⛶</button>
          )}
          {isFullscreen && (
            <button onClick={exitFS} className="absolute bottom-3 right-3 z-10 hidden h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#1A1E23]/80 text-zinc-400 lg:grid">⛶</button>
          )}
          {/* Bottom progress bar in fullscreen like Image 2 */}
          {isFullscreen && (
            <div className="absolute bottom-4 left-1/2 z-10 w-[min(520px,70vw)] -translate-x-1/2 rounded-full border border-white/10 bg-[#1A1E23]/90 p-1.5 backdrop-blur-xl">
              <div className="h-1.5 overflow-hidden rounded-full bg-black"><div className="h-full rounded-full bg-[#00E69A]" style={{ width: `${pct}%` }} /></div>
            </div>
          )}
          {/* Parked badge — visible windowed + fullscreen, with Back on road exit */}
          {breakState && (
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full border border-[#00E69A]/30 bg-[#1A1E23]/90 py-1.5 pl-3 pr-1.5 backdrop-blur-xl">
              <span className="text-[11px] font-bold text-white">{breakState.settled ? `🅿 PARKED · ${fmt(breakState.remaining)}` : "Pulling over…"}</span>
              <button onClick={()=>endBreak(true)} className="touch-44 rounded-full bg-[#00E69A] px-3 text-[11px] font-bold text-[#00140e]">Back on road</button>
            </div>
          )}
          {/* 5s building dedication overlay - varied every start */}
          {isBuilding && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#040709]/70 backdrop-blur-[4px] p-4">
              <div className="w-[320px] rounded-2xl border border-white/10 bg-[#0F1215] p-6 text-center shadow-2xl">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#00E69A]/30 border-t-[#00E69A]" />
                <div className="text-xs font-bold tracking-wide text-white min-h-[16px]">
                  {buildStep < 3 ? buildLines[buildStep] ?? "Building your trip..." : "Ready to roll →"}
                </div>
                <div className="mt-1 text-[10px] text-zinc-500 truncate">{intent ? `“${intent.slice(0,40)}”` : `${routeName} · ${routeMin}m`} · {buildStep+1}/4</div>
                <div className="mt-3 flex justify-center gap-1">
                  {[0,1,2,3].map(i=> <div key={i} className={"h-1.5 w-8 rounded-full transition "+(i<=buildStep?"bg-[#00E69A]":"bg-white/10")} />)}
                </div>
                <button onClick={cancelBuild} className="mt-3 text-[11px] text-zinc-500 hover:text-zinc-300 underline">Cancel (Esc)</button>
              </div>
            </div>
          )}
          {/* Car is drawn on canvas - bottom center */}
          {showDone && doneInfo && (
            <div className="absolute right-4 top-4 z-20 w-[min(340px,calc(100vw-32px))] max-h-[calc(100vh-32px)] max-h-[calc(100dvh-32px)] overflow-auto rounded-xl border border-white/10 bg-[#1A1E23] p-3 shadow-2xl">
              <div className="text-sm font-bold text-white">Journey completed</div>
              <div className="text-xs text-zinc-500">{String((doneInfo as Record<string,unknown>).route??routeName)} · {String((doneInfo as Record<string,unknown>).duration_min??"")}m · {String((doneInfo as Record<string,unknown>).km??"")} km</div>
              <div className="mt-1 truncate text-xs text-zinc-300">{String((doneInfo as Record<string,unknown>).intent??intent)}</div>
              <div className="mt-1 text-[11px]">{syncState==="saved" ? <span className="text-emerald-400">✓ Saved to cloud</span> : syncState==="failed" ? <span className="text-red-400">Cloud save failed — kept in this browser</span> : syncState==="saving" ? <span className="text-zinc-500">Saving…</span> : <span className="text-zinc-500">Saved in this browser (guest)</span>}</div>
              <div className="mt-2 flex gap-2"><button onClick={()=>setShowLog(true)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">Trip Log</button><button onClick={()=>setShowDone(false)} className="rounded-full bg-[#00E69A] px-3 py-1 text-xs font-bold text-[#00140e]">Dismiss</button></div>
            </div>
          )}
        </div>
      </div>
      {showLog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[8px]" onClick={e=>{ if(e.target===e.currentTarget) setShowLog(false); }}>
          <div className="flex max-h-[72vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1A1E23] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4"><h2 className="text-sm font-extrabold tracking-[0.8px] text-[#00E69A]">Trip Log</h2><div className="flex items-center gap-2 text-[11px] text-zinc-500"><span>{logRows.length} trips</span><button onClick={()=>setShowLog(false)} className="rounded-full border border-white/10 px-3 py-1 text-zinc-300">Close</button></div></div>
            <div className="flex-1 overflow-auto"><table className="w-full border-collapse text-xs"><thead className="sticky top-0 bg-[#1A1E23] text-[10px] uppercase tracking-[0.6px] text-zinc-500"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Route</th><th className="p-2 text-left">Min</th><th className="p-2 text-left">Intent</th><th className="p-2 text-left">Done</th></tr></thead><tbody>{logRows.map((r,i)=><tr key={String(r.finished_at??i)} className="border-b border-white/5 hover:bg-white/[0.03]"><td className="p-2 text-zinc-300">{formatIST(String(r.finished_at??""))}</td><td className="p-2 text-white">{String(r.route??"")}</td><td className="p-2 text-white">{String(r.duration_min??"")}</td><td className="max-w-[200px] truncate p-2 text-zinc-400">{String(r.intent??"")}</td><td className="p-2">{(r.completed as boolean)?"✓":"—"}</td></tr>)}{!logRows.length && <tr><td colSpan={5} className="p-8 text-center italic text-zinc-600">No trips yet</td></tr>}</tbody></table></div>
            <div className="flex items-center justify-between border-t border-white/10 p-3"><div className="flex gap-2"><button onClick={exportLogs} className="rounded-lg border border-white/10 bg-black px-3 py-1.5 text-xs font-bold text-white">Export</button><button onClick={clearLogs} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400">Clear</button></div><button onClick={()=>setShowLog(false)} className="rounded-lg bg-[#00E69A] px-3 py-1.5 text-xs font-bold text-[#00140e]">Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

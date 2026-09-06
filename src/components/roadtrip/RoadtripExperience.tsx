"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import RoadtripCanvas from "./RoadtripCanvas";
import { ensureRoadtripAudio, setRoadtripVol } from "@/lib/audio-roadtrip";
import { saveGuestSession } from "@/lib/guest";

type NoiseKind = "brown" | "pink" | "white" | "rain";
const ROUTES: Array<[string, number, string]> = [
  ["Coastal Hop", 25, "Quick sprint"],
  ["Desert Stretch", 50, "Deep work block"],
  ["Mountain Pass", 90, "Long haul"],
  ["Cross-Country", 120, "Marathon"],
];
const SCENERY_SPEED = 18;
function fmt(s: number) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }

export default function RoadtripExperience({ userEmail }: { userEmail: string | null }) {
  const [intent, setIntent] = useState("");
  const [routeName, setRouteName] = useState(ROUTES[0][0]);
  const [routeMin, setRouteMin] = useState(ROUTES[0][1]);
  const [remaining, setRemaining] = useState(ROUTES[0][1]*60);
  const [total, setTotal] = useState(ROUTES[0][1]*60);
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
  const [vol, setVolV] = useState(0.12);
  const [sheetTab, setSheetTab] = useState<"onroad"|"history">("onroad");
  const [csrf, setCsrf] = useState<string|null>(null);
  const [customMin, setCustomMin] = useState("");

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
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const tag=(document.activeElement?.tagName??"");
      const inInput=tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA";
      if(e.key==="Escape" && isFullscreen){ exitFS(); return; }
      if(inInput) return;
      if(e.key==="f"||e.key==="F"){ e.preventDefault(); if(isFullscreen) exitFS(); else enterFS(); return; }
      if(e.code==="Space"||e.key===" "){ e.preventDefault(); if(!isRunning) handleHitRoad(); else handlePauseToggle(); return; }
      if(e.key==="r"||e.key==="R"){ e.preventDefault(); handleReset(); return; }
      if(e.key==="m"||e.key==="M"){ e.preventDefault(); setHumOn(v=>!v); return; }
    };
    document.addEventListener("keydown",onKey); return()=>document.removeEventListener("keydown",onKey);
  },[isFullscreen,isRunning,isPaused]);

  const loadLogs=useCallback(()=>{
    try{
      const arr=JSON.parse(localStorage.getItem("rf_sessions")||"[]") as Array<Record<string,unknown>>;
      const rev=arr.slice().reverse(); setLogRows(rev); return rev;
    }catch{ setLogRows([]); return []; }
  },[]);
  useEffect(()=>{ if(showLog) loadLogs(); },[showLog,loadLogs]);
  useEffect(()=>{ loadLogs(); },[loadLogs]);
  const clearLogs=()=>{ if(!confirm("Clear all trip history?")) return; localStorage.removeItem("rf_sessions"); setLogRows([]); };
  const deleteTransit=(finished_at:unknown)=>{ if(!confirm("Delete this in-transit trip?")) return; try{ const arr=JSON.parse(localStorage.getItem("rf_sessions")||"[]") as Array<Record<string,unknown>>; const nxt=arr.filter(r=>String(r.finished_at)!==String(finished_at)); localStorage.setItem("rf_sessions", JSON.stringify(nxt)); loadLogs(); }catch{} };
  const exportLogs=()=>{
    const rows=logRows.length? logRows : (JSON.parse(localStorage.getItem("rf_sessions")||"[]") as Array<Record<string,unknown>>).slice().reverse();
    if(!rows.length) return;
    const header="| Date | Route | Min | Intent | Done |\n|---|---|---|---|---|\n";
    const body=rows.map(r=> `| ${(String(r.finished_at)||"").slice(0,16).replace("T"," ")} | ${String(r.route??"")} | ${Number(r.duration_min??0)} | ${String(r.intent??"").replace(/\|/g,"/").slice(0,60)} | ${(r.completed?"✓":"—")} |`).join("\n");
    const blob=new Blob([header+body+"\n"],{type:"text/markdown"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`roadtrip-log-${new Date().toISOString().slice(0,10)}.md`; a.click(); URL.revokeObjectURL(url);
  };

  const onFinish=useCallback(async()=>{
    const startedAt=startedAtRef.current||new Date().toISOString();
    const elapsedMin=Math.max(1, Math.round((total-remaining)/60)||Math.round(total/60));
    const km=Number((distRenderRef.current/42).toFixed(1));
    const data:Record<string,unknown>={ started_at:startedAt, finished_at:new Date().toISOString(), duration_min:elapsedMin, duration_sec:total, intent:intent||"(no intent)", route:routeName, preset:routeName, completed:true, sound_on:humOn, km };
    setDoneInfo({...data,km}); setShowDone(true); setTimeout(()=>setShowDone(false),5000);
    startedAtRef.current=null;
    try{ const arr=JSON.parse(localStorage.getItem("rf_sessions")||"[]") as unknown[]; (arr as unknown[]).push(data); localStorage.setItem("rf_sessions", JSON.stringify((arr as unknown[]).slice(-50))); if(showLog) loadLogs(); }catch{}
    const row={ started_at:startedAt, finished_at:data.finished_at as string, duration_sec:total, preset:routeName, intent:intent||undefined, completed:true, route:routeName };
    saveGuestSession(row as unknown as Parameters<typeof saveGuestSession>[0]);
    if(userEmail){
      const headers:Record<string,string>={"Content-Type":"application/json"}; if(csrf) headers["x-csrf-token"]=csrf;
      fetch("/api/sessions",{method:"POST",headers,body:JSON.stringify(row)}).then(res=>{ if(res.ok) fetch("/api/email/session",{method:"POST",headers,body:JSON.stringify({to:userEmail, ...row})}).catch(()=>{}); }).catch(()=>{});
    }
    try{ if("Notification" in window && Notification.permission==="granted"){ const n=new Notification("Journey completed",{body:`${routeName} · ${elapsedMin} min — ${intent||"No intent"} · ${km} km`}); setTimeout(()=>n.close(),5000); } }catch{}
    try{ const Ctx=(window.AudioContext || (window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext) as typeof AudioContext; const ctx2=new Ctx(); const o=ctx2.createOscillator(), g=ctx2.createGain(); o.type="sine"; o.frequency.value=880; o.connect(g).connect(ctx2.destination); g.gain.setValueAtTime(0,ctx2.currentTime); g.gain.linearRampToValueAtTime(0.18,ctx2.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.001,ctx2.currentTime+0.6); o.start(); o.stop(ctx2.currentTime+0.65); }catch{}
    try{ localStorage.removeItem("rf_state"); }catch{}
  },[total,remaining,intent,routeName,humOn,showLog,loadLogs,userEmail,csrf]);

  useEffect(()=>{
    let raf=0;
    const tick=()=>{
      if(isRunning && !isPaused){
        const elapsed=(performance.now()-t0Ref.current-pausedRef.current)/1000;
        const raw=Math.min(elapsed*SCENERY_SPEED*0.35, total*SCENERY_SPEED*0.35);
        const p=Math.min(elapsed/total,1);
        const ease=(t:number)=>1-Math.pow(1-t,3);
        const eased= p>0.88 ? total*SCENERY_SPEED*0.35*(0.88+0.12*ease((p-0.88)/0.12)) : raw;
        distRef.current=eased;
        distRenderRef.current+=(distRef.current-distRenderRef.current)*0.14;
        const nextRemaining=Math.max(0, total-Math.floor(elapsed));
        if(nextRemaining!==remaining){
          if(nextRemaining<=0){ setRemaining(0); setIsRunning(false); void onFinish(); }
          else setRemaining(nextRemaining);
        } else if(elapsed>=total){ if(remaining!==0){ setRemaining(0); setIsRunning(false); void onFinish(); } }
      }
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[isRunning,isPaused,total,remaining,onFinish]);
  useEffect(()=>{ if(isRunning && !isPaused && remaining===total){ t0Ref.current=performance.now(); pausedRef.current=0; distRef.current=0; distRenderRef.current=0; } },[isRunning,isPaused,remaining,total]);

  const handleHitRoad=useCallback(()=>{
    if(isRunning) return;
    let t=routeMin*60;
    if(customMin.trim()){
      const m=parseInt(customMin.trim(),10);
      if(!Number.isNaN(m) && m>=1 && m<=180) t=m*60;
      else if(/^\d{1,3}:\d{2}$/.test(customMin.trim())){
        const [mm,ss]=customMin.trim().split(":").map(Number);
        if(ss<60) t=mm*60+ss;
      }
    }
    if(t<60||t>10800) return;
    setTotal(t); setRemaining(t); startedAtRef.current=new Date().toISOString(); setIsRunning(true); setIsPaused(false); setSeed(Math.random()); dismissCover();
  },[isRunning,routeMin,customMin,dismissCover]);
  const handlePauseToggle=useCallback(()=>{ if(!isRunning) return; setIsPaused(p=>!p); },[isRunning]);
  const handleReset=useCallback(()=>{
    if(isRunning && remaining>0 && remaining<total){
      const elapsedMin=Math.max(1, Math.round((total-remaining)/60));
      const data:Record<string,unknown>={ started_at:startedAtRef.current||new Date().toISOString(), finished_at:new Date().toISOString(), duration_min:elapsedMin, intent:intent||"(no intent)", route:routeName, completed:false, sound_on:humOn, km:Number((distRenderRef.current/42).toFixed(1)) };
      try{ const arr=JSON.parse(localStorage.getItem("rf_sessions")||"[]") as unknown[]; (arr as unknown[]).push(data); localStorage.setItem("rf_sessions", JSON.stringify((arr as unknown[]).slice(-50))); if(showLog) loadLogs(); }catch{}
      const row={ started_at:data.started_at as string, finished_at:data.finished_at as string, duration_sec:elapsedMin*60, preset:routeName, intent:intent||undefined, completed:false, route:routeName };
      saveGuestSession(row as unknown as Parameters<typeof saveGuestSession>[0]);
    }
    setIsRunning(false); setIsPaused(false); setRemaining(routeMin*60); setTotal(routeMin*60); startedAtRef.current=null; distRef.current=0; distRenderRef.current=0;
    try{ localStorage.removeItem("rf_state"); }catch{}
  },[isRunning,remaining,total,intent,routeName,humOn,routeMin,showLog,loadLogs]);

  const pct= total ? Math.round(((total-remaining)/total)*100) : 0;
  const ControlButton = isRunning ? (
    <button onClick={handlePauseToggle} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-sm">{isPaused ? "Play" : "Pause"}</button>
  ) : (
    <button onClick={handleHitRoad} className="grid h-11 w-11 place-items-center rounded-full bg-[#10B981] text-sm font-bold text-[#00140e]">Go</button>
  );

  return (
    <div className={"flex min-h-[calc(100vh-56px)] flex-col "+(isFullscreen?"is-fs-mode":"")} onMouseMove={resetHideTimer}>
      {showCover && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(7,10,14,0.78)] p-5 backdrop-blur-[18px]" onClick={e=>{ if(e.target===e.currentTarget) dismissCover(); }}>
          <div className="flex w-[min(440px,92vw)] flex-col gap-3.5 rounded-[18px] border border-[rgba(30,42,51,0.92)] bg-[rgba(15,20,25,0.96)] p-5 text-center shadow-xl">
            <div className="text-[11px] font-extrabold tracking-[1.2px] text-[#10B981]">READY TO ROLL</div>
            <div className="text-[22px] font-extrabold leading-tight">Are you ready to hit the road?</div>
            <div className="text-[13px] leading-[1.45] text-[#7a8a7a]">Pick an intent and a route — the highway will idle behind you.</div>
            <div className="rounded-xl border border-white/10 bg-[#121212] p-3 text-left"><label className="mb-1.5 block text-[11px] font-bold text-[#7a8a7a]">Intent</label><input value={intent} onChange={e=>setIntent(e.target.value.slice(0,200))} onKeyDown={e=>{ if(e.key==="Enter") dismissCover(); }} placeholder="e.g. finish math sheet" className="w-full rounded-[10px] border border-white/10 bg-white/[0.05] px-3 py-2 text-sm outline-none focus:border-[#10B981]" /></div>
            <button onClick={dismissCover} className="mx-auto inline-flex max-w-[280px] items-center justify-center rounded-full bg-[#10B981] px-6 py-3 text-sm font-bold text-[#00140e]">Let&apos;s roll</button>
            <div className="text-[11px] text-[#7a8a7a]">Road keeps idling behind · Space to start/pause</div>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        {!isFullscreen && (
          <div className="flex w-full max-w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121212] shadow-xl lg:w-[36%]">
            <div className="border-b border-white/10 p-3.5"><h1 className="text-sm font-extrabold tracking-[0.8px] text-[#10B981]">ROADTRIP FOCUS</h1><div className="mt-1 text-[11px] font-semibold text-[#9ab0a0]">{isRunning ? `On the road · ${routeName} · ${Math.round(distRenderRef.current/42)} km` : `Ready · ${routeName}`}</div></div>
            <div className="flex gap-2 border-b border-white/10 p-2.5">
              <button onClick={()=>{ setSheetTab("onroad"); }} className={"flex-1 rounded-full border px-3 py-1.5 text-xs font-bold "+(sheetTab==="onroad" ? "border-[#10B981] bg-[#10B981] text-[#00140e]" : "border-white/10 bg-[#1a1a1e] text-[#7a8a7a]")}>On the road</button>
              <button onClick={()=>{ setSheetTab("history"); loadLogs(); }} className={"flex-1 rounded-full border px-3 py-1.5 text-xs font-bold "+(sheetTab==="history" ? "border-[#10B981] bg-[#10B981] text-[#00140e]" : "border-white/10 bg-[#1a1a1e] text-[#7a8a7a]")}>Trip history</button>
            </div>
            <div className="border-b border-white/10 p-3"><label className="mb-1.5 block text-[11px] font-bold text-[#7a8a7a]">Intent</label><input value={intent} onChange={e=>setIntent(e.target.value.slice(0,200))} placeholder="what does done look like?" className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs outline-none focus:border-[#10B981]" /></div>
            {sheetTab==="onroad" ? (
              <div className="flex-1 overflow-auto p-2">
                <div className="mb-2 text-[11px] font-bold text-[#7a8a7a]">Routes</div>
                {ROUTES.map(([name,mins,desc])=> (
                  <button key={name} onClick={()=>{ if(isRunning) return; setRouteName(name); setRouteMin(mins); setTotal(mins*60); setRemaining(mins*60); }} className={"mb-2 w-full rounded-xl border p-2.5 text-left "+(routeName===name ? "border-[#10B981] bg-[#10B981]/10" : "border-white/10 bg-[#1a1a1e]")}>
                    <div className="flex items-center justify-between text-xs font-bold"><span>{name}</span><span className={"rounded-full px-2 py-0.5 text-[10px] "+(routeName===name?"bg-[#10B981] text-[#00140e]":"bg-[#121212] text-[#7a8a7a] border border-white/10")}>{mins}m</span></div>
                    <div className="mt-1 text-[11px] text-[#7a8a7a]">{desc as string}</div>
                  </button>
                ))}
                <div className="mt-2 flex gap-2"><input value={customMin} onChange={e=>setCustomMin(e.target.value)} placeholder="Custom mm:ss or min" className="flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs outline-none" /></div>
                {(()=>{ const inTransit=logRows.filter(r=>!r.completed).slice(0,3); return inTransit.length ? <div className="mt-3"><div className="mb-1.5 text-[11px] font-bold text-[#7a8a7a]">In transit</div>{inTransit.map((r,i)=><div key={String(r.finished_at??i)} className="relative mb-2 rounded-xl border border-white/10 bg-[#1a1a1e] p-2.5 pr-7"><div className="flex items-center justify-between text-xs font-bold"><span>{String(r.route??routeName)}</span><span className="rounded-full bg-[#10B981] px-2 py-0.5 text-[10px] text-[#00140e]">IN TRANSIT</span></div><div className="mt-1 truncate text-[11px] text-[#7a8a7a]">{String(r.intent??"")}</div><button onClick={e=>{ e.stopPropagation(); deleteTransit(r.finished_at); }} className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border border-red-500/25 bg-red-500/10 text-xs text-red-400">x</button></div>)}</div> : null; })()}
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-2">
                {!logRows.length ? <div className="p-7 text-center text-xs italic text-[#7a8a7a]">No trips yet — hit the road!</div> : logRows.slice(0,50).map((r,i)=><div key={String(r.finished_at??i)} className="mb-2 rounded-xl border border-white/10 bg-[#1a1a1e] p-2.5"><div className="flex items-center justify-between text-xs font-bold"><span>{String(r.route??"")} · {Number(r.duration_min??0)}m</span><span className={"rounded-full px-2 py-0.5 text-[10px] "+(r.completed?"bg-[#10B981]/20 text-[#10B981]":"bg-white/10 text-[#7a8a7a]")}>{(r.completed as boolean)?"done":"abandoned"}</span></div><div className="mt-1 truncate text-[11px] text-[#7a8a7a]">{String(r.intent??"")} · {String(r.finished_at??"").slice(0,16).replace("T"," ")}</div></div>)}
              </div>
            )}
            <div className="border-t border-white/10 bg-[rgba(28,30,34,0.62)] p-3 backdrop-blur-xl">
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[rgba(28,30,34,0.72)] p-3">
                <div className="min-w-[78px] text-center font-mono text-[22px] font-extrabold text-[#10B981] tabular-nums">{fmt(remaining)}</div>
                <div className="flex flex-1 flex-col gap-1.5"><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background:"linear-gradient(90deg,#10B981,#059669)" }} /></div><div className="flex justify-between text-[10px] text-[#7a8a7a]"><span>{routeName} · {pct}%</span><span>{Math.round(distRenderRef.current/42)} km</span></div></div>
                {ControlButton}
                {(isRunning || remaining!==total) && <button onClick={handleReset} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-xs">R</button>}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#121212] p-2 text-xs text-[#7a8a7a]">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={humOn} onChange={e=>setHumOn(e.target.checked)} /> hum</label>
                <input type="range" min={0} max={0.5} step={0.01} value={vol} onChange={e=>setVolV(parseFloat(e.target.value))} />
                <select value={noiseKind} onChange={e=>setNoiseKind(e.target.value as NoiseKind)} className="rounded-md border border-white/10 bg-white/5 px-1 py-1 text-xs"><option value="brown">brown</option><option value="pink">pink</option><option value="white">white</option><option value="rain">rain</option></select>
                <button onClick={loadLogs} className="ml-auto rounded-full border border-white/10 px-2 py-1 text-[10px]">Log</button>
              </div>
              {!userEmail && <div className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs"><span className="text-zinc-400">Guest · Sync to save</span><a href="/signup" className="rounded-full bg-white px-3 py-1 font-medium text-black">Sync</a></div>}
            </div>
          </div>
        )}
        <div ref={canvasWrapRef} className={"relative flex flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#121212] "+(isFullscreen ? "fixed inset-0 z-20 rounded-none border-0" : "")} style={isFullscreen?{height:"100vh"}:undefined}>
          <RoadtripCanvas distRef={distRef} distRenderRef={distRenderRef} seed={seed} progress={progress} isRunningRef={isRunningRef} isPausedRef={isPausedRef} pausedOffRef={pausedOffRef} />
          <div className={"absolute left-1/2 top-3.5 z-10 -translate-x-1/2 "+(!controlsVisible && isFullscreen ? "opacity-0 pointer-events-none" : "")}>
            <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-[rgba(28,30,34,0.72)] px-3.5 py-1.5 text-xs backdrop-blur-xl"><b className="max-w-[260px] truncate">{intent || "No intent — set one"}</b><span className="text-[#7a8a7a]">· {routeName} · {Math.round(distRenderRef.current/42)} km</span></div>
          </div>
          <div className={"absolute bottom-[18px] right-4 z-10 flex flex-col items-center gap-2 rounded-[22px] border border-white/10 bg-[rgba(28,30,34,0.72)] p-2 backdrop-blur-xl "+(!controlsVisible && isFullscreen ? "opacity-0 pointer-events-none" : "")}>
            {ControlButton}
            {(isRunning || remaining!==total) && <button onClick={handleReset} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-xs">R</button>}
            <div className="h-px w-5 bg-white/10" />
            <div className="font-mono text-[11px] font-bold tabular-nums">{fmt(remaining)}</div>
          </div>
          {!isFullscreen ? <button onClick={enterFS} className="absolute bottom-3.5 right-3.5 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-[rgba(28,30,34,0.68)]">FS</button> : <button onClick={exitFS} className="absolute bottom-3.5 right-3.5 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-[rgba(28,30,34,0.68)]">X</button>}
          {showDone && doneInfo && (
            <div className="absolute right-4 top-4 z-20 w-[340px] rounded-xl border border-white/10 bg-[rgba(15,20,25,0.96)] p-3 shadow-2xl backdrop-blur-xl">
              <div className="text-sm font-bold">Journey completed</div>
              <div className="text-xs text-[#7a8a7a]">{String((doneInfo as Record<string,unknown>).route??routeName)} · {String((doneInfo as Record<string,unknown>).duration_min??"")}m · {String((doneInfo as Record<string,unknown>).km??"")} km</div>
              <div className="mt-1 truncate text-xs">{String((doneInfo as Record<string,unknown>).intent??intent)}</div>
              <div className="mt-2 flex gap-2"><button onClick={()=>setShowLog(true)} className="rounded-full border border-white/10 px-3 py-1 text-xs">Trip Log</button><button onClick={()=>setShowDone(false)} className="rounded-full bg-[#10B981] px-3 py-1 text-xs text-[#00140e]">Dismiss</button></div>
            </div>
          )}
        </div>
      </div>
      {showLog && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[8px]" onClick={e=>{ if(e.target===e.currentTarget) setShowLog(false); }}>
          <div className="flex max-h-[72vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(28,30,34,0.88)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 p-3.5"><h2 className="text-sm font-extrabold tracking-[0.8px] text-[#10B981]">Trip Log</h2><div className="flex items-center gap-2 text-[11px] text-[#7a8a7a]"><span>{logRows.length} trips</span><button onClick={()=>setShowLog(false)} className="rounded-full border border-white/10 px-3 py-1">Close</button></div></div>
            <div className="flex-1 overflow-auto"><table className="w-full border-collapse text-xs"><thead className="sticky top-0 bg-[rgba(20,23,27,0.96)] text-[10px] uppercase tracking-[0.6px] text-[#7a8a7a]"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Route</th><th className="p-2 text-left">Min</th><th className="p-2 text-left">Intent</th><th className="p-2 text-left">Done</th></tr></thead><tbody>{logRows.map((r,i)=><tr key={String(r.finished_at??i)} className="border-b border-white/5 hover:bg-white/5"><td className="p-2">{String(r.finished_at??"").slice(0,16).replace("T"," ")}</td><td className="p-2">{String(r.route??"")}</td><td className="p-2">{String(r.duration_min??"")}</td><td className="max-w-[200px] truncate p-2">{String(r.intent??"")}</td><td className="p-2">{(r.completed as boolean)?"✓":"—"}</td></tr>)}{!logRows.length && <tr><td colSpan={5} className="p-8 text-center italic text-[#7a8a7a]">No trips yet</td></tr>}</tbody></table></div>
            <div className="flex items-center justify-between border-t border-white/10 p-3"><div className="flex gap-2"><button onClick={exportLogs} className="rounded-lg border border-white/10 bg-[#121212] px-3 py-1.5 text-xs font-bold">Export</button><button onClick={clearLogs} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400">Clear</button></div><button onClick={()=>setShowLog(false)} className="rounded-lg bg-[#10B981] px-3 py-1.5 text-xs font-bold text-[#00140e]">Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

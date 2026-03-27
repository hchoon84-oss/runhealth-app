
import { useState, useEffect, useRef, useCallback } from "react";

const RUN_KEY = "rh-running-records";
const HEALTH_KEY = "rh-health-records";
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

function loadLeaflet() {
  return new Promise((resolve) => {
    if (window.L) { resolve(window.L); return; }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => resolve(window.L);
    document.head.appendChild(script);
  });
}

function formatTime(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function formatPace(km, sec) {
  if (!km || km === 0) return "--'--\"";
  const ps = sec / km;
  return `${Math.floor(ps/60)}'${String(Math.round(ps%60)).padStart(2,"0")}"`;
}
function formatDate(ds) {
  return new Date(ds).toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"});
}
function bpStatus(sys, dia) {
  if (!sys||!dia) return {label:"—",color:"#666"};
  if (sys<120&&dia<80) return {label:"정상",color:"#00c896"};
  if (sys<130&&dia<80) return {label:"주의",color:"#f0c040"};
  if (sys<140||dia<90) return {label:"고혈압 전단계",color:"#ff8c00"};
  return {label:"고혈압",color:"#ff3030"};
}
function haversineKm(a, b) {
  const R=6371, dLat=(b[0]-a[0])*Math.PI/180, dLon=(b[1]-a[1])*Math.PI/180;
  const s=Math.sin(dLat/2)**2+Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}
function calcRunStats(records) {
  if (!records.length) return {totalKm:0,totalRuns:0,avgPace:"--'--\"",bestPace:"--'--\"",longestRun:0};
  const totalKm=records.reduce((a,r)=>a+r.distance,0);
  const totalSec=records.reduce((a,r)=>a+r.duration,0);
  const paces=records.map(r=>r.distance>0?r.duration/r.distance:Infinity);
  const bestSec=Math.min(...paces);
  return {totalKm,totalRuns:records.length,avgPace:formatPace(totalKm,totalSec),
    bestPace:isFinite(bestSec)?formatPace(1,bestSec):"--'--\"",longestRun:Math.max(...records.map(r=>r.distance))};
}

function Sparkline({data,color,width=130,height=40}) {
  if (!data||data.length<2) return null;
  const mn=Math.min(...data),mx=Math.max(...data),range=mx-mn||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*width},${height-((v-mn)/range)*(height-8)-4}`).join(" ");
  const last=pts.split(" ").at(-1);
  return <svg width={width} height={height} style={{display:"block"}}>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx={parseFloat(last)} cy={parseFloat(last.split(",")[1])} r="3.5" fill={color}/>
  </svg>;
}

function RunMap({route,center,height=260,zoom=15}) {
  const mapRef=useRef(null), instanceRef=useRef(null), polyRef=useRef(null), markerRef=useRef(null);
  useEffect(()=>{
    let mounted=true;
    loadLeaflet().then((L)=>{
      if (!mounted||!mapRef.current) return;
      if (instanceRef.current) { instanceRef.current.remove(); instanceRef.current=null; }
      const initCenter=center||(route&&route.length>0?route[0]:[37.5665,126.9780]);
      const map=L.map(mapRef.current,{zoomControl:true,attributionControl:false}).setView(initCenter,zoom);
      instanceRef.current=map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
      if (route&&route.length>1) {
        const poly=L.polyline(route,{color:"#ff5000",weight:5,opacity:0.9}).addTo(map);
        polyRef.current=poly;
        map.fitBounds(poly.getBounds(),{padding:[24,24]});
        L.marker(route[0],{icon:L.divIcon({html:`<div style="background:#00c896;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,className:"",iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map).bindPopup("출발");
        L.marker(route[route.length-1],{icon:L.divIcon({html:`<div style="background:#ff5000;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,className:"",iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map).bindPopup("도착");
      } else if (center) {
        markerRef.current=L.marker(center,{icon:L.divIcon({html:`<div style="background:#4da6ff;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(77,166,255,0.3)"></div>`,className:"",iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map).bindPopup("현재 위치");
      }
    });
    return ()=>{ mounted=false; if(instanceRef.current){instanceRef.current.remove();instanceRef.current=null;} };
  },[]);
  useEffect(()=>{
    if (!instanceRef.current||!center||(route&&route.length>1)) return;
    loadLeaflet().then(()=>{ if(markerRef.current){markerRef.current.setLatLng(center);instanceRef.current.setView(center);} });
  },[center]);
  useEffect(()=>{
    if (!instanceRef.current||!route||route.length<2) return;
    loadLeaflet().then((L)=>{
      if (!instanceRef.current) return;
      if (polyRef.current) polyRef.current.setLatLngs(route);
      else { polyRef.current=L.polyline(route,{color:"#ff5000",weight:5,opacity:0.9}).addTo(instanceRef.current); }
      instanceRef.current.setView(route[route.length-1]);
    });
  },[route]);
  return <div ref={mapRef} style={{width:"100%",height,borderRadius:4,overflow:"hidden",zIndex:0}}/>;
}

export default function App() {
  const [runs,setRuns]=useState([]);
  const [healths,setHealths]=useState([]);
  const [tab,setTab]=useState("home");
  const [subTab,setSubTab]=useState("run");
  const [view,setView]=useState("list");
  const [selected,setSelected]=useState(null);
  const [toast,setToast]=useState(null);
  const timerRef=useRef(null), watchRef=useRef(null);
  const [gpsActive,setGpsActive]=useState(false);
  const [gpsError,setGpsError]=useState(null);
  const [currentPos,setCurrentPos]=useState(null);
  const [route,setRoute]=useState([]);
  const [gpsDistance,setGpsDistance]=useState(0);
  const [timer,setTimer]=useState({running:false,seconds:0});
  const [runForm,setRunForm]=useState({date:today(),distance:"",hours:"",minutes:"",seconds:"",memo:"",feeling:3});
  const [healthForm,setHealthForm]=useState({date:today(),sys:"",dia:"",pulse:"",weight:"",memo:""});

  function today(){return new Date().toISOString().slice(0,10);}

  useEffect(()=>{
    try{const r=localStorage.getItem(RUN_KEY);if(r)setRuns(JSON.parse(r));}catch{}
    try{const h=localStorage.getItem(HEALTH_KEY);if(h)setHealths(JSON.parse(h));}catch{}
  },[]);

  const saveRuns=(d)=>{setRuns(d);try{localStorage.setItem(RUN_KEY,JSON.stringify(d));}catch{}};
  const saveHealths=(d)=>{setHealths(d);try{localStorage.setItem(HEALTH_KEY,JSON.stringify(d));}catch{}};
  const showToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),2400);};

  useEffect(()=>{
    if(timer.running){timerRef.current=setInterval(()=>setTimer(t=>({...t,seconds:t.seconds+1})),1000);}
    else clearInterval(timerRef.current);
    return()=>clearInterval(timerRef.current);
  },[timer.running]);

  const startGPS=useCallback(()=>{
    if(!navigator.geolocation){setGpsError("GPS를 지원하지 않습니다.");return;}
    setGpsError(null);setGpsActive(true);
    watchRef.current=navigator.geolocation.watchPosition(
      (pos)=>{
        const pt=[pos.coords.latitude,pos.coords.longitude];
        setCurrentPos(pt);
        setRoute(prev=>{
          const next=[...prev,pt];
          if(next.length>=2){const added=haversineKm(next[next.length-2],pt);setGpsDistance(d=>d+added);}
          return next;
        });
      },
      (err)=>setGpsError("GPS 오류: "+err.message),
      {enableHighAccuracy:true,maximumAge:2000,timeout:10000}
    );
  },[]);

  const stopGPS=useCallback(()=>{
    if(watchRef.current!=null){navigator.geolocation.clearWatch(watchRef.current);watchRef.current=null;}
    setGpsActive(false);
  },[]);

  const resetGPS=useCallback(()=>{
    stopGPS();setRoute([]);setCurrentPos(null);setGpsDistance(0);setGpsError(null);
  },[stopGPS]);

  useEffect(()=>{
    if(!gpsActive&&gpsDistance>0)setRunForm(f=>({...f,distance:gpsDistance.toFixed(2)}));
  },[gpsActive,gpsDistance]);

  const toggleTimer=()=>{
    if(timer.running){
      const h=Math.floor(timer.seconds/3600),m=Math.floor((timer.seconds%3600)/60),s=timer.seconds%60;
      setRunForm(f=>({...f,hours:h?String(h):"",minutes:String(m),seconds:String(s)}));
      stopGPS();
    }
    setTimer(t=>({...t,running:!t.running}));
  };
  const resetTimer=()=>{setTimer({running:false,seconds:0});setRunForm(f=>({...f,hours:"",minutes:"",seconds:""}));resetGPS();};
  const startRun=()=>{startGPS();setTimer({running:true,seconds:0});};

  const submitRun=()=>{
    const dist=parseFloat(runForm.distance);
    if(!dist||dist<=0){showToast("거리를 입력해주세요");return;}
    const totalSec=(parseInt(runForm.hours)||0)*3600+(parseInt(runForm.minutes)||0)*60+(parseInt(runForm.seconds)||0);
    if(!totalSec){showToast("시간을 입력해주세요");return;}
    const rec={id:Date.now(),date:runForm.date,distance:dist,duration:totalSec,memo:runForm.memo,feeling:runForm.feeling,route:route.length>1?route:null};
    saveRuns([rec,...runs].sort((a,b)=>new Date(b.date)-new Date(a.date)));
    setRunForm({date:today(),distance:"",hours:"",minutes:"",seconds:"",memo:"",feeling:3});
    setTimer({running:false,seconds:0});resetGPS();
    showToast("✅ 런닝 저장!");setView("list");setTab("home");
  };

  const submitHealth=()=>{
    const{sys,dia,weight}=healthForm;
    if(!sys&&!dia&&!weight){showToast("혈압 또는 체중을 입력해주세요");return;}
    const rec={id:Date.now(),date:healthForm.date,sys:parseFloat(sys)||null,dia:parseFloat(dia)||null,pulse:parseFloat(healthForm.pulse)||null,weight:parseFloat(weight)||null,memo:healthForm.memo};
    saveHealths([rec,...healths].sort((a,b)=>new Date(b.date)-new Date(a.date)));
    setHealthForm({date:today(),sys:"",dia:"",pulse:"",weight:"",memo:""});
    showToast("✅ 건강 기록 저장!");setView("list");setTab("home");
  };

  const deleteRun=(id)=>{saveRuns(runs.filter(r=>r.id!==id));setView("list");setTab("logs");setSubTab("run");showToast("삭제됨");};
  const deleteHealth=(id)=>{saveHealths(healths.filter(r=>r.id!==id));setView("list");setTab("logs");setSubTab("bp");showToast("삭제됨");};

  const runStats=calcRunStats(runs);
  const weekRuns=runs.filter(r=>(new Date()-new Date(r.date))/86400000<=7);
  const latestHealth=healths[0]||null;
  const bpSt=latestHealth?bpStatus(latestHealth.sys,latestHealth.dia):{label:"—",color:"#666"};
  const weightHistory=[...healths].filter(h=>h.weight).reverse().slice(-14).map(h=>h.weight);
  const sysHistory=[...healths].filter(h=>h.sys).reverse().slice(-14).map(h=>h.sys);
  const diaHistory=[...healths].filter(h=>h.dia).reverse().slice(-14).map(h=>h.dia);
  const feelings=["😩","😕","😐","😊","🔥"];
  const C={run:"#ff5000",bp:"#4da6ff",weight:"#a78bfa",bg:"#0a0a0f",card:"#0f0f18",border:"#1e1e2e"};
  const ni=(color)=>({width:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${C.border}`,color:color||"#e8e8e0",fontSize:34,fontWeight:900,padding:"6px 0",fontFamily:"inherit",outline:"none",boxSizing:"border-box"});
  const LBL={fontSize:14,color:"#777",letterSpacing:"0.06em",display:"block",marginBottom:6,fontWeight:600};
  const SEC={fontSize:14,color:"#666",letterSpacing:"0.12em",fontWeight:700,marginBottom:12};
  const BACK={background:"transparent",border:"none",color:"#777",cursor:"pointer",fontSize:16,fontFamily:"inherit",padding:0,marginBottom:24};

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Courier New',monospace",color:"#e8e8e0"}}>
      <div style={{position:"fixed",inset:0,zIndex:0,backgroundImage:"linear-gradient(rgba(255,80,0,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,80,0,0.03) 1px,transparent 1px)",backgroundSize:"40px 40px",pointerEvents:"none"}}/>
      {toast&&<div style={{position:"fixed",top:"calc(env(safe-area-inset-top) + 16px)",left:"50%",transform:"translateX(-50%)",background:"#ff5000",color:"#fff",padding:"13px 30px",borderRadius:3,fontWeight:700,zIndex:999,fontSize:16,whiteSpace:"nowrap"}}>{toast}</div>}
      <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto",paddingBottom:"calc(env(safe-area-inset-bottom) + 80px)"}}>
        <div style={{padding:"28px 24px 0",borderBottom:`1px solid rgba(255,80,0,0.15)`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <span style={{fontSize:28,fontWeight:900,color:C.run}}>RUN</span>
            <span style={{fontSize:28,fontWeight:900}}>+ HEALTH</span>
            <span style={{marginLeft:"auto",fontSize:14,color:"#555"}}>{new Date().toLocaleDateString("ko-KR")}</span>
          </div>
          <div style={{height:2,background:`linear-gradient(90deg,${C.run} 0%,${C.bp} 50%,${C.weight} 100%)`}}/>
        </div>

        {tab==="home"&&view==="list"&&(
          <div style={{padding:"22px 24px 0"}}>
            <div style={SEC}>이번 주 요약</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:22}}>
              {[{label:"런닝",value:`${weekRuns.length}회`,sub:`${weekRuns.reduce((a,r)=>a+r.distance,0).toFixed(1)}km`,color:C.run},{label:"혈압",value:latestHealth?.sys?`${latestHealth.sys}/${latestHealth.dia}`:"—",sub:bpSt.label,color:bpSt.color},{label:"체중",value:latestHealth?.weight?`${latestHealth.weight}`:"—",sub:latestHealth?.weight?"kg":"—",color:C.weight}].map(s=>(
                <div key={s.label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"14px 12px"}}>
                  <div style={{fontSize:13,color:"#666",marginBottom:8}}>{s.label}</div>
                  <div style={{fontSize:18,fontWeight:900,color:s.color,lineHeight:1}}>{s.value}</div>
                  <div style={{fontSize:13,color:"#666",marginTop:5}}>{s.sub}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:22}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"14px"}}>
                <div style={{fontSize:13,color:"#666",marginBottom:10}}>혈압 추이</div>
                {sysHistory.length>=2?<><Sparkline data={sysHistory} color={C.bp}/><Sparkline data={diaHistory} color="#2255aa"/></>:<div style={{fontSize:14,color:"#333",padding:"8px 0"}}>데이터 부족</div>}
                {latestHealth?.sys&&<div style={{fontSize:15,fontWeight:700,color:C.bp,marginTop:8}}>{latestHealth.sys}/{latestHealth.dia} <span style={{fontSize:13,color:bpSt.color}}>{bpSt.label}</span></div>}
              </div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"14px"}}>
                <div style={{fontSize:13,color:"#666",marginBottom:10}}>체중 추이</div>
                {weightHistory.length>=2?<Sparkline data={weightHistory} color={C.weight}/>:<div style={{fontSize:14,color:"#333",padding:"8px 0"}}>데이터 부족</div>}
                {latestHealth?.weight&&<div style={{fontSize:15,fontWeight:700,color:C.weight,marginTop:8}}>{latestHealth.weight} kg</div>}
              </div>
            </div>
            <div style={SEC}>런닝 통계</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:22}}>
              {[{label:"총 거리",value:`${runStats.totalKm.toFixed(1)}km`},{label:"최고 페이스",value:runStats.bestPace},{label:"최장 거리",value:`${runStats.longestRun.toFixed(1)}km`}].map(s=>(
                <div key={s.label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"12px"}}>
                  <div style={{fontSize:12,color:"#666",marginBottom:6}}>{s.label}</div>
                  <div style={{fontSize:16,fontWeight:800}}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={SEC}>최근 기록</div>
            {[...runs.slice(0,3).map(r=>({...r,type:"run"})),...healths.slice(0,3).map(h=>({...h,type:"health"}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5).map(item=>(
              <div key={item.id} onClick={()=>{setSelected(item);setView(item.type==="run"?"detailRun":"detailHealth");}} style={{display:"flex",alignItems:"center",padding:"16px 0",borderBottom:`1px solid #13131d`,cursor:"pointer",gap:14}}>
                <div style={{width:40,height:40,borderRadius:4,background:item.type==="run"?"rgba(255,80,0,0.12)":"rgba(77,166,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{item.type==="run"?"🏃":"💊"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,color:"#666",marginBottom:4}}>{formatDate(item.date)}</div>
                  {item.type==="run"?<div style={{fontSize:18,fontWeight:800,color:C.run}}>{item.distance}km <span style={{fontSize:13,color:"#666",fontWeight:400}}>{formatPace(item.distance,item.duration)}/km {item.route?"📍":""}</span></div>:<div style={{fontSize:17,fontWeight:700}}>{item.sys?<span style={{color:C.bp}}>{item.sys}/{item.dia} </span>:null}{item.weight?<span style={{color:C.weight}}>{item.weight}kg</span>:null}</div>}
                </div>
                <div style={{color:"#444",fontSize:20}}>›</div>
              </div>
            ))}
            {runs.length===0&&healths.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:"#2a2a38",fontSize:16}}>기록을 시작해보세요 👟💊</div>}
          </div>
        )}

        {view==="addRun"&&(
          <div style={{padding:"24px"}}>
            <button onClick={()=>{setView("list");setTab("home");resetGPS();}} style={BACK}>← 취소</button>
            <div style={{fontSize:14,color:C.run,letterSpacing:"0.12em",marginBottom:22,fontWeight:700}}>NEW RUN</div>
            <div style={{border:`1px solid rgba(255,80,0,0.2)`,borderRadius:4,overflow:"hidden",marginBottom:16}}>
              <div style={{padding:"12px 14px",background:C.card,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,color:"#777",marginBottom:2}}>GPS 트래킹</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:gpsActive?"#00c896":"#333",boxShadow:gpsActive?"0 0 0 3px rgba(0,200,150,0.25)":"none"}}/>
                    <span style={{fontSize:13,color:gpsActive?"#00c896":"#555"}}>{gpsActive?"추적 중":"대기"}</span>
                    {gpsDistance>0&&<span style={{fontSize:14,color:C.run,fontWeight:700,marginLeft:8}}>📍 {gpsDistance.toFixed(2)}km</span>}
                  </div>
                </div>
                {!timer.running?<button onClick={startRun} style={{background:"#00c896",border:"none",color:"#fff",padding:"10px 18px",borderRadius:3,cursor:"pointer",fontSize:14,fontFamily:"inherit",fontWeight:700}}>▶ GPS 시작</button>:<button onClick={toggleTimer} style={{background:"#ff5000",border:"none",color:"#fff",padding:"10px 18px",borderRadius:3,cursor:"pointer",fontSize:14,fontFamily:"inherit",fontWeight:700}}>■ 종료</button>}
              </div>
              {gpsError&&<div style={{padding:"10px 14px",background:"rgba(255,50,50,0.08)",fontSize:13,color:"#ff6060"}}>{gpsError}</div>}
              <RunMap route={route.length>1?route:null} center={currentPos} height={220}/>
            </div>
            {timer.running&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                {[{label:"시간",value:formatTime(timer.seconds)},{label:"거리",value:`${gpsDistance.toFixed(2)}km`},{label:"페이스",value:gpsDistance>0?formatPace(gpsDistance,timer.seconds):"—"}].map(s=>(
                  <div key={s.label} style={{background:C.card,border:`1px solid rgba(255,80,0,0.2)`,borderRadius:4,padding:"12px 10px",textAlign:"center"}}>
                    <div style={{fontSize:12,color:"#666",marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:16,fontWeight:800,color:C.run}}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
            {!timer.running&&(
              <div style={{border:`1px solid rgba(255,80,0,0.2)`,borderRadius:4,padding:"18px",marginBottom:20,textAlign:"center"}}>
                <div style={{fontSize:13,color:"#666",marginBottom:10}}>수동 스탑워치</div>
                <div style={{fontSize:48,fontWeight:900,color:timer.seconds>0?C.run:"#333",marginBottom:14}}>{formatTime(timer.seconds)}</div>
                <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                  <button onClick={toggleTimer} style={{background:"transparent",border:`2px solid ${C.run}`,color:C.run,padding:"10px 24px",borderRadius:3,cursor:"pointer",fontSize:14,fontFamily:"inherit",fontWeight:700}}>▶ 시작</button>
                  <button onClick={resetTimer} style={{background:"transparent",border:"1px solid #222",color:"#555",padding:"10px 18px",borderRadius:3,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>초기화</button>
                </div>
              </div>
            )}
            <label style={LBL}>날짜</label>
            <input type="date" value={runForm.date} onChange={e=>setRunForm({...runForm,date:e.target.value})} style={{...ni(),fontSize:20,marginBottom:22}}/>
            <label style={LBL}>거리 (km)</label>
            <input type="number" placeholder="0.0" step="0.01" value={runForm.distance} onChange={e=>setRunForm({...runForm,distance:e.target.value})} style={{...ni(C.run),fontSize:42,marginBottom:8}}/>
            {gpsDistance>0&&<div style={{fontSize:13,color:"#555",marginBottom:16}}>GPS 측정: {gpsDistance.toFixed(3)}km</div>}
            {!gpsDistance&&<div style={{marginBottom:16}}/>}
            <label style={{...LBL,marginBottom:10}}>시간</label>
            <div style={{display:"flex",gap:10,marginBottom:22}}>
              {[["hours","시간"],["minutes","분"],["seconds","초"]].map(([k,u])=>(
                <div key={k} style={{flex:1,textAlign:"center"}}>
                  <input type="number" placeholder="0" min="0" value={runForm[k]} onChange={e=>setRunForm({...runForm,[k]:e.target.value})} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:"#e8e8e0",fontSize:28,fontWeight:700,padding:"12px 4px",textAlign:"center",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                  <div style={{fontSize:14,color:"#555",marginTop:6}}>{u}</div>
                </div>
              ))}
            </div>
            <label style={{...LBL,marginBottom:10}}>컨디션</label>
            <div style={{display:"flex",gap:8,marginBottom:22}}>
              {feelings.map((f,i)=>(
                <button key={i} onClick={()=>setRunForm({...runForm,feeling:i})} style={{flex:1,fontSize:28,background:runForm.feeling===i?"rgba(255,80,0,0.15)":"transparent",border:runForm.feeling===i?`2px solid ${C.run}`:`1px solid ${C.border}`,borderRadius:4,padding:"10px 0",cursor:"pointer"}}>{f}</button>
              ))}
            </div>
            {runForm.distance&&(parseInt(runForm.minutes)||parseInt(runForm.seconds))&&(
              <div style={{background:"rgba(255,80,0,0.07)",border:`1px solid rgba(255,80,0,0.2)`,borderRadius:4,padding:"13px 18px",marginBottom:20}}>
                <span style={{fontSize:15,color:"#777"}}>페이스 </span>
                <span style={{fontSize:24,fontWeight:900,color:C.run}}>{formatPace(parseFloat(runForm.distance),(parseInt(runForm.hours)||0)*3600+(parseInt(runForm.minutes)||0)*60+(parseInt(runForm.seconds)||0))}</span>
                <span style={{fontSize:15,color:"#666"}}> /km</span>
              </div>
            )}
            <label style={LBL}>메모</label>
            <textarea placeholder="오늘 런닝은 어땠나요?" value={runForm.memo} onChange={e=>setRunForm({...runForm,memo:e.target.value})} style={{display:"block",width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:"#e8e8e0",fontSize:16,padding:"14px",marginTop:6,marginBottom:26,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"none",minHeight:72}}/>
            <button onClick={submitRun} style={{width:"100%",background:C.run,border:"none",color:"#fff",padding:"18px",fontSize:17,fontWeight:900,borderRadius:4,cursor:"pointer",fontFamily:"inherit"}}>저장하기 →</button>
          </div>
        )}

        {view==="addHealth"&&(
          <div style={{padding:"24px"}}>
            <button onClick={()=>{setView("list");setTab("home");}} style={BACK}>← 취소</button>
            <div style={{fontSize:14,color:C.bp,letterSpacing:"0.12em",marginBottom:22,fontWeight:700}}>건강 기록</div>
            <label style={LBL}>날짜</label>
            <input type="date" value={healthForm.date} onChange={e=>setHealthForm({...healthForm,date:e.target.value})} style={{...ni(),fontSize:20,marginBottom:22}}/>
            <div style={{border:`1px solid rgba(77,166,255,0.25)`,borderRadius:4,padding:"18px",marginBottom:18}}>
              <div style={{fontSize:15,color:C.bp,marginBottom:16,fontWeight:700}}>혈압</div>
              <div style={{display:"flex",gap:14,marginBottom:16,alignItems:"flex-end"}}>
                <div style={{flex:1}}>
                  <label style={LBL}>수축기 (위)</label>
                  <input type="number" placeholder="120" value={healthForm.sys} onChange={e=>setHealthForm({...healthForm,sys:e.target.value})} style={{...ni(C.bp),fontSize:38}}/>
                  <div style={{fontSize:14,color:"#666",marginTop:4}}>mmHg</div>
                </div>
                <div style={{fontSize:30,color:"#444",paddingBottom:32}}>/</div>
                <div style={{flex:1}}>
                  <label style={LBL}>이완기 (아래)</label>
                  <input type="number" placeholder="80" value={healthForm.dia} onChange={e=>setHealthForm({...healthForm,dia:e.target.value})} style={{...ni(C.bp),fontSize:38}}/>
                  <div style={{fontSize:14,color:"#666",marginTop:4}}>mmHg</div>
                </div>
              </div>
              <label style={LBL}>맥박</label>
              <input type="number" placeholder="72" value={healthForm.pulse} onChange={e=>setHealthForm({...healthForm,pulse:e.target.value})} style={{...ni(),fontSize:30,marginBottom:4}}/>
              <div style={{fontSize:14,color:"#666"}}>bpm</div>
              {healthForm.sys&&healthForm.dia&&(()=>{const st=bpStatus(parseFloat(healthForm.sys),parseFloat(healthForm.dia));return <div style={{marginTop:14,padding:"11px 16px",background:"rgba(0,0,0,0.3)",borderLeft:`4px solid ${st.color}`,fontSize:16,color:st.color,fontWeight:700}}>{st.label}</div>;})()}
            </div>
            <div style={{border:`1px solid rgba(167,139,250,0.25)`,borderRadius:4,padding:"18px",marginBottom:18}}>
              <div style={{fontSize:15,color:C.weight,marginBottom:16,fontWeight:700}}>체중</div>
              <label style={LBL}>체중 (kg)</label>
              <input type="number" placeholder="70.0" step="0.1" value={healthForm.weight} onChange={e=>setHealthForm({...healthForm,weight:e.target.value})} style={{...ni(C.weight),fontSize:42,marginBottom:6}}/>
              {healthForm.weight&&weightHistory.length>0&&(<div style={{fontSize:15,color:"#777",marginTop:4}}>이전 {weightHistory.at(-1)}kg → {parseFloat(healthForm.weight)>weightHistory.at(-1)?"+":""}{(parseFloat(healthForm.weight)-weightHistory.at(-1)).toFixed(1)}kg</div>)}
            </div>
            <label style={LBL}>메모</label>
            <textarea placeholder="오늘 건강 상태는?" value={healthForm.memo} onChange={e=>setHealthForm({...healthForm,memo:e.target.value})} style={{display:"block",width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:"#e8e8e0",fontSize:16,padding:"14px",marginTop:6,marginBottom:26,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"none",minHeight:68}}/>
            <button onClick={submitHealth} style={{width:"100%",background:C.bp,border:"none",color:"#fff",padding:"18px",fontSize:17,fontWeight:900,borderRadius:4,cursor:"pointer",fontFamily:"inherit"}}>저장하기 →</button>
          </div>
        )}

        {tab==="logs"&&view==="list"&&(
          <div style={{padding:"20px 24px 0"}}>
            <div style={{display:"flex",gap:0,marginBottom:22,border:`1px solid ${C.border}`,borderRadius:4,overflow:"hidden"}}>
              {[["run","🏃 런닝",C.run],["bp","💊 혈압",C.bp],["weight","⚖️ 체중",C.weight]].map(([k,label,color])=>(
                <button key={k} onClick={()=>setSubTab(k)} style={{flex:1,padding:"14px 4px",background:subTab===k?"rgba(255,255,255,0.05)":"transparent",border:"none",borderBottom:subTab===k?`3px solid ${color}`:"3px solid transparent",color:subTab===k?color:"#555",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600}}>{label}</button>
              ))}
            </div>
            {subTab==="run"&&(<>
              <div style={{fontSize:14,color:"#555",marginBottom:14}}>총 {runs.length}회</div>
              {runs.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:"#2a2a38",fontSize:16}}>런닝 기록 없음</div>}
              {runs.map((r,i)=>(
                <div key={r.id} onClick={()=>{setSelected(r);setView("detailRun");}} style={{display:"flex",alignItems:"center",gap:14,padding:"18px 0",borderBottom:`1px solid #12121c`,cursor:"pointer"}}>
                  <div style={{fontSize:14,color:"#333",minWidth:26,fontWeight:700}}>{String(i+1).padStart(2,"0")}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:"#666",marginBottom:4}}>{formatDate(r.date)} {r.route?"📍":""}</div>
                    <div style={{fontSize:24,fontWeight:800,color:C.run}}>{r.distance}<span style={{fontSize:14,color:"#666",fontWeight:400}}> km</span></div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:16,fontWeight:700}}>{formatPace(r.distance,r.duration)}</div>
                    <div style={{fontSize:14,color:"#555",marginTop:3}}>{formatTime(r.duration)}</div>
                    <div style={{fontSize:20,marginTop:2}}>{feelings[r.feeling]}</div>
                  </div>
                </div>
              ))}
            </>)}
            {subTab==="bp"&&(<>
              <div style={{fontSize:14,color:"#555",marginBottom:14}}>혈압 기록 {healths.filter(h=>h.sys).length}회</div>
              {healths.filter(h=>h.sys).length===0&&<div style={{textAlign:"center",padding:"48px 0",color:"#2a2a38",fontSize:16}}>혈압 기록 없음</div>}
              {healths.filter(h=>h.sys).map(h=>{const st=bpStatus(h.sys,h.dia);return(
                <div key={h.id} onClick={()=>{setSelected(h);setView("detailHealth");}} style={{display:"flex",alignItems:"center",gap:14,padding:"18px 0",borderBottom:`1px solid #12121c`,cursor:"pointer"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:"#666",marginBottom:4}}>{formatDate(h.date)}</div>
                    <div style={{fontSize:28,fontWeight:800,color:C.bp}}>{h.sys}<span style={{fontSize:20,color:"#666"}}>/{h.dia}</span></div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:15,color:st.color,fontWeight:700,marginBottom:4}}>{st.label}</div>
                    {h.pulse&&<div style={{fontSize:14,color:"#666"}}>♥ {h.pulse} bpm</div>}
                  </div>
                </div>
              );})}
            </>)}
            {subTab==="weight"&&(<>
              <div style={{fontSize:14,color:"#555",marginBottom:14}}>체중 기록 {healths.filter(h=>h.weight).length}회</div>
              {healths.filter(h=>h.weight).length===0&&<div style={{textAlign:"center",padding:"48px 0",color:"#2a2a38",fontSize:16}}>체중 기록 없음</div>}
              {healths.filter(h=>h.weight).map((h,i,arr)=>{const prev=arr[i+1]?.weight;const diff=prev!=null?(h.weight-prev).toFixed(1):null;return(
                <div key={h.id} onClick={()=>{setSelected(h);setView("detailHealth");}} style={{display:"flex",alignItems:"center",gap:14,padding:"18px 0",borderBottom:`1px solid #12121c`,cursor:"pointer"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:"#666",marginBottom:4}}>{formatDate(h.date)}</div>
                    <div style={{fontSize:30,fontWeight:900,color:C.weight}}>{h.weight}<span style={{fontSize:16,color:"#666",fontWeight:400}}> kg</span></div>
                  </div>
                  {diff!==null&&<div style={{fontSize:18,fontWeight:700,color:parseFloat(diff)>0?"#ff5060":parseFloat(diff)<0?"#00c896":"#555"}}>{parseFloat(diff)>0?"▲":parseFloat(diff)<0?"▼":"—"} {Math.abs(diff)}</div>}
                </div>
              );})}
            </>)}
          </div>
        )}

        {view==="detailRun"&&selected&&(
          <div style={{padding:"24px"}}>
            <button onClick={()=>{setView("list");setTab("logs");setSubTab("run");}} style={BACK}>← 뒤로</button>
            <div style={{fontSize:15,color:"#666",marginBottom:6}}>{formatDate(selected.date)}</div>
            <div style={{fontSize:64,fontWeight:900,color:C.run,lineHeight:1}}>{selected.distance}</div>
            <div style={{fontSize:18,color:"#555",marginBottom:20}}>km</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              {[{label:"시간",value:formatTime(selected.duration)},{label:"페이스",value:formatPace(selected.distance,selected.duration)+" /km"}].map(s=>(
                <div key={s.label} style={{border:`1px solid ${C.border}`,padding:"18px",borderRadius:4}}>
                  <div style={{fontSize:13,color:"#555",marginBottom:8}}>{s.label}</div>
                  <div style={{fontSize:22,fontWeight:700}}>{s.value}</div>
                </div>
              ))}
            </div>
            {selected.route&&selected.route.length>1&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:14,color:"#666",marginBottom:10}}>📍 런닝 경로</div>
                <div style={{borderRadius:4,overflow:"hidden",border:`1px solid ${C.border}`}}><RunMap route={selected.route} height={260}/></div>
                <div style={{display:"flex",gap:16,marginTop:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#666"}}><div style={{width:10,height:10,borderRadius:"50%",background:"#00c896",border:"2px solid #fff"}}/>출발</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#666"}}><div style={{width:10,height:10,borderRadius:"50%",background:"#ff5000",border:"2px solid #fff"}}/>도착</div>
                </div>
              </div>
            )}
            <div style={{fontSize:44,marginBottom:18}}>{feelings[selected.feeling]}</div>
            {selected.memo&&<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"16px",fontSize:16,color:"#999",marginBottom:28}}>{selected.memo}</div>}
            <button onClick={()=>deleteRun(selected.id)} style={{width:"100%",background:"transparent",border:"1px solid #2a1010",color:"#664444",padding:"16px",fontSize:15,borderRadius:4,cursor:"pointer",fontFamily:"inherit"}}>삭제하기</button>
          </div>
        )}

        {view==="detailHealth"&&selected&&(()=>{
          const st=selected.sys?bpStatus(selected.sys,selected.dia):{label:"—",color:"#555"};
          return(
            <div style={{padding:"24px"}}>
              <button onClick={()=>{setView("list");setTab("logs");setSubTab(selected.sys?"bp":"weight");}} style={BACK}>← 뒤로</button>
              <div style={{fontSize:15,color:"#666",marginBottom:20}}>{formatDate(selected.date)}</div>
              {selected.sys&&(
                <div style={{border:`1px solid rgba(77,166,255,0.2)`,borderRadius:4,padding:"20px",marginBottom:18}}>
                  <div style={{fontSize:15,color:C.bp,marginBottom:14,fontWeight:700}}>혈압</div>
                  <div style={{fontSize:56,fontWeight:900,color:C.bp,lineHeight:1}}>{selected.sys}<span style={{fontSize:30,color:"#555"}}>/{selected.dia}</span></div>
                  <div style={{fontSize:15,color:"#555",marginTop:6}}>mmHg</div>
                  <div style={{marginTop:14,padding:"12px 16px",background:"rgba(0,0,0,0.3)",borderLeft:`4px solid ${st.color}`,fontSize:17,color:st.color,fontWeight:700}}>{st.label}</div>
                  {selected.pulse&&<div style={{fontSize:17,color:"#777",marginTop:14}}>♥ {selected.pulse} bpm</div>}
                </div>
              )}
              {selected.weight&&(
                <div style={{border:`1px solid rgba(167,139,250,0.2)`,borderRadius:4,padding:"20px",marginBottom:18}}>
                  <div style={{fontSize:15,color:C.weight,marginBottom:14,fontWeight:700}}>체중</div>
                  <div style={{fontSize:56,fontWeight:900,color:C.weight,lineHeight:1}}>{selected.weight}<span style={{fontSize:22,color:"#555"}}> kg</span></div>
                </div>
              )}
              {selected.memo&&<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"16px",fontSize:16,color:"#999",marginBottom:28}}>{selected.memo}</div>}
              <button onClick={()=>deleteHealth(selected.id)} style={{width:"100%",background:"transparent",border:"1px solid #2a1010",color:"#664444",padding:"16px",fontSize:15,borderRadius:4,cursor:"pointer",fontFamily:"inherit"}}>삭제하기</button>
            </div>
          );
        })()}
      </div>

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#0a0a0f",borderTop:`1px solid #1a1a24`,display:"flex",zIndex:10,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {[{id:"home",icon:"◉",label:"홈",onClick:()=>{setTab("home");setView("list");},active:tab==="home"&&view==="list",color:C.run},{id:"addRun",icon:"🏃",label:"런닝",onClick:()=>{setView("addRun");setTab("");},active:view==="addRun",color:C.run},{id:"addHealth",icon:"💊",label:"건강",onClick:()=>{setView("addHealth");setTab("");},active:view==="addHealth",color:C.bp},{id:"logs",icon:"≡",label:"기록",onClick:()=>{setTab("logs");setView("list");},active:tab==="logs"&&view==="list",color:C.bp}].map(n=>(
          <button key={n.id} onClick={n.onClick} style={{flex:1,background:"transparent",border:"none",color:n.active?n.color:"#444",padding:"14px 0 10px",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{fontSize:22,lineHeight:1,marginBottom:4}}>{n.icon}</div>
            <div style={{fontSize:13,fontWeight:n.active?700:400}}>{n.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

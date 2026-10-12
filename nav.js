// Live turn-by-turn navigation (+ ?sim=1 demo drive)
(function(){
const $=id=>document.getElementById(id),D=(a,b)=>Cycle.dist(a,b)*1000;
const ICON={1:'⬆',2:'⬆',3:'⬆',4:'🏁',5:'🏁',6:'🏁',7:'⬆',8:'⬆',9:'↗',10:'➡',11:'↪',12:'↩',13:'↩',14:'↰',15:'⬅',16:'↖',17:'⬆',18:'↗',19:'↖',20:'↗',21:'↖',22:'⬆',23:'↗',24:'↖',25:'⤴',26:'🔄',27:'🔄',37:'↗',38:'↖'};
let S=null;window.navState=()=>S;
function prep(c){const cum=[0];for(let i=1;i<c.pts.length;i++)cum.push(cum[i-1]+D(c.pts[i-1],c.pts[i]));return{...c,cum,total:cum[cum.length-1],sec:c.min*60}}
function fmt(m){const mi=m/1609.34;return mi>=0.2?(mi<10?mi.toFixed(1):Math.round(mi))+' mi':Math.max(0,Math.round(m*3.281/50)*50)+' ft'}
function snap(r,p,hint){const proj=(i)=>{const a=r.pts[i],b=r.pts[i+1],kx=111320*Math.cos(a[0]*Math.PI/180),ky=110570;const ax=(p[1]-a[1])*kx,ay=(p[0]-a[0])*ky,bx=(b[1]-a[1])*kx,by=(b[0]-a[0])*ky,l=bx*bx+by*by;let t=l?(ax*bx+ay*by)/l:0;t=Math.max(0,Math.min(1,t));return{d:Math.hypot(ax-t*bx,ay-t*by),i,t,along:r.cum[i]+t*(r.cum[i+1]-r.cum[i])}};
 let best=null;const scan=(lo,hi)=>{for(let i=Math.max(0,lo);i<Math.min(r.pts.length-1,hi);i++){const q=proj(i);if(!best||q.d<best.d)best=q}};scan(hint-30,hint+400);if(!best||best.d>40)scan(0,r.pts.length);return best}
const lc=t=>t.charAt(0).toLowerCase()+t.slice(1);
function say(t){if(S&&S.muted||!window.speechSynthesis)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.rate=1.05;speechSynthesis.speak(u)}catch(e){}window.lastSpoken=t}
function msg(t,ms=3000){const m=$('navmsg');m.textContent=t;m.style.display='block';clearTimeout(msg.t);msg.t=setTimeout(()=>m.style.display='none',ms)}
function load(r){S.r=prep(r);S.hint=0;S.step=1;S.spoken={};S.off=0;if(S.line)map.removeLayer(S.line);S.line=L.polyline(S.r.pts,{color:'#1a73e8',weight:8,opacity:.85}).addTo(map)}
async function start(sim){const cr=window.curRoute;if(!cr)return;S={mode:cr.mode,dest:cr.dest||cr.c.pts[cr.c.pts.length-1],muted:false,sim,start:Date.now(),reroutes:0};
 document.body.classList.add('navigating');$('nav').hidden=false;layers.clearLayers();load(cr.c);
 S.marker=L.marker(S.r.pts[0],{icon:L.divIcon({className:'rider',html:'<div><svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#1a73e8" stroke="#fff" stroke-width="3"/><path d="M17 6 L25 25 L17 20 L9 25 Z" fill="#fff"/></svg></div>',iconSize:[34,34]}),zIndexOffset:1000}).addTo(map);
 map.setView(S.r.pts[0],17);try{S.wake=await navigator.wakeLock?.request('screen')}catch(e){}
 const m0=S.r.man[0];say(m0?m0.verbal_pre_transition_instruction||m0.instruction:'Starting navigation');
 if(sim)simulate();else S.watch=navigator.geolocation.watchPosition(onPos,e=>msg('GPS: '+e.message,5000),{enableHighAccuracy:true,maximumAge:1000,timeout:15000})}
function end(){if(!S)return;if(S.watch!=null)navigator.geolocation.clearWatch(S.watch);clearInterval(S.simT);S.wake?.release?.();S.marker&&map.removeLayer(S.marker);S.line&&map.removeLayer(S.line);try{speechSynthesis.cancel()}catch(e){}
 S=null;$('nav').hidden=true;document.body.classList.remove('navigating');window.curRoute&&L.polyline(window.curRoute.c.pts,{color:'#e8711a',weight:6}).addTo(layers)}
async function reroute(p){if(S.rerouting)return;S.rerouting=true;msg('Off route — rerouting…');say('Rerouting');
 try{const m=S.mode==='fast'?'fast':S.mode;const [t]=await Cycle.route([p,S.dest],m,0);load(Cycle.tripInfo(t));S.reroutes++;S.simDetourStop=1;msg('New route: '+fmt(S.r.total));if(S.sim)S.simRoute=S.r}catch(e){msg('Reroute failed: '+e.message,5000)}S.rerouting=false}
function onPos(pos){if(!S)return;const p=[pos.coords.latitude,pos.coords.longitude],spd=pos.coords.speed,acc=pos.coords.accuracy||10;const r=S.r;const q=snap(r,p,S.hint);
 let hd=pos.coords.heading;if(hd==null||isNaN(hd))hd=S.prev?Cycle.bearing(S.prev,p):0;if(!S.prev||D(S.prev,p)>2)S.hd=hd;S.prev=p;
 S.marker.setLatLng(p);S.marker.getElement().firstChild.style.transform=`rotate(${S.hd||0}deg)`;map.setView(p,Math.max(map.getZoom(),17),{animate:true});
 $('navspd').textContent=spd!=null&&!isNaN(spd)?Math.round(spd*2.237):'–';
 if(q.d>Math.max(60,acc)){S.off++;if(S.off>=3)reroute(p);return}S.off=0;S.hint=q.i;const prog=q.along;
 while(S.step<r.man.length-1&&r.cum[r.man[S.step].idx]<prog+8)S.step++;const nm=r.man[S.step],toM=r.cum[nm.idx]-prog;
 $('navicon').textContent=ICON[nm.type]||'⬆';$('navdist').textContent=fmt(toM);$('navinstr').textContent=nm.instruction;const nn=r.man[S.step+1];$('navthen').textContent=nn?'Then: '+nn.instruction:'';
 const rem=r.total-prog;$('navrem').textContent=fmt(rem);$('naveta').textContent=new Date(Date.now()+r.sec*rem/r.total*1000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 const k=S.step,sp=S.spoken[k]=S.spoken[k]||{},ins=nm.verbal_pre_transition_instruction||nm.instruction;
 if(toM<40&&!sp.now){sp.now=sp.f=sp.h=1;say(ins)}else if(toM<170&&toM>=40&&!sp.f){sp.f=sp.h=1;say('In 500 feet, '+lc(ins))}else if(toM<900&&toM>=600&&!sp.h){sp.h=1;say('In half a mile, '+lc(ins))}
 if(S.step===r.man.length-1&&toM<30){say('You have arrived');msg('Arrived 🏁',6000);setTimeout(end,4000)}}
// --- simulation: drives along current route at ~45 mph; navSim.offRoute() forces a detour
function simulate(){S.simRoute=S.r;let along=0,detour=0;const v=20,dt=0.5;window.navSim={offRoute:()=>{detour=1},speedup:x=>S.simMul=x};
 S.simT=setInterval(()=>{if(!S)return;const r=S.r;if(r!==S.lastSim){along=S.lastSim?snap(r,S.prevSim,0).along:0;S.lastSim=r}
  along+=v*dt*(S.simMul||1);let i=0;while(i<r.cum.length-2&&r.cum[i+1]<along)i++;const t=(along-r.cum[i])/((r.cum[i+1]-r.cum[i])||1),a=r.pts[i],b=r.pts[i+1];
  let p=[a[0]+(b[0]-a[0])*Math.min(1,t),a[1]+(b[1]-a[1])*Math.min(1,t)];if(detour){p=[p[0]+0.0012*Math.min(detour,4),p[1]+0.0012*Math.min(detour,4)];detour++;if(detour>8||S.simDetourStop){detour=0;S.simDetourStop=0}}
  S.prevSim=p;onPos({coords:{latitude:p[0],longitude:p[1],speed:v*(S.simMul||1),heading:null,accuracy:5}})},dt*1000)}
$('navbtn').onclick=()=>start(false);$('simbtn').onclick=()=>start(true);$('navend').onclick=end;
$('navmute').onclick=()=>{S.muted=!S.muted;$('navmute').textContent=S.muted?'🔇':'🔊';if(S.muted)speechSynthesis.cancel()};
if(/[?&]sim=1/.test(location.search))$('simbtn').hidden=false;
const ob=new MutationObserver(()=>{if(!$('navbtn').hidden&&/[?&]sim=1/.test(location.search))$('simbtn').hidden=false});ob.observe($('navbtn'),{attributes:true});
window.Nav={start,end};
})();

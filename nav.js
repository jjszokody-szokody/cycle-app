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
const VIEWKEY='cycle.navView';let view=localStorage.getItem(VIEWKEY)||'north';
function setLine(coords){const src=S.gl&&S.gl.getSource('rem');const g={type:'Feature',geometry:{type:'LineString',coordinates:coords.map(p=>[p[1],p[0]])}};if(src)src.setData(g);else S.pendingLine=g}
function load(r){S.r=prep(r);S.hint=0;S.step=1;S.spoken={};S.off=0;setLine(S.r.pts)}
function cam(){const h=S.gl.getContainer().clientHeight;return{pitch:view==='persp'?60:0,bearing:view==='persp'?(S.brg||0):0,zoom:view==='persp'?17.5:16.5,padding:view==='persp'?{top:Math.round(h*0.45),bottom:0,left:0,right:0}:{top:0,bottom:0,left:0,right:0}}}
function applyView(anim=true){$('navview').textContent=view==='persp'?'🛣️ Perspective':'🧭 North Up';if(!S||!S.gl)return;S.gl.easeTo({...cam(),duration:anim?600:0})}
function makeGL(p){const gl=new maplibregl.Map({container:'navmap',style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]},center:[p[1],p[0]],zoom:16.5,attributionControl:{compact:true},maxPitch:70,fadeDuration:0});
 gl.on('load',()=>{gl.addSource('rem',{type:'geojson',data:S.pendingLine||{type:'Feature',geometry:{type:'LineString',coordinates:[]}}});
  gl.addLayer({id:'remcase',type:'line',source:'rem',paint:{'line-color':'#0d47a1','line-width':12,'line-opacity':.5},layout:{'line-cap':'round','line-join':'round'}});
  gl.addLayer({id:'remline',type:'line',source:'rem',paint:{'line-color':'#1a73e8','line-width':8},layout:{'line-cap':'round','line-join':'round'}});S.glReady=true;applyView(false)});
 const el=document.createElement('div');el.className='rider2';el.innerHTML='<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="17" fill="#1a73e8" stroke="#fff" stroke-width="3"/><path d="M20 7 L29 29 L20 23 L11 29 Z" fill="#fff"/></svg>';
 S.rider=new maplibregl.Marker({element:el,rotationAlignment:'map',pitchAlignment:'map'}).setLngLat([p[1],p[0]]).addTo(gl);return gl}
function angLerp(a,b,t){let d=((b-a+540)%360)-180;return (a+d*t+360)%360}
async function start(sim){const cr=window.curRoute;if(!cr)return;S={mode:cr.mode,dest:cr.dest||cr.c.pts[cr.c.pts.length-1],muted:false,sim,start:Date.now(),reroutes:0,brg:0};
 document.body.classList.add('navigating');$('nav').hidden=false;load(cr.c);
 // Begin from the rider's actual location: if GPS is away from the planned start, route from here first
 let here=null;try{msg('Getting your location…');here=await getHere(sim?3000:12000)}catch(e){if(!sim)msg(e.message+' — using planned start',4000)}
 if(here&&D(here,S.r.pts[0])>100){msg('Routing from your location…');try{const m=S.mode==='fast'?'fast':S.mode;const [t]=await Cycle.route([here,S.dest],m,0);load(Cycle.tripInfo(t));S.fromHere=true}catch(e){msg('Could not route from here: '+e.message,4000)}}
 const p0=here||S.r.pts[0];S.gl=makeGL(p0);S.brg=Cycle.bearing(S.r.pts[0],S.r.pts[Math.min(3,S.r.pts.length-1)]);if(sim&&here)S.simStart=here;try{S.wake=await navigator.wakeLock?.request('screen')}catch(e){}
 const m0=S.r.man[0];say(m0?m0.verbal_pre_transition_instruction||m0.instruction:'Starting navigation');
 if(sim)simulate();else S.watch=navigator.geolocation.watchPosition(onPos,e=>msg('GPS: '+e.message,5000),{enableHighAccuracy:true,maximumAge:1000,timeout:15000})}
function end(){if(!S)return;if(S.watch!=null)navigator.geolocation.clearWatch(S.watch);clearInterval(S.simT);S.wake?.release?.();try{S.gl&&S.gl.remove()}catch(e){}try{speechSynthesis.cancel()}catch(e){}
 S=null;$('nav').hidden=true;document.body.classList.remove('navigating');setTimeout(()=>map.invalidateSize(),50)}
async function reroute(p){if(S.rerouting)return;S.rerouting=true;msg('Off route — rerouting…');say('Rerouting');
 try{const m=S.mode==='fast'?'fast':S.mode;const [t]=await Cycle.route([p,S.dest],m,0);load(Cycle.tripInfo(t));S.reroutes++;S.simDetourStop=1;msg('New route: '+fmt(S.r.total));if(S.sim)S.simRoute=S.r}catch(e){msg('Reroute failed: '+e.message,5000)}S.rerouting=false}
function onPos(pos){if(!S)return;const p=[pos.coords.latitude,pos.coords.longitude],spd=pos.coords.speed,acc=pos.coords.accuracy||10;const r=S.r;const q=snap(r,p,S.hint);
 // heading: GPS heading when moving, else route bearing (on route) or movement bearing
 let hd=pos.coords.heading;const moving=spd==null||spd>1.5;if(hd==null||isNaN(hd)||!moving){if(q.d<=60){const j=Math.min(q.i+3,r.pts.length-1);hd=Cycle.bearing(r.pts[q.i],r.pts[j===q.i?q.i+1:j])}else if(S.prev&&D(S.prev,p)>3)hd=Cycle.bearing(S.prev,p);else hd=S.brg}
 S.brg=angLerp(S.brg,hd,0.5);S.prev=p;
 if(S.rider){S.rider.setLngLat([p[1],p[0]]);S.rider.setRotation(S.brg)}
 if(S.gl&&S.glReady)S.gl.easeTo({...cam(),center:[p[1],p[0]],duration:S.sim?450:900,easing:t=>t});
 // remaining line: from actual GPS point -> snapped point -> rest of route
 if(q.d<=60){const sp=[r.pts[q.i][0]+(r.pts[q.i+1][0]-r.pts[q.i][0])*q.t,r.pts[q.i][1]+(r.pts[q.i+1][1]-r.pts[q.i][1])*q.t];setLine([p,sp,...r.pts.slice(q.i+1)])}else setLine([p,...r.pts.slice(Math.max(q.i,0))]);
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
 S.simT=setInterval(()=>{if(!S)return;const r=S.r;if(r!==S.lastSim){along=S.lastSim&&S.prevSim?snap(r,S.prevSim,0).along:0;S.lastSim=r}
  along+=v*dt*(S.simMul||1);let i=0;while(i<r.cum.length-2&&r.cum[i+1]<along)i++;const t=(along-r.cum[i])/((r.cum[i+1]-r.cum[i])||1),a=r.pts[i],b=r.pts[i+1];
  let p=[a[0]+(b[0]-a[0])*Math.min(1,t),a[1]+(b[1]-a[1])*Math.min(1,t)];if(detour){p=[p[0]+0.0012*Math.min(detour,4),p[1]+0.0012*Math.min(detour,4)];detour++;if(detour>8||S.simDetourStop){detour=0;S.simDetourStop=0}}
  S.prevSim=p;onPos({coords:{latitude:p[0],longitude:p[1],speed:v*(S.simMul||1),heading:null,accuracy:5}})},dt*1000)}
$('navbtn').onclick=()=>start(false);$('simbtn').onclick=()=>start(true);$('navend').onclick=end;
$('navview').onclick=()=>{view=view==='persp'?'north':'persp';localStorage.setItem(VIEWKEY,view);applyView()};$('navview').textContent=view==='persp'?'🛣️ Perspective':'🧭 North Up';
$('navmute').onclick=()=>{S.muted=!S.muted;$('navmute').textContent=S.muted?'🔇':'🔊';if(S.muted)speechSynthesis.cancel()};
if(/[?&]sim=1/.test(location.search))$('simbtn').hidden=false;
const ob=new MutationObserver(()=>{if(!$('navbtn').hidden&&/[?&]sim=1/.test(location.search))$('simbtn').hidden=false});ob.observe($('navbtn'),{attributes:true});
window.Nav={start,end};
})();

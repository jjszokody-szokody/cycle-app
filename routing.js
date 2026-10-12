// Shared routing/scoring logic (works in browser and Node)
(function(G){
const VAL='https://valhalla1.openstreetmap.de';
function decode(str,p=6){let i=0,lat=0,lng=0,out=[],f=Math.pow(10,p);while(i<str.length){for(const k of[0,1]){let r=0,s=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);const d=(r&1)?~(r>>1):(r>>1);if(k)lng+=d;else lat+=d}out.push([lat/f,lng/f])}return out}
const R=6371,rad=x=>x*Math.PI/180;
function dist(a,b){const dl=rad(b[0]-a[0]),dn=rad(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function bearing(a,b){const y=Math.sin(rad(b[1]-a[1]))*Math.cos(rad(b[0]));const x=Math.cos(rad(a[0]))*Math.sin(rad(b[0]))-Math.sin(rad(a[0]))*Math.cos(rad(b[0]))*Math.cos(rad(b[1]-a[1]));return Math.atan2(y,x)*180/Math.PI}
// Curvature: resample to ~25 m steps, sum heading changes (ignore >100° = intersection turns), degrees per km
function curvature(pts){const rs=[pts[0]];let acc=0,tot=0;for(let i=1;i<pts.length;i++){const d=dist(pts[i-1],pts[i]);acc+=d;tot+=d;if(acc>=0.05){rs.push(pts[i]);acc=0}}
 let sum=0,prev=null;for(let i=1;i<rs.length;i++){const b=bearing(rs[i-1],rs[i]);if(prev!==null){let d=Math.abs(b-prev);if(d>180)d=360-d;if(d<100)sum+=d}prev=b}return{degPerKm:tot?sum/tot:0,km:tot}}

// ---- Scenery (Overpass): water + parks/forests/protected areas ----
const MIRRORS=['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const memCache={};let fileCache=null;
function cacheGet(k){if(memCache[k])return memCache[k];try{if(typeof localStorage!=='undefined'){const v=localStorage.getItem('ovp:'+k);if(v)return memCache[k]=JSON.parse(v)}}catch(e){}
 try{if(typeof require!=='undefined'){const fs=require('fs'),p=__dirname+'/.overpass-cache.json';fileCache=fileCache||(fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{});if(fileCache[k])return memCache[k]=fileCache[k]}}catch(e){}return null}
function cacheSet(k,v){memCache[k]=v;try{if(typeof localStorage!=='undefined')localStorage.setItem('ovp:'+k,JSON.stringify(v))}catch(e){}
 try{if(typeof require!=='undefined'){const fs=require('fs');fileCache=fileCache||{};fileCache[k]=v;fs.writeFileSync(__dirname+'/.overpass-cache.json',JSON.stringify(fileCache))}}catch(e){}}
function bboxOf(cands,pad=0.01){let s=90,w=180,n=-90,e=-180;for(const c of cands)for(const p of c.pts){if(p[0]<s)s=p[0];if(p[0]>n)n=p[0];if(p[1]<w)w=p[1];if(p[1]>e)e=p[1]}
 const r=x=>Math.round(x*50)/50;return[r(s-pad)-0.02,r(w-pad)-0.02,r(n+pad)+0.02,r(e+pad)+0.02].map(x=>+x.toFixed(2))}
async function fetchT(u,opt,ms){const ac=new AbortController();const t=setTimeout(()=>ac.abort(),ms);try{return await fetch(u,{...opt,signal:ac.signal})}finally{clearTimeout(t)}}
// one compact query per trip; geometry simplified client-side into segments
function cacheCover(bb){cacheGet('__init');const keys=new Set([...Object.keys(memCache),...Object.keys(fileCache||{})]);try{if(typeof localStorage!=='undefined')for(let i=0;i<localStorage.length;i++){const x=localStorage.key(i);if(x.startsWith('ovp:'))keys.add(x.slice(4))}}catch(e){}
 for(const k of keys){const b=k.split(',').map(Number);if(b.length===4&&b[0]<=bb[0]&&b[1]<=bb[1]&&b[2]>=bb[2]&&b[3]>=bb[3])return cacheGet(k)}return null}
async function scenery(bb,log=()=>{}){const k=bb.join(',');const c=cacheCover(bb);if(c){log('Scenery: cached');return c}
 const B=`(${bb.join(',')})`;const q=`[out:json][timeout:60];(way["natural"="water"]["name"]${B};relation["natural"="water"]${B};way["water"~"^(lake|reservoir|river)$"]${B};way["waterway"="river"]${B};way["natural"="coastline"]${B};way["leisure"="nature_reserve"]${B};relation["leisure"="nature_reserve"]${B};way["leisure"="park"]["name"]${B};relation["leisure"="park"]${B};relation["boundary"~"^(national_park|protected_area)$"]${B};way["boundary"~"^(national_park|protected_area)$"]${B};relation["landuse"="forest"]["name"]${B};);out tags geom(${bb.join(',')}) qt;`;
 let lastErr;for(const m of MIRRORS){try{log('Scenery: querying '+new URL(m).host+'…');const r=await fetchT(m,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)},75000);
  if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();const out=parseScenery(j);out.src=new URL(m).host;cacheSet(k,out);return out}catch(e){lastErr=e}}
 throw Error('Overpass unavailable ('+(lastErr&&lastErr.message)+')')}
function parseScenery(j){const water=[],park=[];const q=x=>Math.round(x*1e5)/1e5;
 const segs=(g,arr)=>{if(!g)return;for(let i=1;i<g.length;i++)if(g[i-1]&&g[i])arr.push([q(g[i-1].lat),q(g[i-1].lon),q(g[i].lat),q(g[i].lon)])};
 for(const e of j.elements||[]){const t=e.tags||{};const isW=t.natural==='water'||t.waterway||t.natural==='coastline'||t.water;const arr=isW?water:park;
  if(e.type==='way')segs(e.geometry,arr);else if(e.members){const ring=[];for(const mb of e.members)if(mb.type==='way'&&(isW||mb.role!=='inner'))segs(mb.geometry,ring);
   if(isW)water.push(...ring);else park.push({segs:ring})}
  if(e.type==='way'&&!isW){park.pop&&0}}
 // group way-parks as their own polygons
 const parks=[];for(const e of j.elements||[]){const t=e.tags||{};const isW=t.natural==='water'||t.waterway||t.natural==='coastline'||t.water;if(isW)continue;
  const r=[];if(e.type==='way')segs(e.geometry,r);else for(const mb of e.members||[])if(mb.type==='way'&&mb.role!=='inner')segs(mb.geometry,r);if(r.length)parks.push(r)}
 return{water,parks,nW:water.length,nP:parks.length}}
// grid index for fast nearest-segment checks
function grid(segs,cell=0.01){const g=new Map();for(const s of segs){const a=Math.floor(Math.min(s[0],s[2])/cell),b=Math.floor(Math.max(s[0],s[2])/cell),c=Math.floor(Math.min(s[1],s[3])/cell),d=Math.floor(Math.max(s[1],s[3])/cell);
 for(let i=a;i<=b;i++)for(let k=c;k<=d;k++){const key=i+':'+k;(g.get(key)||g.set(key,[]).get(key)).push(s)}}return{g,cell}}
function segDistKm(p,s){const kx=111.32*Math.cos(rad(p[0])),ky=110.57;const ax=(s[1]-p[1])*kx,ay=(s[0]-p[0])*ky,bx=(s[3]-p[1])*kx,by=(s[2]-p[0])*ky;
 const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?-(ax*dx+ay*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(ax+t*dx,ay+t*dy)}
function near(G,p,km){const c=G.cell,i0=Math.floor(p[0]/c),k0=Math.floor(p[1]/c),r=Math.ceil(km/(111*c))+0;for(let i=i0-r;i<=i0+r;i++)for(let k=k0-r-1;k<=k0+r+1;k++){const a=G.g.get(i+':'+k);if(a)for(const s of a)if(segDistKm(p,s)<=km)return true}return false}
function inside(segs,p){let c=false;for(const s of segs){if((s[0]>p[0])!==(s[2]>p[0])){const x=s[1]+(p[0]-s[0])*(s[3]-s[1])/(s[2]-s[0]);if(p[1]<x)c=!c}}return c}
function prepScenery(sc){if(sc._prep)return sc._prep;const W=grid(sc.water);const allP=[];sc.parks.forEach(r=>allP.push(...r));const P=grid(allP);
 const boxes=sc.parks.map(r=>{let s=90,n=-90,w=180,e=-180;for(const x of r){s=Math.min(s,x[0],x[2]);n=Math.max(n,x[0],x[2]);w=Math.min(w,x[1],x[3]);e=Math.max(e,x[1],x[3])}return[s,w,n,e]});
 return Object.defineProperty(sc,'_prep',{value:{W,P,boxes},enumerable:false})._prep}
function sceneryStats(pts,sc,waterKm=0.4,parkKm=0.3){const {W,P,boxes}=prepScenery(sc);const samp=[pts[0]];let acc=0;for(let i=1;i<pts.length;i++){acc+=dist(pts[i-1],pts[i]);if(acc>=0.2){samp.push(pts[i]);acc=0}}
 let w=0,pk=0;for(const p of samp){if(near(W,p,waterKm))w++;let inP=near(P,p,parkKm);if(!inP)for(let j=0;j<boxes.length&&!inP;j++){const b=boxes[j];if(p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3]&&inside(sc.parks[j],p))inP=true}if(inP)pk++}
 return{water:w/samp.length,park:pk/samp.length,n:samp.length}}
async function post(path,body){const r=await fetch(VAL+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j}
function costing(mode){const o={use_trails:0.0,exclude_unpaved:true,use_tolls:0.5};
 if(mode!=='fast'){o.use_highways=0.0;o.use_primary=mode==='curvy'?0.1:0.3;o.use_living_streets=0.1}else{o.use_highways=1.0}return{motorcycle:o}}
async function route(locs,mode,alts){const b={locations:locs.map(p=>({lat:p[0],lon:p[1],type:'break'})),costing:'motorcycle',costing_options:costing(mode),directions_options:{units:'miles'}};
 if(locs.length>2)b.locations.slice(1,-1).forEach(l=>l.type='through');if(alts)b.alternates=alts;const j=await post('/route',b);return [j.trip,...(j.alternates||[]).map(a=>a.trip)]}
function tripInfo(t){let pts=[],man=[];for(const L of t.legs){pts=pts.concat(decode(L.shape));man=man.concat(L.maneuvers.filter((m,i)=>!(m.type===5||m.type===6)||i===L.maneuvers.length-1))}return{pts,man,miles:t.summary.length,min:t.summary.time/60}}
// Road class / surface breakdown via map-matching the geometry
async function attrs(t){const shape=t.legs.map(l=>l.shape);const pts=t.legs.flatMap(l=>decode(l.shape));
 const enc=t.legs.length===1?shape[0]:null;const body={costing:'motorcycle',shape_match:'walk_or_snap',filters:{attributes:['edge.road_class','edge.surface','edge.unpaved','edge.length','edge.use'],action:'include'}};
 if(enc)body.encoded_polyline=enc;else body.shape=pts.map(p=>({lat:p[0],lon:p[1]}));
 const j=await post('/trace_attributes',body);const by={};let unp=0,tot=0;for(const e of j.edges||[]){by[e.road_class]=(by[e.road_class]||0)+e.length;tot+=e.length;if(e.unpaved)unp+=e.length}
 const f=k=>(by[k]||0)/(tot||1);return{tot,unpavedFrac:unp/(tot||1),motorway:f('motorway')+f('trunk'),primary:f('primary'),sec:f('secondary')+f('tertiary'),minor:f('unclassified')+f('residential')+f('service_other')}}
function score(info,a,mode,baseMin){const c=info.curv.degPerKm;const detour=Math.max(0,info.min/baseMin-1);
 const n=info.nature||{water:0,park:0};const scenic=Math.round(100*(0.35*a.sec+0.1*a.minor-0.6*a.motorway-0.15*a.primary)+45*n.water+55*n.park+0.45*Math.min(c,80));
 const curvy=Math.round(c*1.0+20*a.sec-40*a.motorway);
 const s=(mode==='curvy'?curvy:scenic)-Math.max(0,detour-0.6)*60-(a.unpavedFrac>0?1000:0);return{scenic,curvy,total:Math.round(s)}}
// Via-point variations: offsets perpendicular to the straight line
function vias(A,B){const m=[(A[0]+B[0])/2,(A[1]+B[1])/2],dx=B[1]-A[1],dy=B[0]-A[0],out=[];
 for(const [t,k] of [[0.5,0.15],[0.5,-0.15],[0.5,0.3],[0.5,-0.3],[0.33,0.2],[0.66,-0.2]]){const p=[A[0]+dy*t,A[1]+dx*t];out.push([p[0]+dx*k,p[1]-dy*k])}return out}
async function plan(A,B,mode,log=()=>{}){
 if(mode==='fast'){const [t]=await route([A,B],'fast',0);const i=tripInfo(t);i.curv=curvature(i.pts);return{best:i,cands:[i]}}
 log('Fetching base routes…');const trips=await route([A,B],mode,2);
 const vs=vias(A,B);log('Trying '+vs.length+' via-point variations…');
 const res=await Promise.allSettled(vs.map(v=>route([A,v,B],mode,0)));res.forEach(r=>r.status==='fulfilled'&&trips.push(r.value[0]));
 const cands=trips.map(tripInfo);cands.forEach((c,i)=>{c.trip=trips[i];c.curv=curvature(c.pts)});
 const baseMin=Math.min(...cands.map(c=>c.min));log('Scoring '+cands.length+' candidates (road class + surface)…');
 for(const c of cands){for(let k=0;k<3&&!c.attrs;k++){try{c.attrs=await attrs(c.trip)}catch(e){await new Promise(r=>setTimeout(r,800*(k+1)))}}c.attrs=c.attrs||{tot:0,unpavedFrac:0,motorway:0,primary:0,sec:0,minor:0,err:1}}
 if(mode==='scenic'){try{const sc=await scenery(bboxOf(cands),log);cands.forEach(c=>c.nature=sceneryStats(c.pts,sc));cands.sceneSrc=sc.src||'cache'}catch(e){log('Scenery unavailable: '+e.message);cands.sceneErr=e.message}}
 cands.forEach(c=>c.score=score(c,c.attrs,mode,baseMin));cands.sort((a,b)=>b.score.total-a.score.total);return{best:cands[0],cands,sceneErr:cands.sceneErr}}
G.Cycle={scenery,sceneryStats,bboxOf,decode,curvature,route,attrs,plan,tripInfo,VAL};if(typeof module!=='undefined')module.exports=G.Cycle;
})(typeof window!=='undefined'?window:globalThis);

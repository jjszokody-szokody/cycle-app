const map=L.map('map',{zoomControl:false}).setView([34.0029,-84.1446],10);L.control.zoom({position:'topright'}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors · Routing: Valhalla (FOSSGIS)'}).addTo(map);
const $=id=>document.getElementById(id);let mode='fast',pts={from:null,to:null},layers=L.layerGroup().addTo(map),markers={};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('cycleopts').hidden=b.dataset.tab!=='cycle';mode=b.dataset.tab});
const tmr={},seq={};function closeSugg(){['from','to'].forEach(k=>{clearTimeout(tmr[k]);seq[k]=(seq[k]||0)+1;$(k+'-s').innerHTML=''})}
function setupSearch(k){const inp=$(k),box=$(k+'-s');inp.onblur=()=>setTimeout(()=>{box.innerHTML=''},200);inp.onkeydown=e=>{if(e.key==='Escape')box.innerHTML='';if(e.key==='Enter'){closeSugg();$('go').click()}};
 inp.oninput=()=>{pts[k]=null;clearTimeout(tmr[k]);const my=seq[k]=(seq[k]||0)+1;tmr[k]=setTimeout(async()=>{if(inp.value.length<3)return box.innerHTML='';
 const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&q='+encodeURIComponent(inp.value));const j=await r.json();if(my!==seq[k]||document.activeElement!==inp)return;box.innerHTML='';
 j.forEach(p=>{const d=document.createElement('div');d.textContent=p.display_name;d.onclick=()=>{inp.value=p.display_name;box.innerHTML='';setPt(k,[+p.lat,+p.lon])};box.appendChild(d)})},450)}}
function setPt(k,ll){pts[k]=ll;markers[k]&&map.removeLayer(markers[k]);markers[k]=L.marker(ll,{title:k}).addTo(map);map.setView(ll,11)}
window.getHere=(ms=12000)=>new Promise((ok,no)=>{const s=new URLSearchParams(location.search).get('simfrom');if(s)return ok(s.split(',').map(Number));if(!navigator.geolocation)return no(Error('No GPS'));navigator.geolocation.getCurrentPosition(p=>ok([p.coords.latitude,p.coords.longitude]),e=>no(Error('Location: '+e.message)),{enableHighAccuracy:true,timeout:ms,maximumAge:30000})});
async function geocode(k){if(pts[k])return pts[k];if(k==='from'&&/^\s*(my location)?\s*$/i.test($(k).value)){st('Getting your location…');const h=await getHere();$(k).value='My location';setPt(k,h);return h}const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent($(k).value));const j=await r.json();if(!j[0])throw Error('Not found: '+$(k).value);setPt(k,[+j[0].lat,+j[0].lon]);return pts[k]}
setupSearch('from');setupSearch('to');
$('gps').onclick=()=>navigator.geolocation.getCurrentPosition(p=>{$('from').value='My location';setPt('from',[p.coords.latitude,p.coords.longitude])},e=>alert(e.message));
const st=s=>$('status').textContent=s;
function show(c,all,fit=true){window.curRoute={c,mode:window.lastMode||'fast',dest:pts.to};$('navbtn').hidden=false;layers.clearLayers();(all||[]).forEach(o=>o!==c&&L.polyline(o.pts,{color:'#999',weight:4,opacity:.5}).on('click',()=>show(o,all)).addTo(layers));
 const line=L.polyline(c.pts,{color:mode==='fast'?'#1a73e8':'#e8711a',weight:6}).addTo(layers);if(fit)map.fitBounds(line.getBounds(),{padding:[30,30]});
 let h=`<b>${c.miles.toFixed(1)} mi · ${Math.round(c.min)} min</b> · curviness ${c.curv.degPerKm.toFixed(0)}°/km`;
 if(c.score){const a=c.attrs||{sec:0,motorway:0,unpavedFrac:0,pending:1};h+=`<br>Score: <b>${c.score.total}</b> (scenic ${c.score.scenic}, curvy ${c.score.curvy}) · `+(a.pending?'road details pending…':`secondary/tertiary ${(a.sec*100|0)}% · motorway ${(a.motorway*100|0)}% · unpaved ${(a.unpavedFrac*100).toFixed(1)}%`)+(c.nature?` · 💧 near water ${Math.round(c.nature.water*100)}% · 🌲 park/forest ${Math.round(c.nature.park*100)}%`:'');
  h+=all.map((o,i)=>`<div class="cand ${o===c?'best':''}" data-i="${i}">#${i+1}: ${o.miles.toFixed(1)} mi, ${Math.round(o.min)} min, ${o.curv.degPerKm.toFixed(0)}°/km, score ${o.score.total}${o.nature?` · 💧${Math.round(o.nature.water*100)}% · 🌲${Math.round(o.nature.park*100)}%`:''}</div>`).join('')}
 $('summary').innerHTML=h;$('summary').querySelectorAll('.cand').forEach(d=>d.onclick=()=>show(all[d.dataset.i],all));
 $('steps').innerHTML=c.man.map(m=>`<li>${m.instruction}${m.length?` <small>${m.length.toFixed(1)} mi</small>`:''}</li>`).join('')}
$('go').onclick=async()=>{closeSugg();try{st('Geocoding…');const A=await geocode('from'),B=await geocode('to');const m=mode==='fast'?'fast':document.querySelector('[name=style]:checked').value;window.lastMode=m;
 const tok=window.planTok=(window.planTok||0)+1;let shown=0;const label=r=>`Best ${m==='curvy'?'curvy':'scenic'} route of ${r.cands.length} candidates (paved only)`;
 const r=await Cycle.plan(A,B,m,st,u=>{if(tok!==window.planTok||m==='fast')return;show(u.best,u.cands,!shown++);st(label(u)+' — refining…')});
 if(tok!==window.planTok)return;show(r.best,m==='fast'?null:r.cands,!shown++);
 if(m==='fast')st('Fastest route');else if(r.scenery){st(label(r)+' — loading scenery (water/parks)…');r.scenery.then(f=>{if(tok!==window.planTok||document.body.classList.contains('navigating'))return;show(f.best,f.cands,false);st(label(f)+(f.sceneErr?' — scenery unavailable: '+f.sceneErr:' incl. water/park scenery')+'. Tap a grey line or list item to compare.')})}
 else st(label(r)+'. Tap a grey line or list item to compare.')}catch(e){st('Error: '+e.message)}};

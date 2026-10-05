let data=[];let timer=null;const $=x=>document.getElementById(x);
function n(v){return v==null||isNaN(v)?'—':Number(v).toLocaleString('en-IN',{maximumFractionDigits:2})}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function cls(s){return s==='BUY'?'buy':s==='SELL'?'sell':s.startsWith('FAKE')?'fake':''}
function istNow(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}))}
function inWindow(){const d=istNow(),m=d.getHours()*60+d.getMinutes();return m>=555&&m<600}
function signalTime(ts){return new Date(ts).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}
function sessionToken(){try{return sessionStorage.getItem('upstox_session')||localStorage.getItem('upstox_session')||''}catch(e){return ''}}
function authHeaders(){const t=sessionToken();return t?{Authorization:'Bearer '+t}:{}}
function clearSession(){try{sessionStorage.removeItem('upstox_session');localStorage.removeItem('upstox_session')}catch(e){}}
function captureFragmentSession(){
  const h=location.hash||'';
  const prefix='#upstox_session=';
  if(!h.startsWith(prefix))return false;
  const token=decodeURIComponent(h.slice(prefix.length));
  if(!token)return false;
  try{sessionStorage.setItem('upstox_session',token);localStorage.setItem('upstox_session',token)}catch(e){}
  history.replaceState({},document.title,location.pathname+location.search);
  return true;
}
function setConnected(v){$('status').textContent=v?'UPSTOX CONNECTED':'UPSTOX NOT CONNECTED';$('status').style.color=v?'var(--green)':''}
function render(d){
  data=d.results||[];
  $('scanned').textContent=d.scanned||0;
  $('buy').textContent=data.filter(x=>x.direction==='BUY').length;
  $('sell').textContent=data.filter(x=>x.direction==='SELL').length;
  $('top').textContent=data[0]?.score??'—';
  $('updated').textContent=d.active===false?'SCANNER OFF • ACTIVE 09:15–10:00 IST':'Updated '+new Date(d.updatedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'});
  const m=+$('min').value||0;
  $('rows').innerHTML=data.filter(x=>x.score==null||x.score>=m).map(x=>'<tr><td><b>'+esc(x.symbol)+'</b></td><td><span class="sig '+cls(x.direction)+'">'+esc(x.direction)+'</span></td><td>'+n(x.score)+'</td><td>'+esc(x.setup)+' / '+esc(x.levelName)+'</td><td>'+n(x.ltp)+'</td><td>'+n(x.pdh)+'</td><td>'+n(x.pdl)+'</td><td>'+n(x.volMultiple)+'×</td><td>'+n(x.ema20)+'</td><td>'+n(x.yearHigh)+' / '+n(x.yearLow)+'</td><td>'+n(x.monthHigh)+' / '+n(x.monthLow)+'</td><td>'+n(x.entry)+'</td><td>'+n(x.sl)+'</td><td>'+n(x.target1)+'</td><td>'+n(x.target2)+'</td><td>'+signalTime(x.signalTimestamp)+(x.newsMatched?' • NEWS':'')+'</td></tr>').join('')||'<tr><td colspan="16">No 09:15–10:00 setups.</td></tr>';
}
async function scan(){
  if(!inWindow()){render({results:[],scanned:0,active:false,updatedAt:new Date().toISOString()});return}
  try{
    const r=await fetch('/api/scan?ts='+Date.now(),{cache:'no-store',headers:authHeaders()});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||'Scan failed');
    if(d.authenticated===false){clearSession();setConnected(false);throw Error('Upstox session expired')}
    setConnected(true);render(d);
  }catch(e){console.error(e);setConnected(false);$('status').textContent='UPSTOX CONNECTION ERROR'}
}
function startLive(){
  clearInterval(timer);
  if(!inWindow()){render({results:[],scanned:0,active:false,updatedAt:new Date().toISOString()});return}
  scan();
  timer=setInterval(()=>{if(inWindow())scan();else{clearInterval(timer);render({results:[],scanned:0,active:false,updatedAt:new Date().toISOString()})}},180000)
}
async function checkConnection(){
  try{
    const captured=captureFragmentSession();
    const r=await fetch('/api/upstox/status?ts='+Date.now(),{cache:'no-store',headers:authHeaders()});
    const d=await r.json();
    if(!d.connected&&!sessionToken())clearSession();
    setConnected(!!d.connected);
    if(d.connected&&(captured||location.search.includes('connected=1'))){
      history.replaceState({},document.title,location.pathname);
      startLive();
    }
  }catch(e){setConnected(false)}
}
$('min').oninput=()=>render({results:data,scanned:data.length,updatedAt:new Date().toISOString(),active:true});
checkConnection();
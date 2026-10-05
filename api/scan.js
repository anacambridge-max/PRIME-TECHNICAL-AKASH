const { json, token } = require("./_lib");
const { gunzipSync } = require("node:zlib");

const U = "https://api.upstox.com";
const INSTRUMENTS = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
const BUZZ = "https://www.moneycontrol.com/news/tags/buzzing-stocks.html";
const MAX_DETAIL = 70;
const CONCURRENCY = 16;
const START_MIN = 555;
const END_MIN = 600;

async function get(url, tokenValue, timeout=9000) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: "application/json", Authorization: tokenValue ? "Bearer " + tokenValue : undefined }
    });
    const t = await r.text();
    let d = {};
    try { d = t ? JSON.parse(t) : {}; } catch { d = { raw:t }; }
    if (!r.ok) throw Error(d?.errors?.[0]?.message || d?.message || "HTTP " + r.status);
    return d;
  } finally { clearTimeout(tm); }
}

async function getInstrumentMaster() {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(INSTRUMENTS, {
      signal: ac.signal,
      headers: { Accept: "application/gzip, application/json" }
    });
    if (!r.ok) throw Error("Instrument master HTTP " + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    let raw;
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      raw = gunzipSync(buf).toString("utf8");
    } else {
      raw = buf.toString("utf8");
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.data) ? parsed.data : []);
  } finally { clearTimeout(tm); }
}

async function text(url, timeout=7000) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent":"Mozilla/5.0" } });
    if (!r.ok) throw Error("HTTP " + r.status);
    return r.text();
  } finally { clearTimeout(tm); }
}

function todayIST() {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function dateMinus(s,n) {
  const d = new Date(s+"T00:00:00+05:30"); d.setUTCDate(d.getUTCDate()-n);
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function rows(d) {
  return (d?.data?.candles || []).map(x=>({ts:new Date(x[0]).getTime(),o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]||0}))
    .filter(x=>Number.isFinite(x.c)).sort((a,b)=>a.ts-b.ts);
}
function sma(a,n){ if(a.length<n)return NaN; let s=0; for(let i=a.length-n;i<a.length;i++)s+=a[i]; return s/n; }
function ema(a,n){ if(!a.length)return NaN; const k=2/(n+1); let e=a[0]; for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k); return e; }
function atr(c,n=14){ if(c.length<n+1)return NaN; const x=[]; for(let i=1;i<c.length;i++)x.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c))); return sma(x,n); }
function ds(ts){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ts));}
function clean(s){return String(s||"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function istMinutes(ts=Date.now()){
  const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ts));
  return +(p.find(x=>x.type==="hour")?.value||0)*60 + +(p.find(x=>x.type==="minute")?.value||0);
}
function morningWindow(){const m=istMinutes();return m>=START_MIN&&m<END_MIN;}
function signalInWindow(ts){const m=istMinutes(ts);return m>=START_MIN&&m<END_MIN;}
function moneycontrolNews(html,item){
  const sym=clean(item.symbol), name=clean(item.name);
  const re=/<a[^>]+href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const title=String(m[2]||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\\s+/g," ").trim();
    if(title.length<15||title.length>250)continue;
    const hay=clean(title);
    if((sym&&hay.includes(sym))||(name&&hay.includes(name))){
      return {title,url:m[1].startsWith("http")?m[1]:"https://www.moneycontrol.com"+m[1]};
    }
  }
  return null;
}

async function universe(){
  const a=await getInstrumentMaster();
  const now=Date.now(), m=new Map();
  for(const x of a){
    if(x.segment!=="NSE_FO"||x.instrument_type!=="FUT"||x.underlying_type!=="EQUITY"||!x.underlying_key)continue;
    const ex=+x.expiry||0; if(!ex||ex<now)continue;
    const old=m.get(x.underlying_symbol);
    if(!old||+old.expiry>ex)m.set(x.underlying_symbol,x);
  }
  return [...m.values()].map(x=>({symbol:x.underlying_symbol,name:x.name||x.underlying_symbol,key:x.underlying_key})).filter(x=>x.symbol&&x.key);
}

async function quotes(items,t){
  const out={};
  for(let i=0;i<items.length;i+=450){
    const keys=items.slice(i,i+450).map(x=>x.key).join(",");
    const d=await get(U+"/v3/market-quote/quotes?instrument_key="+encodeURIComponent(keys),t);
    for(const [k,q] of Object.entries(d.data||{})){
      out[q.symbol||k.split(":").pop()]={ltp:+q.last_price||+q.ohlc?.close||0,prev:+q.prev_close_price||0,vol:+q.ohlc?.volume||0,yh:+q.year_high||0,yl:+q.year_low||0};
    }
  }
  return out;
}

async function pool(a,n,fn){
  const out=new Array(a.length); let p=0;
  async function w(){while(true){const i=p++;if(i>=a.length)return;try{out[i]=await fn(a[i])}catch(e){out[i]={error:e.message}}}}
  await Promise.all(Array.from({length:Math.min(n,a.length)},w)); return out;
}

function score(item,q,c,d,m,buzz,today,news){
  if(!c||c.length<20||!d.length)return null;
  const conf=c.filter(x=>x.ts+180000<=Date.now()); if(conf.length<20)return null;
  const x=conf[conf.length-1], p=conf[conf.length-2];
  if(!signalInWindow(x.ts))return null;
  const vs=conf.map(z=>z.v), rs=conf.map(z=>z.h-z.l), cs=conf.map(z=>z.c);
  const av=sma(vs,20), vm=av?x.v/av:0, ar=sma(rs,10), rm=ar?(x.h-x.l)/ar:0, e=ema(cs,20), a=atr(conf);
  const strongBull=x.c>x.o && x.h>x.l && Math.abs(x.c-x.o)/(x.h-x.l)>=.5 && (x.c-x.l)/(x.h-x.l)>=.6;
  const strongBear=x.c<x.o && x.h>x.l && Math.abs(x.c-x.o)/(x.h-x.l)>=.5 && (x.h-x.c)/(x.h-x.l)>=.6;
  const past=d.filter(z=>ds(z.ts)<today), last=past[past.length-1];
  const month=d.filter(z=>ds(z.ts).slice(0,7)===today.slice(0,7));
  const mh=month.length?Math.max(...month.map(z=>z.h)):NaN, ml=month.length?Math.min(...month.map(z=>z.l)):NaN;
  const ath=m.length?Math.max(...m.map(z=>z.h)):NaN, atl=m.length?Math.min(...m.map(z=>z.l)):NaN;
  const pdh=last?.h||NaN, pdl=last?.l||NaN, yh=q.yh||NaN, yl=q.yl||NaN;
  const buy=Number.isFinite(pdh)&&x.c>pdh&&p.c<=pdh&&vm>=2&&x.c>e;
  const sell=Number.isFinite(pdl)&&x.c<pdl&&p.c>=pdl&&vm>=2&&x.c<e;
  const fakeBuy=Number.isFinite(pdl)&&p.l<pdl&&p.c>pdl&&x.c>pdl&&strongBull&&vm>=2;
  const fakeSell=Number.isFinite(pdh)&&p.h>pdh&&p.c<pdh&&x.c<pdh&&strongBear&&vm>=2;
  let dir=(buy||fakeBuy)?"BUY":(sell||fakeSell)?"SELL":"WATCH";
  const near=v=>Number.isFinite(v)&&Math.abs(x.c-v)/v<=.005;
  if(dir==="WATCH"&&!([pdh,pdl,mh,ml,yh,yl,ath,atl].some(near)||buzz))return null;
  const level=buy?"YH":sell?"YL":fakeBuy?"YL":fakeSell?"YH":near(ath)?"ATH":near(atl)?"ATL":near(yh)?"52W HIGH":near(yl)?"52W LOW":near(mh)?"MONTH HIGH":near(ml)?"MONTH LOW":"WATCH";
  const volScore=vm>=6.5?20:vm>=4?18:vm>=2?15:vm>=1.5?10:vm>=1.2?5:0;
  const levScore=level==="ATH"||level==="ATL"?15:level==="52W HIGH"||level==="52W LOW"?12:level==="MONTH HIGH"||level==="MONTH LOW"?9:level==="YH"||level==="YL"?3:0;
  const body=(x.h-x.l)>0?Math.abs(x.c-x.o)/(x.h-x.l):0;
  const closePos=dir==="BUY"?((x.c-x.l)/(x.h-x.l||1)):((x.h-x.c)/(x.h-x.l||1));
  let sc=Math.min(100,volScore+levScore+Math.min(15,body*15)+closePos*10+Math.min(15,Math.abs(x.c-e)/e*1500)+(rm>=2?10:rm>=1.75?9:rm>=1.5?8:rm>=1.3?6:rm>=1.1?3:0)+(buzz?8:0)+(vm>=4?5:0));
  let sl=NaN,t1=NaN,t2=NaN;
  if(dir==="BUY"){sl=fakeBuy?pdl:x.l;if(sl<x.c&&a){const r=x.c-sl;t1=x.c+r*1.5;t2=x.c+r*3;}}
  if(dir==="SELL"){sl=fakeSell?pdh:x.h;if(sl>x.c&&a){const r=sl-x.c;t1=x.c-r*1.5;t2=x.c-r*3;}}
  return {symbol:item.symbol,signal:dir,direction:dir,score:Math.round(sc),grade:sc>=90?"A+":sc>=80?"A":sc>=70?"STRONG":sc>=60?"GOOD":"WATCH",setup:fakeBuy?"SETUP 2 — FAKE YL":fakeSell?"SETUP 2 — FAKE YH":buy?"SETUP 1 — PDH BREAK":sell?"SETUP 1 — PDL BREAK":buzz?"BUZZING + WATCH":"LEVEL WATCH",levelName:level,ltp:x.c,pdh,pdl,volMultiple:vm,extremeVolume:vm>=4,ema20:e,yearHigh:yh,yearLow:yl,monthHigh:mh,monthLow:ml,ath,atl,entry:(dir==="BUY"||dir==="SELL")?x.c:NaN,sl,t1,t2,target1:t1,target2:t2,buzz,newsMatched:!!news,newsHeadline:news?.title||"",newsUrl:news?.url||"",changePct:q.prev?((x.c/q.prev)-1)*100:0,candleTime:new Date(x.ts).toISOString(),signalTimestamp:new Date(x.ts).toISOString(),notes:[vm>=4?"EXTREME VOLUME":vm>=2?"2x+ VOLUME":"",news?"MONEYCONTROL NEWS":"",buy?"PDH/YH CROSS":sell?"PDL/YL CROSS":"",near(yh)?"NEAR 52W HIGH":"",near(yl)?"NEAR 52W LOW":""].filter(Boolean).join(" • ")};
}

module.exports=async(req,res)=>{
  const t=token(req); if(!t)return json(res,401,{error:"Not connected to Upstox. Click CONNECT UPSTOX."});
  const started=Date.now();
  try{
    const today=todayIST();
    if(!morningWindow()) return json(res,200,{ok:true,active:false,window:"09:15-10:00 IST",updatedAt:new Date().toISOString(),timeframe:"3m",scanned:0,buy:0,sell:0,results:[],message:"Scanner is active only from 09:15 to 10:00 IST."});
    const u=await universe(); if(!u.length)throw Error("No NSE F&O equity universe returned by Upstox.");
    const [qs,buzzHtml]=await Promise.all([quotes(u,t),text(BUZZ).catch(()=>"" )]);
    const buzzText=clean(buzzHtml), buzzSet=new Set(), newsMap=new Map();
    for(const x of u){
      const sym=clean(x.symbol);
      if(sym&&buzzText.includes(sym))buzzSet.add(x.symbol);
      const n=moneycontrolNews(buzzHtml,x);
      if(n)newsMap.set(x.symbol,n);
    }
    const ranked=u.map(item=>{const q=qs[item.symbol]||{};const ch=q.prev?Math.abs(q.ltp/q.prev-1):0;const prox=q.yh&&q.yl&&q.ltp?Math.min(Math.abs(q.ltp-q.yh)/q.yh,Math.abs(q.ltp-q.yl)/q.yl):1;return {item,q,rank:ch*100+(buzzSet.has(item.symbol)?12:0)+Math.max(0,10-prox*100)}}).sort((a,b)=>b.rank-a.rank).slice(0,MAX_DETAIL);
    const df=dateMinus(today,40), mf=dateMinus(today,3650);
    const raw=await pool(ranked,CONCURRENCY,async z=>{
      const hist3From=dateMinus(today,7);
      const [ic,h3,dc,mc]=await Promise.all([
        get(U+"/v3/historical-candle/intraday/"+encodeURIComponent(z.item.key)+"/minutes/3",t),
        get(U+"/v3/historical-candle/"+encodeURIComponent(z.item.key)+"/minutes/3/"+today+"/"+hist3From,t),
        get(U+"/v3/historical-candle/"+encodeURIComponent(z.item.key)+"/days/1/"+today+"/"+df,t),
        get(U+"/v3/historical-candle/"+encodeURIComponent(z.item.key)+"/months/1/"+today+"/"+mf,t)
      ]);
      const c3=[...rows(h3),...rows(ic)].sort((a,b)=>a.ts-b.ts).filter((x,i,a)=>i===0||x.ts!==a[i-1].ts);
      return score(z.item,z.q,c3,rows(dc),rows(mc),buzzSet.has(z.item.symbol),today,newsMap.get(z.item.symbol));
    });
    const results=raw.filter(Boolean).sort((a,b)=>(b.direction==="BUY"||b.direction==="SELL"?1:0)-(a.direction==="BUY"||a.direction==="SELL"?1:0)||b.score-a.score).slice(0,100);
    return json(res,200,{ok:true,updatedAt:new Date().toISOString(),active:true,window:"09:15-10:00 IST",timeframe:"3m",scanned:u.length,detailedScanned:ranked.length,candidatesWithData:raw.filter(Boolean).length,buzzCount:buzzSet.size,newsCount:newsMap.size,buy:results.filter(x=>x.direction==="BUY").length,sell:results.filter(x=>x.direction==="SELL").length,elapsedMs:Date.now()-started,results});
  }catch(e){return json(res,500,{error:e.message||"Scanner failed"});}
};
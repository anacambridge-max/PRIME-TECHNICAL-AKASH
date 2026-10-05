const crypto=require("crypto");
function key(){return crypto.createHash("sha256").update(process.env.APP_SECRET||"change-this-secret").digest()}
function seal(v){const iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",key(),iv);const e=Buffer.concat([c.update(v),c.final()]);return [iv,c.getAuthTag(),e].map(x=>x.toString("base64url")).join(".")}
function open(v){try{const [i,t,e]=v.split(".");const d=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(i,"base64url"));d.setAuthTag(Buffer.from(t,"base64url"));return Buffer.concat([d.update(Buffer.from(e,"base64url")),d.final()]).toString()}catch{return null}}
function oauthState(){const payload=Date.now().toString()+"."+crypto.randomBytes(18).toString("base64url");return seal(payload)}
function validOAuthState(v){const payload=open(v);if(!payload)return false;const ts=Number(payload.split(".")[0]);return Number.isFinite(ts)&&Date.now()-ts>=0&&Date.now()-ts<10*60*1000}
function json(res,s,b){res.statusCode=s;res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(b))}
function token(req){const c=(req.headers.cookie||"").split(";").find(x=>x.trim().startsWith("upstox_session="));return c?open(decodeURIComponent(c.trim().split("=").slice(1).join("="))):null}
async function up(path,t,opt={}){const r=await fetch("https://api.upstox.com"+path,{...opt,headers:{Authorization:"Bearer "+t,Accept:"application/json",...(opt.headers||{})}});const d=await r.json();if(!r.ok)throw Error(d?.errors?.[0]?.message||d?.message||"Upstox error");return d}
module.exports={seal,oauthState,validOAuthState,json,token,up};
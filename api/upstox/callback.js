const {json,seal,validOAuthState}=require("../_lib");

function successPage(res,session){
  const safe=JSON.stringify(session).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");
  res.statusCode=200;
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upstox Connected</title>
<style>body{margin:0;background:#071321;color:#e8f1fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh}.card{width:min(520px,calc(100% - 40px));background:#0d1c2e;border:1px solid #23405f;border-radius:18px;padding:32px;box-sizing:border-box;text-align:center;box-shadow:0 20px 60px #0005}.ok{font-size:48px;margin-bottom:12px}.title{font-size:24px;font-weight:700;margin-bottom:8px}.sub{color:#9fb3c8;line-height:1.5;margin-bottom:24px}button{border:0;border-radius:10px;padding:13px 22px;background:#1683ff;color:white;font-weight:700;font-size:15px;cursor:pointer}</style></head>
<body><div class="card"><div class="ok">✓</div><div class="title">UPSTOX CONNECTED</div><div class="sub">Authentication succeeded. Click Continue to establish the secure dashboard session.</div>
<form method="POST" action="/api/upstox/finalize"><input type="hidden" name="session" value="__SESSION__"><button type="submit">CONTINUE TO DASHBOARD</button></form></div></body></html>`.replace("__SESSION__",safe));
}

module.exports=async(req,res)=>{
  try{
    const u=new URL(req.url,"https://localhost");
    const code=u.searchParams.get("code");
    const returnedState=u.searchParams.get("state");
    if(!code)return json(res,400,{error:"Missing authorization code"});
    if(!returnedState||!validOAuthState(returnedState))return json(res,400,{error:"OAuth state validation failed or expired. Please click CONNECT UPSTOX again."});
    const body=new URLSearchParams({code,client_id:process.env.UPSTOX_API_KEY||"",client_secret:process.env.UPSTOX_API_SECRET||"",redirect_uri:process.env.UPSTOX_REDIRECT_URI||"",grant_type:"authorization_code"});
    const r=await fetch("https://api.upstox.com/v2/login/authorization/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body});
    const d=await r.json();
    if(!r.ok||!d.access_token)return json(res,400,{error:d?.errors?.[0]?.message||d?.message||"Token exchange failed"});
    const session=seal(d.access_token);
    res.setHeader("Set-Cookie","upstox_session="+encodeURIComponent(session)+"; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400");
    return successPage(res,session);
  }catch(e){return json(res,500,{error:e.message})}
};
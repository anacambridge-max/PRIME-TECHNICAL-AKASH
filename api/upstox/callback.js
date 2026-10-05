const {json,seal}=require("../_lib");
function cookie(req,name){
  const hit=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return hit?decodeURIComponent(hit.slice(name.length+1)):null;
}
module.exports=async(req,res)=>{
  try{
    const u=new URL(req.url,"https://localhost");
    const code=u.searchParams.get("code");
    const returnedState=u.searchParams.get("state");
    const savedState=cookie(req,"upstox_oauth_state");
    if(!code)return json(res,400,{error:"Missing authorization code"});
    if(!savedState||!returnedState||savedState!==returnedState)return json(res,400,{error:"OAuth state validation failed. Please click CONNECT UPSTOX again."});
    const body=new URLSearchParams({
      code,
      client_id:process.env.UPSTOX_API_KEY||"",
      client_secret:process.env.UPSTOX_API_SECRET||"",
      redirect_uri:process.env.UPSTOX_REDIRECT_URI||"",
      grant_type:"authorization_code"
    });
    const r=await fetch("https://api.upstox.com/v2/login/authorization/token",{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
      body
    });
    const d=await r.json();
    if(!r.ok||!d.access_token)return json(res,400,{error:d?.errors?.[0]?.message||d?.message||"Token exchange failed"});
    res.setHeader("Set-Cookie",[
      "upstox_session="+encodeURIComponent(seal(d.access_token))+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400",
      "upstox_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    ]);
    res.statusCode=302;
    res.setHeader("Location","/?connected=1");
    res.end();
  }catch(e){json(res,500,{error:e.message})}
};
const {json,seal,validOAuthState}=require("../_lib");

module.exports=async(req,res)=>{
  try{
    const u=new URL(req.url,"https://localhost");
    const code=u.searchParams.get("code");
    const returnedState=u.searchParams.get("state");
    if(!code)return json(res,400,{error:"Missing authorization code"});
    if(!returnedState||!validOAuthState(returnedState))return json(res,400,{error:"OAuth state validation failed or expired. Please click CONNECT UPSTOX again."});

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

    const session=seal(d.access_token);
    const encoded=encodeURIComponent(session);

    res.statusCode=302;
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Location","/?connected=1#upstox_session="+encoded);
    res.end();
  }catch(e){
    return json(res,500,{error:e.message});
  }
};
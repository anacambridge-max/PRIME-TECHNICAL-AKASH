const {json,oauthState}=require("../_lib");
module.exports=(req,res)=>{
  if(!process.env.UPSTOX_API_KEY||!process.env.UPSTOX_REDIRECT_URI)return json(res,500,{error:"Set UPSTOX_API_KEY and UPSTOX_REDIRECT_URI in Vercel Environment Variables"});
  const state=oauthState();
  const u=new URL("https://api.upstox.com/v2/login/authorization/dialog");
  u.searchParams.set("response_type","code");
  u.searchParams.set("client_id",process.env.UPSTOX_API_KEY);
  u.searchParams.set("redirect_uri",process.env.UPSTOX_REDIRECT_URI);
  u.searchParams.set("state",state);
  res.statusCode=302;
  res.setHeader("Location",u.toString());
  res.end();
};
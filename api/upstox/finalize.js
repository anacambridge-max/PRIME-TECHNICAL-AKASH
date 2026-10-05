const {json}=require("../_lib");
module.exports=async(req,res)=>{
  try{
    let body="";
    for await(const chunk of req) body+=chunk;
    const p=new URLSearchParams(body);
    const session=p.get("session")||"";
    if(!session)return json(res,400,{error:"Missing session"});
    res.setHeader("Set-Cookie","upstox_session="+encodeURIComponent(session)+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400");
    res.statusCode=303;
    res.setHeader("Location","/?connected=1");
    res.end();
  }catch(e){return json(res,400,{error:e.message})}
};
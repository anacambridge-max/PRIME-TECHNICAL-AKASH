const {json,token,up}=require("../_lib");
module.exports=async(req,res)=>{
  try{
    const t=token(req);
    if(!t)return json(res,200,{connected:false});
    await up("/v2/user/profile",t);
    return json(res,200,{connected:true});
  }catch(e){
    res.setHeader("Set-Cookie","upstox_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    return json(res,200,{connected:false,error:e.message});
  }
};
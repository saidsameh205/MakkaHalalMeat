const {json,requireAdmin,supabaseFetch}=require('./_util');
exports.handler=async event=>{
 const auth=requireAdmin(event);if(!auth.ok)return auth.response;
 if(event.httpMethod!=='PATCH')return json(405,{error:'Method Not Allowed'});
 try{
  const b=JSON.parse(event.body||'{}');const id=Number(b.id);
  if(!Number.isSafeInteger(id)||id<=0)return json(400,{error:'Invalid order id'});
  if(!['Ready for Pickup','Completed'].includes(b.status))return json(400,{error:'Unsupported order status'});
  const rows=await supabaseFetch(`orders?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:b.status})});
  return rows&&rows.length?json(200,rows[0]):json(404,{error:'Order not found'});
 }catch(e){console.error('admin-order-status',e);return json(400,{error:e.message||'Unable to update order'});}
};

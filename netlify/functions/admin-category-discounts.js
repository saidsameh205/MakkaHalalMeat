const {json,requireAdmin,supabaseFetch}=require('./_util');
exports.handler=async event=>{
 const auth=requireAdmin(event);if(!auth.ok)return auth.response;
 try{
  if(event.httpMethod==='GET')return json(200,await supabaseFetch('category_discounts?select=*&order=created_at.desc'));
  const b=JSON.parse(event.body||'{}');
  if(event.httpMethod==='POST'){
   const d={department:b.department||null,category:b.category||null,percent_off:Number(b.percent_off),label:b.label||null,image:b.image||"",expires_at:b.expires_at||null,active:b.active!==false};
   if(!Number.isFinite(d.percent_off)||d.percent_off<=0||d.percent_off>100)return json(400,{error:'Invalid percent'});
   const rows=await supabaseFetch('category_discounts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(d)});
   return json(201,rows[0]);
  }
  if(event.httpMethod==='DELETE'){
   if(!Number.isSafeInteger(Number(b.id))||Number(b.id)<=0)return json(400,{error:'Invalid id'});
   await supabaseFetch(`category_discounts?id=eq.${Number(b.id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
   return json(200,{ok:true});
  }
  return json(405,{error:'Method Not Allowed'});
 }catch(e){console.error('admin-category-discounts',e);return json(400,{error:e.message||'Request failed'});}
};

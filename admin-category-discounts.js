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
  if(event.httpMethod==='PATCH'){
   const id=Number(b.id);
   if(!Number.isSafeInteger(id)||id<=0)return json(400,{error:'Invalid id'});
   const d={};
   if(b.department!==undefined)d.department=b.department||null;
   if(b.category!==undefined)d.category=b.category||null;
   if(b.percent_off!==undefined){d.percent_off=Number(b.percent_off);if(!Number.isFinite(d.percent_off)||d.percent_off<=0||d.percent_off>100)return json(400,{error:'Invalid percent'});}
   if(b.label!==undefined)d.label=b.label||null;
   if(b.image!==undefined)d.image=b.image||"";
   if(b.expires_at!==undefined)d.expires_at=b.expires_at||null;
   if(b.active!==undefined)d.active=!!b.active;
   const rows=await supabaseFetch(`category_discounts?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(d)});
   if(!rows.length)return json(404,{error:'Discount not found'});
   return json(200,rows[0]);
  }
  if(event.httpMethod==='DELETE'){
   if(!Number.isSafeInteger(Number(b.id))||Number(b.id)<=0)return json(400,{error:'Invalid id'});
   await supabaseFetch(`category_discounts?id=eq.${Number(b.id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
   return json(200,{ok:true});
  }
  return json(405,{error:'Method Not Allowed'});
 }catch(e){console.error('admin-category-discounts',e);return json(400,{error:e.message||'Request failed'});}
};

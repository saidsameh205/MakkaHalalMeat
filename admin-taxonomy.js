const {json,requireAdmin,supabaseFetch}=require('./_util');
exports.handler=async(event)=>{
 const auth=requireAdmin(event);if(!auth.ok)return auth.response;
 try{
  if(event.httpMethod==='GET'){
   const rows=await supabaseFetch('store_taxonomy?select=id,kind,department,name,sort_order,tax_is_food&order=sort_order.asc,name.asc');
   return json(200,rows);
  }
  if(event.httpMethod==='POST'){
   const b=JSON.parse(event.body||'{}');
   if(!['add_department','add_category','rename','move','delete','sort','set_tax'].includes(b.action))return json(400,{error:'Invalid action'});
   if(b.action==='set_tax'){
     const id=Number(b.id);
     if(!Number.isSafeInteger(id)||id<=0||!(b.tax_is_food===null||typeof b.tax_is_food==='boolean'))return json(400,{error:'Invalid tax setting'});
     await supabaseFetch('rpc/set_category_tax_default',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({p_id:id,p_is_food:b.tax_is_food})});
     return json(200,{ok:true});
   }
   await supabaseFetch('rpc/manage_store_taxonomy',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({p_action:b.action,p_id:b.id||null,p_name:b.name||null,p_department:b.department||null,p_sort:Number.isFinite(Number(b.sort_order))?Number(b.sort_order):null})});
   return json(200,{ok:true});
  }
  return json(405,{error:'Method Not Allowed'});
 }catch(e){console.error('admin-taxonomy',e);return json(400,{error:e.message||'Could not update departments/categories'});}
};

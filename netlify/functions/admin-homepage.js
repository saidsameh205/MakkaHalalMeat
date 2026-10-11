const {json,requireAdmin,supabaseFetch}=require('./_util');
exports.handler=async(event)=>{
 const auth=requireAdmin(event);if(!auth.ok)return auth.response;
 try{
 if(event.httpMethod==='GET'){
 const [rows,depts,products]=await Promise.all([
 supabaseFetch('app_settings?key=eq.ui_config&select=value'),
 supabaseFetch('store_taxonomy?kind=eq.department&select=name&order=sort_order.asc').catch(()=>[]),
 supabaseFetch('products?select=department').catch(()=>[])
 ]);
 return json(200,{config:rows[0]?.value||{},departments:[...new Set([...depts.map(x=>x.name),...products.map(x=>x.department)].filter(Boolean))]});
 }
 if(event.httpMethod==='PATCH'){
 const b=JSON.parse(event.body||'{}');
 const keys=['department_order','hidden_departments','home_sections','featured_product_ids'];
 if(!Array.isArray(b.department_order)||!Array.isArray(b.hidden_departments)||!Array.isArray(b.featured_product_ids)||!b.home_sections||typeof b.home_sections!=='object')return json(400,{error:'Invalid settings'});
 if(b.department_order.length>100||b.hidden_departments.length>100||b.featured_product_ids.length>12)return json(400,{error:'Too many selections'});
 if(![...b.department_order,...b.hidden_departments,...b.featured_product_ids].every(x=>typeof x==='string'&&x.length<=100))return json(400,{error:'Invalid selection'});
 const rows=await supabaseFetch('app_settings?key=eq.ui_config&select=value');
 const value={...(rows[0]?.value||{}),...Object.fromEntries(keys.map(k=>[k,b[k]]))};
 await supabaseFetch('app_settings?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({key:'ui_config',value})});
 return json(200,{ok:true});
 }
 return json(405,{error:'Method Not Allowed'});
 }catch(e){console.error('admin-homepage',e);return json(400,{error:e.message||'Homepage update failed'});}
};

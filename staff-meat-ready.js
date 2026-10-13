const { json, requireStaff, supabaseFetch, appendEvent } = require('./_util');
const { meatOnlyOrders } = require('./_butcher');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405,{error:'Method Not Allowed'});
  const auth = await requireStaff(event);
  if (!auth.ok) return auth.response;
  if (auth.role !== 'butcher') return json(403,{error:'Only a butcher account may mark meat ready'});
  try {
    const id = Number(JSON.parse(event.body||'{}').id);
    if (!Number.isSafeInteger(id)||id<=0) return json(400,{error:'Invalid order ID'});
    for(let attempt=0;attempt<4;attempt++) {
      const rows=await supabaseFetch(`orders?id=eq.${id}&select=id,items,status,meat_ready_at,events,updated_at`);
      const order=rows&&rows[0];
      if(!order) return json(404,{error:'Order not found'});
      if(!['New','Preparing','Paid - Preparing','Ready for Pickup'].includes(order.status)) return json(409,{error:'Order is no longer active'});
      const meat=await meatOnlyOrders([order]);
      if(!meat.length) return json(403,{error:'This order has no classified meat items'});
      if(order.meat_ready_at) return json(200,{ok:true,already_ready:true});
      const when=new Date().toISOString();
      const patch={meat_ready_at:when,updated_at:when,events:appendEvent(order.events,auth.staffName,'Meat ready — grocery order remains open')};
      const updated=await supabaseFetch(`orders?id=eq.${id}&updated_at=eq.${encodeURIComponent(order.updated_at)}&meat_ready_at=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
      if(updated&&updated.length) return json(200,{ok:true,meat_ready_at:when});
    }
    return json(409,{error:'Order changed. Refresh and try again.'});
  }catch(e){console.error('butcher-ready',e);return json(500,{error:'Unable to mark meat ready'});}
};

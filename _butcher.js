const { supabaseFetch } = require('./_util');
const MEAT_DEPARTMENTS = new Set(['meat','fresh halal meat','poultry','camel','fish','seafood']);
async function meatIndexes(items) {
  const ids = [...new Set((items || []).map(it => Number(it.id)).filter(Number.isSafeInteger))];
  if (!ids.length) return new Set();
  const rows = await supabaseFetch(`products?id=in.(${ids.join(',')})&select=id,department,category`);
  const meatIds = new Set((rows || []).filter(p => MEAT_DEPARTMENTS.has(String(p.department || '').trim().toLowerCase())).map(p => Number(p.id)));
  return new Set((items || []).flatMap((it,i) => meatIds.has(Number(it.id)) ? [i] : []));
}
function redactButcherOrder(o, indexes) {
  const meat = (o.items || []).filter((it,i) => indexes.has(i));
  if (!meat.length) return null;
  // Do not expose customer identity, order totals, notes, non-meat items or request metadata.
  return {
    id:o.id, order_code:o.order_code, status:o.status, created_at:o.created_at,
    placed_at:o.placed_at, due_at:o.due_at, asap:o.asap, meat_ready_at:o.meat_ready_at || null,
    items:meat, events:[], customer_name:'Meat preparation', customer_phone:'',
    cancel_request:null, refund_request:null, staff_notes:'', notes:''
  };
}
module.exports = { meatIndexes, redactButcherOrder };

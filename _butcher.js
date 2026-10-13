const MEAT_DEPTS = new Set(['meat','poultry','camel','fish','seafood']);
async function meatOnlyOrders(orders) {
  const ids = [...new Set(orders.flatMap(o => (o.items || []).map(it => Number(it.id)).filter(Number.isFinite)))];
  const map = new Map();
  // Server-owned product classification; never trust order-snapshot department values.
  for (let i=0;i<ids.length;i+=100) {
    const products = await supabaseFetch(`products?id=in.(${ids.slice(i,i+100).join(',')})&select=id,department`);
    for(const product of products || []) map.set(Number(product.id), String(product.department || '').toLowerCase());
  }
  return orders.map(order => ({...order,items:(order.items || []).filter(it => MEAT_DEPTS.has(map.get(Number(it.id))))})).filter(o=>o.items.length);
}
module.exports = { meatOnlyOrders, MEAT_DEPTS };

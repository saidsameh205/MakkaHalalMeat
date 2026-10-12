const {supabaseFetch,round2}=require('./_util');
const cents=n=>Math.round(Number(n)*100);
async function getOffers(code){
 const [categories,promos]=await Promise.all([
  supabaseFetch('category_discounts?active=eq.true&select=department,category,percent_off,expires_at,label'),
  code?supabaseFetch(`discounts?active=eq.true&code=ilike.${encodeURIComponent(code)}&select=title,code,discount_type,discount_value,expires_at,min_order`):Promise.resolve([])
 ]);
 const now=Date.now();
 const live=categories.filter(d=>(!d.expires_at||Date.parse(d.expires_at)>now)&&Number(d.percent_off)>0&&Number(d.percent_off)<=100);
 const promo=promos.find(d=>d.code&&(!d.expires_at||Date.parse(d.expires_at)>now)&&Number(d.discount_value)>0)||null;
 return {live,promo};
}
function priceCart(lines,offers,code){
 const base=lines.map(l=>({ ...l, baseCents:cents(l.price*l.qty) }));
 const gross=base.reduce((s,l)=>s+l.baseCents,0);
 const promo=offers.promo;
 if(code&&!promo)throw new Error('That promo code is invalid or expired.');
 if(promo&&gross/100<Number(promo.min_order||0))throw new Error(`Promo code requires a $${Number(promo.min_order).toFixed(2)} minimum order.`);
 if(promo&&!['percent','amount'].includes(promo.discount_type))throw new Error('Promo code has no valid discount.');
 const promoTotal=promo?(promo.discount_type==='percent'?Math.round(gross*Math.min(100,Number(promo.discount_value))/100):Math.min(gross,cents(promo.discount_value))):0;
 let assigned=0;
 const priced=base.map((l,i)=>{
  const matching=offers.live.filter(d=>(!d.department||String(d.department).toLowerCase()===String(l.department||'').toLowerCase())&&(!d.category||String(d.category).toLowerCase()===String(l.category||'').toLowerCase()));
  const percent=Math.max(0,...matching.map(d=>Number(d.percent_off)));
  const departmentSaving=Math.round(l.baseCents*percent/100);
  const saleSaving=l.sale_price!=null&&Number(l.sale_price)<l.price?Math.max(0,l.baseCents-cents(Number(l.sale_price)*l.qty)):0;
  const reducedSaving=l.is_reduced&&l.reduced_price!=null&&Number(l.reduced_price)<l.price?Math.max(0,l.baseCents-cents(Number(l.reduced_price)*l.qty)):0;
  const automaticSaving=Math.max(departmentSaving,saleSaving,reducedSaving);
  const codeSaving=i===base.length-1?promoTotal-assigned:Math.round(promoTotal*l.baseCents/gross);
  assigned+=codeSaving;
  const saving=Math.min(l.baseCents,Math.max(automaticSaving,codeSaving));
  return {...l, savingCents:saving, netCents:l.baseCents-saving,source:codeSaving>automaticSaving?'code':automaticSaving===departmentSaving&&departmentSaving>0?'department':automaticSaving>0?'sale':'none'};
 });
 return {lines:priced,subtotal:round2(priced.reduce((s,l)=>s+l.netCents,0)/100),discount:round2(priced.reduce((s,l)=>s+l.savingCents,0)/100),gross:round2(gross/100),code:promo?promo.code:null};
}
module.exports={getOffers,priceCart};

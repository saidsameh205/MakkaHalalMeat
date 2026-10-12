const {json,supabaseFetch}=require('./_util');
const {getOffers,priceCart}=require('./_promotion-pricing');
exports.handler=async event=>{
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 try{
  const b=JSON.parse(event.body||'{}');const items=Array.isArray(b.items)?b.items.slice(0,100):[];
  if(!items.length)return json(400,{error:'Cart is empty'});
  const ids=items.map(i=>Number(i.id)).filter(Number.isSafeInteger);
  if(!ids.length)return json(400,{error:'Invalid cart'});
  const products=await supabaseFetch(`products?id=in.(${ids.join(',')})&select=id,price,active,department,category,sale_price,is_reduced,reduced_price,is_food`);
  const byId=new Map(products.map(p=>[p.id,p]));
  const lines=items.map(i=>{const p=byId.get(Number(i.id));const qty=Number(i.qty);if(!p||!p.active||!Number.isFinite(qty)||qty<=0||qty>50)throw new Error('Invalid cart item');return {...p,qty};});
  const code=String(b.code||'').trim().slice(0,50);
  const priced=priceCart(lines,await getOffers(code),code);
  return json(200,{subtotal:priced.subtotal,gross:priced.gross,discount:priced.discount,code:priced.code,items:priced.lines.map(l=>({id:l.id,discount:l.savingCents/100,net:l.netCents/100,source:l.source}))});
 }catch(e){console.error('preview-promotion',e);return json(400,{error:e.message||'Cannot calculate promotions'});}
};

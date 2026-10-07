cat /home/claude/build2/netlify/functions/ask-makka.js
Output

const { json, supabaseFetch } = require('./_util');

const MODEL = process.env.ASK_MAKKA_MODEL || 'gpt-4o-mini';
const MAX_PRODUCTS = 12;
const MAX_HISTORY = 6;

const STOP = new Set('a an and are can could do for from have how i in is it me my of on or our please show some tell the to want what with you your need make give find'.split(' '));
const SYNONYMS = {
  biryani: ['biryani','basmati','rice','seasoning','spice','chicken','lamb'],
  kabsa:   ['kabsa','basmati','rice','seasoning','spice','chicken','lamb'],
  mandi:   ['mandi','basmati','rice','seasoning','spice','chicken','lamb'],
  bbq:     ['barbecue','bbq','grill','beef','chicken','lamb'],
  candy:   ['candy','sweet','sweets','chocolate'],
  sweets:  ['sweet','sweets','candy','chocolate'],
  spices:  ['spice','spices','seasoning'],
  seasoning: ['seasoning','spice','spices'],
};

function termsFor(q) {
  const raw = String(q||'').toLowerCase().replace(/[^a-z0-9& ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w));
  const out = new Set(raw);
  raw.forEach(w => (SYNONYMS[w]||[]).forEach(x=>out.add(x)));
  return [...out].slice(0,10);
}

function cleanHistory(history) {
  return (Array.isArray(history)?history:[]).slice(-MAX_HISTORY).map(m=>({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m && m.content || '').slice(0,600)
  })).filter(m=>m.content);
}

function scoreProduct(p, terms) {
  const name=String(p.name||'').toLowerCase(), cat=String(p.category||'').toLowerCase(),
        dep=String(p.department||'').toLowerCase(), desc=String(p.description||'').toLowerCase();
  let s=0;
  for(const t of terms){ if(name.includes(t))s+=8; if(cat.includes(t))s+=5; if(dep.includes(t))s+=3; if(desc.includes(t))s+=2; }
  if(p.stock != null && Number(p.stock)<=0) s-=20;
  return s;
}

async function relevantProducts(question) {
  const rows = await supabaseFetch('products?active=eq.true&select=id,name,department,category,description,price,unit,image,stock&limit=600');
  const terms = termsFor(question);
  if(!terms.length) return [];
  return (rows||[]).map(p=>({p,s:scoreProduct(p,terms)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,MAX_PRODUCTS).map(x=>x.p);
}

function storeContext(products) {
  if(!products.length) return 'No matching catalog products were found for this question.';
  return products.map(p=>`#${p.id} | ${p.name} | ${p.category} | ${p.department} | ${p.price==null?'price unavailable':'$'+Number(p.price).toFixed(2)} ${p.unit||''} | ${p.stock==null?'stock not tracked':Number(p.stock)>0?'in stock':'out of stock'} | ${String(p.description||'').slice(0,180)}`).join('\n');
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return json(405,{error:'Method not allowed'});
  if(!process.env.OPENAI_API_KEY) return json(503,{error:'Ask Makka is not connected yet. Add OPENAI_API_KEY in Netlify environment variables.'});

  let body={};
  try{ body=JSON.parse(event.body||'{}'); }catch(e){ return json(400,{error:'Invalid request'}); }

  const question = String(body.message||'').trim().slice(0,800);
  if(!question) return json(400,{error:'Please enter a question.'});

  try{
    const products = await relevantProducts(question);
    const history  = cleanHistory(body.history);

    const systemPrompt = `You are Ask Makka, the friendly shopping assistant for Makka Halal Meat in Clarkston, Georgia. Answer the customer's question DIRECTLY in the first sentence. Be concise, warm, and helpful. You may help with recipes, quantities, meal planning, substitutions, and shopping advice. Store-specific product names, prices, availability, and stock MUST come only from the catalog context below — never invent a price or claim an item is in stock if it is not in the context. If the catalog has no match, say so clearly but still offer general cooking guidance. Orders are pickup only — never mention delivery. When relevant, naturally mention up to a few matching products. Do not output JSON.\n\nLIVE CATALOG MATCHES:\n${storeContext(products)}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: question }
    ];

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 260, temperature: 0.7 })
    });

    const data = await r.json();
    if(!r.ok) throw new Error((data && data.error && data.error.message) || `OpenAI request failed (${r.status})`);

    const answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "I'm sorry, I couldn't generate an answer just now.";
    return json(200, { answer, products: products.slice(0,6).map(({description,...p})=>p), model: MODEL });

  } catch(e) {
    console.error('ask-makka error:', e.message);
    return json(500, { error: 'Ask Makka had trouble answering. Please try again.' });
  }
};

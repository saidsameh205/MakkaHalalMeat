'use strict';
// Configure GOOGLE_TRANSLATE_API_KEY as a Netlify environment variable.
// Uses Google Cloud Translation Basic (v2). Never put the key in index.html.
const https = require('https');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode:405,body:'Method not allowed'};
  const key=process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return {statusCode:503,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:'Translation service not configured'})};
  let data;try{data=JSON.parse(event.body||'{}')}catch(e){return {statusCode:400,body:'Invalid JSON'}}
  const target=String(data.target||'');const texts=data.texts;
  if(!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(target)||!Array.isArray(texts)||texts.length>40||texts.length<1||texts.some(t=>typeof t!=='string'||t.length>220)||JSON.stringify(texts).length>9000)
    return {statusCode:400,body:'Invalid translation request'};
  try {
    const payload=JSON.stringify({q:texts,source:'en',target,format:'text'});
    const result=await new Promise((resolve,reject)=>{
      const req=https.request('https://translation.googleapis.com/language/translate/v2?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)},timeout:10000},res=>{
        let body='';res.on('data',chunk=>{body+=chunk;if(body.length>120000)res.destroy()});res.on('end',()=>{try{resolve({status:res.statusCode,json:JSON.parse(body)})}catch(e){reject(e)}});
      });req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('timeout')));req.end(payload);
    });
    if(result.status!==200||!Array.isArray(result.json?.data?.translations))return {statusCode:502,body:JSON.stringify({error:'Translation provider unavailable'})};
    // Provider returns HTML-escaped entities; browser will display them as plain text safely.
    const translations=result.json.data.translations.map(x=>String(x.translatedText||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"));
    return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({translations})};
  }catch(e){console.error('Translation provider failed:',e.message);return {statusCode:502,body:JSON.stringify({error:'Translation provider unavailable'})}}
};

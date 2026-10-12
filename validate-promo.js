const { json, supabaseFetch, round2 } = require('./_util');

// No token — any customer previewing their cart needs this. It only ever
// TELLS the browser what a code would save; create-checkout-session.js
// re-checks everything and is what actually charges the card, so a
// tampered call here can't get anyone a bigger discount than the code allows.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const rawCode = String(body.code || '').trim();
    const subtotal = Math.max(0, Number(body.subtotal) || 0);
    if (!rawCode) return json(400, { error: 'Enter a code' });

    const rows = await supabaseFetch(
      `discounts?active=eq.true&code=ilike.${encodeURIComponent(rawCode)}&select=title,code,discount_type,discount_value,expires_at,requirements`
    );
    const deal = rows && rows[0];
    if (!deal || !deal.code) return json(404, { error: "That code isn't valid." });
    if (deal.expires_at && new Date(deal.expires_at) < new Date()) return json(404, { error: 'That code has expired.' });
    if (!deal.discount_type || !(Number(deal.discount_value) > 0)) {
      return json(404, { error: "That code isn't valid." }); // an informational-only deal has nothing to apply
    }

    const raw = deal.discount_type === 'percent' ? subtotal * (Number(deal.discount_value) / 100) : Number(deal.discount_value);
    const amount = Math.max(0, Math.min(round2(raw), subtotal));

    return json(200, {
      ok: true,
      code: deal.code,
      title: deal.title,
      requirements: deal.requirements || '',
      discount_type: deal.discount_type,
      discount_value: Number(deal.discount_value),
      amount, // what it would save on THIS cart right now — recomputed at checkout too
    });
  } catch (e) {
    console.error('validate-promo', e);
    return json(500, { error: 'Unable to check that code right now' });
  }
};

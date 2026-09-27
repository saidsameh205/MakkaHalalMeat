const { json, requireAdmin, supabaseFetch } = require('./_util');

// GET    -> list every discount (including inactive/expired, unlike the public site)
// POST   -> create a discount
// PATCH  -> update a discount (body must include id)
// DELETE -> body must include id; sets active=false rather than deleting.
exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    if (event.httpMethod === 'GET') {
      const rows = await supabaseFetch('discounts?select=*&order=created_at.desc');
      return json(200, rows);
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const discount = sanitizeDiscount(b);
      if (!discount.title) throw new Error('title is required');
      const rows = await supabaseFetch('discounts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(discount),
      });
      return json(201, rows[0]);
    }

    if (event.httpMethod === 'PATCH') {
      const b = JSON.parse(event.body || '{}');
      if (!b.id) throw new Error('id is required');
      const discount = sanitizeDiscount(b);
      discount.updated_at = new Date().toISOString();
      const rows = await supabaseFetch(`discounts?id=eq.${encodeURIComponent(b.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(discount),
      });
      return json(200, rows[0]);
    }

    if (event.httpMethod === 'DELETE') {
      const b = JSON.parse(event.body || '{}');
      if (!b.id) throw new Error('id is required');
      await supabaseFetch(`discounts?id=eq.${encodeURIComponent(b.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
      });
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (e) {
    console.error('admin-discounts', e);
    return json(400, { error: e.message || 'Unable to complete this action' });
  }
};

function sanitizeDiscount(b) {
  const out = {};
  if (b.id !== undefined) out.id = Number(b.id);
  if (b.title !== undefined) out.title = String(b.title).slice(0, 200);
  if (b.description !== undefined) out.description = String(b.description).slice(0, 500);
  if (b.requirements !== undefined) out.requirements = String(b.requirements).slice(0, 300);
  if (b.code !== undefined) out.code = String(b.code).slice(0, 50);
  if (b.expires_at !== undefined) out.expires_at = b.expires_at ? new Date(b.expires_at).toISOString() : null;
  if (b.active !== undefined) out.active = !!b.active;
  return out;
}

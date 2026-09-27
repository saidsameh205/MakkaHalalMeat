const { json, requireAdmin, supabaseFetch } = require('./_util');

// GET    -> list every product (including inactive ones, unlike the public site)
// POST   -> create a product
// PATCH  -> update a product (body must include id)
// DELETE -> body must include id; sets active=false rather than deleting,
//           so historical orders still show what was actually purchased.
exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    if (event.httpMethod === 'GET') {
      const rows = await supabaseFetch('products?select=*&order=department.asc,category.asc,name.asc');
      return json(200, rows);
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const product = sanitizeProduct(b);
      if (!product.name || !product.department) throw new Error('name and department are required');
      const rows = await supabaseFetch('products', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(product),
      });
      return json(201, rows[0]);
    }

    if (event.httpMethod === 'PATCH') {
      const b = JSON.parse(event.body || '{}');
      if (!b.id) throw new Error('id is required');
      const product = sanitizeProduct(b);
      product.updated_at = new Date().toISOString();
      const rows = await supabaseFetch(`products?id=eq.${encodeURIComponent(b.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(product),
      });
      return json(200, rows[0]);
    }

    if (event.httpMethod === 'DELETE') {
      const b = JSON.parse(event.body || '{}');
      if (!b.id) throw new Error('id is required');
      await supabaseFetch(`products?id=eq.${encodeURIComponent(b.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
      });
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (e) {
    console.error('admin-products', e);
    return json(400, { error: e.message || 'Unable to complete this action' });
  }
};

// Only pass through fields we actually expect, so a stray or malicious
// field in the request body can never reach the database.
function sanitizeProduct(b) {
  const out = {};
  if (b.id !== undefined) out.id = Number(b.id);
  if (b.name !== undefined) out.name = String(b.name).slice(0, 200);
  if (b.department !== undefined) out.department = String(b.department).slice(0, 50);
  if (b.category !== undefined) out.category = String(b.category).slice(0, 100);
  if (b.subcategory !== undefined) out.subcategory = String(b.subcategory).slice(0, 100);
  if (b.price !== undefined) out.price = b.price === null || b.price === '' ? null : Number(b.price);
  if (b.unit !== undefined) out.unit = String(b.unit).slice(0, 20);
  if (b.image !== undefined) out.image = String(b.image).slice(0, 500);
  if (b.emoji !== undefined) out.emoji = String(b.emoji).slice(0, 10);
  if (b.brand !== undefined) out.brand = String(b.brand).slice(0, 100);
  if (b.active !== undefined) out.active = !!b.active;
  if (b.sort_order !== undefined) out.sort_order = Number(b.sort_order) || 0;
  if (b.stock !== undefined) out.stock = b.stock === null || b.stock === '' ? null : Number(b.stock);
  return out;
}

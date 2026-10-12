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
  // id is used only for the URL filter, not inserted into the update payload.
  if (b.name !== undefined) out.name = String(b.name).slice(0, 200);
  if (b.department !== undefined) out.department = String(b.department).slice(0, 50);
  if (b.category !== undefined) out.category = String(b.category).slice(0, 100);
  if (b.subcategory !== undefined) out.subcategory = String(b.subcategory).slice(0, 100);
  if (b.description !== undefined) out.description = String(b.description).slice(0, 1000);
  if (b.is_food !== undefined) out.is_food = !!b.is_food;
  if (b.price !== undefined) out.price = b.price === null || b.price === '' ? null : Number(b.price);
  if (b.unit !== undefined) out.unit = String(b.unit).slice(0, 20);
  if (b.images !== undefined) {
    if (!Array.isArray(b.images) || b.images.length>6 || b.images.some(url=>typeof url!=='string'||url.length>500||!/^https:\/\//.test(url))) throw new Error('Invalid additional photos');
    out.images=b.images;
  }
  if (b.image !== undefined) out.image = String(b.image).slice(0, 500);
  if (b.emoji !== undefined) out.emoji = String(b.emoji).slice(0, 10);
  if (b.brand !== undefined) out.brand = String(b.brand).slice(0, 100);
  if (b.active !== undefined) out.active = !!b.active;
  if (b.featured !== undefined) out.featured = !!b.featured;
  if (b.sort_order !== undefined) out.sort_order = Number(b.sort_order) || 0;
  if (b.stock !== undefined) out.stock = b.stock === null || b.stock === '' ? null : Number(b.stock);
  if (b.by_weight !== undefined) out.by_weight = !!b.by_weight;
  if (b.sale_price !== undefined) out.sale_price = b.sale_price === null || b.sale_price === '' ? null : Number(b.sale_price);
  if (b.sale_ends_at !== undefined) out.sale_ends_at = b.sale_ends_at || null;
  if (b.is_reduced !== undefined) out.is_reduced = !!b.is_reduced;
  if (b.reduced_price !== undefined) out.reduced_price = b.reduced_price === null || b.reduced_price === '' ? null : Number(b.reduced_price);
  return out;
}

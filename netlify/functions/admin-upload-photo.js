const { json, requireAdmin, supabaseStorageUpload } = require('./_util');

// POST { productId, filename, contentType, dataBase64 } -> { url }
// The browser reads the chosen photo as base64 and sends it here; this
// function uploads it to Supabase Storage (using the service-role key,
// never exposed to the browser) and hands back the public URL to save
// into that product's image field.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    const body = JSON.parse(event.body || '{}');
    const productId = Number(body.productId);
    const filename = String(body.filename || 'photo.jpg').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const contentType = String(body.contentType || 'image/jpeg');
    const dataBase64 = String(body.dataBase64 || '');
    if (!productId) throw new Error('productId is required');
    if (!dataBase64) throw new Error('No image data received');

    const buffer = Buffer.from(dataBase64, 'base64');
    // Netlify functions cap request bodies well under 6 MB, so keep this
    // conservative — resize/compress large photos on the client side first.
    if (buffer.length > 4 * 1024 * 1024) throw new Error('Image is too large (max 4 MB) — try a smaller photo');

    const path = `products/${productId}-${Date.now()}-${filename}`;
    const url = await supabaseStorageUpload('product-photos', path, buffer, contentType);

    return json(200, { url });
  } catch (e) {
    console.error('admin-upload-photo', e);
    return json(400, { error: e.message || 'Unable to upload photo' });
  }
};

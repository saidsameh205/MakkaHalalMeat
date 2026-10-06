const { json, requireAdmin, supabaseStorageUpload } = require('./_util');

// POST { productId, filename, contentType, dataBase64 } -> { url }           (a product photo)
//  or  { dealId,    filename, contentType, dataBase64 } -> { url }           (a deal photo)
// The browser reads the chosen photo as base64 (straight from the phone's
// camera roll or camera) and sends it here; this function uploads it to
// Supabase Storage (using the service-role key, never exposed to the
// browser) and hands back the public URL to save into that row's image
// field. Both products and deals share the same public storage bucket,
// just under a different folder, so no extra bucket/policy setup is needed.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    const body = JSON.parse(event.body || '{}');
    const productId = body.productId !== undefined ? Number(body.productId) : null;
    const dealId = body.dealId !== undefined ? Number(body.dealId) : null;
    const settingKey = body.settingKey ? String(body.settingKey).replace(/[^a-z0-9_]/g, '') : null;
    if (!productId && !dealId && !settingKey) throw new Error('productId, dealId, or settingKey is required');

    const filename = String(body.filename || 'photo.jpg').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const contentType = String(body.contentType || 'image/jpeg');
    const dataBase64 = String(body.dataBase64 || '');
    if (!dataBase64) throw new Error('No media data received');
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) throw new Error('Only image and video files are allowed');

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 4 * 1024 * 1024) throw new Error('Media file is too large (max 4 MB)');

    const folder = settingKey ? 'settings' : dealId ? 'deals' : 'products';
    const id = settingKey || dealId || productId;
    const path = `${folder}/${id}-${Date.now()}-${filename}`;
    const url = await supabaseStorageUpload('product-photos', path, buffer, contentType);

    return json(200, { url });
  } catch (e) {
    console.error('admin-upload-photo', e);
    return json(400, { error: e.message || 'Unable to upload photo' });
  }
};

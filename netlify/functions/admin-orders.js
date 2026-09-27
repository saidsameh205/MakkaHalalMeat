const { json, requireAdmin, supabaseFetch } = require('./_util');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    const rows = await supabaseFetch('orders?select=*&order=created_at.desc&limit=200');
    return json(200, rows);
  } catch (e) {
    console.error('admin-orders', e);
    return json(500, { error: 'Unable to load orders' });
  }
};

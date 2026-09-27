const { json, requireAdmin, supabaseFetch } = require('./_util');

const ALLOWED = ['New', 'Preparing', 'Ready for Pickup', 'Completed', 'Cancelled', 'Paid - Preparing'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    const b = JSON.parse(event.body || '{}');
    const id = Number(b.id);
    const status = String(b.status || '');
    if (!id || !ALLOWED.includes(status)) throw new Error('Invalid order id or status');

    await supabaseFetch(`orders?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    });
    return json(200, { ok: true, status });
  } catch (e) {
    console.error('update-order-status', e);
    return json(400, { error: e.message || 'Unable to update status' });
  }
};

const { json, requireAdmin, supabaseFetch } = require('./_util');
const { restoreStock } = require('./create-checkout-session');

const ALLOWED_STATUSES = ['New', 'Preparing', 'Ready for Pickup', 'Completed', 'Cancelled', 'Paid - Preparing'];

// Accepts any combination of status, pickup_time and staff_notes for one
// order, so admin.html can save whichever fields the staff member changed.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    const b = JSON.parse(event.body || '{}');
    const id = Number(b.id);
    if (!id) throw new Error('Invalid order id');

    const patch = { updated_at: new Date().toISOString() };
    if (b.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(b.status)) throw new Error('Invalid status');
      patch.status = b.status;
    }
    if (b.pickup_time !== undefined) {
      patch.pickup_time = b.pickup_time ? new Date(b.pickup_time).toISOString() : null;
    }
    if (b.staff_notes !== undefined) {
      patch.staff_notes = String(b.staff_notes).slice(0, 1000);
    }
    if (Object.keys(patch).length === 1) throw new Error('Nothing to update');

    // If staff are cancelling an order this way (rather than via the
    // Cancel-authorization button), give back its reserved stock too —
    // but only once, so re-saving an already-cancelled order is harmless.
    if (patch.status === 'Cancelled') {
      const rows = await supabaseFetch(`orders?id=eq.${id}&select=items,status`);
      const order = rows && rows[0];
      if (order && order.status !== 'Cancelled') {
        for (const item of order.items || []) {
          if (item && item.id && item.qty) {
            try { await restoreStock(Number(item.id), Number(item.qty)); }
            catch (e2) { console.error('update-order-status stock restore failed', item, e2); }
          }
        }
      }
    }

    await supabaseFetch(`orders?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    return json(200, { ok: true, ...patch });
  } catch (e) {
    console.error('update-order-status', e);
    return json(400, { error: e.message || 'Unable to update order' });
  }
};

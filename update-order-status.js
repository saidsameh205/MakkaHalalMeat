const { json, requireAdmin, supabaseFetch, restoreOrderStock } = require('./_util');

const ALLOWED_STATUSES = [
  'Awaiting Payment', 'New', 'Preparing', 'Ready for Pickup', 'Completed', 'Cancelled', 'Abandoned',
  'Paid - Preparing', // legacy status from earlier versions
];

// Owner-only (admin.html). Accepts any combination of status, pickup_time
// and staff_notes for one order, so the admin page can save whichever
// fields were changed. (Workers use the separate staff-update-order
// function, which has narrower permissions.)
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

    // Cancelling (or abandoning) an order gives back its reserved stock —
    // but only once, so re-saving an already-released order is harmless.
    if (patch.status === 'Cancelled' || patch.status === 'Abandoned') {
      const rows = await supabaseFetch(`orders?id=eq.${id}&select=items,status`);
      const order = rows && rows[0];
      if (order && order.status !== 'Cancelled' && order.status !== 'Abandoned') {
        await restoreOrderStock(order.items);
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

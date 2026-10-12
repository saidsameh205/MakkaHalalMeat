const {
  json,
  supabaseFetch,
  CANCEL_WINDOW_MINUTES,
  CANCEL_GRACE_SECONDS,
  REFUND_WINDOW_DAYS,
  CANCELLABLE_STATUSES,
} = require('./_util');

// Public (no token) — a customer proves it's their order with the order
// code AND the phone number used at checkout. It only ever RECORDS a
// request; nothing is cancelled or refunded until the store admin approves
// it in GIF. Rules are checked here on the server clock:
//   cancel : only within a few minutes of the order being placed, once per order
//   refund : only after pickup, within a limited number of days, once per order
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const orderCode = String(b.order_code || '').trim();
    const phone = String(b.phone || '').trim();
    const type = String(b.type || '');
    const reason = String(b.reason || '').trim().slice(0, 300);
    if (!orderCode || !phone) return json(400, { error: 'order_code and phone are required' });
    if (type !== 'cancel' && type !== 'refund') return json(400, { error: 'Unknown request type' });

    const rows = await supabaseFetch(
      `orders?order_code=eq.${encodeURIComponent(orderCode)}&customer_phone=eq.${encodeURIComponent(phone)}` +
        '&select=id,status,payment_status,placed_at,created_at,updated_at,cancel_request_status,refund_request_status'
    );
    const order = rows && rows[0];
    if (!order) return json(404, { error: 'Order not found' });

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    let patch;

    if (type === 'cancel') {
      if (order.cancel_request_status) {
        return json(409, { error: 'A cancellation request was already sent for this order.' });
      }
      if (!CANCELLABLE_STATUSES.includes(order.status)) {
        return json(400, { error: "This order can't be cancelled online. Please call the store." });
      }
      const placed = new Date(order.placed_at || order.created_at).getTime();
      if (now - placed > (CANCEL_WINDOW_MINUTES * 60 + CANCEL_GRACE_SECONDS) * 1000) {
        return json(400, { error: `The ${CANCEL_WINDOW_MINUTES}-minute cancellation window has passed. Please call the store.` });
      }
      patch = {
        cancel_request_status: 'pending',
        cancel_requested_at: nowIso,
        cancel_request_reason: reason,
        updated_at: nowIso,
      };
    } else {
      if (order.refund_request_status) {
        return json(409, { error: 'A refund request was already sent for this order.' });
      }
      if (order.status !== 'Completed') {
        return json(400, { error: 'Refunds can be requested once the order has been picked up.' });
      }
      if (order.payment_status && order.payment_status !== 'captured') {
        return json(400, { error: "There's no payment to refund on this order." });
      }
      const done = new Date(order.updated_at || order.created_at).getTime();
      if (now - done > REFUND_WINDOW_DAYS * 86400000) {
        return json(400, { error: `Refund requests must be made within ${REFUND_WINDOW_DAYS} days of pickup. Please call the store.` });
      }
      if (reason.length < 5) return json(400, { error: 'Please tell us what went wrong.' });
      patch = {
        refund_request_status: 'pending',
        refund_requested_at: nowIso,
        refund_request_reason: reason,
        updated_at: nowIso,
      };
    }

    // Only succeeds if no request of this kind exists yet (guards against double-taps).
    const guard = type === 'cancel' ? 'cancel_request_status=is.null' : 'refund_request_status=is.null';
    const saved = await supabaseFetch(`orders?id=eq.${order.id}&${guard}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!saved || !saved.length) return json(409, { error: 'A request was already sent for this order.' });

    return json(200, { ok: true, type, status: 'pending' });
  } catch (e) {
    console.error('order-request', e);
    return json(500, { error: 'Unable to send your request' });
  }
};

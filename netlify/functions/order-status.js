const {
  json,
  supabaseFetch,
  cancelSecondsLeft,
  CANCEL_WINDOW_MINUTES,
  REFUND_WINDOW_DAYS,
  CANCELLABLE_STATUSES,
} = require('./_util');

// No token — any customer can call this — but it requires BOTH the exact
// order code AND the phone number used at checkout, so someone can't
// enumerate other customers' orders just by guessing order codes. Only
// customer-safe fields come back (never staff notes).
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  try {
    const params = event.queryStringParameters || {};
    const orderCode = String(params.order_code || '').trim();
    const phone = String(params.phone || '').trim();
    if (!orderCode || !phone) return json(400, { error: 'order_code and phone are required' });

    const rows = await supabaseFetch(
      `orders?order_code=eq.${encodeURIComponent(orderCode)}&customer_phone=eq.${encodeURIComponent(phone)}` +
        '&select=order_code,items,subtotal,tax,total,adjusted_total,status,payment_status,pickup_time,requested_pickup,' +
        'substitution_pref,notes,created_at,updated_at,placed_at,' +
        'cancel_request_status,cancel_decision_note,refund_request_status,refund_decision_note,refund_approved_amount,refunded_amount'
    );
    const order = rows && rows[0];
    if (!order) return json(404, { error: 'Order not found' });

    const now = Date.now();
    const secsLeft = cancelSecondsLeft(order, now);
    const daysSinceDone = (now - new Date(order.updated_at || order.created_at).getTime()) / 86400000;

    // Server-decided flags: the screen just follows these.
    const canRequestCancel = CANCELLABLE_STATUSES.includes(order.status) && !order.cancel_request_status && secsLeft > 0;
    const canRequestRefund =
      order.status === 'Completed' &&
      !order.refund_request_status &&
      (!order.payment_status || order.payment_status === 'captured') &&
      daysSinceDone <= REFUND_WINDOW_DAYS;

    const items = (order.items || []).map((it) => ({
      name: it.name || '',
      qty: it.qty,
      unit: it.unit || '',
      pick_status: it.pick_status || 'pending',
      picked_qty: it.picked_qty != null ? it.picked_qty : null,
      substitute: it.substitute ? { name: it.substitute.name, qty: it.substitute.qty, unit: it.substitute.unit || '' } : null,
    }));

    const { updated_at, placed_at, ...safe } = order; // internal timestamps stay on the server
    return json(200, {
      ...safe,
      items,
      can_request_cancel: canRequestCancel,
      cancel_seconds_left: canRequestCancel ? secsLeft : 0,
      cancel_window_minutes: CANCEL_WINDOW_MINUTES,
      can_request_refund: canRequestRefund,
      refund_window_days: REFUND_WINDOW_DAYS,
    });
  } catch (e) {
    console.error('order-status', e);
    return json(500, { error: 'Unable to look up order' });
  }
};

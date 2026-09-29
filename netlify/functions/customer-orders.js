const {
  json,
  requireCustomer,
  supabaseFetch,
  cancelSecondsLeft,
  CANCEL_WINDOW_MINUTES,
  REFUND_WINDOW_DAYS,
  CANCELLABLE_STATUSES,
} = require('./_util');

// GET (customer session only) — every order placed while signed in to this
// account, newest first. Orders placed as a guest (no account, or before
// this account existed) don't show here — those still work through the
// existing order-code + phone lookup on the Orders tab.
//
// Mirrors order-status.js's eligibility logic exactly (same cancel/refund
// flags), so an order found through account history is just as actionable
// — the customer can request a cancellation or refund from either place.
exports.handler = async (event) => {
  const auth = await requireCustomer(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  try {
    const rows = await supabaseFetch(
      `orders?customer_id=eq.${auth.customerId}&order=created_at.desc&limit=50&select=` +
        'order_code,customer_phone,items,subtotal,tax,total,adjusted_total,status,payment_status,pickup_time,requested_pickup,' +
        'substitution_pref,notes,created_at,updated_at,placed_at,' +
        'cancel_request_status,cancel_decision_note,refund_request_status,refund_decision_note,refund_approved_amount,refunded_amount'
    );

    const now = Date.now();
    const orders = (rows || []).map((o) => {
      const secsLeft = cancelSecondsLeft(o, now);
      const daysSinceDone = (now - new Date(o.updated_at || o.created_at).getTime()) / 86400000;
      const canRequestCancel = CANCELLABLE_STATUSES.includes(o.status) && !o.cancel_request_status && secsLeft > 0;
      const canRequestRefund =
        o.status === 'Completed' &&
        !o.refund_request_status &&
        (!o.payment_status || o.payment_status === 'captured') &&
        daysSinceDone <= REFUND_WINDOW_DAYS;

      const items = (o.items || []).map((it) => ({
        name: it.name || '',
        qty: it.qty,
        unit: it.unit || '',
        pick_status: it.pick_status || 'pending',
        picked_qty: it.picked_qty != null ? it.picked_qty : null,
        substitute: it.substitute ? { name: it.substitute.name, qty: it.substitute.qty, unit: it.substitute.unit || '' } : null,
      }));

      const { updated_at, placed_at, ...safe } = o; // internal timestamps stay on the server
      return {
        ...safe,
        items,
        can_request_cancel: canRequestCancel,
        cancel_seconds_left: canRequestCancel ? secsLeft : 0,
        cancel_window_minutes: CANCEL_WINDOW_MINUTES,
        can_request_refund: canRequestRefund,
        refund_window_days: REFUND_WINDOW_DAYS,
      };
    });

    return json(200, orders);
  } catch (e) {
    console.error('customer-orders', e);
    return json(500, { error: 'Unable to load your orders right now.' });
  }
};

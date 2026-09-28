const { supabaseFetch, ASAP_PREP_MINUTES } = require('./_util');

const ORDER_COLUMNS =
  'id,order_code,customer_name,customer_phone,items,subtotal,tax,total,adjusted_subtotal,adjusted_total,' +
  'status,payment_status,pickup_time,requested_pickup,substitution_pref,staff_notes,notes,created_at,updated_at,placed_at,' +
  'cancel_request_status,cancel_requested_at,cancel_request_reason,cancel_decided_at,cancel_decision_note,' +
  'refund_request_status,refund_requested_at,refund_request_reason,refund_decided_at,refund_decision_note,' +
  'refund_approved_amount,refunded_amount';

// Orders placed before GIF existed stored only { id, qty } per item. This
// looks those products up so every item GIF shows has a name, price, unit
// and photo. Newer orders already carry a snapshot, so nothing is fetched.
async function shapeOrders(rows) {
  const missing = new Set();
  for (const o of rows) {
    for (const it of o.items || []) {
      if (it && it.id && (it.name == null || it.price == null)) missing.add(Number(it.id));
    }
  }
  let byId = {};
  if (missing.size) {
    try {
      const prods = await supabaseFetch(`products?id=in.(${[...missing].join(',')})&select=id,name,price,unit,image,emoji`);
      byId = Object.fromEntries((prods || []).map((p) => [p.id, p]));
    } catch (e) {
      console.error('shapeOrders: product lookup failed', e);
    }
  }

  return rows.map((o) => {
    const items = (o.items || []).map((it, index) => {
      const p = byId[Number(it.id)] || {};
      const unit = it.unit != null ? it.unit : p.unit || '';
      return {
        index,
        id: it.id,
        name: it.name != null ? it.name : p.name || `Item #${it.id}`,
        qty: Number(it.qty) || 0,
        unit,
        price: it.price != null ? Number(it.price) : p.price != null ? Number(p.price) : null,
        image: it.image || p.image || '',
        emoji: it.emoji || p.emoji || '🛒',
        weighted: /lb/i.test(unit),
        pick_status: it.pick_status || 'pending',
        picked_qty: it.picked_qty != null ? Number(it.picked_qty) : null,
        substitute: it.substitute || null,
        note: it.note || '',
      };
    });

    const asap = !o.pickup_time && !o.requested_pickup;
    const dueAt =
      o.pickup_time ||
      o.requested_pickup ||
      new Date(new Date(o.created_at).getTime() + ASAP_PREP_MINUTES * 60000).toISOString();

    const cancelReq = o.cancel_request_status
      ? { status: o.cancel_request_status, requested_at: o.cancel_requested_at, reason: o.cancel_request_reason || '', decided_at: o.cancel_decided_at || null, note: o.cancel_decision_note || '' }
      : null;
    const refundReq = o.refund_request_status
      ? { status: o.refund_request_status, requested_at: o.refund_requested_at, reason: o.refund_request_reason || '', decided_at: o.refund_decided_at || null, note: o.refund_decision_note || '', approved_amount: o.refund_approved_amount != null ? Number(o.refund_approved_amount) : null }
      : null;
    const refunded = o.refunded_amount != null ? Number(o.refunded_amount) : 0;

    return {
      id: o.id,
      order_code: o.order_code,
      placed_at: o.placed_at || o.created_at,
      cancel_request: cancelReq,
      refund_request: refundReq,
      refunded_amount: refunded,
      refundable: o.total != null ? Math.max(0, Math.round((Number(o.total) - refunded) * 100) / 100) : null,
      customer_name: o.customer_name || '',
      customer_phone: o.customer_phone || '',
      status: o.status === 'Paid - Preparing' ? 'Preparing' : o.status,
      payment_status: o.payment_status || null,
      created_at: o.created_at,
      updated_at: o.updated_at,
      requested_pickup: o.requested_pickup || null,
      pickup_time: o.pickup_time || null,
      due_at: dueAt,
      asap,
      substitution_pref: o.substitution_pref || 'call',
      staff_notes: o.staff_notes || '',
      notes: o.notes || '',
      total: o.total != null ? Number(o.total) : null,
      adjusted_total: o.adjusted_total != null ? Number(o.adjusted_total) : null,
      items,
    };
  });
}

module.exports = { shapeOrders, ORDER_COLUMNS };

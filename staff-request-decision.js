const Stripe = require('stripe');
const { json, requireStaff, supabaseFetch, restoreOrderStock, round2, appendEvent } = require('./_util');
const { shapeOrders, ORDER_COLUMNS } = require('./_staff');

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function paymentIntentFor(stripe, order, expandCharge) {
  if (!order.stripe_session_id) return null;
  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id;
  if (!piId) return null;
  return stripe.paymentIntents.retrieve(piId, expandCharge ? { expand: ['latest_charge'] } : undefined);
}

// Every cancellation and refund needs the STORE ADMIN's approval. Only a
// request made with the admin code reaches the money-moving code below —
// worker (STAFF_TOKEN) sign-ins are refused.
//
// Safety notes:
//  - Stripe is contacted first; the order record is then updated with a
//    conditional write ("only if still pending"), so two admins tapping at
//    once can't both process the same request.
//  - Refunds use a Stripe idempotency key, so a retry after a hiccup can't
//    refund the customer twice.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const auth = await requireStaff(event);
  if (!auth.ok) return auth.response;
  if (!auth.isAdmin) {
    return json(403, { error: 'Only the store admin can approve or deny cancellations and refunds.' });
  }

  try {
    const b = JSON.parse(event.body || '{}');
    const id = Number(b.id);
    const kind = String(b.kind || '');
    const decision = String(b.decision || '');
    const note = String(b.note || '').trim().slice(0, 300);
    if (!id) throw httpError(400, 'Invalid order id');
    if (kind !== 'cancel' && kind !== 'refund') throw httpError(400, 'Unknown request type');
    if (decision !== 'approve' && decision !== 'deny') throw httpError(400, 'Decision must be approve or deny');

    const rows = await supabaseFetch(
      `orders?id=eq.${id}&select=id,status,items,stripe_session_id,total,cancel_request_status,refund_request_status,refunded_amount,events`
    );
    const order = rows && rows[0];
    if (!order) throw httpError(404, 'Order not found');

    const nowIso = new Date().toISOString();
    const stateField = kind === 'cancel' ? 'cancel_request_status' : 'refund_request_status';
    if (order[stateField] !== 'pending') throw httpError(409, 'This request has already been decided.');
    const claim = `orders?id=eq.${id}&${stateField}=eq.pending`;
    const decidedField = kind === 'cancel' ? 'cancel_decided_at' : 'refund_decided_at';
    const noteField = kind === 'cancel' ? 'cancel_decision_note' : 'refund_decision_note';

    const describe = (patch) => {
      const what = kind === 'cancel' ? 'cancellation' : 'refund';
      if (patch[stateField] === 'denied') return `Denied the ${what} request`;
      return kind === 'cancel' ? 'Approved the cancellation' : `Approved a refund of $${Number(patch.refund_approved_amount).toFixed(2)}`;
    };
    const commit = async (patch) => {
      const saved = await supabaseFetch(claim, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...patch, [decidedField]: nowIso, [noteField]: note, updated_at: nowIso, events: appendEvent(order.events, auth.staffName, describe(patch)) }),
      });
      if (!saved || !saved.length) throw httpError(409, 'This request was just decided by someone else.');
      return saved[0];
    };

    if (decision === 'deny') {
      await commit({ [stateField]: 'denied' });
    } else if (kind === 'cancel') {
      // ---- approve a cancellation: release the card hold (or refund it) ----
      let paymentStatus = 'cancelled';
      let refundedNow = 0;
      if (process.env.STRIPE_SECRET_KEY) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const pi = await paymentIntentFor(stripe, order, false);
        if (pi) {
          if (pi.status === 'requires_capture') {
            await stripe.paymentIntents.cancel(pi.id, { cancellation_reason: 'requested_by_customer' });
          } else if (pi.status === 'succeeded') {
            await stripe.refunds.create(
              { payment_intent: pi.id, reason: 'requested_by_customer' },
              { idempotencyKey: `cancel-refund-${order.id}` }
            );
            paymentStatus = 'refunded';
            refundedNow = round2((pi.amount_received || 0) / 100);
          } else if (pi.status !== 'canceled') {
            throw httpError(400, `Payment is ${pi.status}, so it can't be cancelled from here. Check it in Stripe.`);
          }
        }
      }
      const alreadyReleased = order.status === 'Cancelled' || order.status === 'Abandoned';
      await commit({
        [stateField]: 'approved',
        status: 'Cancelled',
        payment_status: paymentStatus,
        ...(refundedNow ? { refunded_amount: refundedNow } : {}),
      });
      if (!alreadyReleased) await restoreOrderStock(order.items); // the food goes back on the shelf
    } else {
      // ---- approve a refund (full or partial) ----
      if (!process.env.STRIPE_SECRET_KEY) throw httpError(500, 'Stripe is not configured.');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const pi = await paymentIntentFor(stripe, order, true);
      if (!pi || !(pi.amount_received > 0)) {
        throw httpError(400, 'Nothing has been charged on this order, so there is nothing to refund.');
      }
      const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
      const alreadyRefundedCents = charge ? charge.amount_refunded || 0 : 0;
      const maxCents = pi.amount_received - alreadyRefundedCents;
      const hasAmount = b.amount !== undefined && b.amount !== null && b.amount !== '';
      const cents = hasAmount ? Math.round(Number(b.amount) * 100) : maxCents;
      if (!Number.isFinite(cents) || cents <= 0) throw httpError(400, 'Enter a refund amount greater than $0.');
      if (cents > maxCents) {
        throw httpError(400, `The most that can still be refunded is $${(maxCents / 100).toFixed(2)}.`);
      }
      await stripe.refunds.create(
        { payment_intent: pi.id, amount: cents, reason: 'requested_by_customer' },
        { idempotencyKey: `refund-${order.id}` }
      );
      const totalRefundedCents = alreadyRefundedCents + cents;
      await commit({
        [stateField]: 'approved',
        refund_approved_amount: cents / 100,
        refunded_amount: totalRefundedCents / 100,
        payment_status: totalRefundedCents >= pi.amount_received ? 'refunded' : 'partially_refunded',
      });
    }

    const fresh = await supabaseFetch(`orders?id=eq.${id}&select=${ORDER_COLUMNS}`);
    const [shaped] = await shapeOrders(fresh || []);
    return json(200, { ok: true, order: shaped });
  } catch (e) {
    console.error('staff-request-decision', e);
    return json(e.status || 400, { error: e.message || 'Unable to process this request' });
  }
};

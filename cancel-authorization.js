const Stripe = require('stripe');
const { json, requireAdmin, supabaseFetch, restoreOrderStock } = require('./_util');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    const b = JSON.parse(event.body || '{}');
    const sid = String(b.sessionId || '');
    if (!sid.startsWith('cs_')) throw new Error('Invalid Checkout Session ID');

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(sid, { expand: ['payment_intent'] });
    const pi = s.payment_intent;
    if (!pi) throw new Error('No PaymentIntent found');

    if (pi.status === 'requires_capture') {
      await stripe.paymentIntents.cancel(pi.id, { cancellation_reason: 'requested_by_customer' });
    } else if (pi.status === 'succeeded') {
      throw new Error('Payment was already captured. Refund it from Stripe or add a refund workflow before using live payments.');
    } else if (pi.status === 'canceled') {
      // Already released — fall through so the order record still gets tidied up.
    } else {
      throw new Error(`Payment is ${pi.status}; it cannot be canceled from this screen.`);
    }

    // Give back any inventory this order had reserved, and mark it Cancelled.
    try {
      const orders = await supabaseFetch(`orders?stripe_session_id=eq.${encodeURIComponent(sid)}&select=id,items,status,cancel_request_status`);
      const order = orders && orders[0];
      if (order) {
        const alreadyReleased = order.status === 'Cancelled' || order.status === 'Abandoned';
        if (!alreadyReleased) await restoreOrderStock(order.items);
        await supabaseFetch(`orders?id=eq.${order.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: alreadyReleased ? order.status : 'Cancelled',
            payment_status: 'cancelled',
            // If the customer had asked to cancel, cancelling here is the approval.
            ...(order.cancel_request_status === 'pending'
              ? { cancel_request_status: 'approved', cancel_decided_at: new Date().toISOString() }
              : {}),
            updated_at: new Date().toISOString(),
          }),
        });
      }
    } catch (e2) {
      console.error('cancel-authorization order lookup/update failed', e2);
    }

    return json(200, { ok: true, status: 'canceled' });
  } catch (e) {
    console.error('cancel-authorization', e);
    return json(400, { error: e.message || 'Unable to cancel authorization' });
  }
};

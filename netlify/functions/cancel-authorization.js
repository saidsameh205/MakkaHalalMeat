const Stripe = require('stripe');
const { json, requireAdmin } = require('./_util');

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
      return json(200, { ok: true, status: 'canceled' });
    } else {
      throw new Error(`Payment is ${pi.status}; it cannot be canceled from this screen.`);
    }

    return json(200, { ok: true, status: 'canceled' });
  } catch (e) {
    console.error('cancel-authorization', e);
    return json(400, { error: e.message || 'Unable to cancel authorization' });
  }
};

const Stripe = require('stripe');
const { json } = require('./_util');

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters && event.queryStringParameters.session_id;
    if (!id || !id.startsWith('cs_')) return json(400, { error: 'Bad session' });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] });
    const pi = s.payment_intent;
    const authorized = !!pi && pi.status === 'requires_capture';
    return json(200, {
      authorized,
      orderCode: s.client_reference_id || '',
      amountTotal: s.amount_total || 0,
      status: pi ? pi.status : s.payment_status,
    });
  } catch (e) {
    console.error('verify-checkout-session', e);
    return json(500, { authorized: false, error: 'Unable to verify payment' });
  }
};

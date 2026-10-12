const Stripe = require('stripe');
const { json, supabaseFetch } = require('./_util');

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters && event.queryStringParameters.session_id;
    if (!id || !id.startsWith('cs_')) return json(400, { error: 'Bad session' });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] });
    const pi = s.payment_intent;
    const authorized = !!pi && pi.status === 'requires_capture';

    // The moment payment is confirmed, hand the order to the store: flip it
    // from "Awaiting Payment" to "New" so it shows up in GIF. (If the
    // customer never returns to the site, GIF's reconcile step does the
    // same thing on its own.)
    if (authorized) {
      try {
        await supabaseFetch(`orders?stripe_session_id=eq.${encodeURIComponent(id)}&status=eq.Awaiting%20Payment`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'New', payment_status: 'authorized', placed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
        });
      } catch (e) {
        console.error('verify-checkout-session: could not promote order', e);
      }
    }

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

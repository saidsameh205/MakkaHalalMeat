const Stripe = require('stripe');
const { json, requireAdmin, supabaseFetch } = require('./_util');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    const body = JSON.parse(event.body || '{}');
    const sessionId = String(body.sessionId || '').trim();
    const finalAmount = Number(body.finalAmount);
    if (!sessionId.startsWith('cs_')) throw new Error('Missing or invalid Stripe Checkout Session ID');
    if (!Number.isFinite(finalAmount) || finalAmount < 0.5) throw new Error('Final amount must be at least $0.50');

    // Don't charge the card while the customer's cancellation request is unresolved.
    const held = await supabaseFetch(
      `orders?stripe_session_id=eq.${encodeURIComponent(sessionId)}&cancel_request_status=eq.pending&select=id`
    );
    if (held && held.length) {
      throw new Error('The customer asked to cancel this order. Approve or deny the request (in GIF) before charging.');
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
    const pi = session.payment_intent;
    if (!pi) throw new Error('No PaymentIntent found for this checkout session');
    if (pi.status !== 'requires_capture') throw new Error(`Payment is ${pi.status}, not awaiting capture`);

    const cents = Math.round(finalAmount * 100);
    if (cents > pi.amount_capturable) {
      return json(400, {
        error: `Final amount $${finalAmount.toFixed(2)} exceeds authorized amount $${(pi.amount_capturable / 100).toFixed(2)}.`,
      });
    }

    const captured = await stripe.paymentIntents.capture(pi.id, { amount_to_capture: cents });

    // Record the payment separately from the fulfilment status, so charging
    // an order never bumps it back a step in staff's picking workflow.
    let orderUpdated = false;
    try {
      await supabaseFetch(`orders?stripe_session_id=eq.${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          total: cents / 100,
          payment_status: 'captured',
          updated_at: new Date().toISOString(),
        }),
      });
      orderUpdated = true;
    } catch (e) {
      console.error('capture-final-payment order update failed', e);
    }

    return json(200, {
      ok: true,
      paymentIntentId: captured.id,
      status: captured.status,
      capturedAmount: cents / 100,
      orderCode: session.client_reference_id || '',
      orderUpdated,
    });
  } catch (err) {
    console.error('capture-final-payment', err);
    return json(400, { error: err.message || 'Unable to capture payment' });
  }
};

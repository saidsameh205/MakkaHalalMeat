const Stripe = require('stripe');
const { json, supabaseFetch } = require('./_util');

// Runs with no admin token, because any customer needs to start checkout —
// but it never trusts the browser's math: it validates the amount shape,
// and the *real* per-item prices are looked up server-side from Supabase
// before anything is written to the orders table, so a tampered client
// total can't be used to under-charge or spoof an order record.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    if (!items.length) throw new Error('Your cart is empty');

    const ids = items.map((i) => Number(i.id)).filter(Number.isFinite);
    const qs = `products?id=in.(${ids.join(',')})&select=id,name,price,active`;
    const catalog = await supabaseFetch(qs);
    const byId = Object.fromEntries(catalog.map((p) => [p.id, p]));

    let subtotal = 0;
    const lineDescriptions = [];
    for (const item of items) {
      const p = byId[Number(item.id)];
      const qty = Math.max(1, Math.min(50, Number(item.qty) || 1));
      if (!p || !p.active || p.price == null) continue; // skip unknown/priceless items rather than trusting the client
      subtotal += p.price * qty;
      lineDescriptions.push(`${qty} x ${p.name}`);
    }
    if (subtotal <= 0) throw new Error('No valid priced items in cart');

    const foodTaxable = subtotal; // simple flat estimate; adjust categories as needed
    const tax = Math.round(foodTaxable * 0.03 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const cents = Math.round(total * 100);

    const orderCode = 'MHM-' + Date.now().toString(36).toUpperCase();

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = event.headers.origin || `https://${event.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: body.email || undefined,
      client_reference_id: orderCode,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Makka Halal Meat pickup order ${orderCode}` },
            unit_amount: cents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: { capture_method: 'manual', metadata: { order_code: orderCode } },
      metadata: { order_code: orderCode },
      success_url: `${origin}/?payment=authorized&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment=cancelled`,
    });

    await supabaseFetch('orders', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        order_code: orderCode,
        customer_name: String(body.name || '').slice(0, 200),
        customer_phone: String(body.phone || '').slice(0, 40),
        items,
        subtotal,
        tax,
        total,
        stripe_session_id: session.id,
        status: 'New',
        notes: lineDescriptions.join(', ').slice(0, 2000),
      }),
    });

    return json(200, { id: session.id, url: session.url });
  } catch (err) {
    console.error('create-checkout-session', err);
    return json(500, { error: err.message || 'Unable to start payment' });
  }
};

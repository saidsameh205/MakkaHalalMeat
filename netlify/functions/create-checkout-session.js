const Stripe = require('stripe');
const { json, supabaseFetch } = require('./_util');

// Runs with no admin token, because any customer needs to start checkout —
// but it never trusts the browser's math: it validates the amount shape,
// and the *real* per-item prices are looked up server-side from Supabase
// before anything is written to the orders table, so a tampered client
// total can't be used to under-charge or spoof an order record.
//
// It also reserves inventory up front: stock is decremented the moment an
// order is placed (not when payment is captured later), using an
// optimistic-concurrency check so two customers can't both buy the last
// item. If a reservation fails partway through, everything already
// reserved for this order is rolled back.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const reserved = []; // { id, qty } successfully decremented so far, for rollback

  try {
    const body = JSON.parse(event.body || '{}');
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    if (!items.length) throw new Error('Your cart is empty');

    const ids = items.map((i) => Number(i.id)).filter(Number.isFinite);
    const qs = `products?id=in.(${ids.join(',')})&select=id,name,price,active,stock`;
    const catalog = await supabaseFetch(qs);
    const byId = Object.fromEntries(catalog.map((p) => [p.id, p]));

    let subtotal = 0;
    const lineDescriptions = [];
    const toReserve = []; // items whose stock we still need to decrement

    for (const item of items) {
      const p = byId[Number(item.id)];
      const qty = Math.max(1, Math.min(50, Number(item.qty) || 1));
      if (!p || !p.active || p.price == null) continue; // skip unknown/priceless items rather than trusting the client
      if (p.stock != null && qty > p.stock) {
        throw new Error(`Only ${p.stock} of "${p.name}" left in stock — please adjust your cart.`);
      }
      subtotal += p.price * qty;
      lineDescriptions.push(`${qty} x ${p.name}`);
      if (p.stock != null) toReserve.push({ id: p.id, qty, currentStock: p.stock });
    }
    if (subtotal <= 0) throw new Error('No valid priced items in cart');

    // Reserve stock one item at a time with an optimistic-concurrency
    // check: the update only applies if stock still matches what we just
    // read, so a simultaneous purchase can't oversell the same item.
    for (const r of toReserve) {
      const rows = await supabaseFetch(`products?id=eq.${r.id}&stock=eq.${r.currentStock}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ stock: r.currentStock - r.qty }),
      });
      if (!rows || !rows.length) {
        throw new Error('Someone just bought the last of one of your items — please refresh and try again.');
      }
      reserved.push({ id: r.id, qty: r.qty });
    }

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
    // Give back any inventory we already reserved for this failed attempt.
    for (const r of reserved) {
      try {
        await restoreStock(r.id, r.qty);
      } catch (e2) {
        console.error('create-checkout-session rollback failed', r, e2);
      }
    }
    return json(500, { error: err.message || 'Unable to start payment' });
  }
};

async function restoreStock(id, qty) {
  const rows = await supabaseFetch(`products?id=eq.${id}&select=stock`);
  const current = rows && rows[0] ? rows[0].stock : null;
  if (current == null) return; // stock is untracked for this item, nothing to restore
  await supabaseFetch(`products?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ stock: current + qty }),
  });
}

module.exports.restoreStock = restoreStock;

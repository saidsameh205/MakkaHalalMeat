const Stripe = require('stripe');
const { json, supabaseFetch, restoreStock, round2, FOOD_TAX_RATE, NONFOOD_TAX_RATE, verifySession } = require('./_util');

const SUBSTITUTION_CHOICES = ['substitute', 'call', 'skip'];

// Shared by this function and validate-promo.js so the checkout screen's
// instant preview always matches what actually gets charged.
async function lookupPromo(rawCode) {
  const rows = await supabaseFetch(
    `discounts?active=eq.true&code=ilike.${encodeURIComponent(rawCode)}&select=title,code,discount_type,discount_value,expires_at,requirements`
  );
  const deal = rows && rows[0];
  if (!deal || !deal.code) return null; // a deal with no code is informational-only, never redeemable
  if (deal.expires_at && new Date(deal.expires_at) < new Date()) return null;
  if (!deal.discount_type || !(Number(deal.discount_value) > 0)) return null; // no discount configured — nothing to apply
  return deal;
}
function computeDiscount(deal, subtotal) {
  const raw =
    deal.discount_type === 'percent' ? subtotal * (Number(deal.discount_value) / 100) : Number(deal.discount_value);
  return Math.max(0, Math.min(round2(raw), subtotal)); // never discount below $0 or more than the order is worth
}

// Runs with no token, because any customer needs to start checkout — but
// it never trusts the browser's math: the *real* per-item prices are looked
// up server-side from Supabase before anything is written, so a tampered
// client total can't under-charge or spoof an order.
//
// It also reserves inventory up front: stock is decremented the moment an
// order is placed (not when payment is captured later), using an
// optimistic-concurrency check so two customers can't both buy the last
// item. If anything fails partway, everything already reserved is rolled
// back. The order starts as "Awaiting Payment" and only becomes "New"
// (visible to the GIF staff app) once Stripe confirms the payment.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const reserved = []; // { id, qty } successfully decremented so far, for rollback

  try {
    const body = JSON.parse(event.body || '{}');
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    if (!items.length) throw new Error('Your cart is empty');

    const ids = items.map((i) => Number(i.id)).filter(Number.isFinite);
    const qs = `products?id=in.(${ids.join(',')})&select=id,name,price,unit,image,emoji,active,stock,is_food`;
    const catalog = await supabaseFetch(qs);
    const byId = Object.fromEntries(catalog.map((p) => [p.id, p]));

    let subtotal = 0, foodSubtotal = 0, nonfoodSubtotal = 0;
    const lineDescriptions = [];
    const orderItems = []; // what we store on the order: a snapshot, so later price/name edits never rewrite history
    const toReserve = [];

    for (const item of items) {
      const p = byId[Number(item.id)];
      const qty = Math.max(0.25, Math.min(50, Number(item.qty) || 1));
      if (!p || !p.active || p.price == null) continue; // skip unknown/priceless items rather than trusting the client
      if (p.stock != null && qty > p.stock) {
        throw new Error(`Only ${p.stock} of "${p.name}" left in stock — please adjust your cart.`);
      }
      const lineTotal = p.price * qty;
      // is_food defaults to true (most of this catalog is food) when a product
      // predates the column or was never explicitly set either way.
      const isFood = p.is_food !== false;
      const taxRate = isFood ? FOOD_TAX_RATE : NONFOOD_TAX_RATE;
      subtotal += lineTotal;
      if (isFood) foodSubtotal += lineTotal; else nonfoodSubtotal += lineTotal;
      lineDescriptions.push(`${qty} x ${p.name}`);
      orderItems.push({
        id: p.id,
        qty,
        name: p.name,
        price: p.price,
        unit: p.unit || '',
        image: p.image || '',
        emoji: p.emoji || '',
        pick_status: 'pending',
        tax_rate: taxRate, // snapshotted so a later category change never rewrites this order's tax
      });
      if (p.stock != null) toReserve.push({ id: p.id, qty, currentStock: p.stock });
    }
    if (subtotal <= 0) throw new Error('No valid priced items in cart');
    subtotal = round2(subtotal);

    // Promo code (optional). Looked up and applied here — never trust a
    // discount amount the browser sends — so a tampered client can't grant
    // itself a bigger discount than the code actually allows. The discount
    // is split proportionally across food/non-food (by their pre-discount
    // share of the cart) so tax is still computed on what was actually paid
    // for each, not on the full pre-discount amount.
    let discountCode = null, discountAmount = 0;
    const rawCode = String(body.promo_code || '').trim();
    if (rawCode) {
      const deal = await lookupPromo(rawCode);
      if (!deal) throw new Error("That code isn't valid or has expired.");
      discountAmount = computeDiscount(deal, subtotal);
      if (discountAmount > 0) discountCode = deal.code;
    }
    const foodShare = subtotal > 0 ? foodSubtotal / subtotal : 0;
    const discountFood = round2(discountAmount * foodShare);
    const discountNonfood = round2(discountAmount - discountFood); // remainder, so the split always adds up exactly
    foodSubtotal = round2(foodSubtotal - discountFood);
    nonfoodSubtotal = round2(nonfoodSubtotal - discountNonfood);
    subtotal = round2(subtotal - discountAmount);

    // Optional pickup time the customer asked for (blank = as soon as possible).
    let requestedPickup = null;
    if (body.requested_pickup) {
      const t = new Date(body.requested_pickup);
      const minsAhead = (t.getTime() - Date.now()) / 60000;
      if (!Number.isNaN(t.getTime()) && minsAhead > -5 && minsAhead < 60 * 24 * 4) requestedPickup = t.toISOString();
    }
    const substitutionPref = SUBSTITUTION_CHOICES.includes(body.substitution_pref) ? body.substitution_pref : 'call';

    // Optional: if the customer is signed in, link this order to their
    // account so it shows in their order history. A missing, expired, or
    // invalid token just means they're checking out as a guest — never
    // blocks the order.
    let customerId = null;
    const custToken = event.headers['x-customer-token'] || event.headers['X-Customer-Token'];
    if (custToken) {
      const session = verifySession(custToken, 'cust');
      if (session && !session.expired && session.sid) customerId = session.sid;
    }

    // Reserve stock one item at a time with an optimistic-concurrency check:
    // the update only applies if stock still matches what we just read, so a
    // simultaneous purchase can't oversell the same item.
    for (const r of toReserve) {
      const rows = await supabaseFetch(`products?id=eq.${r.id}&stock=eq.${r.currentStock}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ stock: round2(Number(r.currentStock) - r.qty) }),
      });
      if (!rows || !rows.length) {
        throw new Error('Someone just bought the last of one of your items — please refresh and try again.');
      }
      reserved.push({ id: r.id, qty: r.qty });
    }

    const tax = round2(round2(foodSubtotal * FOOD_TAX_RATE) + round2(nonfoodSubtotal * NONFOOD_TAX_RATE));
    const total = round2(subtotal + tax);
    const cents = Math.round(total * 100);

    const orderCode = 'MHM-' + Date.now().toString(36).toUpperCase();

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = event.headers.origin || `https://${event.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: body.email || undefined,
      client_reference_id: orderCode,
      // Unpaid checkouts close themselves after ~31 minutes (Stripe's minimum
      // is 30), so abandoned carts don't hold inventory for long.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
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
        items: orderItems,
        subtotal,
        tax,
        total,
        ...(discountCode ? { discount_code: discountCode, discount_amount: discountAmount } : {}),
        ...(customerId ? { customer_id: customerId } : {}),
        stripe_session_id: session.id,
        status: 'Awaiting Payment',
        payment_status: 'unpaid',
        requested_pickup: requestedPickup,
        substitution_pref: substitutionPref,
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

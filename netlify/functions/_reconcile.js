const Stripe = require('stripe');
const { supabaseFetch, restoreOrderStock } = require('./_util');

// Orders are created the moment a customer clicks "Continue to payment",
// with the status "Awaiting Payment" — but the customer might still be
// typing their card, or might abandon checkout entirely. This checks each
// such order against Stripe (the source of truth) and settles it:
//   - payment authorized      -> "New" (staff should start picking it)
//   - checkout expired/abandoned -> "Abandoned", and its reserved stock is
//     released so an unpaid cart can't lock up inventory forever
// GIF and admin.html call this every time they load orders, so it stays
// current without needing a Stripe webhook to be configured.
async function reconcilePendingOrders() {
  if (!process.env.STRIPE_SECRET_KEY) return;

  let pending = [];
  try {
    pending = await supabaseFetch(
      'orders?status=eq.Awaiting%20Payment&select=id,stripe_session_id,items,created_at&order=created_at.asc&limit=25'
    );
  } catch (e) {
    console.error('reconcile: could not list pending orders', e);
    return;
  }
  if (!pending || !pending.length) return;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  for (const order of pending) {
    try {
      if (!order.stripe_session_id) continue;
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, { expand: ['payment_intent'] });
      const pi = session.payment_intent;
      const now = new Date().toISOString();

      if (pi && (pi.status === 'requires_capture' || pi.status === 'succeeded')) {
        // Only promote if it's still awaiting payment (avoid racing another caller).
        await supabaseFetch(`orders?id=eq.${order.id}&status=eq.Awaiting%20Payment`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'New',
            payment_status: pi.status === 'succeeded' ? 'captured' : 'authorized',
            placed_at: now,
            updated_at: now,
          }),
        });
        continue;
      }

      const ageMinutes = (Date.now() - new Date(order.created_at).getTime()) / 60000;
      let abandon = session.status === 'expired';
      if (!abandon && session.status === 'open' && ageMinutes > 45) {
        // Sessions are set to expire after ~31 minutes; close any straggler.
        try { await stripe.checkout.sessions.expire(order.stripe_session_id); } catch (e) { /* already closing */ }
        abandon = true;
      }

      if (abandon) {
        // Claim the order first so two callers can't both restore its stock.
        const claimed = await supabaseFetch(`orders?id=eq.${order.id}&status=eq.Awaiting%20Payment`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'Abandoned', payment_status: 'unpaid', updated_at: now }),
        });
        if (claimed && claimed.length) await restoreOrderStock(order.items);
      }
    } catch (e) {
      console.error('reconcile: order', order.id, e);
    }
  }
}

module.exports = { reconcilePendingOrders };

const { json, requireStaff, supabaseFetch } = require('./_util');
const { reconcilePendingOrders } = require('./_reconcile');
const { shapeOrders, ORDER_COLUMNS } = require('./_staff');

const ACTIVE = ['New', 'Preparing', 'Ready for Pickup', 'Paid - Preparing'];
const DONE = ['Completed'];

// GET ?view=active (default) -> orders staff still need to pick / hand over
// GET ?view=done             -> orders completed in the last 48 hours
// Only orders whose payment has been confirmed appear here: checkouts still
// "Awaiting Payment" (or abandoned) never reach the store.
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
  const auth = await requireStaff(event);
  if (!auth.ok) return auth.response;

  try {
    await reconcilePendingOrders();

    const view = (event.queryStringParameters && event.queryStringParameters.view) === 'done' ? 'done' : 'active';
    const since = new Date(Date.now() - (view === 'done' ? 2 : 21) * 24 * 3600 * 1000).toISOString();
    const rows = await supabaseFetch(
      `orders?select=${ORDER_COLUMNS}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=300`
    );

    const wanted = view === 'done' ? DONE : ACTIVE;
    let filtered = (rows || []).filter((o) => wanted.includes(o.status));
    if (view === 'done') {
      const cutoff = Date.now() - 48 * 3600 * 1000;
      filtered = filtered.filter((o) => new Date(o.updated_at || o.created_at).getTime() >= cutoff);
    }

    const orders = await shapeOrders(filtered);

    // Cancellation / refund requests waiting for the admin (any age), plus
    // recently decided ones for reference. Refund requests belong to orders
    // that are already completed, so they can't come from the list above.
    let requests = [];
    if (view === 'active') {
      const back = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString();
      const reqRows = await supabaseFetch(
        `orders?select=${ORDER_COLUMNS}&created_at=gte.${encodeURIComponent(back)}` +
          '&or=(cancel_request_status.not.is.null,refund_request_status.not.is.null)&order=created_at.desc&limit=200'
      );
      const recent = Date.now() - 3 * 24 * 3600 * 1000;
      const keep = (reqRows || []).filter((o) => {
        const pending = o.cancel_request_status === 'pending' || o.refund_request_status === 'pending';
        const decidedAt = Math.max(new Date(o.cancel_decided_at || 0).getTime(), new Date(o.refund_decided_at || 0).getTime());
        return pending || decidedAt >= recent;
      });
      requests = await shapeOrders(keep);
    }

    return json(200, { server_time: new Date().toISOString(), view, is_admin: !!auth.isAdmin, staff_name: auth.staffName || '', orders, requests });
  } catch (e) {
    console.error('staff-orders', e);
    return json(500, { error: 'Unable to load orders' });
  }
};

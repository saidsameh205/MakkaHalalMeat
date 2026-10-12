const { json, requireAdmin, supabaseFetch } = require('./_util');
const { reconcilePendingOrders } = require('./_reconcile');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    // Settle any checkouts that were paid (or abandoned) since the last look.
    await reconcilePendingOrders();

    const showAll = event.queryStringParameters && event.queryStringParameters.all === '1';
    const filter = showAll ? '' : '&status=neq.Abandoned';
    const rows = await supabaseFetch(`orders?select=*&order=created_at.desc&limit=200${filter}`);
    return json(200, rows);
  } catch (e) {
    console.error('admin-orders', e);
    return json(500, { error: 'Unable to load orders' });
  }
};

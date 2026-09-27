const { json, supabaseFetch } = require('./_util');

// No admin token — any customer can call this — but it requires BOTH the
// exact order code AND the phone number used at checkout, so someone can't
// enumerate other customers' orders just by guessing order codes.
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  try {
    const params = event.queryStringParameters || {};
    const orderCode = String(params.order_code || '').trim();
    const phone = String(params.phone || '').trim();
    if (!orderCode || !phone) return json(400, { error: 'order_code and phone are required' });

    const rows = await supabaseFetch(
      `orders?order_code=eq.${encodeURIComponent(orderCode)}&customer_phone=eq.${encodeURIComponent(phone)}&select=order_code,items,subtotal,tax,total,status,pickup_time,notes,created_at`
    );
    const order = rows && rows[0];
    if (!order) return json(404, { error: 'Order not found' });

    return json(200, order);
  } catch (e) {
    console.error('order-status', e);
    return json(500, { error: 'Unable to look up order' });
  }
};

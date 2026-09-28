const { json, requireStaff, supabaseFetch, computeAdjusted } = require('./_util');
const { shapeOrders, ORDER_COLUMNS } = require('./_staff');

const EDITABLE = ['New', 'Preparing', 'Ready for Pickup', 'Paid - Preparing'];
const STAFF_STATUSES = ['Preparing', 'Ready for Pickup', 'Completed'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// The customer asked to cancel — nobody picks (or advances) the order until
// the store admin confirms or denies it.
function assertNotOnHold(order) {
  if (order.cancel_request_status === 'pending') {
    throw Object.assign(
      new Error('The customer asked to cancel this order. Picking is paused until the store admin confirms or denies the request.'),
      { status: 409 }
    );
  }
}

async function loadOrder(id) {
  const rows = await supabaseFetch(`orders?id=eq.${id}&select=id,items,status,updated_at,cancel_request_status`);
  return rows && rows[0];
}

// Writes only if nobody else changed the order since we read it, so two
// workers editing different items on the same order can't overwrite each
// other. Retries a few times with a fresh read.
async function patchWithRetry(id, buildPatch) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const order = await loadOrder(id);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    const patch = buildPatch(order);
    patch.updated_at = new Date().toISOString();
    const rows = await supabaseFetch(
      `orders?id=eq.${id}&updated_at=eq.${encodeURIComponent(order.updated_at)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) }
    );
    if (rows && rows.length) return { before: order, after: rows[0] };
  }
  throw new Error('Someone else just edited this order — please try again.');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const auth = requireStaff(event);
  if (!auth.ok) return auth.response;

  try {
    const b = JSON.parse(event.body || '{}');
    const id = Number(b.id);
    if (!id) throw Object.assign(new Error('Invalid order id'), { status: 400 });
    const op = String(b.op || '');
    let soldOutProductId = null;

    let result;

    if (op === 'item') {
      const action = String(b.action || '');
      const index = Number(b.index);
      result = await patchWithRetry(id, (order) => {
        assertNotOnHold(order);
        if (!EDITABLE.includes(order.status)) {
          throw Object.assign(new Error(`This order is ${order.status} and can't be edited.`), { status: 400 });
        }
        const items = Array.isArray(order.items) ? order.items.map((x) => ({ ...x })) : [];
        if (!Number.isInteger(index) || index < 0 || index >= items.length) {
          throw Object.assign(new Error('Item not found on this order'), { status: 400 });
        }
        const item = items[index];

        if (action === 'picked') {
          const q = b.picked_qty !== undefined && b.picked_qty !== null && b.picked_qty !== '' ? num(b.picked_qty) : Number(item.qty);
          if (!(q > 0) || q > 500) throw Object.assign(new Error('Enter the picked amount (more than 0).'), { status: 400 });
          item.pick_status = 'picked';
          item.picked_qty = Math.round(q * 100) / 100;
          delete item.substitute;
        } else if (action === 'unavailable') {
          item.pick_status = 'unavailable';
          delete item.picked_qty;
          delete item.substitute;
          soldOutProductId = b.mark_sold_out ? Number(item.id) : null;
        } else if (action === 'substitute') {
          const s = b.substitute || {};
          const sq = num(s.qty);
          const sp = num(s.price);
          if (!s.name || !(sq > 0) || !(sp >= 0)) {
            throw Object.assign(new Error('Choose a substitute item and amount.'), { status: 400 });
          }
          item.pick_status = 'substituted';
          delete item.picked_qty;
          item.substitute = {
            product_id: s.product_id ? Number(s.product_id) : null,
            name: String(s.name).slice(0, 200),
            qty: Math.round(sq * 100) / 100,
            price: sp,
            unit: String(s.unit || '').slice(0, 20),
          };
          soldOutProductId = b.mark_sold_out ? Number(item.id) : null;
        } else if (action === 'reset') {
          item.pick_status = 'pending';
          delete item.picked_qty;
          delete item.substitute;
        } else {
          throw Object.assign(new Error('Unknown item action'), { status: 400 });
        }

        if (b.note !== undefined) item.note = String(b.note).slice(0, 200);

        const patch = { items, ...computeAdjusted(items) };
        // Touching an item means picking has started.
        if (order.status === 'New') patch.status = 'Preparing';
        return patch;
      });

      if (soldOutProductId) {
        try {
          await supabaseFetch(`products?id=eq.${soldOutProductId}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ stock: 0, updated_at: new Date().toISOString() }),
          });
        } catch (e) {
          console.error('staff-update-order: could not mark sold out', e);
        }
      }
    } else if (op === 'status') {
      const status = String(b.status || '');
      if (!STAFF_STATUSES.includes(status)) throw Object.assign(new Error('Invalid status'), { status: 400 });
      result = await patchWithRetry(id, (order) => {
        assertNotOnHold(order);
        if (!EDITABLE.includes(order.status) && order.status !== 'Completed') {
          throw Object.assign(new Error(`This order is ${order.status} and can't be changed here.`), { status: 400 });
        }
        const items = Array.isArray(order.items) ? order.items : [];
        if (status === 'Ready for Pickup' || status === 'Completed') {
          const pending = items.filter((it) => !it.pick_status || it.pick_status === 'pending').length;
          if (pending) {
            throw Object.assign(
              new Error(`${pending} item${pending === 1 ? '' : 's'} still need to be picked, substituted, or marked unavailable.`),
              { status: 400 }
            );
          }
        }
        if (status === 'Completed' && order.status !== 'Ready for Pickup') {
          throw Object.assign(new Error('Mark the order Ready for Pickup first.'), { status: 400 });
        }
        return { status, ...computeAdjusted(items) };
      });
    } else if (op === 'notes') {
      result = await patchWithRetry(id, () => ({ staff_notes: String(b.staff_notes || '').slice(0, 1000) }));
    } else {
      throw Object.assign(new Error('Unknown operation'), { status: 400 });
    }

    const rows = await supabaseFetch(`orders?id=eq.${id}&select=${ORDER_COLUMNS}`);
    const [order] = await shapeOrders(rows || []);
    return json(200, { ok: true, order });
  } catch (e) {
    console.error('staff-update-order', e);
    return json(e.status || 400, { error: e.message || 'Unable to update order' });
  }
};

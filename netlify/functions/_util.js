const crypto = require('crypto');

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

// Flat estimated tax rate used for order totals (checkout and GIF's
// adjusted totals both read it from here so they can never disagree).
const TAX_RATE = 0.03;

// Cancellation / refund policy. Everything below is enforced on the server,
// so no screen (or tampered request) can bypass it.
const CANCEL_WINDOW_MINUTES = 5;   // customers may ask to cancel within this long of the order being placed
const CANCEL_GRACE_SECONDS = 30;   // small allowance for slow phones/networks right at the deadline
const REFUND_WINDOW_DAYS = 7;      // customers may ask for a refund within this long after pickup
// Statuses in which a customer may still ask to cancel.
const CANCELLABLE_STATUSES = ['New', 'Preparing', 'Ready for Pickup', 'Paid - Preparing'];

// How long an "as soon as possible" order is expected to take to prepare.
// Used to work out when it's due, for GIF's priority sorting.
const ASAP_PREP_MINUTES = 45;

function json(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

// Constant-time comparison so a token check can't be sped up by an
// attacker measuring how long a mismatched-character comparison takes.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length so the response time doesn't
    // leak the correct token's length.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function header(event, name) {
  const h = event.headers || {};
  return h[name] || h[name.toLowerCase()] || '';
}

// Every owner-only function (products, settings, payments, ...) calls this
// first. Requires an ADMIN_TOKEN environment variable — if it's missing,
// these endpoints refuse to run rather than silently allowing access.
function requireAdmin(event) {
  const configured = process.env.ADMIN_TOKEN;
  const provided = header(event, 'x-admin-token');
  if (!configured) return { ok: false, response: json(500, { error: 'Server is missing the ADMIN_TOKEN environment variable.' }) };
  if (!safeEqual(provided, configured)) return { ok: false, response: json(401, { error: 'Unauthorized' }) };
  return { ok: true };
}

// Used by the GIF staff app. Workers sign in with STAFF_TOKEN, which only
// unlocks the staff-* functions (picking orders) — it can't edit products,
// prices, settings or payments, because those check requireAdmin above.
// The owner's ADMIN_TOKEN is also accepted so the owner can sign into GIF
// too (and so GIF still works before STAFF_TOKEN has been set up).
function requireStaff(event) {
  const staffToken = process.env.STAFF_TOKEN;
  const adminToken = process.env.ADMIN_TOKEN;
  if (!staffToken && !adminToken) {
    return { ok: false, response: json(500, { error: 'Server is missing the STAFF_TOKEN environment variable.' }) };
  }
  const provided = header(event, 'x-staff-token') || header(event, 'x-admin-token');
  const okStaff = staffToken ? safeEqual(provided, staffToken) : false;
  const okAdmin = adminToken ? safeEqual(provided, adminToken) : false;
  if (!okStaff && !okAdmin) return { ok: false, response: json(401, { error: 'Unauthorized' }) };
  return { ok: true, isAdmin: okAdmin };
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  return { url: url.replace(/\/+$/, ''), serviceKey };
}

// Thin wrapper around the Supabase REST API using the service-role key.
// Never call this from anything the browser can trigger without a token
// check first — the service-role key bypasses row level security.
async function supabaseFetch(path, options = {}) {
  const { url, serviceKey } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Supabase request failed (${res.status})`);
  return text ? JSON.parse(text) : null;
}

// Thin wrapper around Supabase's Storage REST API (different endpoint than
// the Postgres REST API above) using the service-role key. Uploads a file
// buffer to a bucket and returns its public URL.
async function supabaseStorageUpload(bucket, path, buffer, contentType) {
  const { url, serviceKey } = supabaseConfig();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Storage upload failed (${res.status})`);
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

const round2 = (n) => Math.round(n * 100) / 100;

// ---------- inventory helpers (shared by checkout, cancel, GIF, reconcile) ----------

// Adds `qty` back to a product's stock. Products with untracked stock
// (stock = null) are left alone.
async function restoreStock(id, qty) {
  const rows = await supabaseFetch(`products?id=eq.${id}&select=stock`);
  const current = rows && rows[0] ? rows[0].stock : null;
  if (current == null) return;
  await supabaseFetch(`products?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ stock: round2(Number(current) + Number(qty)) }),
  });
}

// Gives back everything an order had reserved.
async function restoreOrderStock(items) {
  for (const item of items || []) {
    if (item && item.id && item.qty) {
      try {
        await restoreStock(Number(item.id), Number(item.qty));
      } catch (e) {
        console.error('restoreOrderStock failed', item, e);
      }
    }
  }
}

// Works out what an order is worth now, given what staff actually picked:
// picked items at the picked weight, substitutes at their own price,
// unavailable items at nothing, and untouched items as originally ordered.
function computeAdjusted(items) {
  let subtotal = 0;
  for (const it of items || []) {
    const price = Number(it.price) || 0;
    const status = it.pick_status || 'pending';
    if (status === 'unavailable') continue;
    if (status === 'substituted') {
      const sub = it.substitute || {};
      subtotal += (Number(sub.price) || 0) * (Number(sub.qty) || 0);
    } else if (status === 'picked') {
      const q = it.picked_qty != null ? Number(it.picked_qty) : Number(it.qty);
      subtotal += price * (Number.isFinite(q) ? q : 0);
    } else {
      subtotal += price * (Number(it.qty) || 0);
    }
  }
  const sub = round2(subtotal);
  return { adjusted_subtotal: sub, adjusted_total: round2(sub + sub * TAX_RATE) };
}

// Seconds left in the customer's cancellation window (0 once it has closed).
function cancelSecondsLeft(order, nowMs = Date.now()) {
  const placed = new Date(order.placed_at || order.created_at).getTime();
  return Math.max(0, Math.round((CANCEL_WINDOW_MINUTES * 60000 - (nowMs - placed)) / 1000));
}

module.exports = {
  cancelSecondsLeft,
  CANCEL_WINDOW_MINUTES,
  CANCEL_GRACE_SECONDS,
  REFUND_WINDOW_DAYS,
  CANCELLABLE_STATUSES,
  json,
  safeEqual,
  requireAdmin,
  requireStaff,
  supabaseFetch,
  supabaseStorageUpload,
  restoreStock,
  restoreOrderStock,
  computeAdjusted,
  round2,
  TAX_RATE,
  ASAP_PREP_MINUTES,
  JSON_HEADERS,
};

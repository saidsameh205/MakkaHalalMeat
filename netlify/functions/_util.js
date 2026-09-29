const crypto = require('crypto');

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

// Flat estimated tax rate used for order totals (checkout and GIF's
// adjusted totals both read it from here so they can never disagree).
const FOOD_TAX_RATE = 0.03;
const NONFOOD_TAX_RATE = 0.08;
const TAX_RATE = FOOD_TAX_RATE; // kept as an alias — some older code/orders assume one flat rate

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

// ---------- signed sessions (staff PINs, and now customer accounts) ----------
const SESSION_HOURS = 16;          // staff shift length; sign in again next day
const CUSTOMER_SESSION_DAYS = 30;  // customers stay signed in much longer
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (str) => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// Sessions are signed with a key derived from ADMIN_TOKEN, so there is no
// extra secret to set up. (Changing ADMIN_TOKEN signs everyone out.) `kind`
// keeps different session types cryptographically separate — a customer
// token is signed with a different salt than a staff token, so one can
// never be forged into or mistaken for the other, even though they share
// the same root secret.
function sessionKey(kind) {
  const a = process.env.ADMIN_TOKEN;
  if (!a) return null;
  return crypto.createHmac('sha256', a).update(`${kind}-session-v1`).digest();
}
function signSession(payload, kind = 'gif') {
  const key = sessionKey(kind);
  if (!key) throw new Error('Server is missing the ADMIN_TOKEN environment variable.');
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', key).update(body).digest());
  const prefix = kind === 'gif' ? 'gif1' : `${kind}1`;
  return `${prefix}.${body}.${sig}`;
}
// -> payload | { expired: true } | null (not a valid session token)
function verifySession(token, kind = 'gif') {
  const prefix = kind === 'gif' ? 'gif1' : `${kind}1`;
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== prefix) return null;
  const key = sessionKey(kind);
  if (!key) return null;
  const expected = b64url(crypto.createHmac('sha256', key).update(parts[1]).digest());
  if (!safeEqual(parts[2], expected)) return null;
  let payload;
  try { payload = JSON.parse(unb64url(parts[1]).toString('utf8')); } catch (e) { return null; }
  if (!payload || !payload.sid || !payload.exp) return null;
  if (Date.now() > payload.exp) return { expired: true };
  return payload;
}

// Salted scrypt hash — nobody (including the store) can look a PIN or
// password back up, only reset it. Generic: used for staff PINs and
// customer passwords alike.
function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32);
  return `s1$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPin(pin, stored) {
  const [v, salt, hash] = String(stored || '').split('$');
  const want = v === 's1' && salt && hash ? Buffer.from(hash, 'base64') : Buffer.alloc(32);
  const got = crypto.scryptSync(String(pin || ''), v === 's1' && salt ? Buffer.from(salt, 'base64') : Buffer.alloc(16), 32);
  return v === 's1' && crypto.timingSafeEqual(got, want);
}
const hashPassword = hashPin, checkPassword = checkPin; // same scrypt hashing, clearer names for account code
function generatePin() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
// Rejects PINs that are obvious to guess (1111, 1234, 654321 ...).
function isWeakPin(pin) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const step = d[1] - d[0];
  return (step === 1 || step === -1) && d.every((n, i) => i === 0 || n - d[i - 1] === step);
}
// A one-way-hashed, one-time token for "forgot password" email links —
// same idea as a PIN: only its hash is ever stored, so a leaked database
// can't be used to reset anyone's password.
function generateResetToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashResetToken(token) { return crypto.createHash('sha256').update(String(token)).digest('base64url'); }
// A simple, honest password rule: long enough to matter, nothing clever
// that just annoys people into writing it on a sticky note.
function isWeakPassword(pw) {
  return String(pw || '').length < 8;
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// Used by the GIF staff app. A caller may present:
//   - a personal session token (from staff-login: name + PIN)  -> that person
//   - the shared STAFF_TOKEN                                     -> "Shared staff code"
//   - the owner's ADMIN_TOKEN                                    -> admin
// Personal sessions are re-checked against the team list on EVERY request, so
// turning someone off (or removing them) locks them out immediately.
// Only staff-* functions use this; products, prices, settings and payments
// use requireAdmin, which a worker's session can never satisfy.
async function requireStaff(event) {
  const provided = header(event, 'x-staff-token') || header(event, 'x-admin-token');
  const unauthorized = (msg) => ({ ok: false, response: json(401, { error: msg || 'Unauthorized' }) });
  if (!provided) return unauthorized();

  if (provided.startsWith('gif1.')) {
    const session = verifySession(provided);
    if (!session) return unauthorized();
    if (session.expired) return unauthorized('Your session ended — please sign in again.');
    let row = null;
    try {
      const rows = await supabaseFetch(`staff?id=eq.${encodeURIComponent(session.sid)}&select=id,name,active,can_approve,sessions_valid_after`);
      row = rows && rows[0];
    } catch (e) {
      console.error('requireStaff: team lookup failed', e);
      return { ok: false, response: json(500, { error: 'Unable to check your sign-in right now.' }) };
    }
    if (!row || !row.active) return unauthorized('Your access has been turned off. Ask the store admin.');
    // Turning someone off, or resetting their PIN, ends every session issued before that moment.
    if (row.sessions_valid_after && (session.iat || 0) < new Date(row.sessions_valid_after).getTime()) {
      return unauthorized('Your session ended — please sign in again.');
    }
    return { ok: true, isAdmin: !!row.can_approve, staffId: row.id, staffName: row.name };
  }

  const staffToken = process.env.STAFF_TOKEN;
  const adminToken = process.env.ADMIN_TOKEN;
  if (!staffToken && !adminToken) {
    return { ok: false, response: json(500, { error: 'Server is missing the STAFF_TOKEN environment variable.' }) };
  }
  if (adminToken && safeEqual(provided, adminToken)) return { ok: true, isAdmin: true, staffName: 'Admin' };
  if (staffToken && safeEqual(provided, staffToken)) return { ok: true, isAdmin: false, staffName: 'Shared staff code' };
  return unauthorized();
}

// Used by account-only customer endpoints (profile, order history tied to
// the account). Presented as a 'cust1.' session token from customer-login
// or customer-signup. Re-checked against the customers table on every
// request, same reasoning as staff: a password reset or account deactivation
// takes effect immediately, not just on next login.
async function requireCustomer(event) {
  const provided = header(event, 'x-customer-token');
  const unauthorized = (msg) => ({ ok: false, response: json(401, { error: msg || 'Unauthorized' }) });
  if (!provided) return unauthorized();

  const session = verifySession(provided, 'cust');
  if (!session) return unauthorized();
  if (session.expired) return unauthorized('Your session ended — please sign in again.');

  let row = null;
  try {
    const rows = await supabaseFetch(`customers?id=eq.${encodeURIComponent(session.sid)}&select=id,email,name,phone,active,sessions_valid_after`);
    row = rows && rows[0];
  } catch (e) {
    console.error('requireCustomer: lookup failed', e);
    return { ok: false, response: json(500, { error: 'Unable to check your sign-in right now.' }) };
  }
  if (!row || !row.active) return unauthorized('This account is no longer active.');
  if (row.sessions_valid_after && (session.iat || 0) < new Date(row.sessions_valid_after).getTime()) {
    return unauthorized('Your session ended — please sign in again.');
  }
  return { ok: true, customerId: row.id, email: row.email, name: row.name, phone: row.phone };
}

// Adds one line to an order's activity log (who did what), keeping the last 80.
function appendEvent(events, by, what) {
  const list = Array.isArray(events) ? events.slice(-79) : [];
  list.push({ at: new Date().toISOString(), by: by || 'Staff', what: String(what).slice(0, 160) });
  return list;
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
// Each item carries its own tax_rate (food 3% / non-food 8%), snapshotted at
// checkout — same reasoning as price/name: a later change to a product's
// category should never rewrite the tax on an order already placed. Orders
// from before this feature existed have no tax_rate on their items, so they
// fall back to the old flat food rate (which is what they were actually charged).
function computeAdjusted(items) {
  let subtotal = 0, tax = 0;
  for (const it of items || []) {
    const price = Number(it.price) || 0;
    const rate = it.tax_rate != null ? Number(it.tax_rate) : FOOD_TAX_RATE;
    const status = it.pick_status || 'pending';
    let amount = 0;
    if (status === 'unavailable') {
      amount = 0;
    } else if (status === 'substituted') {
      const sub = it.substitute || {};
      amount = (Number(sub.price) || 0) * (Number(sub.qty) || 0);
    } else if (status === 'picked') {
      const q = it.picked_qty != null ? Number(it.picked_qty) : Number(it.qty);
      amount = price * (Number.isFinite(q) ? q : 0);
    } else {
      amount = price * (Number(it.qty) || 0);
    }
    subtotal += amount;
    tax += amount * rate;
  }
  const sub = round2(subtotal);
  return { adjusted_subtotal: sub, adjusted_total: round2(sub + round2(tax)) };
}

// Seconds left in the customer's cancellation window (0 once it has closed).
function cancelSecondsLeft(order, nowMs = Date.now()) {
  const placed = new Date(order.placed_at || order.created_at).getTime();
  return Math.max(0, Math.round((CANCEL_WINDOW_MINUTES * 60000 - (nowMs - placed)) / 1000));
}

module.exports = {
  FOOD_TAX_RATE,
  NONFOOD_TAX_RATE,
  SESSION_HOURS,
  CUSTOMER_SESSION_DAYS,
  signSession,
  verifySession,
  hashPin,
  checkPin,
  hashPassword,
  checkPassword,
  generatePin,
  isWeakPin,
  generateResetToken,
  hashResetToken,
  isWeakPassword,
  isValidEmail,
  appendEvent,
  cancelSecondsLeft,
  CANCEL_WINDOW_MINUTES,
  CANCEL_GRACE_SECONDS,
  REFUND_WINDOW_DAYS,
  CANCELLABLE_STATUSES,
  json,
  safeEqual,
  requireAdmin,
  requireStaff,
  requireCustomer,
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

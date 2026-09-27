const crypto = require('crypto');

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function json(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

// Constant-time comparison so an admin token check can't be sped up by an
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

// Every admin-only function calls this first. Requires an ADMIN_TOKEN
// environment variable to be set in Netlify — if it's missing, admin
// endpoints refuse to run rather than silently allowing access.
function requireAdmin(event) {
  const configured = String(process.env.ADMIN_TOKEN || process.env.ADMIN_CAPTURE_TOKEN || '').trim();
  const headers = event.headers || {};
  const provided = String(headers['x-admin-token'] || headers['X-Admin-Token'] || headers['X-ADMIN-TOKEN'] || '').trim();

  if (!configured) return { ok: false, response: json(500, {
    error: 'ADMIN_TOKEN is not available to this Netlify Function.',
    code: 'ADMIN_TOKEN_MISSING'
  }) };

  if (!safeEqual(provided, configured)) return { ok: false, response: json(401, {
    error: 'The admin token does not match the token configured in Netlify.',
    code: 'ADMIN_TOKEN_INVALID'
  }) };

  return { ok: true };
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  return { url: url.replace(/\/+$/, ''), serviceKey };
}

// Thin wrapper around the Supabase REST API using the service-role key.
// Never call this from anything the browser can trigger without an admin
// token check first — the service-role key bypasses row level security.
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

module.exports = { json, safeEqual, requireAdmin, supabaseFetch, JSON_HEADERS };

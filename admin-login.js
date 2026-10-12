const { json, safeEqual, signSession } = require('./_util');
const attempts = new Map();
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'])) || 'unknown';
  const key = String(ip).split(',')[0].slice(0, 80);
  const now = Date.now();
  const a = attempts.get(key) || { count: 0, reset: now + 15 * 60000 };
  if (a.reset < now) { a.count = 0; a.reset = now + 15 * 60000; }
  if (a.count >= 10) return json(429, { error: 'Too many attempts. Try again later.' });
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !process.env.ADMIN_TOKEN) return json(503, { error: 'Admin login is not configured. Set ADMIN_PASSWORD and ADMIN_TOKEN in Netlify.' });
  let supplied = '';
  try { supplied = String(JSON.parse(event.body || '{}').password || ''); } catch (_) {}
  if (!supplied || !safeEqual(supplied, password)) {
    a.count++; attempts.set(key, a);
    return json(401, { error: 'Incorrect password.' });
  }
  attempts.delete(key);
  return json(200, { token: signSession({ sid: 'owner', iat: now, exp: now + 8 * 3600000 }, 'admin') });
};

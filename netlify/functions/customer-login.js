const { json, supabaseFetch, checkPassword, signSession, CUSTOMER_SESSION_DAYS } = require('./_util');

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;
const GENERIC = 'Incorrect email or password.';

// Public (no token). Five wrong tries in a row locks that account for 15
// minutes — same reasoning as staff PINs: guessing a password by brute
// force should be slow and get noticed, not just rate-limited quietly.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const emailKey = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!emailKey || !password) return json(400, { error: 'Enter your email and password.' });

    const rows = await supabaseFetch(
      `customers?email_key=eq.${encodeURIComponent(emailKey)}&select=id,email,name,phone,password_hash,active,failed_attempts,locked_until`
    );
    const person = rows && rows[0];

    if (!person) {
      checkPassword(password, 'none'); // burn the same time as a real check, so timing doesn't reveal who has an account
      return json(401, { error: GENERIC });
    }
    if (!person.active) return json(401, { error: 'This account is no longer active. Contact the store for help.' });

    const now = Date.now();
    if (person.locked_until && new Date(person.locked_until).getTime() > now) {
      const mins = Math.max(1, Math.ceil((new Date(person.locked_until).getTime() - now) / 60000));
      return json(429, { error: `Too many wrong tries. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or reset your password.` });
    }

    if (!checkPassword(password, person.password_hash)) {
      const fails = (person.failed_attempts || 0) + 1;
      if (fails >= MAX_TRIES) {
        await supabaseFetch(`customers?id=eq.${person.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ failed_attempts: 0, locked_until: new Date(now + LOCK_MINUTES * 60000).toISOString() }),
        });
        return json(429, { error: `Too many wrong tries. Locked for ${LOCK_MINUTES} minutes, or reset your password.` });
      }
      await supabaseFetch(`customers?id=eq.${person.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ failed_attempts: fails }),
      });
      return json(401, { error: GENERIC });
    }

    await supabaseFetch(`customers?id=eq.${person.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ failed_attempts: 0, locked_until: null, last_login_at: new Date(now).toISOString() }),
    });

    const expires = now + CUSTOMER_SESSION_DAYS * 86400000;
    const token = signSession({ sid: person.id, iat: now, exp: expires }, 'cust');
    return json(200, { token, name: person.name || '', email: person.email, phone: person.phone || '' });
  } catch (e) {
    console.error('customer-login', e);
    return json(500, { error: 'Unable to sign in right now.' });
  }
};

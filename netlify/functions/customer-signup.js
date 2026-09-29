const {
  json,
  supabaseFetch,
  hashPassword,
  isWeakPassword,
  isValidEmail,
  signSession,
  CUSTOMER_SESSION_DAYS,
} = require('./_util');

const GENERIC_EMAIL_ERROR = 'That email is already registered. Try signing in instead.';

// Public (no token) — anyone can create an account. Guest checkout still
// works without one; this is purely optional, for customers who want their
// order history and to stay signed in.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const email = String(b.email || '').trim();
    const password = String(b.password || '');
    const name = String(b.name || '').trim().slice(0, 60);
    const phone = String(b.phone || '').trim().slice(0, 30);

    if (!isValidEmail(email)) return json(400, { error: 'Enter a valid email address.' });
    if (isWeakPassword(password)) return json(400, { error: 'Password must be at least 8 characters.' });

    const emailKey = email.toLowerCase();
    const existing = await supabaseFetch(`customers?email_key=eq.${encodeURIComponent(emailKey)}&select=id`);
    if (existing && existing.length) return json(409, { error: GENERIC_EMAIL_ERROR });

    let rows;
    try {
      rows = await supabaseFetch('customers', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          email,
          email_key: emailKey,
          password_hash: hashPassword(password),
          name,
          phone,
          active: true,
          last_login_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      // Two signups for the same email landing at nearly the same instant:
      // the database's unique index is the real guarantee, this check above
      // is just the common-case fast path.
      if (String(e.message || '').includes('duplicate') || String(e.message || '').includes('idx_customers_email_key')) {
        return json(409, { error: GENERIC_EMAIL_ERROR });
      }
      throw e;
    }
    const customer = rows && rows[0];
    if (!customer) throw new Error('Account was not created');

    const now = Date.now();
    const expires = now + CUSTOMER_SESSION_DAYS * 86400000;
    const token = signSession({ sid: customer.id, iat: now, exp: expires }, 'cust');

    return json(201, { token, name: customer.name || '', email: customer.email, phone: customer.phone || '' });
  } catch (e) {
    console.error('customer-signup', e);
    return json(500, { error: 'Unable to create your account right now.' });
  }
};

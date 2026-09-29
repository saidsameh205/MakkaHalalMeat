const { json, supabaseFetch, hashResetToken, hashPassword, isWeakPassword, safeEqual } = require('./_util');

// Public (no token — the reset token itself IS the credential). One-time
// use, short expiry, and resetting always signs out every session issued
// before this moment, same reasoning as a PIN reset for staff.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const email = String(b.email || '').trim().toLowerCase();
    const token = String(b.token || '');
    const newPassword = String(b.new_password || '');
    if (!email || !token) return json(400, { error: 'This reset link is invalid.' });
    if (isWeakPassword(newPassword)) return json(400, { error: 'Password must be at least 8 characters.' });

    const rows = await supabaseFetch(
      `customers?email_key=eq.${encodeURIComponent(email)}&select=id,reset_token_hash,reset_token_expires`
    );
    const person = rows && rows[0];
    if (!person || !person.reset_token_hash) return json(400, { error: 'This reset link is invalid or has already been used.' });
    if (!person.reset_token_expires || new Date(person.reset_token_expires) < new Date()) {
      return json(400, { error: 'This reset link has expired. Request a new one.' });
    }
    if (!safeEqual(hashResetToken(token), person.reset_token_hash)) {
      return json(400, { error: 'This reset link is invalid or has already been used.' });
    }

    const nowIso = new Date().toISOString();
    // Guarded on the token hash still matching, so a reset link can never be used twice.
    const saved = await supabaseFetch(`customers?id=eq.${person.id}&reset_token_hash=eq.${encodeURIComponent(person.reset_token_hash)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        password_hash: hashPassword(newPassword),
        reset_token_hash: null,
        reset_token_expires: null,
        failed_attempts: 0,
        locked_until: null,
        sessions_valid_after: nowIso,
      }),
    });
    if (!saved || !saved.length) return json(400, { error: 'This reset link was already used.' });

    return json(200, { ok: true });
  } catch (e) {
    console.error('customer-reset-password', e);
    return json(500, { error: 'Unable to reset your password right now.' });
  }
};

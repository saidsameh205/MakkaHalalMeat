const { json, supabaseFetch, checkPin, signSession, SESSION_HOURS } = require('./_util');

const MAX_TRIES = 5;      // wrong PINs allowed in a row
const LOCK_MINUTES = 15;  // then that person is locked out for this long

const GENERIC = "That name or PIN isn't right.";

// Public (no token): an associate proves who they are with their name and
// personal PIN and receives a signed session for the shift.
//  - PINs are checked against a salted hash; they are never stored or sent back.
//  - Five wrong tries in a row lock that person out for 15 minutes, so a PIN
//    can't be guessed by trying them all. (The admin can unlock instantly.)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const nameKey = String(b.name || '').trim().toLowerCase();
    const pin = String(b.pin || '').trim();
    if (!nameKey || !pin) return json(400, { error: 'Enter your name and PIN.' });

    const rows = await supabaseFetch(
      `staff?name_key=eq.${encodeURIComponent(nameKey)}&select=id,name,pin_hash,active,can_approve,failed_attempts,locked_until`
    );
    const person = rows && rows[0];

    if (!person) {
      checkPin(pin, 'none'); // burn the same time as a real check so timing doesn't reveal who exists
      return json(401, { error: GENERIC });
    }
    if (!person.active) return json(401, { error: 'This account is turned off. Ask the store admin.' });

    const now = Date.now();
    if (person.locked_until && new Date(person.locked_until).getTime() > now) {
      const mins = Math.max(1, Math.ceil((new Date(person.locked_until).getTime() - now) / 60000));
      return json(429, { error: `Too many wrong tries. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or ask the store admin to unlock you.` });
    }

    if (!checkPin(pin, person.pin_hash)) {
      const fails = (person.failed_attempts || 0) + 1;
      if (fails >= MAX_TRIES) {
        await supabaseFetch(`staff?id=eq.${person.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ failed_attempts: 0, locked_until: new Date(now + LOCK_MINUTES * 60000).toISOString() }),
        });
        return json(429, { error: `Too many wrong tries. Locked for ${LOCK_MINUTES} minutes — or ask the store admin to unlock you.` });
      }
      await supabaseFetch(`staff?id=eq.${person.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ failed_attempts: fails }),
      });
      return json(401, { error: `${GENERIC} ${MAX_TRIES - fails} ${MAX_TRIES - fails === 1 ? 'try' : 'tries'} left.` });
    }

    await supabaseFetch(`staff?id=eq.${person.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ failed_attempts: 0, locked_until: null, last_login_at: new Date(now).toISOString() }),
    });

    const expires = now + SESSION_HOURS * 3600 * 1000;
    const token = signSession({ sid: person.id, iat: now, exp: expires });
    return json(200, { token, name: person.name, is_admin: !!person.can_approve, expires_at: new Date(expires).toISOString() });
  } catch (e) {
    console.error('staff-login', e);
    return json(500, { error: 'Unable to sign in right now.' });
  }
};

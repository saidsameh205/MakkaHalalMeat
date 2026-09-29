const { json, supabaseFetch, generateResetToken, hashResetToken, isValidEmail } = require('./_util');

const RESET_WINDOW_MINUTES = 30;

async function sendResetEmail(toEmail, toName, resetUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Makka Halal Meat <onboarding@resend.dev>';
  if (!apiKey) return { sent: false, reason: 'not_configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: toEmail,
      subject: 'Reset your Makka Halal Meat password',
      html: `<p>Hi${toName ? ' ' + toName : ''},</p>
        <p>Tap the link below to set a new password. It works for ${RESET_WINDOW_MINUTES} minutes.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn't ask for this, you can ignore this email — your password stays the same.</p>`,
    }),
  });
  if (!res.ok) {
    console.error('sendResetEmail failed', res.status, await res.text().catch(() => ''));
    return { sent: false, reason: 'send_failed' };
  }
  return { sent: true };
}

// Public (no token). Always answers the same way regardless of whether the
// email has an account — never confirm or deny which emails are
// registered. The one exception: while Resend isn't connected yet, this
// says so plainly instead of pretending an email went out, because that
// would leave someone stuck with no way to recover their account and no
// idea why.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const email = String(b.email || '').trim();
    if (!isValidEmail(email)) return json(400, { error: 'Enter a valid email address.' });

    if (!process.env.RESEND_API_KEY) {
      return json(200, {
        ok: true,
        emailed: false,
        message: "Password reset emails aren't set up yet — please contact the store to reset your password.",
      });
    }

    const emailKey = email.toLowerCase();
    const rows = await supabaseFetch(`customers?email_key=eq.${encodeURIComponent(emailKey)}&select=id,email,name,active`);
    const person = rows && rows[0];

    // Same response whether or not the account exists (only skip sending).
    if (person && person.active) {
      const token = generateResetToken();
      const expires = new Date(Date.now() + RESET_WINDOW_MINUTES * 60000).toISOString();
      await supabaseFetch(`customers?id=eq.${person.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ reset_token_hash: hashResetToken(token), reset_token_expires: expires }),
      });
      const site = process.env.URL || `https://${event.headers.host}`;
      const resetUrl = `${site}/?reset=${encodeURIComponent(token)}&email=${encodeURIComponent(person.email)}`;
      await sendResetEmail(person.email, person.name, resetUrl);
    }

    return json(200, { ok: true, emailed: true, message: 'If that email has an account, a reset link is on its way.' });
  } catch (e) {
    console.error('customer-forgot-password', e);
    return json(500, { error: 'Unable to send a reset link right now.' });
  }
};

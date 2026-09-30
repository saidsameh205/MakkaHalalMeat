const { json, supabaseFetch, generateResetToken, hashResetToken, isValidEmail } = require('./_util');

const RESET_WINDOW_MINUTES = 30;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@makkahalalmeat.com';

// Shared branded email template — every email we send looks consistent and professional.
// Customers will immediately recognise it as Makka rather than a generic system message.
function brandedEmail({ title, preheader, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;padding:0;background:#F6F3EE;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrap{max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
  .header{background:#C0272D;padding:28px 32px;text-align:center;}
  .header h1{margin:0;color:#fff;font-size:1.25rem;letter-spacing:-.01em;}
  .header p{margin:4px 0 0;color:rgba(255,255,255,.8);font-size:.82rem;}
  .body{padding:32px;}
  .body p{margin:0 0 16px;color:#3a3028;font-size:.95rem;line-height:1.6;}
  .btn{display:inline-block;background:#C0272D;color:#fff !important;text-decoration:none;padding:13px 28px;border-radius:999px;font-weight:700;font-size:.95rem;margin:8px 0 16px;}
  .footer{background:#F6F3EE;padding:20px 32px;text-align:center;color:#9A8F84;font-size:.78rem;line-height:1.5;}
  .footer a{color:#9A8F84;}
  .divider{border:none;border-top:1px solid #F0EBE4;margin:24px 0;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>★ Makka Halal Meat</h1>
    <p>431 N Indian Creek Dr, Clarkston, GA 30021</p>
  </div>
  <div class="body">${bodyHtml}</div>
  <div class="footer">
    <p>Makka Halal Meat, Inc. · 431 N Indian Creek Dr, Clarkston, GA 30021<br>
    📞 404-297-0008 · Tue–Sun 11 AM–6:30 PM · Monday closed</p>
    <p>Questions? Reply to this email or contact us at
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
  </div>
</div>
</body></html>`;
}

async function sendEmail({ to, subject, bodyHtml, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || `Makka Halal Meat <${SUPPORT_EMAIL}>`;
  if (!apiKey) return { sent: false, reason: 'not_configured' };

  const payload = { from, to, subject,
    html: brandedEmail({ title: subject, preheader: subject, bodyHtml }),
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error('sendEmail failed', res.status, await res.text().catch(() => ''));
    return { sent: false, reason: 'send_failed' };
  }
  return { sent: true };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const email = String(b.email || '').trim();
    if (!isValidEmail(email)) return json(400, { error: 'Enter a valid email address.' });

    if (!process.env.RESEND_API_KEY) {
      return json(200, {
        ok: true, emailed: false,
        message: "Password reset emails aren't set up yet — please contact the store to reset your password.",
      });
    }

    const emailKey = email.toLowerCase();
    const rows = await supabaseFetch(`customers?email_key=eq.${encodeURIComponent(emailKey)}&select=id,email,name,active`);
    const person = rows && rows[0];

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

      await sendEmail({
        to: person.email,
        subject: 'Reset your Makka Halal Meat password',
        bodyHtml: `
          <p>Hi${person.name ? ' <strong>' + person.name + '</strong>' : ''},</p>
          <p>We received a request to reset the password for your Makka Halal Meat account.</p>
          <p>Tap the button below to set a new password. This link works for <strong>${RESET_WINDOW_MINUTES} minutes</strong> and can only be used once.</p>
          <p style="text-align:center;"><a class="btn" href="${resetUrl}">Reset my password</a></p>
          <hr class="divider">
          <p style="font-size:.82rem;color:#9A8F84;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
      });
    }

    return json(200, { ok: true, emailed: true, message: 'If that email has an account, a reset link is on its way.' });
  } catch (e) {
    console.error('customer-forgot-password', e);
    return json(500, { error: 'Unable to send a reset link right now.' });
  }
};

// Export sendEmail so other functions (support contact) can reuse the same template
module.exports.sendEmail = sendEmail;
module.exports.brandedEmail = brandedEmail;

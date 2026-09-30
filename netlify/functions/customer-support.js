const { json, isValidEmail } = require('./_util');
const { sendEmail } = require('./customer-forgot-password');

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@makkahalalmeat.com';
const MAX_MESSAGE_LEN = 2000;

// Public — no account required to contact support. Rate-limited by the
// customer's email being visible to the store, so abuse is self-limiting.
// Sends two emails:
//   1. To the store (the actual support request, with all context)
//   2. To the customer (a confirmation so they know it was received)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  if (!process.env.RESEND_API_KEY) {
    // Graceful fallback before Resend is configured: tell the customer
    // the email address directly instead of silently failing.
    return json(200, {
      ok: false,
      fallback: true,
      message: `Email sending isn't set up yet. Please email us directly at ${SUPPORT_EMAIL}`,
    });
  }

  try {
    const b = JSON.parse(event.body || '{}');
    const customerEmail = String(b.email || '').trim();
    const customerName = String(b.name || '').trim().slice(0, 60) || 'A customer';
    const subject = String(b.subject || 'Support Inquiry').trim().slice(0, 120);
    const message = String(b.message || '').trim().slice(0, MAX_MESSAGE_LEN);
    const orderCode = String(b.order_code || '').trim().slice(0, 30);
    const type = String(b.type || 'general').trim(); // 'order' | 'general'

    if (!isValidEmail(customerEmail)) return json(400, { error: 'Enter a valid email address so we can reply to you.' });
    if (!message) return json(400, { error: 'Please describe what you need help with.' });

    const orderLine = orderCode ? `<p><strong>Order:</strong> ${orderCode}</p>` : '';
    const typeLabel = type === 'order' ? 'Order Support' : 'General Inquiry';

    // 1. Email to the store
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[${typeLabel}] ${subject} — from ${customerName}`,
      replyTo: customerEmail,
      bodyHtml: `
        <p><strong>New ${typeLabel.toLowerCase()} from the Makka app:</strong></p>
        <table style="border-collapse:collapse;width:100%;font-size:.9rem;">
          <tr><td style="padding:6px 0;color:#9A8F84;width:90px;">From</td><td style="padding:6px 0;"><strong>${customerName}</strong> &lt;${customerEmail}&gt;</td></tr>
          ${orderLine ? `<tr><td style="padding:6px 0;color:#9A8F84;">Order</td><td style="padding:6px 0;">${orderCode}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#9A8F84;">Subject</td><td style="padding:6px 0;">${subject}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #F0EBE4;margin:16px 0;">
        <p style="white-space:pre-wrap;">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
        <hr style="border:none;border-top:1px solid #F0EBE4;margin:16px 0;">
        <p style="font-size:.82rem;color:#9A8F84;">Reply directly to this email to respond to the customer.</p>`,
    });

    // 2. Confirmation email to the customer
    await sendEmail({
      to: customerEmail,
      subject: `We got your message — Makka Halal Meat`,
      bodyHtml: `
        <p>Hi <strong>${customerName}</strong>,</p>
        <p>Thanks for reaching out. We received your message and will get back to you as soon as possible, usually within one business day.</p>
        ${orderCode ? `<p><strong>Your order reference:</strong> ${orderCode}</p>` : ''}
        <p><strong>Your message:</strong></p>
        <p style="background:#F6F3EE;padding:14px;border-radius:10px;white-space:pre-wrap;font-size:.9rem;">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
        <hr style="border:none;border-top:1px solid #F0EBE4;margin:20px 0;">
        <p>If this is urgent, you can also call us at <a href="tel:4042970008" style="color:#C0272D;">404-297-0008</a> during store hours (Tue–Sun, 11 AM–6:30 PM).</p>`,
    });

    return json(200, { ok: true, message: "We got it — you'll hear from us soon. Check your email for a confirmation." });
  } catch (e) {
    console.error('customer-support', e);
    return json(500, { error: 'Unable to send your message right now. Please email us directly.' });
  }
};

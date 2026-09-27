# Makka Halal Meat — rebuilt storefront

A from-scratch rebuild of your storefront, using your original zip only as
reference for products and branding — not as the base. The customer-facing
page follows the patterns big retail apps (Walmart, Target) use: a search
bar, a promo carousel, quick-jump category icons, horizontal product rows,
a persistent bottom cart bar, a bottom tab nav, and saved/favorite items.
Products and site text live in Supabase instead of hardcoded HTML, so you
can edit prices/images/copy yourself from a staff admin page — and the
security gaps called out in your own launch checklist are fixed.

## What's in this folder

- `index.html` — the customer-facing storefront (single page, no build step)
- `admin.html` — staff page: edit products, prices, images, site text; manage orders and payments
- `netlify/functions/` — all server-side logic (Stripe, Supabase writes)
- `supabase-schema.sql` — run this first in the Supabase SQL editor
- `seed_products.sql` — run this second — loads your ~380 existing products
- `product-images/` — your existing meat/poultry/fish photos
- `manifest.json`, `sw.js` — makes the site installable as a home-screen app

## 1. Set up Supabase

1. Create a project at supabase.com (or reuse your existing one).
2. **Rotate your service-role key now** if you haven't already — your
   original launch checklist noted it was exposed earlier. Go to
   Project Settings → API → "Reset service_role secret."
3. Open the SQL editor and run `supabase-schema.sql`, then `seed_products.sql`.
4. From Project Settings → API, copy your **Project URL** and **anon public key**.

## 2. Configure the storefront

In `index.html`, near the top of the `<script>` block, set:
```js
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```
The anon key is meant to be public — Row Level Security (already set up by
`supabase-schema.sql`) limits it to reading products and settings only. It
can never read orders or write anything.

## 3. Set Netlify environment variables

In Netlify → Site settings → Environment variables, add:

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys (use the **test** key until you're ready to go live) |
| `SUPABASE_URL` | Same project URL as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (the **rotated** one from step 1 — never the anon key) |
| `ADMIN_TOKEN` | Make up a long random password, e.g. from a password manager — this protects `admin.html` |

Never put any of these four in `index.html`, `admin.html`, or anywhere else
that ships to the browser. Only the two `SUPABASE_...` values in
`index.html` (the URL and the **anon** key) are meant to be public.

## 4. Deploy

Drag this whole folder into Netlify, or connect it as a Git repo and deploy.
Netlify will pick up `netlify.toml` and deploy the functions automatically.

## 5. Go live with real payments

1. Finish Stripe's live-account verification and payout bank setup.
2. Swap `STRIPE_SECRET_KEY` in Netlify for your **live** secret key.
3. Place one small real test order and confirm: authorization → capture in
   `admin.html` → payout in Stripe.

## Security notes (what changed from the original build)

- **Admin token check is now timing-safe** (`netlify/functions/_util.js`),
  so a mismatched token can't be brute-forced faster by timing responses.
- **Order totals are computed server-side** in `create-checkout-session.js`
  by looking up real prices in Supabase — a tampered browser total can no
  longer under-charge or fabricate an order.
- **Products are now database-backed with Row Level Security**, so the
  browser's Supabase key is read-only by design, not just by convention.
- **The Supabase project URL/key live in environment variables**, not
  hardcoded in function source, so rotating them doesn't require a new deploy.
- `admin.html` is marked `noindex` and gated by the admin token; for real
  multi-staff use, consider adding per-staff logins later (Supabase Auth is
  a natural fit since you already use Supabase).
- If a secret ever leaks again (visible in a browser console, a public repo,
  or a shared chat log), rotate it immediately in Stripe/Supabase and update
  the Netlify environment variable — don't just remove it from the file.

## Editing things yourself, day to day

- **Prices, product names, images, add/remove products** → `admin.html` → Products tab.
- **Home page text, hours, address, deal of the day, department order** → `admin.html` → Settings tab.
- **Orders, marking ready, capturing final weighed payment** → `admin.html` → Orders tab.

None of this requires a new file upload or redeploy — it all updates
Supabase directly, and the storefront reads it live.

## Getting this into the App Store and Play Store

This is a website, so publishing it as a native app means wrapping it.
Realistic options, roughly easiest to hardest:

1. **Play Store — Trusted Web Activity (recommended first step).**
   Use [PWABuilder.com](https://www.pwabuilder.com): paste your live Netlify
   URL, and it generates an Android project (and a signed `.aab`) that wraps
   your PWA in a thin native shell. Requires a Google Play Console account
   ($25 one-time).

2. **iOS — Capacitor.** Apple doesn't have an equivalent to TWA, and often
   rejects apps that are "just a website in a wrapper." Wrapping with
   [Capacitor](https://capacitorjs.com) and adding at least one native-feeling
   feature (push notifications for order-ready alerts, native share, etc.)
   gives it a better chance at review. Requires a Mac (or a cloud Mac
   service) to build, and an Apple Developer account ($99/year).

3. Either way, keep the Netlify-hosted site as the source of truth — the
   wrapped app just points at it, so your admin-panel edits update the app
   too, with no app-store re-release needed for content changes (only for
   code changes).

I can help build out either wrapper once the storefront itself is live and
you're happy with it — it's a separate step from what's in this folder.

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

## GIF — the staff picking app

GIF is a separate installable app for your team, at **`yoursite/gif.html`**.

**Setup (once):**
1. In Netlify → Environment variables, add **`STAFF_TOKEN`** — a code you give your workers.
   It only lets them pick orders. It can NOT edit products, prices, settings or payments.
   (Your own `ADMIN_TOKEN` also works in GIF.)
2. In Supabase's SQL editor, run **`supabase-update-gif.sql`** (safe to re-run).
3. On each staff phone/tablet, open `yoursite/gif.html`, sign in, then
   *Share → Add to Home Screen* (iPhone) or *Install app* (Android/Chrome).
   It installs as **GIF** with its own icon.

**How it works:**
- New paid orders appear at the top of **To do**, sorted by pickup time —
  the most urgent order is always first, and overdue ones turn red.
- Tap an order → for each item tap **Picked** (enter the real weight for
  by-the-pound items), **Unavailable**, or **Substitute** (search the catalog).
  The customer's choice at checkout (substitute / call me / skip) is shown at the top.
- When every item is handled, tap **Mark Ready for Pickup**, then
  **Handed to customer** at the counter.
- The order's **updated total** (after real weights, substitutes and unavailable
  items) is calculated automatically. In `admin.html` the **Capture** button is
  pre-filled with that amount.
- **New-order alerts:** a chime, vibration and banner, repeating every 30 seconds
  until someone starts picking (or taps *Silence 10 min*). For reliable alerts, leave GIF
  open on a plugged-in tablet or phone at the counter with the sound up
  (GIF keeps the screen awake). Alerts can't ring while the phone is locked or GIF is closed —
  true background push notifications are a possible future add-on.

Orders are only handed to the store once payment is confirmed. Checkouts that are
abandoned are closed automatically after about 30 minutes and their reserved
stock is released.

## v17 — Scroll fix, SVG nav icons, dark/light theme toggle, faster slideshow

- **Scroll glitch fixed.** Switching tabs or views no longer lets the scroll position
  bleed between them. The page always resets to the top on every navigation.
- **Professional SVG navigation icons** — all five bottom tab icons (Home, Search,
  Deals, Orders, Cart) and all six department icons are now clean line-art SVGs instead
  of emojis. Same for the cart button in the top header.
- **Dark / Light theme toggle.** Tap ☀️ in the top-right to switch to a dark background.
  The preference is saved and remembered across visits. Both themes look good — the
  default stays light, but use dark for evening browsing or personal preference.
- **Slideshow advances faster (every 3 seconds instead of 4)** and no longer glitches
  back to slide 0 when it can't measure the scroller width correctly.
- **Resend DNS + API key**: domain records verified, `RESEND_API_KEY` added to Netlify —
  password reset emails will now send as soon as the domain verifies in Resend dashboard.

## v16 — My Account dashboard, Support page, Buy Again, Resend DNS

- **My Account dashboard** — tapping 👤 now opens a proper screen: avatar with initial,
  name, email, and a menu of My Orders / My Favorites / Buy Again / Support & Inquiries /
  Edit Profile / Sign Out. The Orders tab shows a slim "Signed in as X · My Account ›"
  strip above the order list instead of a large card.
- **Support & Inquiries page** — reachable from the account menu: Order Support (opens
  email app with order number prefilled when signed in), General Inquiries, Call Us,
  and Store Hours — all in one place.
- **Buy Again** — loads items from your last 5 orders, lets you adjust quantities, then
  adds them all at once to the cart. Builds on the existing order-history system.
- **Favorites synced to account** — tap ❤️ on any item while signed in and it's saved
  to the account, not just this device. Signing in on a new device merges cloud favorites
  with local ones, never losing either.
- **Resend DNS** — add 3 records in Squarespace (see DNS instructions) then verify in
  Resend dashboard. Once done, password reset emails will send automatically.
- **Netlify env vars to add:** `RESEND_API_KEY` (from Resend API Keys tab) and optionally
  `RESEND_FROM` = `Makka Halal Meat <support@makkahalalmeat.com>` (once domain verified).
- Schema change: `favorites jsonb not null default '[]'` on customers table — included in
  the catch-up SQL.

## Customer accounts (email + password) — optional, guest checkout unaffected

- **Sign in or create an account** from the Orders tab (tap the 👤 icon). Signing in is
  never required to order — guest checkout works exactly as before.
- **Order history tied to the account**: any order placed while signed in shows up under
  My Orders automatically, from any device, alongside the existing phone-number lookup.
- **Passwords are stored only as a salted hash** — the same approach as staff PINs — so
  nobody, including you, can look one up; only a reset is possible.
- **"Forgot password"** works today by telling the customer plainly that email reset isn't
  set up yet, with no crash and no dead end. The moment you add `RESEND_API_KEY` in
  Netlify, it starts actually sending reset emails automatically — no re-upload needed.
- **Lockout after 5 wrong password attempts** (15 minutes), same protection as staff PINs.
- I ran a full security test suite against this — session forgery, password reset
  single-use/expiry, account privacy (no one can see another customer's orders), and
  confirmed guest checkout is completely unaffected even with an expired or garbage token.
- One-time database update: run **`supabase-update-accounts.sql`** in Supabase.
- **To finish enabling real reset emails later:** add two Netlify environment variables —
  `RESEND_API_KEY` (from your Resend account) and optionally `RESEND_FROM` (e.g.
  `Makka Halal Meat <support@makkahalalmeat.com>`, once that domain is verified in Resend).

## Fixed: the weight quick-pick buttons (1 lb / 1.5 lb / 2 lb / 3 lb / 5 lb)

The popup for weighing meat is back to how it worked before (my last update misread what
you meant). What I found and actually fixed: clicking a preset weight button read its
**display text** ("2 lb") as a number instead of its real value, so `Number("2 lb")` came out
`NaN` and the tap silently failed — that's why the buttons looked broken. Now each button
carries its real number separately from its label, so every one of them works, and the
"enter your own weight" field still works exactly as before. Also removed the smallest
preset (0.5 lb) — there was never a literal 0.25 lb button, so if you meant something else,
let me know.

## Sales tax: 3% for food, 8% for non-food

- Each product in `admin.html` → Products now has a **Tax** dropdown: **Food (3%)** or
  **Non-food (8%)**. On upload, meat and grocery default to food; household, beauty, baby,
  and clothing default to non-food — worth a quick pass to fix any exceptions (paper towels
  in "grocery," baby formula in "baby," etc.).
- Promo code discounts are split proportionally across food and non-food, so tax is always
  computed on what was actually paid for each — tested against several discount scenarios.
- Orders placed before this update keep working correctly at the old flat 3% rate; nothing
  about past orders changes.
- One-time database update: run **`supabase-update-tax.sql`** in Supabase.

## Admin: live visitor count

- A small strip now sits at the top of every tab in `admin.html`: **🟢 3 on the site right
  now · 41 visits today**, refreshing automatically.
- No cookies, no personal data — just a random id the browser keeps for as long as that tab
  is open, the same idea as a "who's online" counter.
- No new service and no extra cost — it's a small table in the Supabase you already have.
- One-time database update: run **`supabase-update-visits.sql`** in Supabase.

## No more forced weight popup, and an optional description per item

- **Tapping + on a by-the-pound item now just adds it** (1 lb to start), the same as any
  other item — no popup interrupts them. Once it's in the cart, tapping the quantity still
  opens the exact weight picker for anyone who wants something other than 1 lb. This applies
  everywhere: grid cards, the item's own page, and the home slideshow's quick-add.
- **Optional product description:** in `admin.html` → Products, each row now has a
  Description box. Leave it blank (the default) or type a couple of sentences — either way
  is fine, it's entirely optional. When set, it shows on that item's own page for customers
  (added in the last update); when blank, nothing extra shows.
- One-time database update: run **`supabase-update-description.sql`** in Supabase.

## Tappable address & phone, and a real product page for each item

- **Address and phone now actually work.** On the home page's Store information card,
  the address opens Google Maps and the phone number opens the dialer — both use
  whatever you've set in `admin.html` → Settings, no extra setup needed.
- **Every item now has its own page.** Tapping a product card (anywhere — home, search,
  a department page) opens a full detail page: bigger photo, name, brand, category, price,
  and the same add-to-cart / choose-weight controls. Tapping the heart or the + button
  still just favorites or adds it, without leaving the list. The back button returns
  exactly where the customer was — the same search results, or the same department
  with its color theme — not back to Home.
- No database changes and no SQL to run for this one.

## Fixed: editing a deal gave an error

Deals couldn't be edited because Postgres refuses to accept a write to `discounts.id`
even when the value is unchanged (it auto-generates that column). Every save was quietly
sending it back, so every edit failed. Fixed in `admin-discounts.js` — nothing to do on
your end besides re-uploading.

## Deal photos + a "Featured today" slideshow

- **Deal photos:** in `admin.html` → Deals, each row now has a photo picker just like
  Products — pick a photo from your phone, it uploads, then Save. It shows at the top of
  that deal's card on the customer's Deals tab.
- **Featured today slideshow:** the home page now has an auto-advancing photo slideshow
  under the top banner. Swipe it manually, or leave it — it moves on its own every few
  seconds and pauses when the tab isn't visible or you've left Home.
  - **You control it:** tick **Featured** next to any product in `admin.html` → Products
    to pin it to the slideshow.
  - **No pinned items?** It automatically rotates through your priced, photographed items
    instead, changing daily, so the slideshow is never empty and needs no setup.
- One-time database update: run **`supabase-update-deals-featured.sql`** in Supabase.

## Team: a personal PIN for each associate

Instead of one shared code, every associate signs in to GIF with their **own name + PIN**.

- **Add people:** `admin.html` → **Team** tab → type a name → *Add & create PIN*.
  A random 6-digit PIN is shown **once** — write it down or tell them. (You can type your
  own 4–8 digit PIN instead; obvious ones like 1234 are refused.) PINs are stored only as a
  salted hash, so nobody can look one up later — you can only **Reset PIN**.
- **Sign in:** on the GIF screen, the associate types their name and PIN once per shift
  (sessions last 16 hours). GIF remembers their name.
- **Remove access instantly:** *Turn off* or *Remove* signs that person out of GIF **immediately**,
  even mid-shift. *Reset PIN* also signs out any session that was already open.
- **Lock-out:** 5 wrong PINs in a row locks that person for 15 minutes (the admin can *Unlock*).
- **Activity log:** every action on an order (picked, unavailable, substituted, marked ready,
  handed over, request approved/denied) is recorded with the person's name and time. It shows
  under *Activity* on each order in GIF, and as "Last: …" plus *all activity* in `admin.html` → Orders.
- **Approve rights:** tick *Can approve cancellations & refunds* only for a manager you trust.
  Everyone else can pick orders but cannot decide requests, and can never touch products, prices,
  settings or payments.
- **Retire the shared code:** once everyone has a PIN, delete the `STAFF_TOKEN` variable in Netlify
  (and redeploy). Your `ADMIN_TOKEN` keeps working as the owner's sign-in ("Use a code instead").
- One-time database update: run **`supabase-update-team.sql`** in Supabase *before* uploading.

## Cancellations & refunds (all approved by the store admin)

- **Cancel within 5 minutes:** on the customer's **Orders** tab, a "Request cancellation"
  button with a live countdown appears for 5 minutes after the order is placed
  (the clock starts when payment is confirmed).
- **Refund after pickup:** once an order is picked up, the customer can send a
  "Request a refund" with a reason, for up to 7 days.
- **Nothing happens automatically.** Every request waits in GIF for the store admin.
  Only someone signed into GIF with the **admin code** (`ADMIN_TOKEN`) sees the
  Approve / Deny buttons; workers signed in with `STAFF_TOKEN` can see requests
  but cannot decide them (the server refuses, not just the screen).
- **Cancellation requests pause picking.** GIF shows a red "CANCEL REQUESTED" notice,
  moves that order to the top, sounds the alarm, and blocks Start picking / Picked /
  Ready until the admin approves or denies. Approve = card hold released (or refunded if
  already charged) and items go back in stock. Deny = the order carries on.
- **Refund approvals** let the admin choose the amount (full or partial) and add a
  message to the customer. The refund is sent through Stripe only at that moment.
- Each order can have one cancellation request and one refund request. The customer
  sees the decision (and your message) on their Orders tab.
- To change the 5 minutes / 7 days, edit `CANCEL_WINDOW_MINUTES` / `REFUND_WINDOW_DAYS`
  at the top of `netlify/functions/_util.js`.
- One-time database update: run **`supabase-update-requests.sql`** in Supabase.

## What's new: inventory, pickup times, order lookup, and photo uploads

If you're updating an existing deployment, **re-run `supabase-schema.sql`** in
the SQL editor first — it's safe to run again (it only adds what's missing)
and adds the new `stock`, `pickup_time`, and `staff_notes` columns plus a
storage bucket for photos.

- **Stock/inventory**: set a number in `admin.html` → Products → Stock for
  any item you want to limit (leave it blank for unlimited). It
  automatically goes down as orders come in, and back up if an order is
  cancelled. Customers can't order more than what's in stock.
- **Pickup time & staff notes**: in `admin.html` → Orders, you can now set a
  pickup time and add internal notes per order, saved with the Save button
  in that row.
- **My Orders tab**: customers now have an "Orders" tab (replacing the old
  "Saved" tab — favorites still work via the heart icon on any item) that
  remembers their past orders on that device and shows live status and
  pickup time, without needing an account.
- **Real photo uploads**: in `admin.html` → Products, there's now a file
  picker per row — choose a photo from your computer or phone and it
  uploads to Supabase Storage automatically, filling in the Image field
  for you. No more typing image links by hand (though that still works too).

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

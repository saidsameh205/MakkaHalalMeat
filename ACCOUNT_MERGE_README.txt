MAKKA HALAL MEAT — GitHub-based account merge (review build)

SOURCE: MakkaHalalMeat-main.zip. This package retains the complete repository.
CHANGED FILES:
  index.html — Adds Orders & Account fifth tab, signup/login/profile/order history,
               links signed-in checkout to existing backend, clickable address/phone.
  netlify/functions/customer-forgot-password.js — disables automated reset emails.
  netlify/functions/customer-support.js — disables automated support + confirmation emails.
ADDED: This README.

ALREADY PRESENT AND RETAINED IN SOURCE:
  Option 3 pastel category cards; custom meat weights and per-item instructions;
  checkout item instruction snapshot; admin/GIF apps; Stripe checkout/capture;
  Netlify functions; existing cancellation rules.

DO NOT RUN THE AD-HOC CUSTOMERS SQL FROM CHAT.
If not yet applied, the repository's supabase-update-accounts.sql migration is the
schema required by these existing backend functions. Check Supabase before running.
It enables RLS; do not disable RLS.

LIMITATIONS / TEST BEFORE LIVE:
  No deployment or live account/payment test has been performed.
  Existing signed-in orders only appear if checkout was linked to the account.
  Deal one-per-customer backend enforcement is NOT implemented by this merge.
  The GIF display of customer instructions must still be verified in a staff test.
  Automatic account recovery email is disabled; account recovery requires store help.
  Cart remains available via the top cart button and floating cart bar.
  Netlify environment variables remain configured in Netlify, not in this ZIP.

KEEP A BACKUP and test a preview deployment before replacing the live site.

EMPLOYEE ROLES + BUTCHER QUEUE — DEPLOYMENT

1. BACK UP YOUR CURRENT GITHUB REPO AND SUPABASE BEFORE DEPLOYING.
2. Run EMPLOYEE_BUTCHER_ROLES.sql in Supabase SQL Editor.
3. Deploy the whole project to a NETLIFY DEPLOY PREVIEW, not production.
4. In admin.html -> Settings -> Team, select Employee or Butcher for each person.
   Changing role revokes the current employee session; they sign in again with their PIN.
5. In GIF, butcher users see a meat-only queue and can mark meat ready.
   Other employees retain the full order workflow. The order is NOT completed by butcher.
6. Test with separate staff accounts, including direct API attempts to edit orders as butcher.

SECURITY: Netlify functions verify staff role against Supabase on every request.
Butchers cannot use the normal order update, requests, or catalog endpoints.
Only the owner admin endpoint can assign roles. Shared STAFF_TOKEN is still a
regular-employee credential; remove it if individual-account-only access is desired.

MEAT CLASSIFICATION: products.department must be one of meat, poultry, camel, fish, seafood.
Products without matching department will NOT appear in butcher queue.

IMPORTANT: This is a code patch, not a live deployment. Validate real order data
and checkout, permissions, and Supabase migrations in a preview before going live.

MAKKA V36 PASSWORD-ONLY ADMIN LOGIN

Upload only:
  admin.html -> repository root
  netlify/functions/_util.js -> existing functions folder (replace)
  netlify/functions/admin-login.js -> existing functions folder (new)

Other files (admin-products.js and admin-settings.js) are included for reference only.
Do not replace them unless you need to restore them.

Netlify -> Environment variables:
  ADMIN_PASSWORD = choose a NEW strong unique password (at least 16 characters)
  ADMIN_TOKEN = KEEP your existing value. Do not remove/change it: it also signs staff/customer sessions.
After adding ADMIN_PASSWORD, deploy the site once to make the new environment variable available.
Then password-only sign-in works without entering a token. Netlify redeploy is NOT needed for normal sign-ins.

Security:
  Password is checked by the backend, not stored in HTML.
  8-hour signed admin session, stored in sessionStorage.
  Existing ADMIN_TOKEN callers remain supported for compatibility.
  Changing ADMIN_TOKEN invalidates signed sessions (including staff/customer).
  Rate limit is best-effort per warm function instance; not a globally distributed rate limiter.

Important:
  This is a code-level repair, not tested against your deployed Supabase or Netlify environment.
  Do not publish the original V36 admin.html: it contains a hardcoded password.
  Other Admin functions that use requireAdmin should accept the signed session.
  The old admin UI's product fields may not all be supported by the existing admin-products sanitizer.
  Back up files first and test Products/Orders/Team before production use.

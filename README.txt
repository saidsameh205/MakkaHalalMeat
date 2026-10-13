MAKKA — CATEGORY PICTURES + BUTCHER ROLE FIX (CHANGED FILES ONLY)

Replace only these matching files in your existing GitHub project:
  index.html
  admin.html
  netlify/functions/admin-staff.js

If your Netlify configuration instead points at the repository-root admin-staff.js, replace that copy too (included in this ZIP). Both backend copies are identical.

Includes:
- Prior duplicate Candy & Sweets card fix and Shop by Category picture/name editor
- Square admin category-image previews, centered crop
- Category pictures use object-fit:cover rather than stretching
- Existing employee-role dropdown retained; current backend supports role updates
- Updated backend function for Supabase-backed butcher role PATCH requests
- Helpful warning if Netlify still runs an old backend function

IMPORTANT: A 'Nothing to change' response on role change usually means the live deployed admin-staff function is outdated. This package includes the role-aware function. Deploy preview and verify role updates, Supabase staff.role, and butcher-only restrictions. SQL EMPLOYEE_BUTCHER_ROLES.sql must already have been run. Do not delete any other website files.

No full website is included. Other existing website files remain untouched.

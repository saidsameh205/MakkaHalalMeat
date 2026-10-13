MAKKA HALAL MEAT — STAGED COMBINED UPDATE (NOT DEPLOYED)

Includes homepage four Why Shop With Us cards under original banner; seven category images (traditional Arab/Somali clothing and realistic packaged candy); and GIF butcher workflow.

DEPLOYMENT: Keep your original site files. Replace only the matching files in their original paths (index.html, gif.html and the matching Netlify functions), add department-images/ at the site root. The Netlify functions here have been flattened into the ZIP root: copy each into its matching netlify/functions/ location in your repo, NOT into site root.

IMPORTANT: First review and apply BUTCHER_SETUP.sql in Supabase, create and assign butcher role, then test on Netlify preview with meat+nonmeat mixed order, server filtering and in-app notification before production. Confirm products.department values match _butcher.js. The changes have NOT been end-to-end tested against the live database. In-app notifications only, not push notifications.

WARNING: This ZIP contains a staged update, not a complete repository. Do not upload this ZIP alone as the entire Netlify site.

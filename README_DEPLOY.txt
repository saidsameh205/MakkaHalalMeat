Makka V36 admin repair — staged release. Preserve your V36 photo uploader design.

Before deployment BACK UP your current GitHub files. Upload admin.html to repository root, and the files in netlify/functions/ to that same GitHub folder. DO NOT overwrite other functions.

Netlify Environment Variables: set ADMIN_PASSWORD to a NEW strong unique password (16+ characters); KEEP existing ADMIN_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY unchanged. Trigger a deploy. Never place any secret in HTML.

Important: This code has not been tested against your live Supabase schema. Product fields by_weight, sale_price, sale_ends_at, is_reduced, reduced_price, and discount min_order require corresponding database columns. Verify schema before using these controls.

The upload design (drag/drop, paste, preview, progress) is preserved. Photos now go through admin-upload-photo server function rather than anonymous direct Supabase Storage writes. Max 4MB; jpeg/png/webp/gif. Product creation uploads to products/new-... then saves returned URL.

Test password login, product list, photo upload, product save, orders, discounts, banner, settings, staff. Order status behavior may differ from your existing fulfillment workflow: test on a non-production order. Existing payment reconciliation is left untouched.

This is not a guarantee of full website restoration. Customer storefront/index.html and GIF/gif.html are intentionally not modified. No database migration is included.

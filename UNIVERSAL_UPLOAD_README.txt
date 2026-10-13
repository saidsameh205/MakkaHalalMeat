Makka admin image uploader update

Updated: admin-media-gallery.html, admin.html, admin-autofit.html, admin 3.html, admin-v23e-autofit-categories.html

Each admin file input now has a drag/drop + Ctrl+V + browse zone. Existing upload/save handlers are preserved. Clipboard paste is routed to the focused/hovered uploader, or the active modal uploader. For products with multiple photo inputs, click/hover the correct upload zone before pasting. Some upload sections still enforce their existing smaller size limits.

This ZIP is the full original repository plus admin HTML changes. Review Netlify preview before going live. No database migration needed for this UI change. The separate index(3).html supplied alongside this ZIP was NOT used to replace the storefront; compare it with your current deployed storefront before replacing index.html.

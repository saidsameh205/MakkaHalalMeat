# Aisle 1 catalog update

This build keeps the existing v22 storefront and adds the Aisle 1 catalog cleanup.

Rules applied:
- Product titles come from the POS description-based catalog; lookup/UPC codes are not used as customer-facing titles.
- Member’s Mark/MM and Great Value branding are omitted from customer-facing product titles; the item type remains unbranded.
- Seasonings are assigned to Seasoning & Spices.
- Candy/sweets items are assigned to the dedicated Candy & Sweets department.
- Pasta, flour/baking, oils/vinegar, canned goods, sauces, rice/grains, tea/coffee and drinks use the v22 category structure.
- Best-effort customer descriptions are added.

For an existing live Supabase database, run `aisle1_catalog_update.sql` once in the Supabase SQL editor. The updated `seed_products.sql` is for fresh installs/reseeding.

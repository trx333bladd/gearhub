# GearHub database

The GearHub Supabase database is already provisioned in the cloud project `exgpuvbijdvciqkjibhz`.

Applied migrations are recorded in Supabase and can be reviewed in the Dashboard's Database → Migrations section. Do not re-run the initial schema on an existing project. The current schema includes profiles/roles, categories, products, orders/order_items, reviews, favorites, RLS policies, the `place_order` RPC, admin helper in the non-exposed `private` schema, and the `product-images` Storage bucket.

The app uses only the public publishable key. Never add a service-role/secret key to this directory or the browser bundle.


## Catalog replacement (2026-11-10)

The initial demo catalog was replaced by the user's 18 supplied product photos/models. Public image paths are served by the Vite/Vercel static `public/products/` folder, and `public.products.image_url` points to `/products/<file>.webp`. Product image uploads made in the admin panel continue to use the `product-images` Storage bucket. There are now 7 categories, including `mousepads` / `Коврики`.

Migration `gearhub_replace_catalog_with_user_photos` replaced all prior sample product rows with the 18 requested models and the user's images.


## Admin delegation and discounts (2026-11-10)

The live database has the protected `public.admin_set_user_role(p_user_id, p_role)` RPC. It is a SECURITY INVOKER wrapper around a private SECURITY DEFINER function. Only authenticated administrators may use it; it refuses to change the current administrator's own role. The private implementation is not exposed as a Data API schema. `anon` has no EXECUTE permission on the public RPC.

Nine products currently have `compare_at_price > price`; those are the discounted products used by the SALE page and discount badges. SQL reference scripts are kept in `supabase/changes/`. They have already been applied to the live project. Do not run them again as a fresh migration on the existing database.

# Water & Melon Merch setup

The site now includes Supabase email/password auth and a Stripe Checkout integration. It will not create accounts or accept payments until configured and deployed. Use Stripe **test mode** first.

## Supabase accounts

1. Host the site on an HTTPS static host. Authentication redirects and Stripe Checkout will not work from a `file://` preview.
2. Create a Supabase project and enable email/password under **Authentication → Providers**. Configure the site's HTTPS URL and `/signin.html` under the auth URL/redirect settings. Email confirmation also needs working email delivery.
3. Copy the project's **Project URL** and **publishable anon key** into `supabase-config.js`. These are browser-visible values. Never put a Supabase service-role key or Stripe secret key in this file.
4. Configure the hosted site's allowed origins in Supabase so the browser can call its Edge Function.

## Stripe Checkout and delivery

1. In Stripe **test mode**, create separate GBP shipping rates for UK and international delivery. Decide the postage prices and countries served before enabling checkout.
2. Set Supabase Edge Function secrets in the Supabase dashboard:
   - `STRIPE_SECRET_KEY` — test-mode secret key
   - `SITE_URL` — the site's HTTPS origin, without a trailing slash
   - `UK_SHIPPING_RATE_ID` — Stripe's UK shipping-rate ID
   - `INTERNATIONAL_SHIPPING_RATE_ID` — Stripe's international shipping-rate ID
   - `SHIPPING_COUNTRIES` — comma-separated ISO 3166-1 alpha-2 country codes you can deliver to, including `GB` (for example `GB,US,CA,AU,NZ`)
3. Deploy `supabase/functions/create-checkout-session/index.ts` as the `create-checkout-session` Edge Function using the Supabase CLI. It verifies the Supabase user, accepts only the fixed server-side product catalog, enforces the limited plush deadline, restricts addresses to the selected UK/international region, and creates a hosted Stripe Checkout session.
4. Test signup, email confirmation, sign-in, cart quantities, UK/international country restrictions, and successful/canceled test payments before using live keys.

## Current catalog

All item prices are set server-side in GBP to match the site: watermelon pumpkin plush £20 (limited through 1 November 2026), avatar plush £3, hoodie £8, cap £5, stickers £1, and mug £15. Shipping is added by the selected Stripe shipping rate.

Real orders still need a fulfillment process, order confirmation handling, and appropriate store policies before live payments are enabled. The success page is a return page, not proof of payment or an order-management system.

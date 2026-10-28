# Water & Melon Merch setup

The site now includes Supabase email/password auth and a Stripe Checkout integration. It will not create accounts or accept payments until configured and deployed. Use Stripe **test mode** first.

## Supabase accounts

1. Host the site on an HTTPS static host. Authentication redirects and Stripe Checkout will not work from a `file://` preview.
2. Create a Supabase project and enable email/password under **Authentication → Providers**. Configure the site's HTTPS URL and `/signin.html` under the auth URL/redirect settings. Email confirmation also needs working email delivery.
3. Copy the project's **Project URL** and **publishable anon key** into `supabase-config.js`. These are browser-visible values. Never put a Supabase service-role key or Stripe secret key in this file.
4. Configure the hosted site's allowed origins in Supabase so the browser can call its Edge Function.

## Stripe Checkout and delivery

1. In Stripe **test mode**, create one GBP flat shipping rate to use for every destination. Make sure the price is enough to cover the most expensive destination before enabling worldwide delivery.
2. Set Supabase Edge Function secrets in the Supabase dashboard:
   - `STRIPE_SECRET_KEY` — test-mode secret key
   - `SITE_URL` — the site's full HTTPS base URL without a trailing slash (for GitHub Pages: `https://charliewakefield309-spec.github.io/water-melon-merch`)
   - `SHIPPING_RATE_ID` — Stripe's flat GBP shipping-rate ID used for every country
3. Configure the site's HTTPS origin in Supabase's allowed origins. For GitHub Pages, use `https://charliewakefield309-spec.github.io` (without the repository path).
4. Deploy `supabase/functions/create-checkout-session/index.ts` as the `create-checkout-session` Edge Function using the Supabase CLI. It verifies the Supabase user, accepts only the fixed server-side product catalog, enforces the limited plush deadline, offers the ISO 3166 country and territory list, and creates a hosted Stripe Checkout session using the same shipping rate for all destinations. Customers enter their full shipping/billing address and card details on Stripe's secure page.
5. Test signup, email confirmation, sign-in, cart quantities, addresses from different continents, all three monthly subscription tiers, and successful/canceled test payments before using live keys. Stripe may not permit delivery to certain destinations; do not advertise delivery there unless your carrier and Stripe support it.
6. Before offering subscriptions live, configure clear recurring-billing and cancellation terms and a customer-support process for subscription changes and cancellations.

## Current catalog

All item prices are set server-side in GBP to match the site: watermelon pumpkin plush £20 (limited through 1 November 2026), avatar plush £3, hoodie £8, cap £5, stickers £1, and mug £15. Shipping is added by the selected Stripe shipping rate.

Monthly Stripe subscriptions are set server-side at £5 for Watermelon Supporter, £10 for Watermelon Champion, and £20 for Watermelon Boss.

Real orders still need a fulfillment process, order confirmation handling, and appropriate store policies before live payments are enabled. The success page is a return page, not proof of payment or an order-management system.

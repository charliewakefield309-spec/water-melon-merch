const products = {
  "limited-plush": { name: "Watermelon Pumpkin Plush", unitAmount: 2000, until: Date.UTC(2026, 10, 2) },
  plush: { name: "Watermelon Avatar Plush", unitAmount: 300 },
  hoodie: { name: "Juicy Hoodie", unitAmount: 800 },
  cap: { name: "Watermelon Cap", unitAmount: 500 },
  stickers: { name: "Watermelon Stickers", unitAmount: 100 },
  mug: { name: "Watermelon Mug", unitAmount: 1500 }
} as const;

type ProductId = keyof typeof products;

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (request: Request) => {
  const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
  const requestOrigin = request.headers.get("Origin");
  const corsHeaders = {
    "Access-Control-Allow-Origin": siteUrl && requestOrigin === siteUrl ? siteUrl : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (!siteUrl) {
    return Response.json({ error: "Checkout site URL is not configured." }, { status: 500, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (requestOrigin !== siteUrl) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const ukShippingRateId = Deno.env.get("UK_SHIPPING_RATE_ID");
  const internationalShippingRateId = Deno.env.get("INTERNATIONAL_SHIPPING_RATE_ID");
  const shippingCountries = (Deno.env.get("SHIPPING_COUNTRIES") || "")
    .split(",")
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
  if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey || !ukShippingRateId || !internationalShippingRateId) {
    return Response.json({ error: "Checkout and delivery settings are not fully configured." }, { status: 503, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (shippingCountries.length === 0 || !shippingCountries.includes("GB") || shippingCountries.some((country) => !/^[A-Z]{2}$/.test(country))) {
    return Response.json({ error: "Configure valid delivery country codes, including GB." }, { status: 503, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ error: "Sign in before checking out." }, { status: 401, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  let userResponse: Response;
  try {
    userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: authorization }
    });
  } catch {
    return Response.json({ error: "Could not verify your account. Please try again." }, { status: 502, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (!userResponse.ok) {
    return Response.json({ error: "Your sign-in has expired. Please sign in again." }, { status: 401, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  const user = await userResponse.json();
  if (typeof user.id !== "string" || typeof user.email !== "string") {
    return Response.json({ error: "Could not verify your account." }, { status: 401, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  let body: { items?: unknown; deliveryRegion?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid cart data." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 10) {
    return Response.json({ error: "Your cart is empty or invalid." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (body.deliveryRegion !== "uk" && body.deliveryRegion !== "international") {
    return Response.json({ error: "Choose a valid delivery destination." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  const allowedShippingCountries = body.deliveryRegion === "uk"
    ? ["GB"]
    : shippingCountries.filter((country) => country !== "GB");
  if (allowedShippingCountries.length === 0) {
    return Response.json({ error: "International delivery countries are not configured yet." }, { status: 503, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  const lineItems: Array<{ id: ProductId; quantity: number }> = [];
  let totalQuantity = 0;
  for (const item of body.items) {
    if (!item || typeof item !== "object" || !("productId" in item) || !("quantity" in item)) {
      return Response.json({ error: "Invalid product in cart." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
    }
    const productId = item.productId;
    const quantity = item.quantity;
    if (typeof productId !== "string" || !(productId in products) || !Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 20) {
      return Response.json({ error: "Invalid product or quantity." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
    }
    const id = productId as ProductId;
    if ("until" in products[id] && Date.now() >= products[id].until) {
      return Response.json({ error: "The limited Watermelon Pumpkin Plush offer has ended." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
    }
    lineItems.push({ id, quantity: quantity as number });
    totalQuantity += quantity as number;
  }
  if (totalQuantity > 50) {
    return Response.json({ error: "Your cart exceeds the maximum quantity allowed." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  const stripeBody = new URLSearchParams();
  stripeBody.set("mode", "payment");
  stripeBody.set("success_url", `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  stripeBody.set("cancel_url", `${siteUrl}/shop.html?checkout=cancelled`);
  stripeBody.set("customer_email", user.email);
  stripeBody.set("client_reference_id", user.id);
  stripeBody.set("metadata[user_id]", user.id);
  allowedShippingCountries.forEach((country) => {
    stripeBody.append("shipping_address_collection[allowed_countries][]", country);
  });
  const shippingRateId = body.deliveryRegion === "uk" ? ukShippingRateId : internationalShippingRateId;
  stripeBody.set("shipping_options[0][shipping_rate]", shippingRateId);
  lineItems.forEach((item, index) => {
    const product = products[item.id];
    stripeBody.set(`line_items[${index}][price_data][currency]`, "gbp");
    stripeBody.set(`line_items[${index}][price_data][unit_amount]`, String(product.unitAmount));
    stripeBody.set(`line_items[${index}][price_data][product_data][name]`, product.name);
    stripeBody.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  let stripeResponse: Response;
  try {
    stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: stripeBody
    });
  } catch {
    return Response.json({ error: "Could not reach secure checkout. Please try again." }, { status: 502, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  const stripeResult = await stripeResponse.json();
  if (!stripeResponse.ok || typeof stripeResult.url !== "string") {
    console.error("Stripe Checkout session creation failed.", stripeResult.error?.type || stripeResponse.status);
    return Response.json({ error: "Secure checkout could not be started. Please try again." }, { status: 502, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  return Response.json({ url: stripeResult.url }, { headers: { ...corsHeaders, ...jsonHeaders } });
});

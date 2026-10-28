const products = {
  "limited-plush": { name: "Watermelon Pumpkin Plush", unitAmount: 2000, until: Date.UTC(2026, 10, 2) },
  plush: { name: "Watermelon Avatar Plush", unitAmount: 300 },
  hoodie: { name: "Juicy Hoodie", unitAmount: 800 },
  cap: { name: "Watermelon Cap", unitAmount: 500 },
  stickers: { name: "Watermelon Stickers", unitAmount: 100 },
  mug: { name: "Watermelon Mug", unitAmount: 1500 }
} as const;

type ProductId = keyof typeof products;

const shippingCountries = new Set(
  "AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AS,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BV,BW,BY,BZ,CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GU,GW,GY,HK,HM,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PN,PR,PS,PT,PW,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,TC,TD,TF,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,UM,US,UY,UZ,VA,VC,VE,VG,VI,VN,VU,WF,WS,YE,YT,ZA,ZM,ZW".split(",")
);

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (request: Request) => {
  const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/+$/, "");
  let siteOrigin: string | undefined;
  try {
    const parsedSiteUrl = new URL(siteUrl || "");
    if (parsedSiteUrl.protocol === "https:" && !parsedSiteUrl.search && !parsedSiteUrl.hash) {
      siteOrigin = parsedSiteUrl.origin;
    }
  } catch {
    siteOrigin = undefined;
  }
  const requestOrigin = request.headers.get("Origin");
  const corsHeaders = {
    "Access-Control-Allow-Origin": siteOrigin && requestOrigin === siteOrigin ? siteOrigin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin"
  };

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (!siteUrl || !siteOrigin) {
    return Response.json({ error: "Checkout site URL is not configured." }, { status: 500, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (requestOrigin !== siteOrigin) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  const shippingRateId = Deno.env.get("SHIPPING_RATE_ID");
  if (!shippingRateId || !/^shr_[A-Za-z0-9]+$/.test(shippingRateId)) {
    return Response.json({ error: "Configure a valid worldwide Stripe shipping rate." }, { status: 503, headers: { ...corsHeaders, ...jsonHeaders } });
  }

  if (request.method === "GET") {
    return Response.json({ countries: [...shippingCountries] }, { headers: { ...corsHeaders, ...jsonHeaders } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey) {
    return Response.json({ error: "Checkout and delivery settings are not fully configured." }, { status: 503, headers: { ...corsHeaders, ...jsonHeaders } });
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

  let body: { items?: unknown; shippingCountry?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid cart data." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 10) {
    return Response.json({ error: "Your cart is empty or invalid." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
  }
  if (typeof body.shippingCountry !== "string" || !shippingCountries.has(body.shippingCountry)) {
    return Response.json({ error: "Choose a valid delivery country." }, { status: 400, headers: { ...corsHeaders, ...jsonHeaders } });
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
  stripeBody.set("billing_address_collection", "required");
  stripeBody.append("shipping_address_collection[allowed_countries][]", body.shippingCountry);
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

(() => {
  const config = window.WATERMELON_CONFIG || {};
  const products = {
    "limited-plush": { name: "Watermelon Pumpkin Plush", price: 20, limited: true },
    plush: { name: "Watermelon Avatar Plush", price: 3 },
    hoodie: { name: "Juicy Hoodie", price: 8 },
    cap: { name: "Watermelon Cap", price: 5 },
    stickers: { name: "Watermelon Stickers", price: 1 },
    mug: { name: "Watermelon Mug", price: 15 }
  };
  const cartKey = "watermelon-merch-cart";
  const cartToggle = document.querySelector("#cart-toggle");
  const cartPanel = document.querySelector("#shopping-cart");
  const cartItems = document.querySelector("#cart-items");
  const cartCount = document.querySelector("#cart-count");
  const cartTotal = document.querySelector("#cart-total");
  const checkoutButton = document.querySelector(".checkout-button");
  const cartNote = document.querySelector(".cart-note");
  const shippingCountry = document.querySelector("#shipping-country");
  const shopStatus = document.querySelector("#shop-status");
  const limitedCutoff = Date.UTC(2026, 10, 2);
  const checkoutConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

  function loadCart() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(cartKey) || "{}");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
      return Object.fromEntries(
        Object.entries(saved).filter(([id, quantity]) =>
          Object.prototype.hasOwnProperty.call(products, id) && Number.isInteger(quantity) && quantity > 0 && quantity <= 20
        )
      );
    } catch (error) {
      console.error("Could not read the saved cart.", error);
      return {};
    }
  }

  let cart = loadCart();

  function saveCart() {
    try {
      window.localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch (error) {
      console.error("Could not save the cart on this device.", error);
    }
  }

  function updateCart() {
    const entries = Object.entries(cart).filter(([, quantity]) => quantity > 0);
    const itemCount = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
    cartCount.textContent = String(itemCount);
    cartTotal.textContent = `£${entries.reduce((sum, [id, quantity]) => sum + products[id].price * quantity, 0)}`;
    checkoutButton.disabled = itemCount === 0 || !checkoutConfigured || !shippingCountry.value;
    cartItems.replaceChildren();

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "cart-empty";
      empty.textContent = "Your cart is empty.";
      cartItems.append(empty);
      return;
    }

    for (const [id, quantity] of entries) {
      const row = document.createElement("div");
      row.className = "cart-item";
      const name = document.createElement("span");
      name.className = "cart-item-name";
      name.textContent = products[id].name;
      const controls = document.createElement("div");
      controls.className = "cart-quantity";
      const minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "−";
      minus.setAttribute("aria-label", `Remove one ${products[id].name}`);
      minus.addEventListener("click", () => {
        cart[id] -= 1;
        if (cart[id] === 0) delete cart[id];
        saveCart();
        updateCart();
      });
      const amount = document.createElement("span");
      amount.textContent = String(quantity);
      const plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
      plus.setAttribute("aria-label", `Add one ${products[id].name}`);
      plus.disabled = quantity >= 20;
      plus.addEventListener("click", () => {
        cart[id] = Math.min(20, (cart[id] || 0) + 1);
        saveCart();
        updateCart();
      });
      controls.append(minus, amount, plus);
      const linePrice = document.createElement("strong");
      linePrice.textContent = `£${products[id].price * quantity}`;
      row.append(name, controls, linePrice);
      cartItems.append(row);
    }
  }

  function updateLimitedProduct() {
    if (Date.now() < limitedCutoff) return;
    const card = document.querySelector('[data-product="limited-plush"]');
    const button = card.querySelector(".add-to-cart");
    button.disabled = true;
    button.textContent = "Offer ended";
    card.querySelector(".merch-type").textContent = "LIMITED EDITION • ENDED NOV 1";
    card.querySelector(".merch-card-copy > p").textContent = "This limited seasonal design is no longer available.";
  }

  document.querySelectorAll(".add-to-cart").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.closest("[data-product]").dataset.product;
      if (products[productId].limited && Date.now() >= limitedCutoff) return;
      cart[productId] = Math.min(20, (cart[productId] || 0) + 1);
      saveCart();
      updateCart();
      cartPanel.hidden = false;
      cartToggle.setAttribute("aria-expanded", "true");
    });
  });

  cartToggle.addEventListener("click", () => {
    cartPanel.hidden = !cartPanel.hidden;
    cartToggle.setAttribute("aria-expanded", String(!cartPanel.hidden));
  });
  document.querySelector("#cart-close").addEventListener("click", () => {
    cartPanel.hidden = true;
    cartToggle.setAttribute("aria-expanded", "false");
    cartToggle.focus();
  });

  checkoutButton.addEventListener("click", async () => {
    if (!checkoutConfigured || checkoutButton.disabled) return;
    if (!window.supabase?.createClient) {
      cartNote.textContent = "Supabase's client library did not load. Check your connection and reload.";
      return;
    }

    checkoutButton.disabled = true;
    cartNote.textContent = "Preparing secure checkout…";
    try {
      const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data: { session }, error } = await client.auth.getSession();
      if (error) throw error;
      if (!session) {
        window.location.assign("signin.html?next=checkout");
        return;
      }

      const response = await fetch(`${config.supabaseUrl}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.supabaseAnonKey,
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          shippingCountry: shippingCountry.value,
          items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }))
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start checkout.");
      if (typeof result.url !== "string" || !result.url.startsWith("https://checkout.stripe.com/")) {
        throw new Error("Checkout returned an invalid destination.");
      }
      window.sessionStorage.setItem("watermelon-checkout-cart", cartKey);
      window.location.assign(result.url);
    } catch (error) {
      cartNote.textContent = error instanceof Error ? error.message : "Could not start checkout. Please try again.";
      updateCart();
    }
  });

  if (!checkoutConfigured) {
    shopStatus.lastChild.textContent = " Prices are in pounds. Configure Supabase and Stripe to enable secure checkout.";
    cartNote.textContent = "Set up Supabase and Stripe to enable secure checkout.";
  } else {
    loadShippingCountries();
  }
  if (new URLSearchParams(window.location.search).get("checkout") === "cancelled") {
    cartNote.textContent = "Checkout was canceled. Your cart is still here if you'd like to try again.";
    cartPanel.hidden = false;
    cartToggle.setAttribute("aria-expanded", "true");
  } else if (new URLSearchParams(window.location.search).get("checkout") === "retry") {
    cartNote.textContent = "You're signed in. Review your cart and choose checkout to continue.";
    cartPanel.hidden = false;
    cartToggle.setAttribute("aria-expanded", "true");
  }
  updateLimitedProduct();
  updateCart();

  async function loadShippingCountries() {
    try {
      const response = await fetch(`${config.supabaseUrl}/functions/v1/create-checkout-session`, {
        headers: {
          "apikey": config.supabaseAnonKey,
          "Authorization": `Bearer ${config.supabaseAnonKey}`
        }
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.countries)) {
        throw new Error(result.error || "Delivery countries are not available yet.");
      }

      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
      const countries = result.countries
        .filter((country) => typeof country === "string" && /^[A-Z]{2}$/.test(country))
        .map((code) => ({ code, name: displayNames.of(code) || code }))
        .sort((first, second) => first.name.localeCompare(second.name));
      shippingCountry.replaceChildren(new Option("Choose a country", ""));
      for (const country of countries) {
        shippingCountry.add(new Option(country.name, country.code));
      }
      shippingCountry.disabled = countries.length === 0;
      if (countries.length === 0) {
        throw new Error("No delivery countries have been configured yet.");
      }
      cartNote.textContent = "Choose your country. Enter your full address and card securely with Stripe at checkout.";
      updateCart();
    } catch (error) {
      shippingCountry.replaceChildren(new Option("Delivery countries unavailable", ""));
      shippingCountry.disabled = true;
      cartNote.textContent = error instanceof Error ? error.message : "Could not load delivery countries.";
      updateCart();
    }
  }

  shippingCountry.addEventListener("change", updateCart);
})();

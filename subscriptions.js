(() => {
  const config = window.WATERMELON_CONFIG || {};
  const buttons = document.querySelectorAll(".subscription-button");
  const status = document.querySelector("#subscription-status");
  const checkoutConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

  if (!checkoutConfigured) {
    status.textContent = "Monthly subscriptions are not available until Supabase and Stripe are configured.";
    return;
  }

  buttons.forEach((button) => {
    button.disabled = false;
    button.addEventListener("click", async () => {
      if (!window.supabase?.createClient) {
        status.textContent = "Supabase's client library did not load. Check your connection and reload.";
        return;
      }

      buttons.forEach((tierButton) => {
        tierButton.disabled = true;
      });
      status.textContent = "Preparing secure subscription checkout…";
      try {
        const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        const { data: { session }, error } = await client.auth.getSession();
        if (error) throw error;
        if (!session) {
          window.location.assign("signin.html?next=subscription");
          return;
        }

        const response = await fetch(`${config.supabaseUrl}/functions/v1/create-checkout-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": config.supabaseAnonKey,
            "Authorization": `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ subscriptionTier: button.dataset.tier })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not start subscription checkout.");
        if (typeof result.url !== "string" || !result.url.startsWith("https://checkout.stripe.com/")) {
          throw new Error("Checkout returned an invalid destination.");
        }
        window.location.assign(result.url);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Could not start subscription checkout. Please try again.";
        buttons.forEach((tierButton) => {
          tierButton.disabled = false;
        });
      }
    });
  });

  if (new URLSearchParams(window.location.search).get("checkout") === "cancelled") {
    status.textContent = "Checkout was canceled. Choose a subscription tier whenever you're ready.";
  } else {
    status.textContent = "Choose a tier to continue to secure monthly checkout.";
  }
})();

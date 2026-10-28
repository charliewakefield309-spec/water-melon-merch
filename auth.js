(() => {
  const config = window.WATERMELON_CONFIG || {};
  const signUpForm = document.querySelector("#signup-form");
  const signInForm = document.querySelector("#signin-form");
  const activeForm = signUpForm || signInForm;
  if (!activeForm) return;

  const status = document.querySelector("#signup-status, #signin-status");
  const submitButton = activeForm.querySelector('button[type="submit"]');
  const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  if (!isConfigured || !window.supabase?.createClient) {
    setStatus("Account setup is not connected yet. Add the Supabase project URL and public anon key to supabase-config.js.", "error");
  }

  if (signUpForm) {
    const email = signUpForm.elements.email;
    const password = signUpForm.elements.password;
    const createButton = signUpForm.querySelector('button[type="submit"]');
    const updateButton = () => {
      password.setCustomValidity(password.value.length > 0 && password.value.length < 8
        ? "Use at least 8 characters for your password."
        : "");
      createButton.disabled = !signUpForm.checkValidity();
    };
    signUpForm.addEventListener("input", updateButton);
    updateButton();
    signUpForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      updateButton();
      if (!signUpForm.reportValidity()) return;
      if (!isConfigured || !window.supabase?.createClient) return;

      createButton.disabled = true;
      setStatus("Creating your account…");
      try {
        const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        const { data, error } = await client.auth.signUp({
          email: email.value.trim(),
          password: password.value,
          options: { emailRedirectTo: new URL("signin.html", window.location.href).href }
        });
        if (error) throw error;
        if (!data.session) {
          setStatus("Account created. Check your email to confirm it, then sign in.", "success");
        } else {
          setStatus("Your account is ready. Taking you to the shop…", "success");
          window.location.assign("shop.html");
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Account creation failed. Please try again.", "error");
      } finally {
        updateButton();
      }
    });
  }

  if (signInForm) {
    signInForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!signInForm.reportValidity()) return;
      if (!isConfigured || !window.supabase?.createClient) return;

      submitButton.disabled = true;
      setStatus("Signing in…");
      try {
        const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        const { error } = await client.auth.signInWithPassword({
          email: signInForm.elements.email.value.trim(),
          password: signInForm.elements.password.value
        });
        if (error) throw error;
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.assign(next === "checkout"
          ? "shop.html?checkout=retry"
          : next === "subscription"
          ? "subscriptions.html"
          : "shop.html");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Sign-in failed. Please try again.", "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }
})();

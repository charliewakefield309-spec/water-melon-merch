(() => {
  const config = window.WATERMELON_CONFIG || {};
  const accountBadge = document.querySelector("[data-account-badge]");
  const signInLink = document.querySelector('nav a[href="signin.html"]');
  const signUpLink = document.querySelector('nav a[href="signup.html"]');
  const signOutButton = document.querySelector("[data-auth-signout]");

  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) return;

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  function updateAccount(session) {
    const email = session?.user?.email;
    if (accountBadge) {
      accountBadge.textContent = email ? `Account · ${email}` : "";
      accountBadge.hidden = !email;
    }
    if (signInLink) signInLink.hidden = Boolean(email);
    if (signUpLink) signUpLink.hidden = Boolean(email);
    if (signOutButton) signOutButton.hidden = !email;
  }

  client.auth.getSession()
    .then(({ data, error }) => {
      if (error) {
        console.error("Could not check the current sign-in.", error);
        return;
      }
      updateAccount(data.session);
    })
    .catch((error) => {
      console.error("Could not check the current sign-in.", error);
    });

  client.auth.onAuthStateChange((_event, session) => {
    updateAccount(session);
  });

  signOutButton?.addEventListener("click", async () => {
    signOutButton.disabled = true;
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      window.location.assign("index.html");
    } catch (error) {
      console.error("Could not sign out.", error);
      if (accountBadge) accountBadge.textContent = "Sign out failed. Try again.";
      signOutButton.disabled = false;
    }
  });
})();

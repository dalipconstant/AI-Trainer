(() => {
  "use strict";
  const cfg = () => window.TrainerConfig;

  /** Prefer live app origin; never hard-code localhost for mobile. */
  const appRedirectUrl = () => {
    const configured = cfg().AUTH_APP_REDIRECT;
    if (configured && !/localhost|127\.0\.0\.1/i.test(configured)) {
      return configured;
    }
    try {
      const origin = window.location.origin || "";
      if (origin && !/localhost|127\.0\.0\.1/i.test(origin)) {
        return origin + (window.location.pathname || "/").replace(/index\.html$/i, "");
      }
    } catch (_) {}
    // Hosted callback (GitHub Pages) — works from phone & Capacitor Browser
    return (
      cfg().AUTH_CALLBACK_PAGE ||
      "https://dalipconstant.github.io/AI-Trainer/auth-callback.html"
    );
  };

  const headers = (token) => ({
    apikey: cfg().SUPABASE_ANON_KEY,
    Authorization: "Bearer " + (token || cfg().SUPABASE_ANON_KEY),
    "Content-Type": "application/json"
  });

  const saveSession = (session) => {
    window.TrainerDB.patch({
      session,
      sessionAt: Date.now()
    });
  };

  const getSession = async () => {
    const local = window.TrainerDB.getAll().session;
    if (local?.access_token) {
      if (local.expires_at && local.expires_at * 1000 < Date.now() - 60000) {
        try {
          return await refreshSession(local);
        } catch {
          return local;
        }
      }
      return local;
    }
    return null;
  };

  const refreshSession = async (session) => {
    const s = session || (await getSession());
    if (!s?.refresh_token) throw new Error("Not logged in");
    const res = await fetch(
      cfg().SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ refresh_token: s.refresh_token })
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || "Refresh failed");
    const next = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || s.refresh_token,
      expires_at: data.expires_at,
      user: data.user || s.user
    };
    saveSession(next);
    return next;
  };

  const signInEmail = async (email, password) => {
    const res = await fetch(cfg().SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || "Login failed");
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user: data.user
    };
    saveSession(session);
    return session;
  };

  const signUpEmail = async (email, password) => {
    // emailRedirectTo must be an allowed Redirect URL in Supabase (not localhost)
    const emailRedirectTo = appRedirectUrl();
    const res = await fetch(cfg().SUPABASE_URL + "/auth/v1/signup", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        email,
        password,
        email_redirect_to: emailRedirectTo
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || "Signup failed");
    if (data.access_token) {
      saveSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        user: data.user
      });
    }
    return data;
  };

  /**
   * Google OAuth via Supabase.
   * redirect_to = GitHub Pages auth-callback (or current origin if not localhost).
   * That page stores tokens / deep-links back — avoids localhost:3000 on phone.
   */
  const signInWithGoogle = async () => {
    const redirectTo = appRedirectUrl();
    const url =
      cfg().SUPABASE_URL +
      "/auth/v1/authorize?provider=google&redirect_to=" +
      encodeURIComponent(redirectTo);

    // Mark pending so callback page / app can finish login
    try {
      localStorage.setItem("ai_trainer_auth_pending", "1");
    } catch (_) {}

    if (window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url });
      // Poll for session written by callback page (same device browser may share storage only on same origin)
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        consumeHashSession();
        consumeStoredOAuth();
        const s = await getSession();
        if (s?.access_token) {
          try {
            await window.Capacitor.Plugins.Browser.close();
          } catch (_) {}
          return s;
        }
      }
      return getSession();
    }

    // Web: full navigation is most reliable
    window.location.href = url;
    return null;
  };

  const parseTokensFromHashOrSearch = (href) => {
    try {
      const u = new URL(href || window.location.href);
      let raw = (u.hash || "").replace(/^#/, "");
      if (!raw && u.search) raw = u.search.replace(/^\?/, "");
      const params = new URLSearchParams(raw);
      const access_token = params.get("access_token");
      if (!access_token) return null;
      return {
        access_token,
        refresh_token: params.get("refresh_token") || "",
        expires_in: Number(params.get("expires_in") || 3600),
        expires_at: params.get("expires_at")
          ? Number(params.get("expires_at"))
          : Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600),
        token_type: params.get("token_type") || "bearer"
      };
    } catch {
      return null;
    }
  };

  const consumeHashSession = () => {
    const parsed = parseTokensFromHashOrSearch(window.location.href);
    if (!parsed?.access_token) return null;
    const session = {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: parsed.expires_at,
      user: null
    };
    saveSession(session);
    try {
      if (window.location.hash && window.location.hash.includes("access_token")) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (_) {}
    try {
      localStorage.removeItem("ai_trainer_auth_pending");
    } catch (_) {}
    return session;
  };

  /** Tokens stored by auth-callback.html on GitHub Pages (same browser profile) */
  const consumeStoredOAuth = () => {
    try {
      const raw = localStorage.getItem("ai_trainer_supabase_session");
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.access_token) return null;
      if (data.savedAt && Date.now() - data.savedAt > 10 * 60 * 1000) {
        localStorage.removeItem("ai_trainer_supabase_session");
        return null;
      }
      saveSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token || "",
        expires_at: data.expires_at,
        user: data.user || null
      });
      localStorage.removeItem("ai_trainer_supabase_session");
      return data;
    } catch {
      return null;
    }
  };

  const signOut = async () => {
    try {
      const s = await getSession();
      if (s?.access_token) {
        await fetch(cfg().SUPABASE_URL + "/auth/v1/logout", {
          method: "POST",
          headers: headers(s.access_token)
        });
      }
    } catch (_) {}
    window.TrainerDB.patch({ session: null });
  };

  const getUserEmail = async () => {
    const s = await getSession();
    if (s?.user?.email) return s.user.email;
    if (!s?.access_token) return null;
    try {
      const res = await fetch(cfg().SUPABASE_URL + "/auth/v1/user", {
        headers: headers(s.access_token)
      });
      const u = await res.json();
      if (u?.email) {
        s.user = u;
        saveSession(s);
        return u.email;
      }
    } catch (_) {}
    return null;
  };

  window.TrainerAuth = {
    getSession,
    refreshSession,
    signInEmail,
    signUpEmail,
    signInWithGoogle,
    consumeHashSession,
    consumeStoredOAuth,
    signOut,
    getUserEmail,
    appRedirectUrl
  };
})();

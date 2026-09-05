(() => {
  "use strict";
  const FOLDER = () => window.TrainerConfig.DRIVE_FOLDER_NAME || "AI Trainer Data";
  /** Stable GitHub Pages callback — add this exact URL in Google Cloud redirect URIs */
  const DRIVE_REDIRECT =
    window.TrainerConfig.DRIVE_OAUTH_REDIRECT ||
    "https://dalipconstant.github.io/AI-Trainer/oauth-drive.html";
  const DEEP_SCHEME = "com.aitrainer.app://oauth-callback";
  const STORAGE_KEY = "ai_trainer_drive_oauth";

  let folderId = null;
  let accessToken = null;

  const setToken = (t, expiresIn = 3600) => {
    accessToken = t;
    window.TrainerDB.saveSettings({
      driveAccessToken: t,
      driveTokenAt: Date.now(),
      driveTokenExp: Date.now() + (Number(expiresIn) || 3600) * 1000,
      driveConnected: true
    });
  };

  const getToken = () => {
    if (accessToken) return accessToken;
    const s = window.TrainerDB.getSettings();
    if (s.driveAccessToken) {
      if (s.driveTokenExp && Date.now() > s.driveTokenExp - 60_000) {
        return null;
      }
      if (!s.driveTokenExp && Date.now() - (s.driveTokenAt || 0) > 50 * 60 * 1000) {
        return null;
      }
      accessToken = s.driveAccessToken;
      return accessToken;
    }
    return null;
  };

  const parseTokenFromUrl = (href) => {
    try {
      const u = new URL(href, window.location.origin);
      let hash = u.hash || "";
      if (!hash && /access_token=/.test(u.search)) hash = "#" + u.search.replace(/^\?/, "");
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const access_token = params.get("access_token");
      if (!access_token) return null;
      return {
        access_token,
        expires_in: Number(params.get("expires_in") || 3600),
        scope: params.get("scope") || ""
      };
    } catch {
      return null;
    }
  };

  /** Call on app boot — deep link or same-tab hash */
  const consumeOAuthRedirect = (href) => {
    const parsed = parseTokenFromUrl(href || window.location.href);
    if (parsed?.access_token) {
      setToken(parsed.access_token, parsed.expires_in);
      try {
        if (window.location.hash && window.location.hash.includes("access_token")) {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } catch (_) {}
      return true;
    }
    // Web popup / GitHub Pages → localStorage bridge
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.access_token && Date.now() - (data.savedAt || 0) < 5 * 60 * 1000) {
          setToken(data.access_token, data.expires_in);
          localStorage.removeItem(STORAGE_KEY);
          return true;
        }
      }
    } catch (_) {}
    return false;
  };

  const buildAuthUrl = (hintEmail) => {
    const clientId = window.TrainerConfig.GOOGLE_WEB_CLIENT_ID;
    if (!clientId) throw new Error("Missing GOOGLE_WEB_CLIENT_ID in config");
    const scope =
      window.TrainerConfig.DRIVE_SCOPES ||
      "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: DRIVE_REDIRECT,
      response_type: "token",
      scope,
      include_granted_scopes: "true",
      prompt: "select_account consent",
      state: "ai_trainer_drive_" + Date.now()
    });
    if (hintEmail) params.set("login_hint", String(hintEmail));
    return "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
  };

  /**
   * Opens Google OAuth → GitHub Pages oauth-drive.html → deep link / localStorage back to app.
   * Same reliability pattern as Inventory AI oauth-sheets.html.
   */
  const connectDrive = async () => {
    // Already returning from redirect?
    if (consumeOAuthRedirect(window.location.href)) {
      await ensureFolder();
      return getToken();
    }

    let hint = null;
    try {
      hint = await window.TrainerAuth?.getUserEmail?.();
    } catch (_) {}

    const url = buildAuthUrl(hint);

    // Listen for popup postMessage (if open in window.open)
    const messageHandler = (ev) => {
      if (ev?.data?.type === "AI_TRAINER_DRIVE_OAUTH" && ev.data.access_token) {
        setToken(ev.data.access_token, ev.data.expires_in);
      }
    };
    window.addEventListener("message", messageHandler);

    if (window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url });
      // Poll localStorage / deep link consume when user returns
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (consumeOAuthRedirect()) break;
        if (getToken()) break;
      }
    } else {
      // Prefer popup so SPA tab stays alive
      const popup = window.open(url, "ai_trainer_drive", "width=480,height=720");
      if (!popup) {
        window.location.href = url;
        return null;
      }
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (getToken()) break;
        if (consumeOAuthRedirect()) break;
        try {
          if (popup.closed) break;
        } catch (_) {}
      }
      try {
        popup.close();
      } catch (_) {}
    }

    window.removeEventListener("message", messageHandler);
    consumeOAuthRedirect();
    if (getToken()) {
      try {
        await ensureFolder();
      } catch (_) {}
    }
    return getToken();
  };

  const api = async (path, opts = {}) => {
    const token = getToken();
    if (!token) throw new Error("Connect Google Drive in Settings");
    const res = await fetch("https://www.googleapis.com/drive/v3" + path, {
      ...opts,
      headers: {
        Authorization: "Bearer " + token,
        ...(opts.body && !(opts.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(opts.headers || {})
      }
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error("Drive: " + err.slice(0, 200));
    }
    if (res.status === 204) return null;
    return res.json();
  };

  const ensureFolder = async () => {
    if (folderId) return folderId;
    const saved = window.TrainerDB.getSettings().driveFolderId;
    if (saved) {
      folderId = saved;
      return folderId;
    }
    const q = encodeURIComponent(
      "name='" + FOLDER() + "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    );
    const list = await api("/files?q=" + q + "&spaces=drive&fields=files(id,name)");
    if (list.files?.[0]?.id) {
      folderId = list.files[0].id;
      window.TrainerDB.saveSettings({ driveFolderId: folderId });
      return folderId;
    }
    const created = await api("/files", {
      method: "POST",
      body: JSON.stringify({
        name: FOLDER(),
        mimeType: "application/vnd.google-apps.folder"
      })
    });
    folderId = created.id;
    window.TrainerDB.saveSettings({ driveFolderId: folderId });
    return folderId;
  };

  const findFile = async (name) => {
    const fid = await ensureFolder();
    const q = encodeURIComponent(
      "name='" + name + "' and '" + fid + "' in parents and trashed=false"
    );
    const list = await api("/files?q=" + q + "&fields=files(id,name,modifiedTime)");
    return list.files?.[0] || null;
  };

  const uploadJson = async (name, obj) => {
    const fid = await ensureFolder();
    const existing = await findFile(name);
    const metadata = {
      name,
      parents: existing ? undefined : [fid],
      mimeType: "application/json"
    };
    const boundary = "trainer_" + Date.now();
    const body =
      "--" +
      boundary +
      "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(existing ? { name, mimeType: "application/json" } : metadata) +
      "\r\n--" +
      boundary +
      "\r\nContent-Type: application/json\r\n\r\n" +
      JSON.stringify(obj) +
      "\r\n--" +
      boundary +
      "--";
    const url = existing
      ? "https://www.googleapis.com/upload/drive/v3/files/" +
        existing.id +
        "?uploadType=multipart"
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    const token = getToken();
    const res = await fetch(url, {
      method: existing ? "PATCH" : "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "multipart/related; boundary=" + boundary
      },
      body
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const downloadJson = async (name) => {
    const f = await findFile(name);
    if (!f) return null;
    const token = getToken();
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files/" + f.id + "?alt=media",
      { headers: { Authorization: "Bearer " + token } }
    );
    if (!res.ok) return null;
    return res.json();
  };

  const pushAll = async () => {
    const all = window.TrainerDB.getAll();
    await uploadJson("trainer-sync.json", {
      profile: all.profile,
      plan: all.plan,
      tasks: all.tasks,
      workouts: all.workouts,
      physiqueImages: (all.physiqueImages || []).map((p) => ({
        ...p,
        dataUrl: p.isPrimary ? p.dataUrl : p.dataUrl || null
      })),
      syncedAt: Date.now()
    });
  };

  const pullAll = async () => {
    const remote = await downloadJson("trainer-sync.json");
    if (!remote) return null;
    window.TrainerDB.patch({
      profile: remote.profile || null,
      plan: remote.plan || null,
      tasks: remote.tasks || {},
      workouts: remote.workouts || [],
      physiqueImages: remote.physiqueImages || []
    });
    return remote;
  };

  const uploadImage = async (fileName, dataUrl) => {
    const fid = await ensureFolder();
    const base64 = dataUrl.split(",")[1];
    const mime = (dataUrl.match(/^data:([^;]+)/) || [])[1] || "image/jpeg";
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    const metadata = JSON.stringify({ name: fileName, parents: [fid] });
    const form = new FormData();
    form.append("metadata", new Blob([metadata], { type: "application/json" }));
    form.append("file", new Blob([arr], { type: mime }));
    const token = getToken();
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: form
      }
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  window.TrainerDrive = {
    connectDrive,
    getToken,
    setToken,
    consumeOAuthRedirect,
    buildAuthUrl,
    ensureFolder,
    pushAll,
    pullAll,
    uploadJson,
    downloadJson,
    uploadImage,
    DRIVE_REDIRECT
  };
})();

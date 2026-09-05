(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const todayKey = () => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  };

  const showView = (name) => {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    const el = $("view-" + name);
    if (el) el.classList.remove("hidden");
  };

  const TAB_TITLES = {
    home: "Dashboard",
    tasks: "Tasks",
    ai: "AI Coach",
    workouts: "Workouts",
    diet: "Diet",
    images: "Photos",
    profile: "Profile",
    settings: "Settings"
  };

  const closeSideNav = () => {
    $("sideNav")?.classList.remove("open");
    $("sideBackdrop")?.classList.add("hidden");
  };
  const openSideNav = () => {
    $("sideNav")?.classList.add("open");
    $("sideBackdrop")?.classList.remove("hidden");
  };

  const switchTab = (tab, opts = {}) => {
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".side-link").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const panel = $("tab-" + tab);
    if (panel) panel.classList.remove("hidden");
    if ($("headerTitle")) $("headerTitle").textContent = TAB_TITLES[tab] || "AI Trainer";
    closeSideNav();
    if (tab === "home") renderDashboard();
    if (tab === "tasks") renderTasks(opts.editTaskId || null);
    if (tab === "workouts") renderWorkouts();
    if (tab === "profile") renderProfile();
    if (tab === "images") renderImages();
    if (tab === "settings") fillSettingsAiControls();
    if (tab === "ai") {
      /* chat log kept */
    }
    if (tab === "diet") {
      /* keep last diet output */
    }
  };

  const providerOptions = () => {
    const prov = window.TrainerConfig.AI_PROVIDERS || {};
    return Object.keys(prov).map((id) => ({
      value: id,
      label: prov[id].name || id
    }));
  };

  const modelsForProvider = (provider) => {
    const list = window.TrainerConfig.AI_PROVIDERS?.[provider]?.models || [];
    return list.map((m) => ({ value: m.id, label: m.name }));
  };

  const fillSettingsAiControls = () => {
    const s = window.TrainerDB.getSettings() || {};
    const provEl = $("setProvider");
    const modelEl = $("setModel");
    const keyEl = $("setApiKey");
    const providers = window.TrainerConfig.AI_PROVIDERS || {};
    if (provEl) {
      const cur = s.aiProvider || "gemini";
      provEl.innerHTML = Object.keys(providers)
        .map((id) => `<option value="${id}" ${id === cur ? "selected" : ""}>${providers[id].name || id}</option>`)
        .join("");
      provEl.disabled = false;
    }
    const provider = (provEl && provEl.value) || s.aiProvider || "gemini";
    if (modelEl) {
      const models = modelsForProvider(provider);
      const curM = s.aiModel || models[0]?.value || "";
      modelEl.innerHTML = models
        .map((m) => `<option value="${m.value}" ${m.value === curM ? "selected" : ""}>${m.label}</option>`)
        .join("");
    }
    if (keyEl && s.apiKey) keyEl.value = s.apiKey;
  };

  const ensureApiSetup = async () => {
    const s = window.TrainerDB.getSettings() || {};
    if (s.apiKey && String(s.apiKey).trim()) return true;
    if (s.skippedApiSetup) return false;

    const providers = providerOptions();
    const provider0 = s.aiProvider || "gemini";
    let models = modelsForProvider(provider0);

    const res = await window.TrainerUI.open({
      title: "Set up AI",
      message: "Choose engine + model and paste your API key. You can change this later in Settings.",
      icon: "🔑",
      fields: [
        {
          name: "aiProvider",
          label: "AI engine",
          type: "select",
          options: providers,
          value: provider0
        },
        {
          name: "aiModel",
          label: "Model",
          type: "select",
          options: models.length ? models : [{ value: "gemini-3.7-flash", label: "Gemini 3.7 Flash" }],
          value: s.aiModel || models[0]?.value || "gemini-3.7-flash"
        },
        {
          name: "apiKey",
          label: "API key",
          placeholder: "Paste key…",
          value: s.apiKey || ""
        }
      ],
      buttons: [
        { id: "save", label: "Save & continue", primary: true },
        { id: "getkey", label: "Get free / open key page" },
        { id: "skip", label: "Skip for now" }
      ]
    });

    if (!res || res.action === "skip") {
      window.TrainerDB.saveSettings({ skippedApiSetup: true });
      return false;
    }
    if (res.action === "getkey") {
      const prov = String(res.data?.aiProvider || provider0);
      const url =
        window.TrainerConfig.AI_PROVIDERS?.[prov]?.keyUrl ||
        window.TrainerConfig.GEMINI_KEY_URL ||
        "https://aistudio.google.com/api-keys";
      try {
        if (window.Capacitor?.Plugins?.Browser) {
          await window.Capacitor.Plugins.Browser.open({ url });
        } else {
          window.open(url, "_blank");
        }
      } catch (_) {
        window.open(url, "_blank");
      }
      return ensureApiSetup();
    }
    if (res.action === "save") {
      const key = String(res.data?.apiKey || "").trim();
      const provider = String(res.data?.aiProvider || "gemini").trim();
      const model = String(res.data?.aiModel || "").trim();
      if (!key) {
        await window.TrainerUI.alert("API key", "Paste your API key, or open the key page.", { icon: "⚠️" });
        return ensureApiSetup();
      }
      window.TrainerDB.saveSettings({
        apiKey: key,
        aiModel: model,
        aiProvider: provider,
        skippedApiSetup: false
      });
      fillSettingsAiControls();
      await window.TrainerUI.alert("Saved", "AI settings saved on this device.", { icon: "✅" });
      return true;
    }
    return false;
  };

  const autoConnectDrive = async () => {
    try {
      if (window.TrainerDrive.getToken()) {
        await window.TrainerDrive.ensureFolder();
        await window.TrainerDrive.pullAll();
        return true;
      }
      // After Google login, request Drive scopes (same Google account)
      const connected = await window.TrainerDrive.connectDrive();
      if (connected || window.TrainerDrive.getToken()) {
        await window.TrainerDrive.ensureFolder();
        try {
          await window.TrainerDrive.pullAll();
        } catch (_) {}
        try {
          await window.TrainerDrive.pushAll();
        } catch (_) {}
        return true;
      }
    } catch (e) {
      console.warn("autoConnectDrive", e);
    }
    return false;
  };

  const enterApp = async () => {
    showView("app");
    // First-run: API key + model + engine
    await ensureApiSetup();
    // Auto Google Drive — restore cloud profile before onboarding decision
    await autoConnectDrive();
    try {
      if (window.TrainerDrive.getToken()) {
        await window.TrainerDrive.pullAll();
      }
    } catch (e) {
      console.warn("drive restore", e);
    }

    const profile = window.TrainerDB.getProfile();
    if (profile?.onboardingDone) {
      // Returning user — data already restored from Drive
    } else if (!profile?.onboardingDone) {
      showView("onboarding");
      startOnboarding();
      return;
    }
    await ensureTodayTasks();
    maybeWeekendPhotoPrompt();
    renderDashboard();
    switchTab("home");
    try {
      if (window.TrainerDrive.getToken()) {
        await window.TrainerDrive.pullAll();
        await ensureTodayTasks();
        renderDashboard();
      }
    } catch (e) {
      console.warn("drive pull", e);
    }
  };

  // —— Onboarding wizard ——
  let ob = {};
  const startOnboarding = () => {
    ob = {};
    $("obStep").textContent = "Step 1 of 6";
    $("obBody").innerHTML = `
      <h2>Let's build your profile</h2>
      <p class="muted">AI Trainer uses this to plan workouts around your life.</p>
      <label class="field"><span>Name</span><input id="obName" placeholder="Your name" /></label>
      <label class="field"><span>Gender</span>
        <select id="obGender">
          <option value="">Select…</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </label>
      <label class="field"><span>Age</span><input id="obAge" type="number" placeholder="25" /></label>
      <label class="field"><span>Weight (kg)</span><input id="obWeight" type="number" step="0.1" /></label>
      <label class="field"><span>Height (cm)</span><input id="obHeight" type="number" step="0.1" /></label>
      <button type="button" class="btn primary block" id="obNext1">Continue</button>`;
    $("obNext1").onclick = () => {
      ob.name = $("obName").value.trim();
      ob.gender = ($("obGender").value || "").trim();
      ob.age = Number($("obAge").value) || 0;
      ob.weightKg = Number($("obWeight").value) || 0;
      ob.heightCm = Number($("obHeight").value) || 0;
      if (!ob.name) return window.TrainerUI.alert("Name", "Please enter your name", { icon: "⚠️" });
      if (!ob.gender) return window.TrainerUI.alert("Gender", "Please select male or female", { icon: "⚠️" });
      obStep2();
    };
  };

  const obStep2 = () => {
    $("obStep").textContent = "Step 2 of 6";
    $("obBody").innerHTML = `
      <h2>Workout timing</h2>
      <label class="field"><span>Usually from</span><input id="obFrom" type="time" value="06:00" /></label>
      <label class="field"><span>Usually until</span><input id="obTo" type="time" value="07:30" /></label>
      <label class="field"><span>Training style</span>
        <select id="obStyle"><option value="gym">Gym</option><option value="natural">Natural / home</option></select>
      </label>
      <div id="obGymWrap" class="hidden">
        <label class="field"><span>Machines available at your gym</span>
          <textarea id="obMachines" rows="3" placeholder="e.g. bench, squat rack, cables, leg press…"></textarea>
        </label>
      </div>
      <button type="button" class="btn primary block" id="obNext2">Continue</button>`;
    const sync = () => $("obGymWrap").classList.toggle("hidden", $("obStyle").value !== "gym");
    $("obStyle").onchange = sync;
    sync();
    $("obNext2").onclick = () => {
      ob.timeFrom = $("obFrom").value;
      ob.timeTo = $("obTo").value;
      ob.style = $("obStyle").value;
      ob.gymMachines = $("obMachines")?.value?.trim() || "";
      obStep3();
    };
  };

  const obStep3 = () => {
    $("obStep").textContent = "Step 3 of 6";
    $("obBody").innerHTML = `
      <h2>Your training journey</h2>
      <button type="button" class="btn block choice" data-j="first">First time training</button>
      <button type="button" class="btn block choice" data-j="current">Currently working out</button>
      <button type="button" class="btn block choice" data-j="again">Joining again after a break</button>`;
    document.querySelectorAll("[data-j]").forEach((b) => {
      b.onclick = async () => {
        ob.journey = b.dataset.j;
        if (ob.journey === "again") {
          const gap = await window.TrainerUI.prompt(
            "Break length",
            "How long since you last trained consistently?",
            { fieldLabel: "e.g. 3 months", icon: "⏱️" }
          );
          ob.breakDuration = gap || "";
        }
        obStep4();
      };
    });
  };

  const obStep4 = () => {
    $("obStep").textContent = "Step 4 of 6";
    const goals = window.TrainerConfig.BODY_GOALS.map(
      (g) => `<button type="button" class="btn block choice" data-g="${g}">${g}</button>`
    ).join("");
    $("obBody").innerHTML = `
      <h2>Dream body</h2>
      <p class="muted">What are you training toward?</p>
      ${goals}`;
    document.querySelectorAll("[data-g]").forEach((b) => {
      b.onclick = () => {
        ob.goal = b.dataset.g;
        obStep5();
      };
    });
  };

  const obStep5 = () => {
    $("obStep").textContent = "Step 5 of 6";
    $("obBody").innerHTML = `
      <h2>Rest & requirements</h2>
      <label class="field"><span>Rest day(s)?</span>
        <input id="obRest" placeholder="e.g. Sunday, or none" />
      </label>
      <label class="field"><span>Any special requirements</span>
        <textarea id="obReq" rows="3" placeholder="Injuries, equipment limits, preferences…"></textarea>
      </label>
      <button type="button" class="btn primary block" id="obNext5">Continue</button>`;
    $("obNext5").onclick = () => {
      ob.restDays = $("obRest").value.trim();
      ob.requirements = $("obReq").value.trim();
      obStep6();
    };
  };

  const obStep6 = () => {
    $("obStep").textContent = "Step 6 of 6";
    $("obBody").innerHTML = `
      <h2>Current physique photo</h2>
      <p class="muted">Saved forever as your baseline. Used by AI for better coaching.</p>
      <img id="obPreview" class="physique-preview hidden" alt="" />
      <button type="button" class="btn primary block" id="obCam">Take / choose photo</button>
      <button type="button" class="btn ghost block" id="obSkip">Skip for now</button>
      <button type="button" class="btn primary block hidden" id="obFinish">Generate my plan</button>`;
    let photo = null;
    $("obCam").onclick = async () => {
      try {
        let dataUrl = null;
        if (window.Capacitor?.Plugins?.Camera) {
          const photoCap = await window.Capacitor.Plugins.Camera.getPhoto({
            quality: 80,
            source: "PROMPT",
            resultType: "Base64"
          });
          dataUrl = "data:image/jpeg;base64," + photoCap.base64String;
        } else {
          dataUrl = await new Promise((resolve) => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/*";
            inp.onchange = () => {
              const f = inp.files?.[0];
              if (!f) return resolve(null);
              const r = new FileReader();
              r.onload = () => resolve(r.result);
              r.readAsDataURL(f);
            };
            inp.click();
          });
        }
        if (!dataUrl) return;
        photo = dataUrl;
        const img = $("obPreview");
        img.src = dataUrl;
        img.classList.remove("hidden");
        $("obFinish").classList.remove("hidden");
      } catch (e) {
        window.TrainerUI.alert("Camera", String(e.message || e), { icon: "⚠️" });
      }
    };
    $("obSkip").onclick = () => finishOnboarding(null);
    $("obFinish").onclick = () => finishOnboarding(photo);
  };

  const finishOnboarding = async (photoDataUrl) => {
    window.TrainerUI.showThinking(true);
    try {
      const profile = {
        ...ob,
        gender: ob.gender || "",
        trainingStyle: ob.style || ob.trainingStyle || "gym",
        machines: (ob.gymMachines || ob.machines || "")
          .split(/[,\n]+/)
          .map((x) => x.trim())
          .filter(Boolean),
        bodyGoal: ob.goal || ob.bodyGoal || "",
        journeyType: ob.journey || ob.journeyType || "first",
        onboardingDone: true,
        createdAt: Date.now()
      };
      window.TrainerDB.saveProfile(profile);
      try {
        if (window.TrainerDrive.getToken()) {
          await window.TrainerDrive.pushAll();
        }
      } catch (_) {}
      if (photoDataUrl) {
        window.TrainerDB.addPhysiqueImage({
          id: "phys_primary",
          dataUrl: photoDataUrl,
          isPrimary: true,
          takenAt: Date.now(),
          label: "Baseline physique"
        });
        try {
          if (window.TrainerDrive.getToken()) {
            await window.TrainerDrive.uploadImage("physique-baseline.jpg", photoDataUrl);
          }
        } catch (_) {}
      }
      const plan = await window.TrainerAI.generatePlan("Initial plan after onboarding");
      window.TrainerDB.savePlan(plan);
      await ensureTodayTasks(true);
      try {
        if (window.TrainerDrive.getToken()) await window.TrainerDrive.pushAll();
      } catch (_) {}
      showView("app");
      switchTab("home");
      await window.TrainerUI.alert("Plan ready", plan.title || "Your monthly plan is ready.", { icon: "🏆" });
    } catch (e) {
      await window.TrainerUI.alert("Setup error", String(e.message || e), { icon: "⚠️" });
      showView("app");
      switchTab("home");
    } finally {
      window.TrainerUI.showThinking(false);
    }
  };

  const ensureTodayTasks = async (force) => {
    const key = todayKey();
    const existing = window.TrainerDB.getDayTasks(key);
    if (existing && !force) return existing;
    window.TrainerUI.showThinking(true);
    try {
      const day = await window.TrainerAI.generateDayTasks(key);
      const tasks = (day.tasks || []).map((t, i) => ({
        ...t,
        id: t.id || "t" + (i + 1),
        status: "pending",
        completedAt: null
      }));
      const payload = {
        date: key,
        dayFocus: day.dayFocus || "",
        motivation: day.motivation || "",
        tasks,
        generatedAt: Date.now()
      };
      window.TrainerDB.saveDayTasks(key, payload);
      // learn workout names
      tasks.forEach((t) => {
        if (t.name) {
          window.TrainerDB.upsertWorkout({
            name: t.name,
            type: t.weightKg != null ? "weight" : "bodyweight",
            lastSets: t.sets,
            lastReps: t.reps,
            lastWeightKg: t.weightKg
          });
        }
      });
      return payload;
    } finally {
      window.TrainerUI.showThinking(false);
    }
  };

  let editingTaskId = null;

  const renderTasks = (editId) => {
    const key = todayKey();
    const day = window.TrainerDB.getDayTasks(key);
    const list = $("tasksList");
    const focus = $("tasksFocus");
    if (focus) focus.textContent = day?.dayFocus || day?.title || "Today";
    if (!list) return;
    if (!day?.tasks?.length) {
      list.innerHTML = `<div class="card muted-card">No tasks for today yet.</div>`;
      $("taskEditor")?.classList.add("hidden");
      return;
    }
    list.innerHTML = day.tasks
      .map((t) => {
        const st = t.status || "pending";
        const weight =
          t.weightKg != null && t.weightKg !== ""
            ? ` · ${t.weightKg} kg`
            : "";
        return `<div class="task-card ${st}" data-tid="${t.id}">
          <div class="task-title">${escapeHtml(t.name || t.text || "Task")}</div>
          <div class="task-meta">${t.sets || "—"} sets · ${t.reps || "—"} reps${weight} · rest ${t.restSec || t.rest || 60}s</div>
          ${t.notes || t.userNote ? `<div class="muted small">${escapeHtml(t.notes || t.userNote)}</div>` : ""}
          <div class="task-actions">
            <button type="button" class="btn primary sm" data-act="done">Completed</button>
            <button type="button" class="btn ghost sm" data-act="edit">Edit</button>
            <button type="button" class="btn ghost sm" data-act="skip">Not completed</button>
          </div>
        </div>`;
      })
      .join("");
    list.querySelectorAll(".task-card").forEach((card) => {
      card.querySelectorAll("[data-act]").forEach((btn) => {
        btn.onclick = () => {
          if (btn.dataset.act === "edit") openTaskEditor(card.dataset.tid);
          else handleTask(card.dataset.tid, btn.dataset.act);
        };
      });
    });
    if (editId) openTaskEditor(editId);
  };

  const openTaskEditor = (tid) => {
    const key = todayKey();
    const day = window.TrainerDB.getDayTasks(key);
    const t = day?.tasks?.find((x) => x.id === tid);
    if (!t) return;
    editingTaskId = tid;
    const ed = $("taskEditor");
    if (!ed) return;
    ed.classList.remove("hidden");
    if ($("taskEditTitle")) $("taskEditTitle").textContent = "Edit: " + (t.name || t.text || "Task");
    if ($("teSets")) $("teSets").value = t.sets ?? "";
    if ($("teReps")) $("teReps").value = t.reps ?? "";
    if ($("teWeight")) $("teWeight").value = t.weightKg ?? "";
    if ($("teRest")) $("teRest").value = t.restSec ?? t.rest ?? 60;
    if ($("teNotes")) $("teNotes").value = t.notes || t.userNote || "";
    ed.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const saveTaskEditor = (complete) => {
    if (!editingTaskId) return;
    const key = todayKey();
    const day = window.TrainerDB.getDayTasks(key);
    if (!day) return;
    const t = day.tasks.find((x) => x.id === editingTaskId);
    if (!t) return;
    t.sets = Number($("teSets")?.value) || t.sets;
    t.reps = Number($("teReps")?.value) || t.reps;
    const w = $("teWeight")?.value;
    t.weightKg = w === "" || w == null ? t.weightKg : Number(w);
    t.restSec = Number($("teRest")?.value) || t.restSec || 60;
    t.notes = $("teNotes")?.value?.trim() || "";
    t.userNote = t.notes;
    if (complete) {
      t.status = "done";
      t.completedAt = Date.now();
    } else {
      t.status = t.status === "done" ? "done" : "changed";
    }
    if (t.weightKg != null) {
      window.TrainerDB.upsertWorkout({
        name: t.name,
        type: "weight",
        prSets: t.sets,
        prReps: t.reps,
        prWeightKg: t.weightKg
      });
    }
    window.TrainerDB.saveDayTasks(key, day);
    $("taskEditor")?.classList.add("hidden");
    editingTaskId = null;
    renderTasks();
    renderDashboard();
    try {
      if (window.TrainerDrive.getToken()) window.TrainerDrive.pushAll().catch(() => {});
    } catch (_) {}
  };

  const renderDashboard = () => {
    const key = todayKey();
    const day = window.TrainerDB.getDayTasks(key);
    const profile = window.TrainerDB.getProfile() || {};
    $("dashHello").textContent = "Hi, " + (profile.name || "Athlete");
    $("dashFocus").textContent = day?.dayFocus || "Your day";
    $("dashMotivation").textContent = day?.motivation || "";
    const box = $("dashTasks");
    if (!box) return;
    if (!day?.tasks?.length) {
      box.innerHTML = `<div class="card muted-card">Rest or no tasks yet. Pull to refresh / regenerate in Settings.</div>`;
      return;
    }
    box.innerHTML = day.tasks
      .map((t) => {
        const done = t.status === "done";
        const changed = t.status === "changed";
        const weight =
          t.weightKg != null && t.weightKg !== ""
            ? ` · <strong>${t.weightKg} kg</strong> <span class="muted">(plates)</span>`
            : "";
        const yt = encodeURIComponent(t.youtubeQuery || t.name + " workout tutorial");
        return `<div class="task-card ${done ? "done" : ""} ${changed ? "changed" : ""}" data-tid="${t.id}">
          <div class="task-title">${escapeHtml(t.name)}</div>
          <div class="task-meta">${t.sets || "—"} sets · ${t.reps || "—"} reps${weight} · rest ${t.restSec || 60}s</div>
          ${t.notes ? `<div class="muted small">${escapeHtml(t.notes)}</div>` : ""}
          <div class="task-actions">
            <button type="button" class="btn primary sm" data-act="done">Completed</button>
            <button type="button" class="btn ghost sm" data-act="edit">Edit</button>
            <button type="button" class="btn ghost sm" data-act="skip">Not completed</button>
          </div>
        </div>`;
      })
      .join("");
    box.querySelectorAll(".task-card").forEach((card) => {
      card.querySelectorAll("[data-act]").forEach((btn) => {
        btn.onclick = () => handleTask(card.dataset.tid, btn.dataset.act);
      });
    });
  };

  const escapeHtml = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const handleTask = async (tid, act) => {
    const key = todayKey();
    const day = window.TrainerDB.getDayTasks(key);
    if (!day) return;
    const t = day.tasks.find((x) => x.id === tid);
    if (!t) return;
    if (act === "done") {
      t.status = "done";
      t.completedAt = Date.now();
    } else if (act === "skip") {
      t.status = "skipped";
    } else if (act === "edit" || act === "change") {
      switchTab("tasks", { editTaskId: tid });
      return;
    } else if (act === "pending") {
      t.status = "pending";
      delete t.completedAt;
    }
    window.TrainerDB.saveDayTasks(key, day);
    renderDashboard();
    if ($("tab-tasks") && !$("tab-tasks").classList.contains("hidden")) renderTasks();
    try {
      if (window.TrainerDrive.getToken()) window.TrainerDrive.pushAll().catch(() => {});
    } catch (_) {}
  };

  const maybeWeekendPhotoPrompt = async () => {
    if (new Date().getDay() !== 6) return; // Saturday
    const s = window.TrainerDB.getSettings();
    const week = todayKey().slice(0, 7);
    if (s.lastPhotoPromptWeek === week) return;
    const act = await window.TrainerUI.open({
      title: "Weekly physique check",
      message: "Update your body photo so AI can adjust your plan.",
      icon: "📸",
      fields: [],
      buttons: [
        { id: "now", label: "Update now", primary: true },
        { id: "later", label: "Update sometime later" },
        { id: "skip", label: "Skip this week" }
      ]
    });
    window.TrainerDB.saveSettings({ lastPhotoPromptWeek: week });
    if (!act || act.action === "skip") return;
    if (act.action === "later") {
      setTimeout(() => maybeWeekendPhotoPromptForce(), 2 * 60 * 60 * 1000);
      return;
    }
    await updatePhysiquePhoto();
  };

  const maybeWeekendPhotoPromptForce = async () => {
    const act = await window.TrainerUI.open({
      title: "Physique photo reminder",
      message: "Ready to update your progress photo?",
      icon: "📸",
      fields: [],
      buttons: [
        { id: "now", label: "Update now", primary: true },
        { id: "later", label: "Later again" },
        { id: "skip", label: "Skip" }
      ]
    });
    if (act?.action === "now") await updatePhysiquePhoto();
    if (act?.action === "later") setTimeout(() => maybeWeekendPhotoPromptForce(), 2 * 60 * 60 * 1000);
  };

  const updatePhysiquePhoto = async () => {
    try {
      let dataUrl = null;
      if (window.Capacitor?.Plugins?.Camera) {
        const photoCap = await window.Capacitor.Plugins.Camera.getPhoto({
          quality: 80,
          source: "PROMPT",
          resultType: "Base64"
        });
        dataUrl = "data:image/jpeg;base64," + photoCap.base64String;
      } else {
        dataUrl = await new Promise((resolve) => {
          const inp = document.createElement("input");
          inp.type = "file";
          inp.accept = "image/*";
          inp.onchange = () => {
            const f = inp.files?.[0];
            if (!f) return resolve(null);
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.readAsDataURL(f);
          };
          inp.click();
        });
      }
      if (!dataUrl) return;
      window.TrainerDB.addPhysiqueImage({
        id: "phys_" + Date.now(),
        dataUrl,
        isPrimary: false,
        takenAt: Date.now(),
        label: "Progress " + todayKey()
      });
      const w = await window.TrainerUI.prompt("Weight (kg)", "Optional update — leave blank to skip", {
        inputType: "number",
        placeholder: "Skip"
      });
      if (w != null && String(w).trim() !== "") {
        const p = window.TrainerDB.getProfile() || {};
        window.TrainerDB.saveProfile({ ...p, weightKg: Number(w) });
      }
      try {
        if (window.TrainerDrive.getToken()) {
          await window.TrainerDrive.uploadImage("physique-" + todayKey() + ".jpg", dataUrl);
          await window.TrainerDrive.pushAll();
        }
      } catch (_) {}
      await window.TrainerUI.alert("Saved", "Progress photo saved.", { icon: "✅" });
      renderImages();
    } catch (e) {
      window.TrainerUI.alert("Photo", String(e.message || e), { icon: "⚠️" });
    }
  };

  const renderWorkouts = () => {
    const list = window.TrainerDB.getWorkouts() || [];
    const box = $("workoutList");
    if (!box) return;
    box.innerHTML = list.length
      ? list
          .map(
            (w) => `<div class="card">
          <strong>${escapeHtml(w.name)}</strong>
          <div class="muted small">${w.type || "workout"}
            ${w.prWeightKg != null ? " · PR " + w.prWeightKg + " kg plates" : ""}
            ${w.prSets ? " · " + w.prSets + "×" + (w.prReps || "") : ""}
          </div>
        </div>`
          )
          .join("")
      : `<p class="muted">Workouts appear here as AI assigns them. You can also add your own.</p>`;
  };

  const renderProfile = () => {
    const p = window.TrainerDB.getProfile() || {};
    const box = $("profileBody");
    if (!box) return;
    const machines = Array.isArray(p.machines)
      ? p.machines.join(", ")
      : p.gymMachines || "";
    const goals = (window.TrainerConfig.BODY_GOALS || []).map(
      (g) => `<option value="${g}" ${(p.bodyGoal || p.goal) === g ? "selected" : ""}>${g}</option>`
    ).join("");
    box.innerHTML = `
      <div class="card profile-form">
        <p class="muted small">All onboarding answers — edit and save anytime.</p>
        <label class="field"><span>Name</span><input id="pfName" value="${escapeHtml(p.name || "")}" /></label>
        <label class="field"><span>Gender</span>
          <select id="pfGender">
            <option value="">Select…</option>
            <option value="male" ${p.gender === "male" ? "selected" : ""}>Male</option>
            <option value="female" ${p.gender === "female" ? "selected" : ""}>Female</option>
          </select>
        </label>
        <label class="field"><span>Age</span><input id="pfAge" type="number" value="${p.age || ""}" /></label>
        <label class="field"><span>Weight (kg)</span><input id="pfWeight" type="number" step="0.1" value="${p.weightKg || ""}" /></label>
        <label class="field"><span>Height (cm)</span><input id="pfHeight" type="number" step="0.1" value="${p.heightCm || ""}" /></label>
        <label class="field"><span>Training style</span>
          <select id="pfStyle">
            <option value="gym" ${(p.trainingStyle || p.style) === "gym" ? "selected" : ""}>Gym</option>
            <option value="natural" ${(p.trainingStyle || p.style) === "natural" ? "selected" : ""}>Natural / home</option>
          </select>
        </label>
        <label class="field"><span>Machines (gym)</span>
          <textarea id="pfMachines" rows="2">${escapeHtml(machines)}</textarea>
        </label>
        <label class="field"><span>Usual time from</span><input id="pfFrom" type="time" value="${p.timeFrom || "06:00"}" /></label>
        <label class="field"><span>Usual time until</span><input id="pfTo" type="time" value="${p.timeTo || "07:30"}" /></label>
        <label class="field"><span>Journey</span>
          <select id="pfJourney">
            <option value="first" ${(p.journeyType || p.journey) === "first" ? "selected" : ""}>First time</option>
            <option value="current" ${(p.journeyType || p.journey) === "current" ? "selected" : ""}>Currently training</option>
            <option value="again" ${(p.journeyType || p.journey) === "again" ? "selected" : ""}>Back after break</option>
          </select>
        </label>
        <label class="field"><span>Break length (if any)</span><input id="pfBreak" value="${escapeHtml(p.breakDuration || "")}" /></label>
        <label class="field"><span>Body goal</span><select id="pfGoal">${goals}</select></label>
        <label class="field"><span>Rest day(s)</span><input id="pfRest" value="${escapeHtml(p.restDays || "")}" /></label>
        <label class="field"><span>Special requirements</span>
          <textarea id="pfReq" rows="3" placeholder="Injuries, limits, preferences…">${escapeHtml(p.requirements || "")}</textarea>
        </label>
        <button type="button" class="btn primary block" id="btnSaveProfile">Save profile</button>
      </div>
      <div class="card">
        <strong>Monthly plan</strong>
        <div id="planPreview" class="md-body"></div>
        <button type="button" class="btn ghost block" id="btnResetPlan">Reset / regenerate plan</button>
      </div>`;
    const plan = window.TrainerDB.getPlan();
    const prev = $("planPreview");
    if (prev && plan) {
      const title = plan.title || "Plan";
      const overview = plan.overview || plan.summary || "";
      prev.innerHTML = `<strong>${escapeHtml(title)}</strong><p class="small">${escapeHtml(overview)}</p>`;
    }
    $("btnSaveProfile").onclick = saveProfileForm;
    $("btnResetPlan").onclick = resetPlan;
  };

  const saveProfileForm = async () => {
    const p = window.TrainerDB.getProfile() || {};
    const machinesRaw = $("pfMachines")?.value || "";
    const machines = machinesRaw.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
    const next = {
      ...p,
      name: $("pfName")?.value?.trim() || p.name,
      gender: $("pfGender")?.value || p.gender,
      age: Number($("pfAge")?.value) || p.age,
      weightKg: Number($("pfWeight")?.value) || p.weightKg,
      heightCm: Number($("pfHeight")?.value) || p.heightCm,
      trainingStyle: $("pfStyle")?.value || p.trainingStyle,
      style: $("pfStyle")?.value || p.style,
      machines,
      gymMachines: machinesRaw,
      timeFrom: $("pfFrom")?.value || p.timeFrom,
      timeTo: $("pfTo")?.value || p.timeTo,
      journeyType: $("pfJourney")?.value || p.journeyType,
      journey: $("pfJourney")?.value || p.journey,
      breakDuration: $("pfBreak")?.value?.trim() || "",
      bodyGoal: $("pfGoal")?.value || p.bodyGoal,
      goal: $("pfGoal")?.value || p.goal,
      restDays: $("pfRest")?.value?.trim() || "",
      requirements: $("pfReq")?.value?.trim() || ""
    };
    window.TrainerDB.saveProfile(next);
    try {
      if (window.TrainerDrive.getToken()) await window.TrainerDrive.pushAll();
    } catch (_) {}
    await window.TrainerUI.alert("Saved", "Profile updated.", { icon: "✅" });
    renderProfile();
  };

  const editProfile = async () => {
    switchTab("profile");
  };

  const resetPlan = async () => {
    const why = await window.TrainerUI.prompt(
      "Why reset the plan?",
      "Tell the AI what you want changed",
      { textarea: true, icon: "🔄", fieldLabel: "Your goal for the new plan" }
    );
    if (why == null || !String(why).trim()) return;
    window.TrainerUI.showThinking(true);
    try {
      const plan = await window.TrainerAI.generatePlan(why);
      window.TrainerDB.savePlan(plan);
      await ensureTodayTasks(true);
      try {
        if (window.TrainerDrive.getToken()) await window.TrainerDrive.pushAll();
      } catch (_) {}
      await window.TrainerUI.alert("New plan", plan.title || "Plan updated", { icon: "🏆" });
      renderProfile();
      renderDashboard();
    } catch (e) {
      await window.TrainerUI.alert("Error", String(e.message || e), { icon: "⚠️" });
    } finally {
      window.TrainerUI.showThinking(false);
    }
  };

  const renderImages = () => {
    const list = window.TrainerDB.getPhysiqueImages() || [];
    const box = $("imagesList");
    if (!box) return;
    box.innerHTML = list.length
      ? list
          .map(
            (im) => `<div class="card">
          <img src="${im.dataUrl || ""}" alt="" class="physique-thumb" />
          <div class="muted small">${escapeHtml(im.label || "")} · ${new Date(im.takenAt || 0).toLocaleDateString()}</div>
          ${im.isPrimary ? "<span class='badge'>Baseline</span>" : ""}
        </div>`
          )
          .join("")
      : `<p class="muted">No physique photos yet.</p>`;
  };

  // midnight rollover check on focus
  const checkMidnightRollover = async () => {
    const s = window.TrainerDB.getSettings();
    const key = todayKey();
    if (s.lastTaskDay === key) return;
    // new day — generate fresh tasks (old days stay in history)
    window.TrainerDB.saveSettings({ lastTaskDay: key });
    await ensureTodayTasks(true);
    renderDashboard();
  };

  const wireAuth = () => {
    let mode = "login";
    document.querySelectorAll("[data-auth]").forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.auth;
        document.querySelectorAll("[data-auth]").forEach((x) => x.classList.toggle("active", x === b));
        $("authSubmit").textContent = mode === "signup" ? "Create account" : "Log in";
      };
    });
    $("authForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("authEmail").value.trim();
      const pass = $("authPass").value;
      $("authMsg").textContent = "Please wait…";
      try {
        if (mode === "signup") await window.TrainerAuth.signUpEmail(email, pass);
        else await window.TrainerAuth.signInEmail(email, pass);
        await enterApp();
      } catch (err) {
        $("authMsg").textContent = err.message || String(err);
      }
    });
    $("btnGoogle")?.addEventListener("click", async () => {
      $("authMsg").textContent = "Opening Google…";
      try {
        await window.TrainerAuth.signInWithGoogle();
        const s = await window.TrainerAuth.getSession();
        if (s) {
          // Drive consent may open after session; enterApp will auto-connect
          await enterApp();
        }
      } catch (e) {
        $("authMsg").textContent = e.message || String(e);
      }
    });
  };

  const wireApp = () => {
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.onclick = () => switchTab(b.dataset.tab);
    });
    document.querySelectorAll(".side-link").forEach((b) => {
      b.onclick = () => switchTab(b.dataset.tab);
    });
    $("btnOpenSide")?.addEventListener("click", openSideNav);
    $("btnCloseSide")?.addEventListener("click", closeSideNav);
    $("sideBackdrop")?.addEventListener("click", closeSideNav);
    $("teSave")?.addEventListener("click", () => saveTaskEditor(false));
    $("teComplete")?.addEventListener("click", () => saveTaskEditor(true));
    $("teCancel")?.addEventListener("click", () => {
      editingTaskId = null;
      $("taskEditor")?.classList.add("hidden");
    });
    $("btnAiAsk")?.addEventListener("click", async () => {
      const q = $("aiChatInput")?.value?.trim();
      if (!q) return;
      window.TrainerUI.showThinking(true);
      try {
        const ans = await window.TrainerAI.coachChat(q);
        const log = $("aiChatLog");
        if (log) {
          log.innerHTML += `<div class="small"><strong>You:</strong> ${escapeHtml(q)}</div>`;
        }
        const out = $("aiChatOut");
        if (out) {
          if (window.TrainerAI.renderMarkdown) window.TrainerAI.renderMarkdown(out, ans);
          else out.textContent = ans;
        }
        if ($("aiChatInput")) $("aiChatInput").value = "";
      } catch (e) {
        await window.TrainerUI.alert("AI", String(e.message || e), { icon: "⚠️" });
      } finally {
        window.TrainerUI.showThinking(false);
      }
    });
    $("btnAddWorkout")?.addEventListener("click", async () => {
      const name = await window.TrainerUI.prompt("Workout name", "", { fieldLabel: "Name" });
      if (!name) return;
      const typeRes = await window.TrainerUI.open({
        title: "Type",
        message: "Weight exercise or bodyweight / skill?",
        icon: "🏋️",
        fields: [],
        buttons: [
          { id: "weight", label: "Weight (plates)", primary: true },
          { id: "bodyweight", label: "Bodyweight / reps" },
          { id: "cancel", label: "Cancel" }
        ]
      });
      if (!typeRes || typeRes.action === "cancel") return;
      let prWeightKg = null,
        prSets = null,
        prReps = null;
      if (typeRes.action === "weight") {
        prWeightKg = Number(
          (await window.TrainerUI.prompt("PR plate weight (kg)", "Plates only, not bar", {
            inputType: "number",
            defaultValue: "20"
          })) || 0
        );
      }
      prSets = Number(
        (await window.TrainerUI.prompt("Sets", "", { inputType: "number", defaultValue: "3" })) || 0
      );
      prReps = Number(
        (await window.TrainerUI.prompt("Reps", "", { inputType: "number", defaultValue: "8" })) || 0
      );
      window.TrainerDB.upsertWorkout({
        name,
        type: typeRes.action,
        prWeightKg,
        prSets,
        prReps
      });
      renderWorkouts();
      try {
        if (window.TrainerDrive.getToken()) window.TrainerDrive.pushAll().catch(() => {});
      } catch (_) {}
    });
    $("btnDietAsk")?.addEventListener("click", async () => {
      const q = $("dietQuestion")?.value?.trim() || "";
      window.TrainerUI.showThinking(true);
      try {
        const text = await window.TrainerAI.generateDiet(q || null);
        const out = $("dietOut");
        out.innerHTML = window.TrainerAI.formatReply(text);
        window.TrainerAI.renderMathIn(out);
      } catch (e) {
        window.TrainerUI.alert("Diet AI", String(e.message || e), { icon: "⚠️" });
      } finally {
        window.TrainerUI.showThinking(false);
      }
    });
    $("setProvider")?.addEventListener("change", () => {
      const s = window.TrainerDB.getSettings() || {};
      const provider = $("setProvider").value || "gemini";
      const models = modelsForProvider(provider);
      const modelEl = $("setModel");
      if (modelEl) {
        modelEl.innerHTML = models
          .map((m) => `<option value="${m.value}">${m.label}</option>`)
          .join("");
      }
      const url = window.TrainerConfig.AI_PROVIDERS?.[provider]?.keyUrl;
      if ($("btnGetGeminiKey") && url) $("btnGetGeminiKey").dataset.keyUrl = url;
    });
    $("btnGetGeminiKey")?.addEventListener("click", () => {
      const provider = $("setProvider")?.value || "gemini";
      const url =
        window.TrainerConfig.AI_PROVIDERS?.[provider]?.keyUrl ||
        window.TrainerConfig.GEMINI_KEY_URL ||
        "https://aistudio.google.com/api-keys";
      if (window.Capacitor?.Plugins?.Browser) {
        window.Capacitor.Plugins.Browser.open({ url });
      } else {
        window.open(url, "_blank");
      }
    });
    $("btnSaveSettings")?.addEventListener("click", () => {
      window.TrainerDB.saveSettings({
        apiKey: $("setApiKey")?.value?.trim() || "",
        aiProvider: $("setProvider")?.value || "gemini",
        aiModel: $("setModel")?.value || "gemini-3.7-flash"
      });
      window.TrainerUI.alert("Saved", "API settings saved on this device.", { icon: "✅" });
    });
    $("btnConnectDrive")?.addEventListener("click", async () => {
      try {
        await window.TrainerDrive.connectDrive();
        await window.TrainerDrive.ensureFolder();
        await window.TrainerDrive.pullAll();
        await window.TrainerDrive.pushAll();
        window.TrainerUI.alert("Drive", "Connected & synced.", { icon: "☁️" });
        renderDashboard();
      } catch (e) {
        window.TrainerUI.alert("Drive", String(e.message || e), { icon: "⚠️" });
      }
    });
    $("btnLogout")?.addEventListener("click", async () => {
      await window.TrainerAuth.signOut();
      showView("auth");
    });
    $("btnUpdatePhoto")?.addEventListener("click", () => updatePhysiquePhoto());
  };

  const boot = async () => {
    window.TrainerAuth.consumeHashSession?.();
    try { window.TrainerAuth.consumeStoredOAuth?.(); } catch (_) {}
    try { window.TrainerDrive.consumeOAuthRedirect?.(window.location.href); } catch (_) {}
    // Drive token from Google redirect hash
    const h = window.location.hash.replace(/^#/, "");
    if (h.includes("access_token") && h.includes("scope")) {
      try {
        await window.TrainerDrive.connectDrive();
      } catch (_) {}
    }
    wireAuth();
    wireApp();
    const s = window.TrainerDB.getSettings();
    if ($("setApiKey") && s.apiKey) $("setApiKey").value = s.apiKey;
    try {
      const session = await window.TrainerAuth.getSession();
      if (session?.access_token) {
        await enterApp();
        await checkMidnightRollover();
        return;
      }
    } catch (_) {}
    showView("auth");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

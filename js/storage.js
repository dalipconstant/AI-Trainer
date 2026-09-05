(() => {
  "use strict";
  const KEY = "aiTrainerLocal_v1";
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      return {};
    }
  };
  const write = (o) => localStorage.setItem(KEY, JSON.stringify(o));

  window.TrainerDB = {
    getAll: () => read(),
    setAll: (o) => write(o),
    patch: (partial) => {
      const n = { ...read(), ...partial };
      write(n);
      return n;
    },
    getProfile: () => read().profile || null,
    saveProfile: (p) => {
      const all = read();
      all.profile = { ...(all.profile || {}), ...p, updatedAt: Date.now() };
      write(all);
      return all.profile;
    },
    getPlan: () => read().plan || null,
    savePlan: (plan) => {
      const all = read();
      all.plan = { ...plan, savedAt: Date.now() };
      write(all);
      return all.plan;
    },
    getTasks: () => read().tasks || {},
    /** tasks keyed by YYYY-MM-DD */
    saveDayTasks: (dateKey, tasks) => {
      const all = read();
      all.tasks = all.tasks || {};
      all.tasks[dateKey] = tasks;
      write(all);
    },
    getDayTasks: (dateKey) => (read().tasks || {})[dateKey] || null,
    getWorkouts: () => read().workouts || [],
    saveWorkouts: (list) => {
      const all = read();
      all.workouts = list;
      write(all);
    },
    upsertWorkout: (w) => {
      const all = read();
      all.workouts = all.workouts || [];
      const i = all.workouts.findIndex(
        (x) => x.id === w.id || String(x.name).toLowerCase() === String(w.name).toLowerCase()
      );
      if (i >= 0) all.workouts[i] = { ...all.workouts[i], ...w };
      else all.workouts.unshift({ id: "w" + Date.now(), ...w });
      write(all);
      return all.workouts;
    },
    getPhysiqueImages: () => read().physiqueImages || [],
    addPhysiqueImage: (entry) => {
      const all = read();
      all.physiqueImages = all.physiqueImages || [];
      all.physiqueImages.unshift(entry);
      write(all);
      return all.physiqueImages;
    },
    getSettings: () => read().settings || {},
    saveSettings: (s) => {
      const all = read();
      all.settings = { ...(all.settings || {}), ...s };
      write(all);
      return all.settings;
    },
    getHistoryDays: (n = 3) => {
      const tasks = read().tasks || {};
      return Object.keys(tasks)
        .sort()
        .reverse()
        .slice(0, n)
        .map((k) => ({ date: k, tasks: tasks[k] }));
    }
  };
})();

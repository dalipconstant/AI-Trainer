(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const ensure = () => {
    let sheet = $("trainerDialog");
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.id = "trainerDialog";
    sheet.className = "sheet hidden";
    sheet.innerHTML = `
      <div class="sheet-backdrop" id="tdBackdrop"></div>
      <div class="sheet-panel dialog-panel">
        <div class="dialog-icon" id="tdIcon">💪</div>
        <h2 id="tdTitle"></h2>
        <p id="tdMsg" class="muted"></p>
        <div id="tdFields"></div>
        <div id="tdActions"></div>
      </div>`;
    document.body.appendChild(sheet);
    return sheet;
  };

  const open = ({ title, message, icon, fields, buttons }) =>
    new Promise((resolve) => {
      const sheet = ensure();
      $("tdIcon").textContent = icon || "💪";
      $("tdTitle").textContent = title || "";
      $("tdMsg").textContent = message || "";
      const fieldsBox = $("tdFields");
      fieldsBox.innerHTML = "";
      (fields || []).forEach((f) => {
        const lab = document.createElement("label");
        lab.className = "field";
        lab.innerHTML = `<span>${f.label || ""}</span>`;
        let input;
        if (f.type === "select") {
          input = document.createElement("select");
          (f.options || []).forEach((o) => {
            const opt = document.createElement("option");
            opt.value = o.value != null ? o.value : o;
            opt.textContent = o.label != null ? o.label : o;
            input.appendChild(opt);
          });
        } else if (f.type === "textarea") {
          input = document.createElement("textarea");
          input.rows = f.rows || 3;
        } else {
          input = document.createElement("input");
          input.type = f.inputType || "text";
        }
        input.id = "td_" + f.name;
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.value != null) input.value = f.value;
        lab.appendChild(input);
        fieldsBox.appendChild(lab);
      });
      const actions = $("tdActions");
      actions.innerHTML = "";
      const finish = (v) => {
        sheet.classList.add("hidden");
        resolve(v);
      };
      (buttons || [{ id: "ok", label: "OK", primary: true }]).forEach((b) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = b.primary ? "btn primary block" : b.danger ? "btn danger block" : "btn ghost block";
        btn.textContent = b.label;
        btn.onclick = () => {
          if (b.id === "cancel") return finish(null);
          const data = {};
          (fields || []).forEach((f) => {
            const el = $("td_" + f.name);
            data[f.name] = el ? el.value : "";
          });
          finish({ action: b.id, data });
        };
        actions.appendChild(btn);
      });
      $("tdBackdrop").onclick = () => finish(null);
      sheet.classList.remove("hidden");
    });

  window.TrainerUI = {
    open,
    prompt: async (title, message, opts = {}) => {
      const res = await open({
        title,
        message,
        icon: opts.icon || "✏️",
        fields: [
          {
            name: "value",
            label: opts.fieldLabel || "",
            placeholder: opts.placeholder || "",
            value: opts.defaultValue ?? "",
            inputType: opts.inputType || "text",
            type: opts.textarea ? "textarea" : "text"
          }
        ],
        buttons: [
          { id: "ok", label: opts.okLabel || "Continue", primary: true },
          { id: "cancel", label: "Cancel" }
        ]
      });
      if (!res || res.action !== "ok") return null;
      return res.data.value;
    },
    confirm: async (title, message, opts = {}) => {
      const res = await open({
        title,
        message,
        icon: opts.icon || "?",
        fields: [],
        buttons: [
          { id: "ok", label: opts.okLabel || "Yes", primary: true },
          { id: "cancel", label: opts.cancelLabel || "No" }
        ]
      });
      return !!(res && res.action === "ok");
    },
    alert: async (title, message, opts = {}) => {
      await open({
        title,
        message,
        icon: opts.icon || "✦",
        fields: [],
        buttons: [{ id: "ok", label: "OK", primary: true }]
      });
    },
    showThinking: (on) => {
      const el = $("thinkingOverlay");
      if (!el) return;
      el.classList.toggle("hidden", !on);
    }
  };
})();

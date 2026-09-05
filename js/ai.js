(() => {
  "use strict";

  const renderMarkdown = (el, text) => {
    if (!el) return;
    const raw = String(text || "");
    el.textContent = raw;
    try {
      if (window.marked) {
        el.innerHTML = window.marked.parse(raw);
      }
      if (window.renderMathInElement) {
        window.renderMathInElement(el, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false
        });
      }
    } catch (_) {}
  };

  const getKeyModel = () => {
    const s = window.TrainerDB.getSettings();
    return {
      provider: (s.aiProvider || "gemini").toLowerCase(),
      key: String(s.apiKey || "").trim(),
      model: String(s.aiModel || "gemini-3.7-flash").trim()
    };
  };

  const callGemini = async (prompt, imageDataUrl, isJson) => {
    const { key, model } = getKeyModel();
    if (!key) throw new Error("Add API key in Settings");
    const parts = [{ text: prompt }];
    if (imageDataUrl) {
      const m = String(imageDataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    }
    const tryModels = [model];
    for (const fb of ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-3.5-flash"]) {
      if (!tryModels.includes(fb)) tryModels.push(fb);
    }
    let lastErr = null;
    for (const m of tryModels) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(m) +
        ":generateContent?key=" +
        encodeURIComponent(key);
      const body = {
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: isJson ? 0.2 : 0.7,
          ...(isJson ? { responseMimeType: "application/json" } : {})
        }
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return (
          data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || ""
        ).trim();
      }
      lastErr = data?.error?.message || "AI error " + res.status;
      if (!/not found|404|invalid/i.test(String(lastErr))) break;
    }
    throw new Error(lastErr || "Gemini failed");
  };

  const callOpenAI = async (prompt, isJson) => {
    const { key, model } = getKeyModel();
    if (!key) throw new Error("Add OpenAI API key in Settings");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: isJson ? 0.2 : 0.7,
        ...(isJson ? { response_format: { type: "json_object" } } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "OpenAI error " + res.status);
    return (data?.choices?.[0]?.message?.content || "").trim();
  };

  const callClaude = async (prompt, isJson) => {
    const { key, model } = getKeyModel();
    if (!key) throw new Error("Add Claude API key in Settings");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: model || "claude-3-5-sonnet-latest",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt + (isJson ? "\n\nReturn ONLY valid JSON." : "") }]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "Claude error " + res.status);
    const text = (data?.content || []).map((c) => c.text || "").join("\n");
    return text.trim();
  };

  const callGrok = async (prompt, isJson) => {
    const { key, model } = getKeyModel();
    if (!key) throw new Error("Add Grok API key in Settings");
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key
      },
      body: JSON.stringify({
        model: model || "grok-2-1212",
        messages: [{ role: "user", content: prompt }],
        temperature: isJson ? 0.2 : 0.7
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "Grok error " + res.status);
    return (data?.choices?.[0]?.message?.content || "").trim();
  };

  const callAIText = async (prompt, imageDataUrl) => {
    const { provider } = getKeyModel();
    if (provider === "openai") return callOpenAI(prompt, false);
    if (provider === "claude") return callClaude(prompt, false);
    if (provider === "grok") return callGrok(prompt, false);
    return callGemini(prompt, imageDataUrl, false);
  };

  const callAIJson = async (prompt, imageDataUrl) => {
    const { provider } = getKeyModel();
    let text;
    if (provider === "openai") text = await callOpenAI(prompt + "\n\nReturn ONLY valid JSON.", true);
    else if (provider === "claude") text = await callClaude(prompt, true);
    else if (provider === "grok") text = await callGrok(prompt + "\n\nReturn ONLY valid JSON.", true);
    else text = await callGemini(prompt + "\n\nReturn ONLY valid JSON. No markdown fences.", imageDataUrl, true);
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(cleaned);
  };

  const profileBlurb = (p) => {
    p = p || {};
    return [
      "Name: " + (p.name || "Athlete"),
      "Gender: " + (p.gender || "unspecified"),
      "Age: " + (p.age || "?"),
      "Weight kg: " + (p.weightKg || "?"),
      "Height cm: " + (p.heightCm || "?"),
      "Style: " + (p.trainingStyle || "?"),
      "Goal: " + (p.bodyGoal || "?"),
      "Journey: " + (p.journeyType || "fresh"),
      "Machines: " + ((p.machines || []).join(", ") || "bodyweight / basic")
    ].join("\n");
  };

  const generatePlan = async (extraNote) => {
    const p = window.TrainerDB.getProfile() || {};
    const prompt =
      "You are an elite fitness coach. Create a 30-day progressive training plan.\n" +
      "Athlete profile:\n" +
      profileBlurb(p) +
      "\nRespect gender-appropriate programming (e.g. volume, recovery, exercise selection biases when relevant; never unsafe).\n" +
      "Style: " +
      (p.trainingStyle === "natural" ? "bodyweight / home" : "gym machines available") +
      ".\n" +
      (extraNote ? "Note: " + extraNote + "\n" : "") +
      'Return JSON: {"title":"","overview":"","weeks":[{"week":1,"focus":"","days":[{"day":1,"name":"","exercises":[{"name":"","sets":"","reps":"","notes":""}],"restNote":""}]}]}' +
      "\nInclude about 4 weeks. Vary intensity. Include rest days.";
    return callAIJson(prompt, p.physiqueDataUrl || null);
  };

  const generateDayTasks = async (dateStr, planSlice) => {
    const p = window.TrainerDB.getProfile() || {};
    const prompt =
      "Create today's gym/fitness tasks for " +
      dateStr +
      ".\nProfile:\n" +
      profileBlurb(p) +
      "\nPlan context: " +
      JSON.stringify(planSlice || {}).slice(0, 2000) +
      '\nReturn JSON: {"title":"","tasks":[{"id":"t1","text":"","done":false}],"coachTip":""}' +
      "\n3–6 concrete tasks. Gender-aware coaching tip. Safe progression.";
    return callAIJson(prompt);
  };

  const generateDietGuide = async () => {
    const p = window.TrainerDB.getProfile() || {};
    const prompt =
      "Write a practical diet guide for this athlete (India-friendly optional foods ok).\n" +
      profileBlurb(p) +
      "\nInclude calories estimate, macros, meal ideas, hydration. Gender-aware recommendations. Markdown.";
    return callAIText(prompt);
  };

  const coachChat = async (question) => {
    const p = window.TrainerDB.getProfile() || {};
    const prompt =
      "You are AI Trainer coach. Answer briefly and safely.\nProfile:\n" +
      profileBlurb(p) +
      "\nQuestion: " +
      question;
    return callAIText(prompt);
  };

  window.TrainerAI = {
    renderMarkdown,
    generatePlan,
    generateDayTasks,
    generateDietGuide,
    coachChat,
    callAIText,
    callAIJson
  };
})();

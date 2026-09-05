(() => {
  "use strict";
  window.TrainerConfig = {
    APP_NAME: "AI Trainer",
    SUPABASE_URL: "https://kzcltmopqoqtakgnvuzy.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_ilx3jFTfjwyKxLri_6TyCw__02oLlrT",
    GOOGLE_WEB_CLIENT_ID:
      "18856560320-26l8l7plebgsjik45tbol0v7osru6e2k.apps.googleusercontent.com",
    AUTH_REDIRECT:
      "https://kzcltmopqoqtakgnvuzy.supabase.co/auth/v1/callback",
    /** Where Google / email links should return (NOT localhost) */
    AUTH_CALLBACK_PAGE:
      "https://dalipconstant.github.io/AI-Trainer/auth-callback.html",
    AUTH_APP_REDIRECT:
      "https://dalipconstant.github.io/AI-Trainer/auth-callback.html",
    DRIVE_FOLDER_NAME: "AI Trainer Data",
    DRIVE_OAUTH_REDIRECT:
      "https://dalipconstant.github.io/AI-Trainer/oauth-drive.html",
    DRIVE_SCOPES: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ].join(" "),
    GEMINI_KEY_URL: "https://aistudio.google.com/api-keys",
    AI_PROVIDERS: {
      gemini: {
        name: "Google Gemini",
        keyUrl: "https://aistudio.google.com/api-keys",
        models: [
          { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash (latest)" },
          { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
          { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
          { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
          { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
          { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite" },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
          { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
          { id: "gemini-omni-flash-1.1", name: "Gemini Omni Flash 1.1" },
          { id: "gemini-3.5-live", name: "Gemini 3.5 Live" }
        ]
      },
      openai: {
        name: "OpenAI",
        keyUrl: "https://platform.openai.com/api-keys",
        models: [
          { id: "gpt-4o", name: "GPT-4o" },
          { id: "gpt-4o-mini", name: "GPT-4o mini" },
          { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
          { id: "o1-preview", name: "o1 Preview" },
          { id: "o1-mini", name: "o1 mini" },
          { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
          { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
          { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
          { id: "gpt-5.0-opus", name: "GPT-5.0 Opus" }
        ]
      },
      claude: {
        name: "Anthropic Claude",
        keyUrl: "https://console.anthropic.com/settings/keys",
        models: [
          { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet" },
          { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
          { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
          { id: "claude-4-opus", name: "Claude 4 Opus" },
          { id: "claude-4-sonnet", name: "Claude 4 Sonnet" },
          { id: "claude-5-opus", name: "Claude 5 Opus" },
          { id: "claude-5-sonnet", name: "Claude 5 Sonnet" }
        ]
      },
      grok: {
        name: "xAI Grok",
        keyUrl: "https://console.x.ai/",
        models: [
          { id: "grok-4.6", name: "Grok 4.6" },
          { id: "grok-4.3", name: "Grok 4.3" },
          { id: "grok-4.1-fast", name: "Grok 4.1 Fast" },
          { id: "grok-3-opus", name: "Grok 3 Opus" },
          { id: "grok-2-1212", name: "Grok 2" },
          { id: "grok-beta", name: "Grok Beta" }
        ]
      }
    },
    BODY_GOALS: ["Slim fit", "Muscular", "Strength", "Balanced"],
    DEFAULT_REST_NOTE: "Listen to your body. Sleep 7–8 hours."
  };
})();

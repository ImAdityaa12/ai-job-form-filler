# AI Job Form Filler — Chrome Extension

Auto-fill job application forms using AI based on your resume. Instead of a popup,
the extension now injects a **floating toolbar** directly onto the page.

## The toolbar

Click the extension icon (or press **Ctrl+Shift+Y**) to show/hide the draggable toolbar.
It has three one-click actions plus a settings menu:

| Action | What it does |
| --- | --- |
| ✨ **Auto Fill** | Detects every form field on the page and fills it with AI answers tailored to the job posting + your resume/profile. |
| 🔧 **Fix Field Errors** | Re-fills only the fields that show a validation error (red/`aria-invalid`, required-but-empty, native validation, nearby error text), passing the error message to the AI so it returns a corrected value. |
| 💼 **Workday Auto Fill** | Forces Workday-specific field detection (custom dropdowns, date pickers, `data-automation-id` widgets) for `myworkday.com` / `workday.com` application pages. |
| ⋮ **Menu** | Opens the settings & options panel (below). |

**Keyboard shortcuts:** `Ctrl+Shift+F` = Auto Fill · `Ctrl+Shift+Y` = toggle toolbar.

## The ⋮ menu

- **AI Model** — pick a provider + model and paste its API key. All options are free:
  - **Groq** — Llama 3.3 70B / 3.1 8B (⚡ fastest)
  - **Google Gemini** — **Gemini 2.5 Flash** (recommended), 2.5 Flash-Lite, 2.0 Flash
  - **Cerebras** — Llama 3.3 70B / 3.1 8B (⚡ ultra-fast)
  - **OpenRouter** / **NVIDIA NIM** — free hosted models
  - If a selected model is unavailable, the engine automatically falls back to the provider's other models.
- **Resume** — upload a PDF/DOC (stored and auto-attached to file-upload fields) and/or paste resume text.
- **Additional Details** — free-text extras combined with your resume.
- **Advanced Options** (authoritative — override the AI's guesses):
  - Full name, email, phone, current location
  - Current company / job title, total experience, notice period
  - Current CTC, expected CTC, available-from date, visa/work authorization
  - LinkedIn / GitHub / portfolio, willing to relocate
  - **Experience per skill** — e.g. `React → 3`, fills "years of experience in React" fields exactly
  - **Custom field answers** — if a field label contains a phrase, answer it with your exact text

All data is stored locally in `chrome.storage.local`. API calls go directly to the
provider you choose (proxied through the background worker to bypass page CORS).

## Install

1. `chrome://extensions/` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Click the extension icon on any page to open the toolbar, open ⋮, add your API key + resume, and **Save Settings**.

## Setup notes

- **Get an API key:** Groq → <https://console.groq.com/keys> · Gemini → <https://aistudio.google.com/app/apikey> · Cerebras → <https://cloud.cerebras.ai/> · OpenRouter → <https://openrouter.ai/keys>
- Icons (`icon16/48/128.png`) are included; regenerate with `create-icons.html` if needed.

## Files

- `manifest.json` — MV3 config (no popup; icon toggles the in-page toolbar).
- `background.js` — toggles the toolbar, routes keyboard commands, proxies fetches past CORS.
- `content.js` — the engine: field detection, error detection, AI answer generation, field filling (incl. React/Workday/Select2).
- `ui.js` — the floating toolbar + settings panel, isolated in a Shadow DOM.

## Privacy

All data stays in your browser's local storage. Nothing is sent anywhere except the
AI provider you configure.

## License

MIT

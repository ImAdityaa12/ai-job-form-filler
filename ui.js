// ==================== AI FORM FILLER : IN-PAGE TOOLBAR ====================
// A floating, draggable command bar (in a Shadow DOM so the host page's CSS
// can't touch it) with three actions: Auto Fill, Fix Field Errors, Workday
// Auto Fill, plus a menu holding the model selector, resume, additional
// details and advanced profile options. Talks to the engine in content.js
// through window.AIFormFiller.
//
// Design: single controlled accent (cobalt), Tabler line icons (no emoji),
// inner borders (no glows), WCAG AA contrast, reduced-motion honored.

(function () {
    // Re-injection guard: if the toolbar already exists, just toggle it.
    if (window.__aiFormFillerUI) {
        window.__aiFormFillerUI.toggle();
        return;
    }

    // ---- Tabler icon set (stroke = currentColor) ----
    const ICONS = {
        bolt: '<path d="M13 3v7h6l-8 11v-7H5z"/>',
        wand: '<path d="M6 21l15 -15l-3 -3l-15 15l3 3z"/><path d="M15 6l3 3"/><path d="M9 3l.6 1.6 1.6 .6 -1.6 .6 -.6 1.6 -.6 -1.6 -1.6 -.6 1.6 -.6z"/>',
        tool: '<path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"/>',
        briefcase: '<path d="M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2z"/><path d="M9 7v-2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2"/><path d="M3 13a20 20 0 0 0 18 0"/><path d="M12 12v.01"/>',
        dotsV: '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
        grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
        x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
        plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
        trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
        chevron: '<path d="M9 6l6 6l-6 6"/>',
        upload: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4v12"/>',
        file: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/><path d="M9 13h6"/><path d="M9 17h6"/>',
        chip: '<path d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2z"/><path d="M9 9h6v6h-6z"/><path d="M3 10h2"/><path d="M3 14h2"/><path d="M19 10h2"/><path d="M19 14h2"/><path d="M10 3v2"/><path d="M14 3v2"/><path d="M10 19v2"/><path d="M14 19v2"/>',
        sliders: '<path d="M4 6h8"/><path d="M16 6h4"/><path d="M4 12h2"/><path d="M10 12h10"/><path d="M4 18h10"/><path d="M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
        pencil: '<path d="M4 20h4l10.5 -10.5a1.5 1.5 0 0 0 -4 -4l-10.5 10.5z"/><path d="M13.5 6.5l4 4"/>',
        target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>'
    };
    function svg(name, size = 16, sw = 1.8) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    }

    // ---- Provider / model catalogue (kept in sync with content.js defaults) ----
    const PROVIDERS = {
        groq: {
            name: 'Groq', tag: 'Fastest, free',
            consoleUrl: 'https://console.groq.com/keys', consoleText: 'Groq Console',
            placeholder: 'Enter your Groq API key (gsk_...)',
            models: [
                { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Recommended)' },
                { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Fastest)' },
                { id: 'gemma2-9b-it', name: 'Gemma2 9B' }
            ]
        },
        gemini: {
            name: 'Google Gemini', tag: 'Free',
            consoleUrl: 'https://aistudio.google.com/app/apikey', consoleText: 'Google AI Studio',
            placeholder: 'Enter your Gemini API key (AIza...)',
            models: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recommended)' },
                { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite (Faster)' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
            ]
        },
        cerebras: {
            name: 'Cerebras', tag: 'Ultra-fast, free',
            consoleUrl: 'https://cloud.cerebras.ai/', consoleText: 'Cerebras Cloud',
            placeholder: 'Enter your Cerebras API key (csk-...)',
            models: [
                { id: 'llama-3.3-70b', name: 'Llama 3.3 70B (Recommended)' },
                { id: 'llama3.1-8b', name: 'Llama 3.1 8B (Fastest)' }
            ]
        },
        openrouter: {
            name: 'OpenRouter', tag: 'Free models',
            consoleUrl: 'https://openrouter.ai/keys', consoleText: 'OpenRouter',
            placeholder: 'Enter your OpenRouter API key (sk-or-...)',
            models: [
                { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)' },
                { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)' },
                { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)' }
            ]
        },
        nvidia: {
            name: 'NVIDIA NIM', tag: 'Free',
            consoleUrl: 'https://build.nvidia.com/', consoleText: 'NVIDIA Build',
            placeholder: 'Enter your NVIDIA API key (nvapi-...)',
            models: [
                { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
                { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
                { id: 'mistralai/mistral-7b-instruct-v0.3', name: 'Mistral 7B' }
            ]
        }
    };

    // Advanced profile text fields: [storage key, label, placeholder, input type]
    const PROFILE_FIELDS = [
        ['fullName', 'Full Name', 'Jane Doe', 'text'],
        ['email', 'Email', 'jane@email.com', 'email'],
        ['phone', 'Phone', '+1 555 123 4567', 'tel'],
        ['currentLocation', 'Current Location', 'Bengaluru, India', 'text'],
        ['currentCompany', 'Current Company', 'Acme Corp', 'text'],
        ['currentJobTitle', 'Current Job Title', 'Software Engineer', 'text'],
        ['totalExperience', 'Total Experience (years)', '3', 'text'],
        ['noticePeriod', 'Notice Period', '30 days / Immediate', 'text'],
        ['currentCTC', 'Current CTC / Salary', '8 LPA / 80000', 'text'],
        ['expectedCTC', 'Expected CTC / Salary', '12 LPA / 120000', 'text'],
        ['expectedJoiningDate', 'Available From', 'Immediately / 2 weeks', 'text'],
        ['visaStatus', 'Work Authorization', 'Citizen / H1B / Sponsorship', 'text'],
        ['linkedin', 'LinkedIn URL', 'https://linkedin.com/in/...', 'url'],
        ['github', 'GitHub URL', 'https://github.com/...', 'url'],
        ['portfolio', 'Portfolio / Website', 'https://...', 'url']
    ];

    // ---------- Build shadow host ----------
    const host = document.createElement('div');
    host.id = 'ai-form-filler-root';
    host.style.cssText = 'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important;';
    (document.documentElement || document.body).appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
<style>
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  .root {
    --accent: #2f6bd8;
    --accent-hover: #3a78e6;
    --accent-weak: rgba(47,107,216,.13);
    --accent-border: rgba(47,107,216,.4);
    --bar-bg: #0e0f13;
    --bar-fg: #f4f4f5;
    --bar-line: rgba(255,255,255,.09);
    --bar-hover: rgba(255,255,255,.08);
  }
  .wrap { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); }
  svg { display: block; flex: none; }

  /* ---- Toolbar ---- */
  .bar { display: flex; align-items: center; gap: 6px; background: var(--bar-bg); border: 1px solid var(--bar-line); border-radius: 13px; padding: 6px; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 10px 34px rgba(0,0,0,.34); user-select: none; }
  .grip { display: flex; align-items: center; cursor: grab; padding: 0 3px; color: rgba(244,244,245,.34); }
  .grip:active { cursor: grabbing; }
  .mark { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: var(--accent-weak); border: 1px solid var(--accent-border); color: var(--accent); }
  .mark.sm { width: 24px; height: 24px; border-radius: 7px; }

  .btn { display: inline-flex; align-items: center; gap: 7px; color: var(--bar-fg); background: transparent; border: 1px solid transparent; padding: 8px 12px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s; }
  .btn svg { color: rgba(244,244,245,.7); }
  .btn:hover { background: var(--bar-hover); }
  .btn:hover svg { color: var(--bar-fg); }
  .btn.primary { background: var(--accent); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.16); }
  .btn.primary svg { color: #fff; }
  .btn.primary:hover { background: var(--accent-hover); }
  .btn[disabled] { opacity: .55; cursor: wait; }
  .icon-btn { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: transparent; border: 1px solid transparent; color: var(--bar-fg); cursor: pointer; transition: background .15s; }
  .icon-btn:hover { background: var(--bar-hover); }
  .icon-btn.active { background: var(--accent-weak); color: var(--accent); border-color: var(--accent-border); }
  .sep { width: 1px; height: 22px; background: var(--bar-line); margin: 0 2px; }

  .spin { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* ---- Panel ---- */
  .panel { position: fixed; top: 70px; left: 16px; width: min(384px, calc(100vw - 24px)); max-height: 74vh; overflow-y: auto; background: #fff; color: #18181b; border: 1px solid #e8e8ec; border-radius: 16px; box-shadow: 0 16px 50px rgba(0,0,0,.26); display: none; }
  .panel.open { display: block; animation: drop .16s ease; }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .panel::-webkit-scrollbar { width: 12px; }
  .panel::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 7px; border: 3px solid #fff; }

  .phead { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ececf0; padding: 13px 15px; display: flex; align-items: center; justify-content: space-between; z-index: 2; }
  .phead h3 { font-size: 14px; font-weight: 700; letter-spacing: -.01em; margin: 0; display: flex; align-items: center; gap: 9px; color: #18181b; }
  .phead .x { display: flex; cursor: pointer; background: none; border: none; color: #a1a1aa; padding: 4px; border-radius: 7px; }
  .phead .x:hover { color: #18181b; background: #f4f4f5; }

  .body { padding: 14px 15px 18px; }
  .group { border: 1px solid #ececf0; border-radius: 12px; padding: 13px; margin-bottom: 11px; }
  .gtitle { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #71717a; margin-bottom: 11px; display: flex; align-items: center; gap: 7px; }
  .gtitle svg { color: #a1a1aa; }

  label.l { display: block; font-size: 12px; font-weight: 600; color: #3f3f46; margin: 11px 0 5px; }
  label.l:first-child { margin-top: 0; }
  .hint { font-size: 11px; color: #6b7280; margin-top: 5px; line-height: 1.45; }
  .in, select.in, textarea.in { width: 100%; padding: 9px 10px; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 13px; background: #fafafa; color: #18181b; transition: border-color .15s, box-shadow .15s, background .15s; }
  .in:focus, select.in:focus, textarea.in:focus { outline: none; border-color: var(--accent); background: #fff; box-shadow: 0 0 0 3px var(--accent-weak); }
  textarea.in { min-height: 78px; resize: vertical; line-height: 1.5; }
  select.in { cursor: pointer; }
  a.link { color: var(--accent); text-decoration: none; font-weight: 600; }
  a.link:hover { text-decoration: underline; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 10px; }
  .grid2 label.l { margin-top: 0; }

  .upload { border: 1.5px dashed #d4d4d8; border-radius: 10px; padding: 13px; text-align: center; background: #fafafa; transition: border-color .15s, background .15s; }
  .upload.has { border-color: var(--accent-border); background: var(--accent-weak); border-style: solid; }
  .ubtn { display: inline-flex; align-items: center; gap: 7px; background: #18181b; color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background .15s; }
  .ubtn:hover { background: #27272a; }
  .fname { margin-top: 9px; font-size: 12px; color: var(--accent); font-weight: 600; word-break: break-all; }

  details.adv { border: 1px solid #ececf0; border-radius: 12px; margin-bottom: 11px; overflow: hidden; }
  details.adv > summary { cursor: pointer; padding: 12px 13px; font-size: 12.5px; font-weight: 700; color: #3f3f46; list-style: none; display: flex; align-items: center; gap: 8px; background: #fafafa; }
  details.adv > summary::-webkit-details-marker { display: none; }
  details.adv > summary svg { color: #a1a1aa; }
  details.adv > summary .chev { margin-left: auto; transition: transform .2s; }
  details.adv[open] > summary .chev { transform: rotate(90deg); }
  .advbody { padding: 13px; }
  .subt { font-size: 12px; font-weight: 700; color: #52525b; margin: 16px 0 6px; display: flex; align-items: center; gap: 7px; }
  .subt svg { color: #a1a1aa; }

  .dyn { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
  .dyn .in { flex: 1; min-width: 0; }
  .dyn .years { flex: 0 0 64px; font-variant-numeric: tabular-nums; }
  .dyn .rm { display: flex; align-items: center; justify-content: center; flex: 0 0 34px; height: 34px; border: 1px solid #e4e4e7; background: #fafafa; color: #a1a1aa; border-radius: 8px; cursor: pointer; transition: all .15s; }
  .dyn .rm:hover { border-color: #f0c4c4; color: #b91c1c; background: #fef2f2; }
  .addrow { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 5px; background: #fff; color: var(--accent); border: 1px dashed var(--accent-border); border-radius: 8px; padding: 8px; width: 100%; font-size: 12px; font-weight: 600; cursor: pointer; transition: background .15s; }
  .addrow:hover { background: var(--accent-weak); }

  .save { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 11px; border: none; border-radius: 9px; font-size: 13.5px; font-weight: 700; cursor: pointer; color: #fff; background: var(--accent); box-shadow: inset 0 1px 0 rgba(255,255,255,.16); margin-top: 4px; transition: background .15s; }
  .save:hover { background: var(--accent-hover); }
  .danger { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 9px; border: 1px solid #f0d6d6; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; color: #b91c1c; background: #fff; margin-top: 8px; transition: background .15s; }
  .danger:hover { background: #fef2f2; }

  .status { margin-top: 10px; padding: 10px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; display: none; }
  .status.ok { display: block; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
  .status.err { display: block; background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }

  @media (prefers-reduced-motion: reduce) {
    .panel.open { animation: none; }
    * { transition: none !important; }
  }
</style>

<div class="root">
<div class="wrap" id="wrap">
  <div class="bar" id="bar">
    <span class="grip" id="grip" title="Drag">${svg('grip', 16)}</span>
    <div class="mark">${svg('bolt', 16)}</div>
    <button class="btn primary" id="autoFillBtn">${svg('wand')}<span>Auto Fill</span></button>
    <button class="btn" id="fixBtn">${svg('tool')}<span>Fix Field Errors</span></button>
    <button class="btn" id="workdayBtn">${svg('briefcase')}<span>Workday Auto Fill</span></button>
    <span class="sep"></span>
    <button class="icon-btn" id="menuBtn" title="Settings and options">${svg('dotsV', 18)}</button>
    <button class="icon-btn" id="closeBtn" title="Hide toolbar">${svg('x', 16)}</button>
  </div>
</div>

  <div class="panel" id="panel">
    <div class="phead">
      <h3><span class="mark sm">${svg('bolt', 14)}</span> AI Form Filler</h3>
      <button class="x" id="panelClose" title="Close">${svg('x', 16)}</button>
    </div>
    <div class="body">

      <div class="group">
        <div class="gtitle">${svg('chip', 14)} AI Model</div>
        <label class="l">Provider</label>
        <select class="in" id="providerSelect"></select>
        <label class="l">Model</label>
        <select class="in" id="modelSelect"></select>
        <label class="l">API Key</label>
        <input class="in" type="password" id="apiKey" placeholder="Enter your API key" />
        <div class="hint">Get a free key from <a class="link" id="apiKeyLink" target="_blank" rel="noopener" href="#">the provider console</a>.</div>
      </div>

      <div class="group">
        <div class="gtitle">${svg('file', 14)} Resume</div>
        <div class="upload" id="uploadArea">
          <input type="file" id="resumeFile" accept=".pdf,.doc,.docx,.txt" style="display:none" />
          <button class="ubtn" id="uploadBtn" type="button">${svg('upload', 15)} Choose File</button>
          <div class="fname" id="fileName"></div>
        </div>
        <div class="hint">PDF or DOC is stored for file-upload fields. Paste the text below so the AI can read it.</div>
        <label class="l">Resume Text</label>
        <textarea class="in" id="resume" placeholder="Paste your resume text here..." style="min-height:120px"></textarea>
      </div>

      <div class="group">
        <div class="gtitle">${svg('pencil', 14)} Additional Details</div>
        <textarea class="in" id="additionalInfo" placeholder="Anything extra not in your resume: cover-letter points, achievements, preferences."></textarea>
      </div>

      <details class="adv" id="advDetails">
        <summary>${svg('sliders', 15)} <span>Advanced Options</span> <span class="chev">${svg('chevron', 14)}</span></summary>
        <div class="advbody">
          <div class="hint" style="margin-bottom:10px">These values are authoritative and override the AI's guesses for matching fields.</div>
          <div class="grid2" id="profileGrid"></div>

          <label class="l">Willing to Relocate</label>
          <select class="in" id="willingToRelocate">
            <option value="">Not specified</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>

          <div class="subt">${svg('bolt', 13)} Experience per skill</div>
          <div class="hint" style="margin-bottom:6px">Fills "years of experience in X" fields with the exact value you set.</div>
          <div id="skillList"></div>
          <button class="addrow" id="addSkill" type="button">${svg('plus', 14)} Add skill</button>

          <div class="subt">${svg('target', 13)} Custom field answers</div>
          <div class="hint" style="margin-bottom:6px">If a field's label contains the phrase, it's answered with your exact text.</div>
          <div id="customList"></div>
          <button class="addrow" id="addCustom" type="button">${svg('plus', 14)} Add custom answer</button>
        </div>
      </details>

      <button class="save" id="saveBtn">Save Settings</button>
      <button class="danger" id="clearBtn">${svg('trash', 14)} Clear all saved data</button>
      <div class="status" id="status"></div>
    </div>
  </div>
</div>
`;

    const $ = (sel) => shadow.querySelector(sel);
    const wrap = $('#wrap'), panel = $('#panel'), bar = $('#bar');

    // Position the panel near the bar, capping its height to the available space
    // and flipping above the bar when there is more room up top. Keeps the panel
    // on-screen and internally scrollable instead of overflowing off the bottom.
    function positionPanel() {
        if (!panel.classList.contains('open')) return;
        const r = bar.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        const margin = 12, gap = 10;
        const pw = panel.offsetWidth || 384;
        let left = r.left + r.width / 2 - pw / 2;
        left = Math.max(margin, Math.min(left, vw - pw - margin));
        panel.style.left = left + 'px';
        panel.style.right = 'auto';

        const below = vh - r.bottom - gap - margin;
        const above = r.top - gap - margin;
        if (below >= 300 || below >= above) {
            panel.style.top = (r.bottom + gap) + 'px';
            panel.style.bottom = 'auto';
            panel.style.maxHeight = Math.max(180, below) + 'px';
        } else {
            panel.style.top = 'auto';
            panel.style.bottom = (vh - r.top + gap) + 'px';
            panel.style.maxHeight = Math.max(180, above) + 'px';
        }
    }
    window.addEventListener('resize', positionPanel);

    // Capture each action button's default markup so we can restore it after a busy state.
    const ACTION_BTNS = ['autoFillBtn', 'fixBtn', 'workdayBtn'];
    const labelHTML = {};
    ACTION_BTNS.forEach(id => labelHTML[id] = $('#' + id).innerHTML);

    // ---------- Visibility ----------
    wrap.style.display = 'none'; // hidden until the icon (or shortcut) opens it
    function toggle() {
        const showing = wrap.style.display !== 'none';
        wrap.style.display = showing ? 'none' : 'flex';
        if (showing) { panel.classList.remove('open'); $('#menuBtn').classList.remove('active'); }
    }
    function togglePanel() {
        panel.classList.toggle('open');
        const open = panel.classList.contains('open');
        $('#menuBtn').classList.toggle('active', open);
        if (open) { loadSettings(); positionPanel(); }
    }

    $('#menuBtn').addEventListener('click', togglePanel);
    $('#closeBtn').addEventListener('click', () => { wrap.style.display = 'none'; panel.classList.remove('open'); $('#menuBtn').classList.remove('active'); });
    $('#panelClose').addEventListener('click', () => { panel.classList.remove('open'); $('#menuBtn').classList.remove('active'); });

    // ---------- Drag ----------
    (function enableDrag() {
        let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
        const handle = $('#grip');
        const start = (e) => {
            dragging = true;
            const rect = wrap.getBoundingClientRect();
            wrap.style.left = rect.left + 'px';
            wrap.style.top = rect.top + 'px';
            wrap.style.transform = 'none';
            sx = e.clientX; sy = e.clientY; ox = rect.left; oy = rect.top;
            e.preventDefault();
        };
        const move = (e) => {
            if (!dragging) return;
            wrap.style.left = Math.max(0, ox + (e.clientX - sx)) + 'px';
            wrap.style.top = Math.max(0, oy + (e.clientY - sy)) + 'px';
            positionPanel(); // keep the panel attached if it's open
        };
        const end = () => { dragging = false; };
        handle.addEventListener('mousedown', start);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
    })();

    // ---------- Action buttons ----------
    function setBusy(busy, activeBtn) {
        ACTION_BTNS.forEach(id => {
            const b = $('#' + id);
            b.disabled = busy;
            if (busy && b === activeBtn) b.innerHTML = `<span class="spin"></span><span>Working</span>`;
            else if (!busy) b.innerHTML = labelHTML[id];
        });
    }
    async function runAction(btn, fn) {
        if (!window.AIFormFiller) {
            toast('Engine not ready. Reload the page and try again.', 'err');
            return;
        }
        setBusy(true, btn);
        try { await fn(); } catch (e) { console.error(e); } finally { setBusy(false, btn); }
    }
    $('#autoFillBtn').addEventListener('click', (e) => runAction(e.currentTarget, () => window.AIFormFiller.autoFill()));
    $('#fixBtn').addEventListener('click', (e) => runAction(e.currentTarget, () => window.AIFormFiller.fixErrors()));
    $('#workdayBtn').addEventListener('click', (e) => runAction(e.currentTarget, () => window.AIFormFiller.workdayAutoFill()));

    // ---------- Provider / model selects ----------
    const providerSelect = $('#providerSelect'), modelSelect = $('#modelSelect'), apiKeyInput = $('#apiKey'), apiKeyLink = $('#apiKeyLink');
    Object.entries(PROVIDERS).forEach(([id, cfg]) => {
        const o = document.createElement('option');
        o.value = id; o.textContent = `${cfg.name} · ${cfg.tag}`;
        providerSelect.appendChild(o);
    });
    function renderModels(provider, savedModel) {
        const cfg = PROVIDERS[provider]; if (!cfg) return;
        modelSelect.innerHTML = '';
        cfg.models.forEach(m => {
            const o = document.createElement('option');
            o.value = m.id; o.textContent = m.name;
            modelSelect.appendChild(o);
        });
        if (savedModel && cfg.models.some(m => m.id === savedModel)) modelSelect.value = savedModel;
        apiKeyInput.placeholder = cfg.placeholder;
        apiKeyLink.href = cfg.consoleUrl;
        apiKeyLink.textContent = cfg.consoleText;
    }
    providerSelect.addEventListener('change', () => {
        const p = providerSelect.value;
        renderModels(p, null);
        chrome.storage.local.get(['apiKeys'], (r) => {
            const keys = r.apiKeys || {};
            apiKeyInput.value = keys[p] || '';
        });
    });

    // ---------- Advanced profile grid ----------
    const profileGrid = $('#profileGrid');
    PROFILE_FIELDS.forEach(([key, label, ph, type]) => {
        const cell = document.createElement('div');
        cell.innerHTML = `<label class="l">${label}</label><input class="in" data-key="${key}" type="${type}" placeholder="${ph}" />`;
        profileGrid.appendChild(cell);
    });

    // ---------- Dynamic rows ----------
    function skillRow(skill = '', years = '') {
        const row = document.createElement('div'); row.className = 'dyn';
        row.innerHTML = `<input class="in skill" placeholder="Skill (e.g. React)"><input class="in years" type="number" min="0" step="0.5" placeholder="Yrs"><button class="rm" title="Remove">${svg('trash', 15)}</button>`;
        row.querySelector('.skill').value = skill;
        row.querySelector('.years').value = years;
        row.querySelector('.rm').addEventListener('click', () => row.remove());
        return row;
    }
    function customRow(pattern = '', answer = '') {
        const row = document.createElement('div'); row.className = 'dyn';
        row.innerHTML = `<input class="in pattern" placeholder="If label contains..."><input class="in answer" placeholder="Answer with..."><button class="rm" title="Remove">${svg('trash', 15)}</button>`;
        row.querySelector('.pattern').value = pattern;
        row.querySelector('.answer').value = answer;
        row.querySelector('.rm').addEventListener('click', () => row.remove());
        return row;
    }
    $('#addSkill').addEventListener('click', () => $('#skillList').appendChild(skillRow()));
    $('#addCustom').addEventListener('click', () => $('#customList').appendChild(customRow()));

    // ---------- File upload ----------
    $('#uploadBtn').addEventListener('click', () => $('#resumeFile').click());
    $('#resumeFile').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const uploadArea = $('#uploadArea'), fileNameDiv = $('#fileName');
        fileNameDiv.textContent = 'Reading ' + file.name;
        uploadArea.classList.add('has');
        try {
            const base64File = await fileToBase64(file);
            if (file.type === 'text/plain') {
                $('#resume').value = await readFileAsText(file);
            } else if (!$('#resume').value.trim()) {
                toast('File saved for uploads. Paste your resume text below so the AI can read it.', 'ok');
            }
            chrome.storage.local.set({ resumeFileData: base64File, resumeFileName: file.name, resumeFileType: file.type }, () => {
                fileNameDiv.textContent = '✓ ' + file.name;
            });
        } catch (err) {
            fileNameDiv.textContent = '';
            uploadArea.classList.remove('has');
            toast('Could not read file: ' + err.message, 'err');
        }
    });

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // ---------- Load / Save ----------
    function loadSettings() {
        chrome.storage.local.get(
            ['selectedProvider', 'selectedModel', 'apiKeys', 'apiKey', 'resumeText', 'additionalInfo', 'profile', 'resumeFileName'],
            (r) => {
                const provider = r.selectedProvider || 'groq';
                providerSelect.value = provider;
                renderModels(provider, r.selectedModel);

                const apiKeys = r.apiKeys || {};
                if (!apiKeys.groq && r.apiKey) apiKeys.groq = r.apiKey;
                apiKeyInput.value = apiKeys[provider] || '';

                let resumeText = r.resumeText || '';
                if (r.additionalInfo && resumeText.includes('\n\nAdditional Information:')) {
                    resumeText = resumeText.split('\n\nAdditional Information:')[0];
                }
                $('#resume').value = resumeText;
                $('#additionalInfo').value = r.additionalInfo || '';

                if (r.resumeFileName) {
                    $('#fileName').textContent = '✓ ' + r.resumeFileName;
                    $('#uploadArea').classList.add('has');
                }

                const profile = r.profile || {};
                profileGrid.querySelectorAll('input[data-key]').forEach(inp => {
                    inp.value = profile[inp.dataset.key] || '';
                });
                $('#willingToRelocate').value = profile.willingToRelocate || '';

                const skillList = $('#skillList'); skillList.innerHTML = '';
                (Array.isArray(profile.skillExperience) ? profile.skillExperience : []).forEach(s => skillList.appendChild(skillRow(s.skill || '', s.years || '')));
                if (!skillList.children.length) skillList.appendChild(skillRow());

                const customList = $('#customList'); customList.innerHTML = '';
                (Array.isArray(profile.customAnswers) ? profile.customAnswers : []).forEach(c => customList.appendChild(customRow(c.pattern || '', c.answer || '')));
                if (!customList.children.length) customList.appendChild(customRow());
            }
        );
    }

    $('#saveBtn').addEventListener('click', () => {
        const provider = providerSelect.value;
        const model = modelSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const resumeText = $('#resume').value.trim();
        const additionalInfo = $('#additionalInfo').value.trim();

        const profile = {};
        profileGrid.querySelectorAll('input[data-key]').forEach(inp => {
            const v = inp.value.trim();
            if (v) profile[inp.dataset.key] = v;
        });
        const relocate = $('#willingToRelocate').value;
        if (relocate) profile.willingToRelocate = relocate;

        profile.skillExperience = [...$('#skillList').querySelectorAll('.dyn')]
            .map(r => ({ skill: r.querySelector('.skill').value.trim(), years: r.querySelector('.years').value.trim() }))
            .filter(s => s.skill && s.years);
        profile.customAnswers = [...$('#customList').querySelectorAll('.dyn')]
            .map(r => ({ pattern: r.querySelector('.pattern').value.trim(), answer: r.querySelector('.answer').value.trim() }))
            .filter(c => c.pattern && c.answer);

        chrome.storage.local.get(['apiKeys'], (r) => {
            const apiKeys = r.apiKeys || {};
            apiKeys[provider] = apiKey;
            const data = {
                selectedProvider: provider,
                selectedModel: model,
                apiKeys,
                resumeText,
                additionalInfo,
                profile
            };
            if (provider === 'groq') data.apiKey = apiKey; // legacy compat
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) toast('Error saving: ' + chrome.runtime.lastError.message, 'err');
                else toast('Settings saved.', 'ok');
            });
        });
    });

    $('#clearBtn').addEventListener('click', () => {
        if (!confirm('Clear ALL saved data (API keys, resume, profile)?')) return;
        chrome.storage.local.clear(() => {
            apiKeyInput.value = ''; $('#resume').value = ''; $('#additionalInfo').value = '';
            $('#fileName').textContent = ''; $('#uploadArea').classList.remove('has');
            profileGrid.querySelectorAll('input[data-key]').forEach(i => i.value = '');
            $('#willingToRelocate').value = '';
            $('#skillList').innerHTML = ''; $('#skillList').appendChild(skillRow());
            $('#customList').innerHTML = ''; $('#customList').appendChild(customRow());
            providerSelect.value = 'groq'; renderModels('groq', null);
            toast('All data cleared.', 'ok');
        });
    });

    let toastTimer = null;
    function toast(msg, kind) {
        const s = $('#status');
        s.textContent = msg;
        s.className = 'status ' + (kind === 'err' ? 'err' : 'ok');
        if (toastTimer) clearTimeout(toastTimer);
        if (kind !== 'err') toastTimer = setTimeout(() => { s.className = 'status'; }, 3500);
    }

    // ---------- Messages from background / shortcuts ----------
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        if (req && req.action === 'togglePanel') { toggle(); sendResponse({ ok: true }); return true; }
        if (req && req.action === 'ping') { sendResponse({ ok: true }); return true; }
    });

    // Expose for re-injection
    window.__aiFormFillerUI = { toggle, togglePanel };

    // Populate selects immediately so the panel is ready on first open.
    renderModels('groq', null);
})();

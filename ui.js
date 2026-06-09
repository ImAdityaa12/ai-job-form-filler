// ==================== AI FORM FILLER — IN-PAGE TOOLBAR ====================
// Builds a floating, draggable toolbar (in a Shadow DOM so the host page's CSS
// can't touch it) with three actions — Auto Fill, Fix Field Errors, Workday
// Auto Fill — plus a ⋮ menu holding the model selector, resume, additional
// details and advanced profile options. Talks to the engine in content.js
// through window.AIFormFiller.

(function () {
    // Re-injection guard: if the toolbar already exists, just toggle it.
    if (window.__aiFormFillerUI) {
        window.__aiFormFillerUI.toggle();
        return;
    }

    // ---- Provider / model catalogue (kept in sync with content.js defaults) ----
    const PROVIDERS = {
        groq: {
            name: 'Groq',
            tag: '⚡ Fastest · Free',
            consoleUrl: 'https://console.groq.com/keys',
            consoleText: 'Groq Console',
            placeholder: 'Enter your Groq API key (gsk_...)',
            models: [
                { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B ⭐ (Best)' },
                { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B ⚡ (Fastest)' },
                { id: 'gemma2-9b-it', name: 'Gemma2 9B (Fast)' }
            ]
        },
        gemini: {
            name: 'Google Gemini',
            tag: 'Free',
            consoleUrl: 'https://aistudio.google.com/app/apikey',
            consoleText: 'Google AI Studio',
            placeholder: 'Enter your Gemini API key (AIza...)',
            models: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash ⭐ (Recommended)' },
                { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite ⚡ (Faster)' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
            ]
        },
        cerebras: {
            name: 'Cerebras',
            tag: '⚡ Ultra-fast · Free',
            consoleUrl: 'https://cloud.cerebras.ai/',
            consoleText: 'Cerebras Cloud',
            placeholder: 'Enter your Cerebras API key (csk-...)',
            models: [
                { id: 'llama-3.3-70b', name: 'Llama 3.3 70B ⭐ (Best)' },
                { id: 'llama3.1-8b', name: 'Llama 3.1 8B ⚡ (Fastest)' }
            ]
        },
        openrouter: {
            name: 'OpenRouter',
            tag: 'Free models',
            consoleUrl: 'https://openrouter.ai/keys',
            consoleText: 'OpenRouter',
            placeholder: 'Enter your OpenRouter API key (sk-or-...)',
            models: [
                { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free) ⭐' },
                { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)' },
                { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)' }
            ]
        },
        nvidia: {
            name: 'NVIDIA NIM',
            tag: 'Free',
            consoleUrl: 'https://build.nvidia.com/',
            consoleText: 'NVIDIA Build',
            placeholder: 'Enter your NVIDIA API key (nvapi-...)',
            models: [
                { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B ⭐' },
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
        ['expectedJoiningDate', 'Available From / Joining', 'Immediately / 2 weeks', 'text'],
        ['visaStatus', 'Work Authorization / Visa', 'Citizen / H1B / Needs sponsorship', 'text'],
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
  .wrap { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; }

  /* ---- Toolbar ---- */
  .bar { display: flex; align-items: center; gap: 8px; background: #1b1b27; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 8px; box-shadow: 0 14px 44px rgba(0,0,0,.45); user-select: none; }
  .grip { cursor: grab; padding: 0 4px; color: rgba(255,255,255,.35); font-size: 16px; line-height: 1; }
  .grip:active { cursor: grabbing; }
  .logo { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg,#667eea,#764ba2); display: flex; align-items: center; justify-content: center; font-size: 16px; }
  .btn { display: inline-flex; align-items: center; gap: 7px; color: #fff; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.08); padding: 8px 13px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: filter .15s, background .15s; }
  .btn:hover { background: rgba(255,255,255,.16); }
  .btn.primary { background: linear-gradient(135deg,#3b82f6,#2563eb); border-color: transparent; }
  .btn.amber { background: linear-gradient(135deg,#f59e0b,#d97706); border-color: transparent; }
  .btn.workday { background: linear-gradient(135deg,#10b981,#059669); border-color: transparent; }
  .btn.primary:hover, .btn.amber:hover, .btn.workday:hover { filter: brightness(1.1); }
  .btn[disabled] { opacity: .55; cursor: wait; }
  .icon-btn { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 9px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.08); color: #fff; cursor: pointer; font-size: 18px; line-height: 1; }
  .icon-btn:hover { background: rgba(255,255,255,.16); }
  .icon-btn.active { background: rgba(102,126,234,.45); }
  .sep { width: 1px; height: 24px; background: rgba(255,255,255,.12); margin: 0 2px; }

  .spin { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ---- Panel ---- */
  .panel { width: 392px; max-height: 74vh; overflow-y: auto; background: #fff; color: #1f2937; border-radius: 16px; box-shadow: 0 18px 54px rgba(0,0,0,.4); display: none; }
  .panel.open { display: block; animation: drop .18s ease; }
  @keyframes drop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
  .panel::-webkit-scrollbar { width: 10px; }
  .panel::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 6px; border: 3px solid #fff; }

  .phead { position: sticky; top: 0; background: linear-gradient(135deg,#667eea,#764ba2); color: #fff; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; z-index: 2; }
  .phead h3 { font-size: 15px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
  .phead .x { cursor: pointer; font-size: 18px; opacity: .9; background: none; border: none; color: #fff; }
  .phead .x:hover { opacity: 1; }

  .body { padding: 14px 16px 18px; }
  .group { border: 1px solid #eef0f3; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
  .group > .gtitle { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }

  label.l { display: block; font-size: 12px; font-weight: 600; color: #374151; margin: 10px 0 5px; }
  label.l:first-child { margin-top: 0; }
  .hint { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.4; }
  .in, select.in, textarea.in { width: 100%; padding: 9px 10px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: #f9fafb; color: #111827; }
  .in:focus, select.in:focus, textarea.in:focus { outline: none; border-color: #667eea; background: #fff; box-shadow: 0 0 0 3px rgba(102,126,234,.12); }
  textarea.in { min-height: 78px; resize: vertical; line-height: 1.45; }
  select.in { cursor: pointer; }
  a.link { color: #667eea; text-decoration: none; font-weight: 600; }
  a.link:hover { text-decoration: underline; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
  .grid2 label.l { margin-top: 0; }

  .upload { border: 2px dashed #d1d5db; border-radius: 10px; padding: 12px; text-align: center; background: #f9fafb; }
  .upload.has { border-color: #10b981; background: #ecfdf5; }
  .ubtn { background: linear-gradient(135deg,#667eea,#764ba2); color: #fff; border: none; padding: 9px 16px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .fname { margin-top: 9px; font-size: 12px; color: #059669; font-weight: 600; }

  details.adv { border: 1px solid #eef0f3; border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
  details.adv > summary { cursor: pointer; padding: 12px; font-size: 13px; font-weight: 700; color: #374151; list-style: none; display: flex; align-items: center; gap: 8px; background: #fafafe; }
  details.adv > summary::-webkit-details-marker { display: none; }
  details.adv > summary .chev { margin-left: auto; transition: transform .2s; color: #9ca3af; }
  details.adv[open] > summary .chev { transform: rotate(90deg); }
  .advbody { padding: 12px; }
  .subt { font-size: 12px; font-weight: 700; color: #4b5563; margin: 14px 0 6px; }

  .dyn { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
  .dyn .in { flex: 1; }
  .dyn .years { flex: 0 0 64px; }
  .dyn .rm { flex: 0 0 30px; height: 32px; border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; border-radius: 7px; cursor: pointer; font-size: 13px; }
  .dyn .rm:hover { background: #fee2e2; }
  .addrow { margin-top: 4px; background: #eef2ff; color: #4338ca; border: 1px dashed #c7d2fe; border-radius: 8px; padding: 7px; width: 100%; font-size: 12px; font-weight: 600; cursor: pointer; }
  .addrow:hover { background: #e0e7ff; }

  .save { width: 100%; padding: 12px; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; cursor: pointer; color: #fff; background: linear-gradient(135deg,#10b981,#059669); box-shadow: 0 3px 10px rgba(16,185,129,.3); margin-top: 4px; }
  .save:hover { filter: brightness(1.07); }
  .danger { width: 100%; padding: 9px; border: 1px solid #fecaca; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; color: #dc2626; background: #fff; margin-top: 8px; }
  .danger:hover { background: #fef2f2; }

  .status { margin-top: 10px; padding: 10px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; display: none; }
  .status.ok { display: block; background: #ecfdf5; color: #065f46; border: 1px solid #6ee7b7; }
  .status.err { display: block; background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
</style>

<div class="wrap" id="wrap">
  <div class="bar" id="bar">
    <span class="grip" id="grip" title="Drag">⠿</span>
    <div class="logo">🤖</div>
    <button class="btn primary" id="autoFillBtn" data-label="✨ Auto Fill">✨ Auto Fill</button>
    <button class="btn amber" id="fixBtn" data-label="🔧 Fix Field Errors">🔧 Fix Field Errors</button>
    <button class="btn workday" id="workdayBtn" data-label="💼 Workday Auto Fill">💼 Workday Auto Fill</button>
    <span class="sep"></span>
    <button class="icon-btn" id="menuBtn" title="Settings &amp; options">⋮</button>
    <button class="icon-btn" id="closeBtn" title="Hide toolbar">✕</button>
  </div>

  <div class="panel" id="panel">
    <div class="phead">
      <h3><span>🤖</span> AI Form Filler</h3>
      <button class="x" id="panelClose" title="Close">✕</button>
    </div>
    <div class="body">

      <div class="group">
        <div class="gtitle">🧠 AI Model</div>
        <label class="l">Provider</label>
        <select class="in" id="providerSelect"></select>
        <label class="l">Model</label>
        <select class="in" id="modelSelect"></select>
        <label class="l">API Key</label>
        <input class="in" type="password" id="apiKey" placeholder="Enter your API key" />
        <div class="hint">Get a free key from <a class="link" id="apiKeyLink" target="_blank" href="#">the provider console</a>.</div>
      </div>

      <div class="group">
        <div class="gtitle">📄 Resume</div>
        <div class="upload" id="uploadArea">
          <input type="file" id="resumeFile" accept=".pdf,.doc,.docx,.txt" style="display:none" />
          <button class="ubtn" id="uploadBtn" type="button">📎 Choose File</button>
          <div class="fname" id="fileName"></div>
        </div>
        <div class="hint">PDF/DOC is stored for file-upload fields. Paste the text below so the AI can read it.</div>
        <label class="l">Resume Text</label>
        <textarea class="in" id="resume" placeholder="Paste your resume text here..." style="min-height:120px"></textarea>
      </div>

      <div class="group">
        <div class="gtitle">✏️ Additional Details</div>
        <textarea class="in" id="additionalInfo" placeholder="Anything extra not in your resume — cover-letter points, achievements, preferences, etc."></textarea>
      </div>

      <details class="adv" id="advDetails">
        <summary>⚙️ Advanced Options <span class="chev">▶</span></summary>
        <div class="advbody">
          <div class="hint" style="margin-bottom:10px">These values are treated as authoritative and override the AI's guesses for matching fields.</div>
          <div class="grid2" id="profileGrid"></div>

          <label class="l">Willing to Relocate</label>
          <select class="in" id="willingToRelocate">
            <option value="">— Not specified —</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>

          <div class="subt">🧩 Experience per skill</div>
          <div class="hint" style="margin-bottom:6px">Fills "years of experience in X" fields with the exact value you set.</div>
          <div id="skillList"></div>
          <button class="addrow" id="addSkill" type="button">+ Add skill</button>

          <div class="subt">🎯 Custom field answers</div>
          <div class="hint" style="margin-bottom:6px">If a field's label contains the phrase, it's answered with your exact text.</div>
          <div id="customList"></div>
          <button class="addrow" id="addCustom" type="button">+ Add custom answer</button>
        </div>
      </details>

      <button class="save" id="saveBtn">💾 Save Settings</button>
      <button class="danger" id="clearBtn">🗑️ Clear all saved data</button>
      <div class="status" id="status"></div>
    </div>
  </div>
</div>
`;

    const $ = (sel) => shadow.querySelector(sel);
    const wrap = $('#wrap'), bar = $('#bar'), panel = $('#panel');

    // ---------- Visibility ----------
    wrap.style.display = 'none'; // hidden until the icon (or shortcut) opens it
    function toggle() {
        const showing = wrap.style.display !== 'none';
        wrap.style.display = showing ? 'none' : 'flex';
        if (showing) panel.classList.remove('open');
    }
    function togglePanel() {
        panel.classList.toggle('open');
        $('#menuBtn').classList.toggle('active', panel.classList.contains('open'));
        if (panel.classList.contains('open')) loadSettings();
    }

    $('#menuBtn').addEventListener('click', togglePanel);
    $('#closeBtn').addEventListener('click', () => { wrap.style.display = 'none'; panel.classList.remove('open'); });
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
        };
        const end = () => { dragging = false; };
        handle.addEventListener('mousedown', start);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
    })();

    // ---------- Action buttons ----------
    function setBusy(busy, activeBtn) {
        const btns = [$('#autoFillBtn'), $('#fixBtn'), $('#workdayBtn')];
        btns.forEach(b => {
            b.disabled = busy;
            if (busy && b === activeBtn) {
                b.innerHTML = `<span class="spin"></span> Working...`;
            } else if (!busy) {
                b.innerHTML = b.getAttribute('data-label');
            }
        });
    }
    async function runAction(btn, fn) {
        if (!window.AIFormFiller) {
            toast('Engine not ready — reload the page and try again.', 'err');
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
        o.value = id; o.textContent = `${cfg.name} — ${cfg.tag}`;
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
        row.innerHTML = `<input class="in skill" placeholder="Skill (e.g. React)"><input class="in years" type="number" min="0" step="0.5" placeholder="Yrs"><button class="rm" title="Remove">✕</button>`;
        row.querySelector('.skill').value = skill;
        row.querySelector('.years').value = years;
        row.querySelector('.rm').addEventListener('click', () => row.remove());
        return row;
    }
    function customRow(pattern = '', answer = '') {
        const row = document.createElement('div'); row.className = 'dyn';
        row.innerHTML = `<input class="in pattern" placeholder="If label contains..."><input class="in answer" placeholder="Answer with..."><button class="rm" title="Remove">✕</button>`;
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
        fileNameDiv.textContent = `⏳ Processing ${file.name}...`;
        uploadArea.classList.add('has');
        try {
            const base64File = await fileToBase64(file);
            if (file.type === 'text/plain') {
                $('#resume').value = await readFileAsText(file);
            } else if (!$('#resume').value.trim()) {
                toast('File saved for uploads. Please paste your resume text below so the AI can read it.', 'ok');
            }
            chrome.storage.local.set({ resumeFileData: base64File, resumeFileName: file.name, resumeFileType: file.type }, () => {
                fileNameDiv.textContent = `✓ ${file.name}`;
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

                // Resume text (strip legacy embedded "Additional Information:" block)
                let resumeText = r.resumeText || '';
                if (r.additionalInfo && resumeText.includes('\n\nAdditional Information:')) {
                    resumeText = resumeText.split('\n\nAdditional Information:')[0];
                }
                $('#resume').value = resumeText;
                $('#additionalInfo').value = r.additionalInfo || '';

                if (r.resumeFileName) {
                    $('#fileName').textContent = `✓ ${r.resumeFileName}`;
                    $('#uploadArea').classList.add('has');
                }

                // Profile
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
                else toast('✓ Settings saved!', 'ok');
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
            toast('✓ All data cleared.', 'ok');
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

// ==================== REACT / WORKDAY HELPERS ====================

// Detect if current page is a Workday application
function isWorkdayPage() {
    return window.location.hostname.includes('myworkday') ||
        window.location.hostname.includes('workday.com') ||
        !!document.querySelector('[data-automation-id]');
}

// Bypass React's internal value tracker so controlled components actually update state.
// React overrides the value setter on input instances; calling the prototype setter
// forces React to see it as a new value and fire onChange.
function setNativeValue(element, value) {
    try {
        const descriptor = Object.getOwnPropertyDescriptor(element, 'value');
        const prototype = Object.getPrototypeOf(element);
        const protoDescriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

        if (descriptor && descriptor.set && protoDescriptor && descriptor.set !== protoDescriptor.set) {
            protoDescriptor.set.call(element, value);
        } else if (protoDescriptor && protoDescriptor.set) {
            protoDescriptor.set.call(element, value);
        } else {
            element.value = value;
        }
    } catch (e) {
        element.value = value;
    }
}

// Simulate a realistic event sequence that React and Workday will recognize
function simulateFullInput(element, value) {
    element.focus();
    element.dispatchEvent(new Event('focus', { bubbles: true }));

    // Clear existing value first
    setNativeValue(element, '');
    element.dispatchEvent(new Event('input', { bubbles: true }));

    // Set the new value
    setNativeValue(element, value);

    // Dispatch full event sequence
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
}

// ==================== PUBLIC API (used by the in-page toolbar in ui.js) ====================

window.AIFormFiller = {
    autoFill: (opts) => fillFormWithAI({ mode: 'autofill', ...(opts || {}) }),
    workdayAutoFill: (opts) => fillFormWithAI({ mode: 'workday', forceWorkday: true, ...(opts || {}) }),
    fixErrors: (opts) => fixFieldErrors(opts || {}),
    isWorkdayPage
};

// Listen for messages from the background worker / keyboard shortcuts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const action = request && request.action;

    if (action === 'autoFill' || action === 'fillForm') {
        fillFormWithAI({ mode: 'autofill' })
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (action === 'workdayAutoFill') {
        fillFormWithAI({ mode: 'workday', forceWorkday: true })
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (action === 'fixErrors') {
        fixFieldErrors({})
            .then((res) => sendResponse({ success: true, ...res }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
    // 'togglePanel' / 'ping' are handled by ui.js — leave them for that listener.
});

// ==================== SETTINGS ====================

async function getSettings() {
    const s = await chrome.storage.local.get([
        'apiKey', 'apiKeys', 'selectedProvider', 'selectedModel',
        'resumeText', 'additionalInfo', 'profile',
        'resumeFileData', 'resumeFileName', 'resumeFileType'
    ]);

    const provider = s.selectedProvider || 'groq';
    const apiKeys = s.apiKeys || {};
    if (!apiKeys.groq && s.apiKey) apiKeys.groq = s.apiKey; // legacy migration

    return {
        provider,
        model: s.selectedModel || null,
        apiKey: apiKeys[provider],
        resumeText: s.resumeText || '',
        additionalInfo: s.additionalInfo || '',
        profile: s.profile || {},
        resumeFileData: s.resumeFileData,
        resumeFileName: s.resumeFileName,
        resumeFileType: s.resumeFileType
    };
}

// ==================== NOTIFICATIONS ====================

function showNotification(message, type = 'info', progress = null) {
    if (!document.body) {
        setTimeout(() => showNotification(message, type, progress), 100);
        return;
    }

    const existing = document.getElementById('ai-form-filler-notification');
    if (existing) {
        if (progress !== null) {
            const progressBar = existing.querySelector('.notification-progress-bar');
            const progressText = existing.querySelector('.notification-progress-text');
            const messageSpan = existing.querySelector('.notification-message');
            if (progressBar && progressText && messageSpan) {
                progressBar.style.width = progress + '%';
                progressText.textContent = progress + '%';
                messageSpan.textContent = message;
                return;
            }
        }
        existing.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'ai-form-filler-notification';
    notification.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        background: ${type === 'success' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
            type === 'error' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' :
                'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'} !important;
        color: white !important;
        padding: 16px 24px !important;
        border-radius: 12px !important;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3) !important;
        z-index: 2147483647 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        animation: slideInRight 0.3s ease !important;
        max-width: 350px !important;
        pointer-events: auto !important;
        min-width: 300px !important;
    `;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '⏳';

    let content = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: ${progress !== null ? '12px' : '0'};">
            <span style="font-size: 20px;">${icon}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;

    if (progress !== null) {
        content += `
            <div style="margin-top: 8px;">
                <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.3); border-radius: 3px; overflow: hidden;">
                    <div class="notification-progress-bar" style="height: 100%; background: white; border-radius: 3px; transition: width 0.3s ease; width: ${progress}%;"></div>
                </div>
                <div class="notification-progress-text" style="text-align: center; font-size: 12px; margin-top: 6px; opacity: 0.9;">${progress}%</div>
            </div>
        `;
    }

    notification.innerHTML = content;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideOutRight { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100px); } }
    `;
    if (!document.getElementById('ai-form-filler-styles')) {
        style.id = 'ai-form-filler-styles';
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    if (progress === null || progress >= 100) {
        const delay = type === 'error' ? 5000 : 3000;
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 300);
        }, delay);
    }
}

// ==================== MAIN FLOWS ====================

async function fillFormWithAI(options = {}) {
    const forceWorkday = !!options.forceWorkday;
    const mode = options.mode || 'autofill';

    showNotification('Detecting fields...', 'info', 0);
    await sleep(300);

    const settings = await getSettings();
    if (!settings.apiKey || !settings.resumeText) {
        showNotification('⚠️ Add your API key and resume in the toolbar menu first', 'error');
        throw new Error('API key or resume not found');
    }

    const formFields = findFormFields(forceWorkday);
    const fileInputs = findFileInputs();

    if (formFields.length === 0 && fileInputs.length === 0) {
        showNotification('⚠️ No form fields found on this page', 'error');
        throw new Error('No form fields found on this page');
    }

    showNotification(`Found ${formFields.length} fields`, 'info', 25);
    await sleep(150);

    const jobContext = extractJobContext();

    console.log('=== FORM FIELDS DETECTED ===');
    console.log(`Found ${formFields.length} text fields and ${fileInputs.length} file upload fields`);
    formFields.forEach((field, index) => console.log(`${index + 1}. "${field.label}" (${field.inputType})`));

    try {
        if (formFields.length > 0) {
            showNotification('Generating answers with AI...', 'info', 40);
            const answers = await generateAllAnswers(formFields, { ...settings, jobContext, mode });

            showNotification('Filling form fields...', 'info', 55);
            await applyAnswersToFields(formFields, answers, settings.profile, 55, 75);
            showNotification('Form fields filled!', 'info', 75);
            await sleep(150);
        }

        if (fileInputs.length > 0 && settings.resumeFileData) {
            showNotification('Uploading resume...', 'info', 80);
            const totalFiles = fileInputs.length;
            for (let i = 0; i < fileInputs.length; i++) {
                const fileInput = fileInputs[i];
                const fileProgress = 80 + Math.floor((i / totalFiles) * 15);
                showNotification(`Uploading file ${i + 1}/${totalFiles}...`, 'info', fileProgress);
                await fillFileInput(fileInput.element, settings.resumeFileData, settings.resumeFileName, settings.resumeFileType);
                await sleep(300);
            }
            showNotification('Resume uploaded!', 'info', 95);
            await sleep(150);
        } else {
            showNotification('Finalizing...', 'info', 90);
            await sleep(150);
        }

        showNotification('Complete!', 'info', 100);
        await sleep(400);
        console.log('\n=== FORM FILLING COMPLETE ===');
        showNotification('✓ Form filled successfully!', 'success');
    } catch (error) {
        console.error('❌ Error filling form:', error);
        showNotification(`✗ Error: ${error.message}`, 'error');
        throw error;
    }
}

// Re-fill only the fields that currently show validation errors / are required-but-empty.
async function fixFieldErrors(options = {}) {
    showNotification('Scanning for field errors...', 'info', 0);
    await sleep(200);

    const settings = await getSettings();
    if (!settings.apiKey || !settings.resumeText) {
        showNotification('⚠️ Add your API key and resume in the toolbar menu first', 'error');
        throw new Error('API key or resume not found');
    }

    const forceWorkday = options.forceWorkday || isWorkdayPage();
    const errorFields = findErrorFields(forceWorkday);

    if (errorFields.length === 0) {
        showNotification('✓ No field errors found on this page', 'success');
        return { fixed: 0 };
    }

    console.log('=== FIELDS WITH ERRORS ===');
    errorFields.forEach((f, i) => console.log(`${i + 1}. "${f.label}" — ${f.errorMessage}`));

    showNotification(`Found ${errorFields.length} field(s) to fix`, 'info', 30);
    const jobContext = extractJobContext();

    try {
        const answers = await generateAllAnswers(errorFields, { ...settings, jobContext, mode: 'fix' });
        showNotification('Fixing fields...', 'info', 55);
        await applyAnswersToFields(errorFields, answers, settings.profile, 55, 95);
        showNotification('Complete!', 'info', 100);
        await sleep(300);
        showNotification(`✓ Fixed ${errorFields.length} field(s)!`, 'success');
        return { fixed: errorFields.length };
    } catch (error) {
        console.error('❌ Error fixing fields:', error);
        showNotification(`✗ Error: ${error.message}`, 'error');
        throw error;
    }
}

// Shared loop that writes the generated answers into the fields.
async function applyAnswersToFields(fields, answers, profile, startPct, endPct) {
    const total = fields.length;
    for (let i = 0; i < total; i++) {
        const field = fields[i];
        let answer = answers[i];

        // User-defined overrides (custom answers + per-skill experience) win over the model.
        const override = resolveFieldOverride(field, profile);
        if (override !== null && override !== '') answer = override;

        // For numeric experience-style fields, coerce to a plain number (e.g. "2 years" → "2").
        const labelLower = (field.label || '').toLowerCase();
        const isExperienceLabel = /\b(experience|exp|years?|yrs?)\b/.test(labelLower);
        const isNumericInput = field.inputType === 'number' || (field.element && field.element.type === 'number');
        if (answer && (isNumericInput || (isExperienceLabel && field.type !== 'radio' && field.type !== 'select' && field.type !== 'select2' && field.type !== 'select2-search' && field.type !== 'workday-dropdown'))) {
            const numMatch = String(answer).match(/(\d+(?:\.\d+)?)/);
            if (numMatch) {
                const wantsInteger = isNumericInput || /total\s*(experience|exp)/.test(labelLower);
                answer = wantsInteger ? String(Math.round(parseFloat(numMatch[1]))) : numMatch[1];
            }
        }

        // Apply character limit
        const maxLength = field.maxLength ? parseInt(field.maxLength) :
            (field.type === 'textarea' || field.inputType === 'text') ? 500 : null;
        if (maxLength && answer && answer.length > maxLength) {
            answer = answer.substring(0, maxLength);
        }

        const pct = startPct + Math.floor((i / Math.max(total, 1)) * (endPct - startPct));
        showNotification(`Filling field ${i + 1}/${total}...`, 'info', pct);

        console.log(`📝 "${field.label}" → ${answer}`);
        fillField(field, answer);

        const delay = (field.type === 'select2-search' || field.type === 'workday-dropdown') ? 1000
            : field.isWorkday ? 500 : 200;
        await sleep(delay);
    }
}

// ==================== FIELD DETECTION ====================

function findFormFields(forceWorkday = false) {
    const fields = [];
    const processedSelect2 = new Set();

    // Select2 search fields with placeholders
    const select2SearchFields = document.querySelectorAll('input.select2-search__field[placeholder]');
    select2SearchFields.forEach(input => {
        const placeholder = input.getAttribute('placeholder');
        if (placeholder && placeholder.trim() !== '' &&
            input.style.width !== '5.25em' &&
            parseFloat(input.style.width) > 50) {

            let selectElement = null;
            const container = input.closest('.select2-container');
            if (container) {
                selectElement = container.previousElementSibling;
                if (!selectElement || selectElement.tagName !== 'SELECT') {
                    selectElement = container.nextElementSibling;
                }
                if (!selectElement || selectElement.tagName !== 'SELECT') {
                    const ariaControls = container.getAttribute('aria-controls');
                    if (ariaControls) {
                        const resultsId = ariaControls.replace('-results', '');
                        selectElement = document.querySelector(`select[data-select2-id="${resultsId}"]`);
                    }
                }
            }

            fields.push({
                element: input,
                selectElement: selectElement,
                label: placeholder,
                type: 'select2-search',
                inputType: 'select2',
                maxLength: null
            });

            if (selectElement) processedSelect2.add(selectElement);
        }
    });

    // Regular inputs
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type]), textarea, select');
    inputs.forEach(input => {
        if (input.classList.contains('select2-search__field')) return;
        if (input.tagName === 'SELECT' && processedSelect2.has(input)) return;
        if (input.offsetParent === null || input.disabled || input.readOnly) return;
        const label = getFieldLabel(input);
        if (label) {
            fields.push({
                element: input,
                label: label,
                type: input.tagName.toLowerCase(),
                inputType: input.type || 'text',
                maxLength: input.getAttribute('maxlength') || null
            });
        }
    });

    // Select2 dropdowns
    const select2Containers = document.querySelectorAll('.select2-container');
    select2Containers.forEach(container => {
        const selectId = container.getAttribute('aria-owns');
        if (selectId) {
            const originalSelect = document.getElementById(selectId.replace('-results', ''));
            if (originalSelect && originalSelect.tagName === 'SELECT') {
                const label = getFieldLabel(originalSelect);
                if (label) {
                    fields.push({ element: originalSelect, label, type: 'select2', inputType: 'select2', container, maxLength: null });
                }
            }
        } else {
            const prevElement = container.previousElementSibling;
            if (prevElement && prevElement.tagName === 'SELECT') {
                const label = getFieldLabel(prevElement);
                if (label) {
                    fields.push({ element: prevElement, label, type: 'select2', inputType: 'select2', container, maxLength: null });
                }
            }
        }
    });

    // Radio button groups
    const radioGroups = new Map();
    const radioInputs = document.querySelectorAll('input[type="radio"]');
    radioInputs.forEach(radio => {
        if (radio.offsetParent === null || radio.disabled) return;
        const groupName = radio.name;
        if (!groupName) return;

        if (!radioGroups.has(groupName)) {
            const label = getRadioGroupLabel(radio);
            if (label) {
                const options = Array.from(document.querySelectorAll(`input[type="radio"][name="${groupName}"]`))
                    .map(r => ({ element: r, label: getRadioOptionLabel(r), value: r.value }));
                radioGroups.set(groupName, {
                    element: radio,
                    label: label,
                    type: 'radio',
                    inputType: 'radio',
                    groupName: groupName,
                    options: options,
                    maxLength: null
                });
            }
        }
    });
    radioGroups.forEach(group => fields.push(group));

    // ==================== WORKDAY-SPECIFIC FIELD DETECTION ====================
    if (forceWorkday || isWorkdayPage()) {
        const processedElements = new Set(fields.map(f => f.element));

        document.querySelectorAll('[data-automation-id*="textInput"], [data-automation-id*="TextInput"]').forEach(input => {
            if (processedElements.has(input)) return;
            if (input.offsetParent === null || input.disabled || input.readOnly) return;
            const label = getWorkdayFieldLabel(input) || getFieldLabel(input);
            if (label) {
                fields.push({ element: input, label, type: input.tagName.toLowerCase(), inputType: input.type || 'text', maxLength: input.getAttribute('maxlength') || null, isWorkday: true });
                processedElements.add(input);
            }
        });

        document.querySelectorAll('[data-automation-id^="formField-"]').forEach(container => {
            const input = container.querySelector('input, textarea');
            if (!input || processedElements.has(input)) return;
            if (input.offsetParent === null || input.disabled || input.readOnly) return;
            const label = getWorkdayFieldLabel(input) || getFieldLabel(input);
            if (label) {
                fields.push({ element: input, label, type: input.tagName.toLowerCase(), inputType: input.type || 'text', maxLength: input.getAttribute('maxlength') || null, isWorkday: true });
                processedElements.add(input);
            }
        });

        document.querySelectorAll('[data-automation-id*="selectWidget"], [data-automation-id*="selectInput"], [data-automation-id*="multiselectInputContainer"]').forEach(el => {
            const input = el.querySelector('input') || el;
            if (processedElements.has(input)) return;
            if (input.offsetParent === null) return;
            const label = getWorkdayFieldLabel(input) || getFieldLabel(input);
            if (label) {
                fields.push({ element: input, label, type: 'workday-dropdown', inputType: 'workday-dropdown', container: el, maxLength: null, isWorkday: true });
                processedElements.add(input);
            }
        });

        document.querySelectorAll('[data-automation-id*="dateInput"], [data-automation-id*="DateInput"]').forEach(el => {
            const input = el.querySelector('input') || el;
            if (processedElements.has(input)) return;
            if (input.offsetParent === null) return;
            const label = getWorkdayFieldLabel(input) || getFieldLabel(input);
            if (label) {
                fields.push({ element: input, label, type: 'workday-date', inputType: 'text', maxLength: null, isWorkday: true });
                processedElements.add(input);
            }
        });

        document.querySelectorAll('[data-automation-id] input:not([type="hidden"]), [data-automation-id] textarea').forEach(input => {
            if (processedElements.has(input)) return;
            if (input.offsetParent === null || input.disabled || input.readOnly) return;
            if (input.classList.contains('select2-search__field')) return;
            const label = getWorkdayFieldLabel(input) || getFieldLabel(input);
            if (label) {
                fields.push({ element: input, label, type: input.tagName.toLowerCase(), inputType: input.type || 'text', maxLength: input.getAttribute('maxlength') || null, isWorkday: true });
                processedElements.add(input);
            }
        });
    }

    return fields;
}

// Collect only fields that currently show a validation error or are required-but-empty.
function findErrorFields(forceWorkday) {
    const all = findFormFields(forceWorkday);
    const result = [];
    for (const field of all) {
        if (!field.element) continue;
        const msg = detectFieldError(field);
        if (msg !== null) {
            result.push({ ...field, errorMessage: msg || 'Invalid or required value' });
        }
    }
    return result;
}

// Returns an error message string if the field is invalid, else null.
function detectFieldError(field) {
    const el = field.element;
    if (!el) return null;

    let invalid = false;
    let msg = '';

    const ariaInvalid = (el.getAttribute && el.getAttribute('aria-invalid')) || '';
    if (ariaInvalid === 'true') invalid = true;

    const cls = (el.className || '') + '';
    if (/\b(is-invalid|invalid|has-error|field-error|error)\b/i.test(cls)) invalid = true;

    // Native constraint validation (covers required-empty, bad email, min/max, etc.)
    try {
        if (typeof el.checkValidity === 'function' && el.willValidate && !el.checkValidity()) {
            invalid = true;
            if (el.validationMessage) msg = el.validationMessage;
        }
    } catch (e) { /* some custom elements throw */ }

    // Nearby error text
    const near = findNearbyErrorText(el);
    if (near) {
        invalid = true;
        if (!msg) msg = near;
    }

    return invalid ? msg : null;
}

function findNearbyErrorText(el) {
    let cur = el;
    for (let depth = 0; depth < 4 && cur; depth++) {
        cur = cur.parentElement;
        if (!cur || cur === document.body) break;
        const candidates = cur.querySelectorAll('[role="alert"], .invalid-feedback, .error-message, .help-block, .field-error, .form-error, [class*="error" i], [data-automation-id*="error" i]');
        for (const c of candidates) {
            if (c.querySelector('input, textarea, select')) continue; // skip containers that wrap the field itself
            const t = (c.textContent || '').trim();
            if (t && t.length > 1 && t.length < 160) return t;
        }
    }
    return '';
}

function getRadioGroupLabel(radioElement) {
    let parent = radioElement.closest('[data-testid*="input-"]');
    if (parent) {
        const labelElement = parent.querySelector('label[id*="label"]') || parent.querySelector('label[class*="10g55w1"]');
        if (labelElement) {
            const textElement = labelElement.querySelector('[data-testid*="label"]:not([data-testid*="asterisk"])') ||
                labelElement.querySelector('span[data-testid="safe-markup"]') ||
                labelElement.querySelector('span.mosaic-provider-module-apply-questions-1wsk8bh');
            if (textElement) {
                return textElement.textContent.trim().replace(/\*/g, '').replace(/:/g, '').trim();
            }
            const clone = labelElement.cloneNode(true);
            const asterisk = clone.querySelector('[data-testid*="asterisk"]');
            if (asterisk) asterisk.remove();
            const text = clone.textContent.trim().replace(/\*/g, '').replace(/:/g, '').trim();
            if (text) return text;
        }
    }

    const labelId = radioElement.getAttribute('aria-labelledby');
    if (labelId) {
        const labelElement = document.getElementById(labelId);
        if (labelElement) return labelElement.textContent.trim().replace(/\*/g, '').replace(/:/g, '').trim();
    }

    if (radioElement.name) return radioElement.name.replace(/[_-]/g, ' ').trim();
    return null;
}

function getRadioOptionLabel(radioElement) {
    const label = radioElement.closest('label');
    if (label) {
        const span = label.querySelector('span.mosaic-provider-module-apply-questions-1hx0a07') ||
            label.querySelector('span[class*="1hx0a07"]') ||
            label.querySelector('span.eu4oa1w0') ||
            label.querySelector('span:last-child');
        if (span) {
            const text = span.textContent.trim();
            if (text) return text;
        }
        const clone = label.cloneNode(true);
        const input = clone.querySelector('input');
        if (input) input.remove();
        const text = clone.textContent.trim();
        if (text) return text;
    }
    return radioElement.value;
}

function findFileInputs() {
    const fileFields = [];
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        if (input.offsetParent === null || input.disabled) return;
        const label = getFieldLabel(input);
        fileFields.push({ element: input, label: label || 'File Upload' });
    });
    return fileFields;
}

function getFieldLabel(element) {
    let label = null;

    if (element.placeholder && element.placeholder.trim() !== '') {
        label = element.placeholder.trim();
    }

    if (!label && element.id) {
        const labelElement = document.querySelector(`label[for="${element.id}"]`);
        if (labelElement) label = labelElement.textContent.trim();
    }

    if (!label) {
        const parentLabel = element.closest('label');
        if (parentLabel) {
            const clone = parentLabel.cloneNode(true);
            const inputs = clone.querySelectorAll('input, textarea, select');
            inputs.forEach(input => input.remove());
            label = clone.textContent.trim();
        }
    }

    if (!label) {
        const parentDiv = element.closest('.col-md-4, .col-xs-12, .form-group, .field-wrapper, .form-field, .wpcf7-form-control-wrap');
        if (parentDiv) {
            const labelElement = parentDiv.querySelector('label');
            if (labelElement) label = labelElement.textContent.trim();
        }
    }

    if (!label && element.previousElementSibling) {
        const prev = element.previousElementSibling;
        if (prev.tagName === 'LABEL') label = prev.textContent.trim();
    }

    if (!label && element.getAttribute('aria-label')) label = element.getAttribute('aria-label').trim();

    if (!label) {
        let current = element;
        for (let depth = 0; depth < 6 && !label; depth++) {
            current = current.parentElement;
            if (!current || current === document.body || current === document.documentElement) break;

            let sibling = current.previousElementSibling;
            while (sibling && !label) {
                const tagName = sibling.tagName;
                if (['P', 'LABEL', 'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'DT', 'LEGEND'].includes(tagName)) {
                    if (!sibling.querySelector('input, textarea, select')) {
                        const text = sibling.textContent.trim();
                        if (text && text.length > 0 && text.length < 100) {
                            label = text;
                            break;
                        }
                    }
                }
                sibling = sibling.previousElementSibling;
            }

            if (!label) {
                const children = current.children;
                for (const child of children) {
                    if (child.contains(element)) continue;
                    if (child.querySelector('input, textarea, select')) continue;
                    const tagName = child.tagName;
                    if (['P', 'LABEL', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LEGEND'].includes(tagName)) {
                        const text = child.textContent.trim();
                        if (text && text.length > 0 && text.length < 100) {
                            label = text;
                            break;
                        }
                    }
                }
            }
        }
    }

    if (!label && element.name) label = element.name.replace(/[_-]/g, ' ').trim();

    if (label) {
        label = label.replace(/\*/g, '').replace(/:/g, '').replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '').replace(/\(required\)/gi, '').replace(/\(optional\)/gi, '');
    }
    return label;
}

function getWorkdayFieldLabel(element) {
    let label = null;

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const ids = labelledBy.split(' ');
        const texts = ids.map(id => {
            const el = document.getElementById(id);
            return el ? el.textContent.trim() : '';
        }).filter(t => t);
        if (texts.length > 0) label = texts.join(' ');
    }

    if (!label && element.getAttribute('aria-label')) {
        label = element.getAttribute('aria-label').trim();
    }

    if (!label) {
        const formField = element.closest('[data-automation-id^="formField-"]');
        if (formField) {
            const automationId = formField.getAttribute('data-automation-id');
            const fieldName = automationId.replace('formField-', '');
            const labelEl = formField.querySelector('label, [data-automation-id*="label"], [data-automation-id*="Label"]');
            if (labelEl) label = labelEl.textContent.trim();
            if (!label && fieldName) {
                label = fieldName.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').trim();
            }
        }
    }

    if (!label) {
        const parent = element.closest('[data-automation-id]');
        if (parent) {
            const labelEl = parent.querySelector('label');
            if (labelEl) label = labelEl.textContent.trim();
        }
    }

    if (label) {
        label = label.replace(/\*/g, '').replace(/:/g, '').replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '').replace(/\(required\)/gi, '').replace(/\(optional\)/gi, '');
    }
    return label;
}

function extractJobContext() {
    const bodyText = document.body.innerText;
    const pageContent = bodyText.substring(0, 3000);
    return { pageContent, pageTitle: document.title, url: window.location.href };
}

// ==================== PROFILE / OVERRIDES ====================

// Build an authoritative profile block to prepend to the resume context.
function buildProfileBlock(profile) {
    if (!profile) return '';
    const lines = [];
    const map = {
        fullName: 'Full Name',
        email: 'Email',
        phone: 'Phone',
        currentLocation: 'Current Location',
        currentCompany: 'Current Company',
        currentJobTitle: 'Current Job Title',
        totalExperience: 'Total Experience (years)',
        noticePeriod: 'Notice Period',
        currentCTC: 'Current CTC / Salary',
        expectedCTC: 'Expected CTC / Salary',
        expectedJoiningDate: 'Available From / Joining Date',
        willingToRelocate: 'Willing to Relocate',
        visaStatus: 'Work Authorization / Visa Status',
        linkedin: 'LinkedIn',
        github: 'GitHub',
        portfolio: 'Portfolio / Website'
    };
    for (const [key, label] of Object.entries(map)) {
        const v = profile[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            lines.push(`- ${label}: ${v}`);
        }
    }
    if (Array.isArray(profile.skillExperience)) {
        const se = profile.skillExperience
            .filter(s => s && s.skill && String(s.skill).trim())
            .map(s => `${s.skill}: ${s.years} year(s)`)
            .join(', ');
        if (se) lines.push(`- Years of experience per skill: ${se}`);
    }
    if (!lines.length) return '';
    return `\n\nCANDIDATE PROFILE (authoritative — prefer these exact values whenever a field asks for them):\n${lines.join('\n')}`;
}

function buildForcedAnswersBlock(profile) {
    if (!profile || !Array.isArray(profile.customAnswers)) return '';
    const items = profile.customAnswers.filter(c => c && c.pattern && String(c.pattern).trim() && c.answer && String(c.answer).trim());
    if (!items.length) return '';
    return `\n\nFORCED ANSWERS (if a field label contains the phrase, you MUST answer with exactly the given text):\n` +
        items.map(c => `- If label contains "${c.pattern}" → "${c.answer}"`).join('\n');
}

// User overrides applied directly to a field after generation (authoritative).
function resolveFieldOverride(field, profile) {
    if (!profile) return null;
    const label = (field.label || '').toLowerCase();
    if (!label) return null;

    // 1. Custom answers (exact phrase match in the label)
    if (Array.isArray(profile.customAnswers)) {
        for (const c of profile.customAnswers) {
            if (c && c.pattern && c.answer) {
                const pat = String(c.pattern).toLowerCase().trim();
                if (pat && label.includes(pat)) return String(c.answer);
            }
        }
    }

    // 2. Per-skill experience — only when the label is clearly asking about experience
    if (Array.isArray(profile.skillExperience) && /\b(experience|exp|years?|yrs?)\b/.test(label)) {
        for (const s of profile.skillExperience) {
            if (s && s.skill && (s.years || s.years === 0)) {
                const skill = String(s.skill).toLowerCase().trim();
                if (skill && label.includes(skill)) {
                    const isNumeric = field.inputType === 'number' || (field.element && field.element.type === 'number');
                    return isNumeric ? String(parseInt(s.years, 10) || s.years) : `${s.years} years`;
                }
            }
        }
    }

    return null;
}

// ==================== AI ANSWER GENERATION ====================

async function generateAllAnswers(formFields, ctx) {
    const { resumeText, additionalInfo, profile, apiKey, jobContext } = ctx;
    const provider = ctx.provider || 'groq';
    const model = ctx.model || null;
    const mode = ctx.mode || 'autofill';

    const fieldsList = formFields.map((field, index) => {
        const maxLength = field.maxLength ||
            (field.type === 'textarea' || field.inputType === 'text') ? 500 : null;
        const limitText = maxLength ? `, max ${maxLength} chars` : '';

        let typeInfo = '';
        if (field.type === 'select' || field.type === 'select2' || field.type === 'select2-search') {
            const options = [];
            const selectEl = field.selectElement || field.element;
            if (selectEl && selectEl.tagName === 'SELECT') {
                Array.from(selectEl.options).forEach(opt => {
                    const text = opt.text.trim();
                    if (text && opt.value !== '') options.push(text);
                });
            }
            typeInfo = options.length > 0
                ? ` [dropdown - pick from: ${options.slice(0, 20).join(', ')}]`
                : ` [dropdown${limitText}]`;
        } else if (field.type === 'radio') {
            const opts = field.options.map(o => o.label).join(', ');
            typeInfo = ` [radio - pick one: ${opts}]`;
        } else if (field.inputType === 'email') {
            typeInfo = ' [email]';
        } else if (field.inputType === 'tel') {
            typeInfo = ' [phone number]';
        } else if (field.inputType === 'url') {
            typeInfo = ' [URL]';
        } else if (field.inputType === 'number') {
            typeInfo = ' [number only]';
        } else if (field.type === 'textarea') {
            typeInfo = ` [textarea${limitText}]`;
        } else {
            typeInfo = ` [text${limitText}]`;
        }

        const errInfo = (mode === 'fix' && field.errorMessage)
            ? ` [⚠️ VALIDATION ERROR: "${field.errorMessage}" — return a corrected value that resolves this error]`
            : '';

        return `${index + 1}. ${field.label}${typeInfo}${errInfo}`;
    }).join('\n');

    const today = new Date();
    const currentDate = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Compose resume context
    let resumeContext = resumeText || '';
    if (additionalInfo && !resumeContext.includes(additionalInfo)) {
        resumeContext += `\n\nAdditional Information:\n${additionalInfo}`;
    }
    const profileBlock = buildProfileBlock(profile);
    const forcedBlock = buildForcedAnswersBlock(profile);

    const intro = mode === 'fix'
        ? `You are filling a job application form. Some fields were rejected with VALIDATION ERRORS and must be corrected. Return a fixed value for each field that resolves its error while staying truthful to the resume and profile.`
        : `You are an experienced professional filling a job application form. Write answers that sound natural, conversational, and human - NOT like AI-generated text.`;

    const prompt = `${intro}

TODAY'S DATE: ${currentDate}

PAGE CONTENT (Job Posting):
${jobContext.pageContent}

YOUR RESUME:
${resumeContext}${profileBlock}${forcedBlock}

Form Fields to Fill:
${fieldsList}

Task:
1. FIRST, analyze the page content above to identify:
   - Job title/position (e.g., "Full Stack Developer", "React Native Developer", "Frontend Engineer")
   - Company name
   - Key technologies and skills required
   - Job responsibilities and requirements

2. THEN, provide thoughtful, HUMAN-SOUNDING answers for ALL ${formFields.length} fields. Return your response as a JSON array with exactly ${formFields.length} answers in the same order.

CRITICAL INSTRUCTIONS:
0. Honor the CANDIDATE PROFILE and FORCED ANSWERS above as authoritative. If a profile value answers a field (location, CTC, expected CTC, notice period, experience, current company/title, links, etc.), use it exactly.
1. TAILOR YOUR ANSWERS TO THE JOB: Based on the job posting content above, highlight relevant experience from your resume that matches this specific role.
2. If the job is for Full Stack Developer, emphasize both frontend AND backend experience.
3. If the job is for React Native/Mobile Developer, emphasize mobile development experience.
4. If the job is for Frontend Developer, focus on frontend technologies and UI/UX skills.
5. If the job is for Backend Developer, focus on server-side technologies, APIs, databases.
6. Always connect your resume experience to what the job posting is asking for.

CHARACTER LIMITS - ABSOLUTELY CRITICAL - READ THIS CAREFULLY:
- Most fields have a STRICT LIMIT of 500 characters or less
- You MUST write answers that are SHORTER than the limit
- For 500 character limit: Write 2-3 SHORT sentences, approximately 400-450 characters MAX
- For 1000 character limit: Write 4-5 sentences, approximately 800-900 characters MAX
- Count characters as you write (spaces and punctuation count!)
- COMPLETE YOUR SENTENCES - never end mid-sentence
- If you're approaching the limit, finish your current sentence and STOP
- Better to write less and be complete than to write more and get cut off
- DO NOT exceed the character limit - answers will be rejected if too long

WRITE LIKE A REAL PERSON, NOT AN AI:
- Short, crisp answers. No unnecessary words.
- Use contractions (I've, I'd, it's)
- Be specific, not generic
- Avoid corporate jargon and buzzwords

CRITICAL RULE - MATCH ANSWER TO FIELD TYPE:
Each field above has a type annotation in brackets. You MUST follow the type:

GOLDEN RULE: KEEP ANSWERS SHORT AND CRISP. No long paragraphs. No fluff.

1. [text] fields with labels like "First Name", "Last Name", "Email", "Phone", "City", "LinkedIn", etc.:
   → SIMPLE DATA FIELDS - return ONLY the exact value (e.g., "John", "Doe", "john@email.com")
   → Do NOT write sentences. Just the raw value.
   → If not in resume/profile, return empty string ""

2. [email] fields → Just the email address (e.g., "john@email.com")

3. [phone number] fields → Just the phone number (e.g., "+1234567890")

4. [URL] fields → Just the URL (e.g., "https://linkedin.com/in/johndoe")

5. [number only] fields (salary, notice period, years of experience):
   → Return ONLY digits, NO text, NO units, NO words
   → Examples: "50000", "30", "5", "2"
   → For "Total Experience" / "Years of Experience" in a [number only] field, return JUST the integer (e.g. "2"), NOT "2 years"

6. [dropdown] fields → Pick the EXACT option text from the listed options.

7. [radio] fields → Pick one of the listed options. Return the EXACT option text.

8. For EXPERIENCE fields (e.g., "years of experience", "total experience", "experience"):
   → If the field type is [number only] or [text] with a label like "total experience" / "years of experience": return JUST the number (e.g. "2" or "3.5"), no units.
   → For other phrasing (e.g. textarea asking to describe experience): "2 years" or "3.5 years" is fine.
   → Use per-skill experience from the profile when the field asks about a specific skill.

8a. CURRENT COMPANY / CURRENT EMPLOYER fields:
   → Use the profile's Current Company if set, else the MOST RECENT employer from the resume.
   → Return ONLY the company name. If unknown, return "".

8b. CURRENT JOB TITLE / CURRENT POSITION fields:
   → Use the profile's Current Job Title if set, else the title of the MOST RECENT role in the resume.

8c. PREVIOUS / FORMER / LAST COMPANY fields:
   → Use the SECOND-most-recent employer from the resume. If only one job exists, return "".

8d. CURRENT/EXPECTED JOB ROLE on the application:
   → If the field asks what role you're applying for (e.g. "Position applied for", "Role"), use the job title from the JOB POSTING content above, NOT from the resume.

8e. RELEVANT EXPERIENCE / RELEVANT JOB fields:
   → Pick the PAST resume role whose title + tech stack best matches the posting. NEVER the role being applied for. Default to the most recent resume role if unsure.

9. For NOTICE PERIOD fields → Use the profile value, else a short answer like "30 days", "Immediate", "2 weeks"

10. For SALARY/CTC fields → Use the profile's Current/Expected CTC. Number fields: digits only. Text fields: short like "8 LPA".

11. [textarea] fields → Write 2-3 SHORT sentences max. Reference specific tech/projects from resume. No fluff.

12. [text] fields with QUESTION-like labels (e.g., "Why do you want this job?"): 1-2 short sentences max.

13. For SCHEDULING/DATE questions → Use TODAY'S DATE above to suggest 2-3 upcoming weekday dates. Keep it short.

14. If information is NOT AVAILABLE → Return empty string "" (never "N/A")

FORMATTING:
   → No markdown, bullet points, or special formatting
   → Keep EVERY answer as short as possible
   → Simple fields: just the value, nothing else
   → Questions: 1-3 sentences MAX, no more
   → Never over-explain. Be direct.

Your JSON array:`;

    const resolvedProvider = provider || 'groq';
    if (resolvedProvider === 'gemini') {
        return await callGeminiAPI(prompt, apiKey, model, formFields.length);
    } else {
        return await callOpenAICompatibleAPI(prompt, apiKey, resolvedProvider, model, formFields.length);
    }
}

const PROVIDER_ENDPOINTS = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    cerebras: 'https://api.cerebras.ai/v1/chat/completions',
    nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions'
};

const PROVIDER_DEFAULT_MODELS = {
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
    cerebras: ['llama-3.3-70b', 'llama3.1-8b'],
    nvidia: ['meta/llama-3.3-70b-instruct', 'meta/llama-3.1-70b-instruct', 'mistralai/mistral-7b-instruct-v0.3'],
    openrouter: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free', 'deepseek/deepseek-r1:free']
};

async function callOpenAICompatibleAPI(prompt, apiKey, provider, model, expectedCount) {
    const endpoint = PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.groq;
    const defaults = PROVIDER_DEFAULT_MODELS[provider] || PROVIDER_DEFAULT_MODELS.groq;

    // Try the chosen model first, then fall back to the provider's other models.
    const modelsToTry = model
        ? [model, ...defaults.filter(m => m !== model)]
        : defaults;
    let lastError = null;

    for (const currentModel of modelsToTry) {
        try {
            console.log(`[${provider}] Trying model: ${currentModel}`);

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://github.com';
                headers['X-Title'] = 'AI Job Form Filler';
            }

            const response = await bgFetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: currentModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.8,
                    max_tokens: 4096
                })
            });

            console.log(`[${provider}] ${currentModel} - status:`, response.status);

            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try { errorData = JSON.parse(errorText); } catch (e) { }

                if (response.status === 404 || response.status === 400) {
                    lastError = new Error(`Model ${currentModel} not available`);
                    continue;
                }
                if (response.status === 429) {
                    throw new Error(`Rate limit exceeded for ${provider}. Please wait or switch to a different model.`);
                }
                if (response.status === 401) {
                    throw new Error(`Invalid API key for ${provider}. Please check your key in the toolbar menu.`);
                }
                lastError = new Error(`API Error: ${errorData?.error?.message || errorText}`);
                continue;
            }

            const data = await response.json();
            if (!data.choices?.[0]?.message) {
                lastError = new Error('Invalid API response format');
                continue;
            }

            const answerText = data.choices[0].message.content.trim();
            console.log(`✓ [${provider}] Success with ${currentModel}`);
            return parseAnswerArray(answerText, expectedCount);

        } catch (error) {
            lastError = error;
            if (error.message.includes('Rate limit') || error.message.includes('Invalid API key')) throw error;
            continue;
        }
    }

    throw lastError || new Error(`All ${provider} models failed. Please check your API key.`);
}

async function callGeminiAPI(prompt, apiKey, model, expectedCount) {
    // Try the chosen model first, then fall back to current Gemini Flash models.
    const fallbacks = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
    const modelsToTry = (model ? [model, ...fallbacks] : fallbacks)
        .filter((m, i, arr) => arr.indexOf(m) === i);
    let lastError = null;

    for (const modelId of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
            console.log(`[gemini] Trying model: ${modelId}`);

            const response = await bgFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.8, maxOutputTokens: 4096 }
                })
            });

            console.log(`[gemini] ${modelId} - status:`, response.status);

            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try { errorData = JSON.parse(errorText); } catch (e) { }

                if (response.status === 429) throw new Error('Gemini rate limit exceeded. Try a different model or wait.');
                if (response.status === 403) throw new Error('Invalid Gemini API key. Get yours from https://aistudio.google.com/app/apikey');
                if (response.status === 404 || response.status === 400) {
                    lastError = new Error(`Gemini model ${modelId} not available`);
                    continue;
                }
                lastError = new Error(`Gemini API Error (${response.status}): ${errorData?.error?.message || errorText}`);
                continue;
            }

            const data = await response.json();
            if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
                lastError = new Error('Invalid Gemini API response');
                continue;
            }

            const answerText = data.candidates[0].content.parts[0].text.trim();
            console.log(`✓ [gemini] Success with ${modelId}`);
            return parseAnswerArray(answerText, expectedCount);
        } catch (error) {
            lastError = error;
            if (error.message.includes('rate limit') || error.message.includes('Invalid Gemini API key')) throw error;
            continue;
        }
    }

    throw lastError || new Error('All Gemini models failed. Please check your API key.');
}

function parseAnswerArray(answerText, expectedCount) {
    console.log('Raw response:', answerText);
    try {
        const jsonMatch = answerText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in response');

        const answers = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(answers)) throw new Error('Response is not an array');

        if (answers.length !== expectedCount) {
            console.warn(`Expected ${expectedCount} answers, got ${answers.length}. Padding...`);
        }
        while (answers.length < expectedCount) answers.push('');
        return answers;
    } catch (parseError) {
        console.error('Failed to parse JSON, falling back to line split:', parseError);
        const lines = answerText.split('\n').filter(line => line.trim() && !line.trim().startsWith('[') && !line.trim().startsWith(']'));
        const answers = lines.map(line => line.replace(/^["'\d\.\-\s]+/, '').replace(/["',]+$/, '').trim());
        while (answers.length < expectedCount) answers.push('');
        return answers.slice(0, expectedCount);
    }
}

// ==================== FIELD FILLING ====================

function fillField(field, value) {
    if (!value || value.trim() === '') {
        console.log(`Skipping empty value for field`);
        return;
    }

    if (field.type === 'radio') {
        let matched = false;
        for (const option of field.options) {
            if (option.label.toLowerCase().includes(value.toLowerCase()) ||
                value.toLowerCase().includes(option.label.toLowerCase()) ||
                option.value === value) {
                option.element.checked = true;
                option.element.click();
                matched = true;
                console.log(`✓ Selected radio option: "${option.label}"`);
                if (option.element.parentElement) {
                    option.element.parentElement.style.backgroundColor = '#e8f5e9';
                    setTimeout(() => { option.element.parentElement.style.backgroundColor = ''; }, 1000);
                }
                break;
            }
        }
        if (!matched) console.log(`No matching radio option found for: "${value}"`);
    } else if (field.type === 'select') {
        const select = field.element;
        let matched = false;
        for (let option of select.options) {
            if (option.text.toLowerCase().includes(value.toLowerCase()) ||
                option.value.toLowerCase().includes(value.toLowerCase()) ||
                value.toLowerCase().includes(option.text.toLowerCase())) {
                setNativeValue(select, option.value);
                matched = true;
                break;
            }
        }
        if (!matched) console.log(`No matching option found for: "${value}"`);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('blur', { bubbles: true }));
        select.style.backgroundColor = '#e8f5e9';
        setTimeout(() => { select.style.backgroundColor = ''; }, 1000);
    } else if (field.type === 'select2-search') {
        const input = field.element;
        const selectElement = field.selectElement;

        if (selectElement && window.jQuery && window.jQuery(selectElement).data('select2')) {
            try {
                const $select = window.jQuery(selectElement);
                let matchedOption = null;
                $select.find('option').each(function () {
                    const optionText = window.jQuery(this).text().toLowerCase();
                    const optionValue = window.jQuery(this).val().toLowerCase();
                    if (optionText.includes(value.toLowerCase()) ||
                        value.toLowerCase().includes(optionText) ||
                        optionValue.includes(value.toLowerCase())) {
                        matchedOption = window.jQuery(this).val();
                        return false;
                    }
                });

                if (matchedOption) {
                    $select.val(matchedOption).trigger('change');
                    console.log(`✓ Set Select2 via jQuery: "${value}"`);
                } else {
                    const newOption = new Option(value, value, true, true);
                    $select.append(newOption).trigger('change');
                    console.log(`✓ Created new Select2 option: "${value}"`);
                }

                const container = input.closest('.select2-container');
                if (container) {
                    container.style.backgroundColor = '#e8f5e9';
                    setTimeout(() => { container.style.backgroundColor = ''; }, 1000);
                }
                return;
            } catch (e) {
                console.log('jQuery method failed, trying manual approach:', e);
            }
        }

        const container = input.closest('.select2-container');
        if (container) container.click();

        setTimeout(() => {
            input.focus();
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: value }));
            setTimeout(() => {
                const results = document.querySelector('.select2-results__option[aria-selected="false"]');
                if (results) {
                    results.click();
                    console.log(`✓ Selected Select2 result: "${value}"`);
                } else {
                    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
                    input.dispatchEvent(enterEvent);
                }
                if (container) {
                    container.style.backgroundColor = '#e8f5e9';
                    setTimeout(() => { container.style.backgroundColor = ''; }, 1000);
                }
            }, 500);
        }, 200);
    } else if (field.type === 'workday-dropdown') {
        fillWorkdayDropdown(field, value);
    } else {
        const element = field.element;
        let finalValue = value;
        if (element.type === 'number') {
            finalValue = value.replace(/[^0-9.]/g, '');
        }
        simulateFullInput(element, finalValue);
        element.style.backgroundColor = '#e8f5e9';
        setTimeout(() => { element.style.backgroundColor = ''; }, 1000);
    }
}

async function fillWorkdayDropdown(field, value) {
    const container = field.container || field.element.closest('[data-automation-id]');
    const input = field.element;

    input.click();
    input.focus();
    await sleep(300);

    simulateFullInput(input, value);
    await sleep(500);

    const resultSelectors = [
        '[data-automation-id*="promptOption"]',
        '[data-automation-id*="selectOption"]',
        '[data-automation-id*="menuItem"]',
        '[role="option"]',
        '[role="listbox"] [role="option"]',
        'li[role="option"]'
    ];

    let clicked = false;
    for (const selector of resultSelectors) {
        const options = document.querySelectorAll(selector);
        for (const option of options) {
            const text = option.textContent.trim().toLowerCase();
            if (text.includes(value.toLowerCase()) || value.toLowerCase().includes(text)) {
                option.click();
                clicked = true;
                console.log(`✓ Selected Workday dropdown option: "${option.textContent.trim()}"`);
                break;
            }
        }
        if (clicked) break;
    }

    if (!clicked) {
        for (const selector of resultSelectors) {
            const firstOption = document.querySelector(selector);
            if (firstOption && firstOption.offsetParent !== null) {
                firstOption.click();
                console.log(`✓ Selected first Workday dropdown option: "${firstOption.textContent.trim()}"`);
                clicked = true;
                break;
            }
        }
    }

    if (!clicked) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        console.log(`Pressed Enter for Workday dropdown: "${value}"`);
    }

    if (container) {
        container.style.backgroundColor = '#e8f5e9';
        setTimeout(() => { container.style.backgroundColor = ''; }, 1000);
    }
}

async function fillFileInput(element, base64Data, fileName, fileType) {
    try {
        const response = await fetch(base64Data);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: fileType });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        element.files = dataTransfer.files;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        if (element.parentElement) {
            element.parentElement.style.backgroundColor = '#e8f5e9';
            setTimeout(() => { element.parentElement.style.backgroundColor = ''; }, 1000);
        }
    } catch (error) {
        console.error('Error filling file input:', error);
    }
}

// ==================== UTILITIES ====================

// Route all external API calls through the background service worker to bypass CORS
function bgFetch(url, options) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'proxyFetch', url, options }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response) {
                reject(new Error('No response from background worker'));
                return;
            }
            if (response.error) {
                reject(new Error(response.error));
                return;
            }
            resolve({
                ok: response.ok,
                status: response.status,
                text: () => Promise.resolve(response.text),
                json: () => Promise.resolve(JSON.parse(response.text))
            });
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

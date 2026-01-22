// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fillForm') {
        fillFormWithAI()
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function fillFormWithAI() {
    const { apiKey, resumeText } = await chrome.storage.local.get(['apiKey', 'resumeText']);
    if (!apiKey || !resumeText) throw new Error('API key or resume not found');

    const formFields = findFormFields();
    if (formFields.length === 0) throw new Error('No form fields found on this page');

    // First, log all questions found
    console.log('=== FORM FIELDS DETECTED ===');
    console.log(`Found ${formFields.length} fields:`);
    formFields.forEach((field, index) => {
        console.log(`${index + 1}. "${field.label}" (${field.inputType})`);
    });
    console.log('=== STARTING TO FILL ===\n');

    // Then fill them
    for (const field of formFields) {
        try {
            console.log(`📝 Filling field: "${field.label}" (type: ${field.inputType})`);
            const answer = await generateAnswer(field.label, field.type, resumeText, apiKey);
            console.log(`✅ Answer for "${field.label}": ${answer}`);
            fillField(field.element, answer, field.type);
            await sleep(500);
        } catch (error) {
            console.error(`❌ Error filling field "${field.label}":`, error);
        }
    }
}

function findFormFields() {
    const fields = [];
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea');

    inputs.forEach(input => {
        if (input.offsetParent === null || input.disabled || input.readOnly) return;
        const label = getFieldLabel(input);
        if (label) {
            fields.push({
                element: input,
                label: label,
                type: input.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'input',
                inputType: input.type || 'text'
            });
        }
    });
    return fields;
}

function getFieldLabel(element) {
    let label = null;

    if (element.id) {
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

    if (!label && element.previousElementSibling) {
        const prev = element.previousElementSibling;
        if (prev.tagName === 'LABEL') label = prev.textContent.trim();
    }

    if (!label && element.getAttribute('aria-label')) label = element.getAttribute('aria-label').trim();
    if (!label && element.placeholder) label = element.placeholder.trim();
    if (!label && element.name) label = element.name.replace(/[_-]/g, ' ').trim();

    if (label) {
        label = label.replace(/\*/g, '').replace(/:/g, '').replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '').replace(/\(required\)/gi, '').replace(/\(optional\)/gi, '');
    }
    return label;
}

async function generateAnswer(fieldLabel, fieldType, resumeText, apiKey) {
    const lowerLabel = fieldLabel.toLowerCase();
    let fieldCategory = 'general';

    if (lowerLabel.includes('name') && !lowerLabel.includes('company')) fieldCategory = 'name';
    else if (lowerLabel.includes('email')) fieldCategory = 'email';
    else if (lowerLabel.includes('phone') || lowerLabel.includes('mobile') || lowerLabel.includes('contact')) fieldCategory = 'phone';
    else if (lowerLabel.includes('address') || lowerLabel.includes('location') || lowerLabel.includes('city') || lowerLabel.includes('state')) fieldCategory = 'address';
    else if (lowerLabel.includes('family') || lowerLabel.includes('father') || lowerLabel.includes('mother') || lowerLabel.includes('parent')) fieldCategory = 'family';
    else if (lowerLabel.includes('education') || lowerLabel.includes('degree') || lowerLabel.includes('university') || lowerLabel.includes('college')) fieldCategory = 'education';
    else if (lowerLabel.includes('experience') || lowerLabel.includes('work') || lowerLabel.includes('employment')) fieldCategory = 'experience';
    else if (lowerLabel.includes('skill')) fieldCategory = 'skills';
    else if (lowerLabel.includes('position') || lowerLabel.includes('title') || lowerLabel.includes('role')) fieldCategory = 'position';

    const prompt = `You are filling a job application form.

Resume:
${resumeText}

Task:
Write a SHORT, PROFESSIONAL, and NATURAL answer for the form field titled "${fieldLabel}".

Rules:
- If the field is a cover letter, motivation, or "Why should we hire you":
  → Write 3–5 sentences in first person ("I am", "I have")
  → Sound human and professional
  → Mention relevant skills and experience from the resume
  → Do NOT repeat the resume verbatim
- If the field asks for name, email, phone, LinkedIn, or portfolio:
  → Extract the exact value from the resume
- If the information is not available:
  → Respond with "N/A"
- Do NOT use markdown
- Do NOT add headings
- Do NOT add greetings or sign-offs
- Return ONLY the final answer text

Answer:`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    let lastError = null;

    for (const model of models) {
        try {
            console.log(`Trying model: ${model} for field: ${fieldLabel}`);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
                })
            });

            console.log(`Model ${model} - Response status:`, response.status);

            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    lastError = new Error(`API Error (${response.status}): ${errorText}`);
                    console.log(`Model ${model} failed, trying next...`);
                    continue;
                }

                if (response.status === 404) {
                    console.log(`Model ${model} not found, trying next...`);
                    lastError = new Error(`Model ${model} not found`);
                    continue;
                }

                if (response.status === 429) {
                    throw new Error(`Quota exceeded. Please wait 10-15 minutes or get a new API key from https://aistudio.google.com/app/apikey`);
                }

                lastError = new Error(`API Error: ${errorData.error?.message || errorText}`);
                console.log(`Model ${model} error:`, lastError.message);
                continue;
            }

            const data = await response.json();

            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                console.error('Unexpected API response:', data);
                lastError = new Error('Invalid API response format');
                continue;
            }

            const answer = data.candidates[0].content.parts[0].text.trim();
            console.log(`✓ Success with model ${model}:`, answer);
            return answer;

        } catch (error) {
            console.error(`Error with model ${model}:`, error);
            lastError = error;
            if (error.message.includes('Quota exceeded')) throw error;
            continue;
        }
    }

    throw lastError || new Error('All models failed. Please check your API key and try again.');
}

function fillField(element, value, type) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    element.style.backgroundColor = '#e8f5e9';
    setTimeout(() => { element.style.backgroundColor = ''; }, 1000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
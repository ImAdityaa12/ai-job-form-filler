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

    const prompt = `You are filling out a job application form. Extract the specific information requested from the resume.

Resume:
${resumeText}

Field Label: "${fieldLabel}"
Field Category: ${fieldCategory}

INSTRUCTIONS BY CATEGORY:
- name: Extract only the person's full name
- email: Extract only the email address
- phone: Extract only the phone number
- address: Extract only the complete address (street, city, state, zip)
- family: This asks about FAMILY BACKGROUND (parents, siblings, family details) - NOT professional background. If not in resume, say "Not specified in resume"
- education: Extract degree, major, and institution
- experience: Briefly describe relevant work experience
- skills: List relevant technical/professional skills
- position: Extract current or most recent job title
- general: Provide the most relevant information from the resume

CRITICAL RULES:
1. Answer ONLY what the field asks for - nothing else
2. If asking about family/personal background, DO NOT provide professional information
3. If information is not in resume, respond with "Not specified in resume"
4. No explanations, labels, or extra text
5. Be concise and direct

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
// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fillForm') {
        fillFormWithAI()
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// Function to show notification on page
function showNotification(message, type = 'info') {
    console.log('showNotification called:', message, type);

    // Check if body exists
    if (!document.body) {
        console.error('document.body not found, waiting...');
        setTimeout(() => showNotification(message, type), 100);
        return;
    }

    // Remove existing notification if any
    const existing = document.getElementById('ai-form-filler-notification');
    if (existing) {
        console.log('Removing existing notification');
        existing.remove();
    }

    // Create notification element
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
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        animation: slideInRight 0.3s ease !important;
        max-width: 350px !important;
        pointer-events: auto !important;
    `;

    // Add icon based on type
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '⏳';
    notification.innerHTML = `
        <span style="font-size: 20px;">${icon}</span>
        <span>${message}</span>
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(100px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        @keyframes slideOutRight {
            from {
                opacity: 1;
                transform: translateX(0);
            }
            to {
                opacity: 0;
                transform: translateX(100px);
            }
        }
    `;
    if (!document.getElementById('ai-form-filler-styles')) {
        style.id = 'ai-form-filler-styles';
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    console.log('Notification appended to body');

    // Auto remove after delay (longer for errors)
    const delay = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
                console.log('Notification removed');
            }
        }, 300);
    }, delay);
}

async function fillFormWithAI() {
    // Show starting notification
    showNotification('🤖 AI Form Filler: Detecting fields...', 'info');

    const { apiKey, resumeText, resumeFileData, resumeFileName, resumeFileType } = await chrome.storage.local.get(['apiKey', 'resumeText', 'resumeFileData', 'resumeFileName', 'resumeFileType']);

    if (!apiKey || !resumeText) {
        showNotification('⚠️ Please save your API key and resume first', 'error');
        throw new Error('API key or resume not found');
    }

    const formFields = findFormFields();
    const fileInputs = findFileInputs();

    if (formFields.length === 0 && fileInputs.length === 0) {
        showNotification('⚠️ No form fields found on this page', 'error');
        throw new Error('No form fields found on this page');
    }

    // Update notification
    showNotification(`🔍 Found ${formFields.length} fields. Generating answers...`, 'info');

    // Extract job context from the page
    const jobContext = extractJobContext();

    // First, log all questions found
    console.log('=== FORM FIELDS DETECTED ===');
    console.log(`Found ${formFields.length} text fields and ${fileInputs.length} file upload fields`);
    formFields.forEach((field, index) => {
        console.log(`${index + 1}. "${field.label}" (${field.inputType})`);
    });
    fileInputs.forEach((field, index) => {
        console.log(`FILE ${index + 1}. "${field.label}"`);
    });
    console.log('=== JOB CONTEXT ===');
    console.log(jobContext);
    console.log('=== GENERATING ALL ANSWERS IN ONE API CALL ===\n');

    try {
        // Fill file upload fields first
        if (fileInputs.length > 0 && resumeFileData) {
            console.log('📎 Uploading resume to file fields...');
            for (const fileInput of fileInputs) {
                await fillFileInput(fileInput.element, resumeFileData, resumeFileName, resumeFileType);
                console.log(`✅ Uploaded resume to: "${fileInput.label}"`);
            }
        }

        // Generate all text answers in one API call
        if (formFields.length > 0) {
            const answers = await generateAllAnswers(formFields, resumeText, apiKey, jobContext);

            // Update notification
            showNotification('📝 Filling form fields...', 'info');

            // Fill the fields with the answers
            for (let i = 0; i < formFields.length; i++) {
                const field = formFields[i];
                let answer = answers[i];

                // Apply character limit - use field's maxLength or default to 500 for text fields
                const maxLength = field.maxLength ? parseInt(field.maxLength) :
                    (field.type === 'textarea' || field.inputType === 'text') ? 500 : null;

                if (maxLength && answer && answer.length > maxLength) {
                    console.warn(`Answer for "${field.label}" is ${answer.length} chars, truncating to ${maxLength}`);
                    // Truncate to maxLength
                    answer = answer.substring(0, maxLength);
                }

                console.log(`📝 Filling field: "${field.label}"`);
                console.log(`✅ Answer: ${answer}`);
                if (maxLength) {
                    console.log(`   Character count: ${answer ? answer.length : 0}/${maxLength}`);
                }

                if (field.type === 'radio') {
                    console.log(`   Options: ${field.options.map(o => o.label).join(', ')}`);
                }

                fillField(field, answer);

                // Longer delay for Select2 fields to allow dropdown interactions
                const delay = field.type === 'select2-search' ? 1000 : 200;
                await sleep(delay);
            }
        }

        console.log('\n=== FORM FILLING COMPLETE ===');
        showNotification('✓ Form filled successfully!', 'success');
    } catch (error) {
        console.error('❌ Error filling form:', error);
        showNotification(`✗ Error: ${error.message}`, 'error');
        throw error;
    }
}

function findFormFields() {
    const fields = [];
    const processedSelect2 = new Set(); // Track processed Select2 fields

    // First, find all Select2 search fields with placeholders
    const select2SearchFields = document.querySelectorAll('input.select2-search__field[placeholder]');
    select2SearchFields.forEach(input => {
        const placeholder = input.getAttribute('placeholder');
        // Only process if it has a meaningful placeholder (not empty and not the tiny internal ones)
        if (placeholder && placeholder.trim() !== '' &&
            input.style.width !== '5.25em' &&
            parseFloat(input.style.width) > 50) {

            // Find the associated select element
            let selectElement = null;
            const container = input.closest('.select2-container');
            if (container) {
                // Look for the original select before or after the container
                selectElement = container.previousElementSibling;
                if (!selectElement || selectElement.tagName !== 'SELECT') {
                    selectElement = container.nextElementSibling;
                }
                if (!selectElement || selectElement.tagName !== 'SELECT') {
                    // Try to find by aria-controls or other attributes
                    const ariaControls = container.getAttribute('aria-controls');
                    if (ariaControls) {
                        const resultsId = ariaControls.replace('-results', '');
                        selectElement = document.querySelector(`select[data-select2-id="${resultsId}"]`);
                    }
                }
            }

            fields.push({
                element: input,
                selectElement: selectElement, // Store the original select if found
                label: placeholder,
                type: 'select2-search',
                inputType: 'select2',
                maxLength: null
            });

            if (selectElement) {
                processedSelect2.add(selectElement);
            }
        }
    });

    // Now process regular inputs
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type]), textarea, select');

    inputs.forEach(input => {
        // Skip select2 search fields (already processed above)
        if (input.classList.contains('select2-search__field')) return;

        // Skip select elements that are part of Select2 (already processed)
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

    // Find Select2 dropdowns (custom select boxes)
    const select2Containers = document.querySelectorAll('.select2-container');
    select2Containers.forEach(container => {
        // Find the original select element
        const selectId = container.getAttribute('aria-owns');
        if (selectId) {
            const originalSelect = document.getElementById(selectId.replace('-results', ''));
            if (originalSelect && originalSelect.tagName === 'SELECT') {
                const label = getFieldLabel(originalSelect);
                if (label) {
                    fields.push({
                        element: originalSelect,
                        label: label,
                        type: 'select2',
                        inputType: 'select2',
                        container: container,
                        maxLength: null
                    });
                }
            }
        } else {
            // Try to find by looking at the previous sibling
            const prevElement = container.previousElementSibling;
            if (prevElement && prevElement.tagName === 'SELECT') {
                const label = getFieldLabel(prevElement);
                if (label) {
                    fields.push({
                        element: prevElement,
                        label: label,
                        type: 'select2',
                        inputType: 'select2',
                        container: container,
                        maxLength: null
                    });
                }
            }
        }
    });

    // Find radio button groups
    const radioGroups = new Map();
    const radioInputs = document.querySelectorAll('input[type="radio"]');

    radioInputs.forEach(radio => {
        if (radio.offsetParent === null || radio.disabled) return;
        const groupName = radio.name;
        if (!groupName) return;

        if (!radioGroups.has(groupName)) {
            const label = getRadioGroupLabel(radio);
            if (label) {
                // Get all options for this radio group
                const options = Array.from(document.querySelectorAll(`input[type="radio"][name="${groupName}"]`))
                    .map(r => {
                        const optionLabel = getRadioOptionLabel(r);
                        return { element: r, label: optionLabel, value: r.value };
                    });

                radioGroups.set(groupName, {
                    element: radio, // First radio in group
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

    // Add radio groups to fields
    radioGroups.forEach(group => fields.push(group));

    return fields;
}

function getRadioGroupLabel(radioElement) {
    // Try to find the group label (usually in a parent element)
    let parent = radioElement.closest('[data-testid*="input-"]');
    if (parent) {
        // Look for label with specific patterns
        const labelElement = parent.querySelector('label[id*="label"]') ||
            parent.querySelector('label[class*="10g55w1"]');
        if (labelElement) {
            // Try to find the text element within the label
            const textElement = labelElement.querySelector('[data-testid*="label"]:not([data-testid*="asterisk"])') ||
                labelElement.querySelector('span[data-testid="safe-markup"]') ||
                labelElement.querySelector('span.mosaic-provider-module-apply-questions-1wsk8bh');
            if (textElement) {
                return textElement.textContent.trim().replace(/\*/g, '').replace(/:/g, '').trim();
            }

            // Fallback: get text from label, excluding asterisk
            const clone = labelElement.cloneNode(true);
            const asterisk = clone.querySelector('[data-testid*="asterisk"]');
            if (asterisk) asterisk.remove();
            const text = clone.textContent.trim().replace(/\*/g, '').replace(/:/g, '').trim();
            if (text) return text;
        }
    }

    // Fallback: look for aria-labelledby
    const labelId = radioElement.getAttribute('aria-labelledby');
    if (labelId) {
        const labelElement = document.getElementById(labelId);
        if (labelElement) return labelElement.textContent.trim().replace(/\*/g, '').replace(/:/g, '').trim();
    }

    // Fallback: use name attribute
    if (radioElement.name) {
        return radioElement.name.replace(/[_-]/g, ' ').trim();
    }

    return null;
}

function getRadioOptionLabel(radioElement) {
    // Look for label associated with this specific radio
    const label = radioElement.closest('label');
    if (label) {
        // Try multiple selectors for the label text
        const span = label.querySelector('span.mosaic-provider-module-apply-questions-1hx0a07') ||
            label.querySelector('span[class*="1hx0a07"]') ||
            label.querySelector('span.eu4oa1w0') ||
            label.querySelector('span:last-child');
        if (span) {
            const text = span.textContent.trim();
            if (text) return text;
        }

        // Fallback: get all text from label, excluding the input
        const clone = label.cloneNode(true);
        const input = clone.querySelector('input');
        if (input) input.remove();
        const text = clone.textContent.trim();
        if (text) return text;
    }

    // Fallback to value
    return radioElement.value;
}

function findFileInputs() {
    const fileFields = [];
    const fileInputs = document.querySelectorAll('input[type="file"]');

    fileInputs.forEach(input => {
        if (input.offsetParent === null || input.disabled) return;
        const label = getFieldLabel(input);
        fileFields.push({
            element: input,
            label: label || 'File Upload'
        });
    });
    return fileFields;
}

function getFieldLabel(element) {
    let label = null;

    // Check for placeholder first (especially for select2 fields)
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

    // Look for label in parent div structure (common in Bootstrap forms)
    if (!label) {
        const parentDiv = element.closest('.col-md-4, .col-xs-12, .form-group, .field-wrapper');
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
    if (!label && element.name) label = element.name.replace(/[_-]/g, ' ').trim();

    if (label) {
        label = label.replace(/\*/g, '').replace(/:/g, '').replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '').replace(/\(required\)/gi, '').replace(/\(optional\)/gi, '');
    }
    return label;
}

function extractJobContext() {
    // Get all visible text content from the page
    const bodyText = document.body.innerText;

    // Limit to first 3000 characters to avoid token limits
    // This should capture job title, company, description, and requirements
    const pageContent = bodyText.substring(0, 3000);

    return {
        pageContent: pageContent,
        pageTitle: document.title,
        url: window.location.href
    };
}

async function generateAllAnswers(formFields, resumeText, apiKey, jobContext) {
    // Build a list of all questions with character limits
    const fieldsList = formFields.map((field, index) => {
        // Default to 500 chars for text fields if no maxLength specified
        const maxLength = field.maxLength ||
            (field.type === 'textarea' || field.inputType === 'text') ? 500 : null;
        const limitText = maxLength ? ` (STRICT LIMIT: ${maxLength} characters)` : '';
        return `${index + 1}. ${field.label}${limitText}`;
    }).join('\n');

    const prompt = `You are an experienced software engineer filling a job application form. Write answers that sound natural, conversational, and human - NOT like AI-generated text.

PAGE CONTENT (Job Posting):
${jobContext.pageContent}

YOUR RESUME:
${resumeText}

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
- Use casual, conversational language
- Include personal touches ("I've found that...", "In my experience...", "One thing I learned...")
- Vary sentence structure (mix short and long sentences)
- Use contractions (I've, I'd, it's, that's)
- Be specific with examples, not generic
- Show personality while staying professional
- Avoid corporate jargon and buzzwords
- Don't sound overly formal or robotic

ANSWER GUIDELINES:

1. For TECHNICAL QUESTIONS (how do you approach X, describe your experience with Y):
   → Write 3-5 sentences in a conversational tone
   → Start with phrases like "I usually...", "I've found...", "My approach is..."
   → Reference specific technologies/projects from the resume
   → Share a brief example or insight
   → NEVER say "N/A" - always provide a thoughtful answer
   → Sound like you're explaining to a colleague, not writing a textbook

2. For SIMPLE FIELDS (name, email, phone, LinkedIn):
   → Extract the exact value from the resume
   → If not in resume, return empty string ""

3. For MOTIVATION/WHY questions:
   → Write 3-5 sentences explaining genuine interest
   → Be enthusiastic but authentic
   → Reference specific aspects of the role/company if mentioned
   → Show personality

4. For SELECT/DROPDOWN fields (usually single word answers like "Yes", "No", country names, etc.):
   → Provide a simple, direct answer that would match a dropdown option
   → Examples: "Yes", "No", "India", "Bachelor's", "5-10 years", etc.
   → If not applicable, return empty string ""

5. For NUMERIC FIELDS (salary, notice period, years of experience):
   → CRITICAL: Return ONLY the number, NO text, NO currency symbols, NO units
   → Examples: "50000" (not "$50,000" or "50000 USD")
   → Examples: "30" (not "30 days" or "1 month")
   → Examples: "5" (not "5 years")
   → If the field label contains "salary", "notice", "period", "years", return ONLY digits
   → If not in resume, estimate a reasonable number based on experience level

6. If information is NOT AVAILABLE or NOT APPLICABLE:
   → Return empty string ""
   → DO NOT write "N/A" or "Not applicable"
   → Just leave it blank with ""

6. FORMATTING:
   → No markdown, bullet points, or special formatting
   → No headings or labels
   → Write in natural paragraph form
   → Keep answers 50-150 words for technical questions
   → Sound conversational, not formal

Example of GOOD (human) answer:
"I usually start by setting up a clear folder structure based on features rather than file types. In my last project, we used a modular architecture where each feature had its own components, hooks, and tests. This made it way easier to scale as the team grew. We also relied heavily on TypeScript and ESLint to catch issues early."

Example of BAD (robotic) answer:
"I utilize industry-standard best practices to implement scalable architecture patterns. My approach involves leveraging modular design principles and adhering to established conventions."

Your JSON array:`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    let lastError = null;

    for (const model of models) {
        try {
            console.log(`Trying model: ${model}`);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 4096 // Increased for longer technical answers
                    }
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

            const answerText = data.candidates[0].content.parts[0].text.trim();
            console.log(`✓ Success with model ${model}`);
            console.log('Raw response:', answerText);

            // Parse the JSON array from the response
            try {
                // Try to extract JSON array from the response
                const jsonMatch = answerText.match(/\[[\s\S]*\]/);
                if (!jsonMatch) {
                    throw new Error('No JSON array found in response');
                }

                const answers = JSON.parse(jsonMatch[0]);

                if (!Array.isArray(answers)) {
                    throw new Error('Response is not an array');
                }

                if (answers.length !== formFields.length) {
                    console.warn(`Expected ${formFields.length} answers, got ${answers.length}. Padding with empty strings...`);
                    // Pad with empty strings if needed
                    while (answers.length < formFields.length) {
                        answers.push('');
                    }
                }

                return answers;
            } catch (parseError) {
                console.error('Failed to parse JSON response:', parseError);
                console.log('Attempting to split by lines as fallback...');

                // Fallback: split by lines and clean up
                const lines = answerText.split('\n').filter(line => line.trim() && !line.trim().startsWith('[') && !line.trim().startsWith(']'));
                const answers = lines.map(line => line.replace(/^["'\d\.\-\s]+/, '').replace(/["',]+$/, '').trim());

                if (answers.length < formFields.length) {
                    while (answers.length < formFields.length) {
                        answers.push('');
                    }
                }

                return answers.slice(0, formFields.length);
            }

        } catch (error) {
            console.error(`Error with model ${model}:`, error);
            lastError = error;
            if (error.message.includes('Quota exceeded')) throw error;
            continue;
        }
    }

    throw lastError || new Error('All models failed. Please check your API key and try again.');
}

function fillField(field, value) {
    // Skip if value is empty
    if (!value || value.trim() === '') {
        console.log(`Skipping empty value for field`);
        return;
    }

    if (field.type === 'radio') {
        // For radio button groups
        let matched = false;

        // Try to match the answer with one of the radio options
        for (const option of field.options) {
            if (option.label.toLowerCase().includes(value.toLowerCase()) ||
                value.toLowerCase().includes(option.label.toLowerCase()) ||
                option.value === value) {
                // Click the radio button
                option.element.checked = true;
                option.element.click();
                matched = true;
                console.log(`✓ Selected radio option: "${option.label}"`);

                // Visual feedback
                if (option.element.parentElement) {
                    option.element.parentElement.style.backgroundColor = '#e8f5e9';
                    setTimeout(() => {
                        option.element.parentElement.style.backgroundColor = '';
                    }, 1000);
                }
                break;
            }
        }

        if (!matched) {
            console.log(`No matching radio option found for: "${value}"`);
        }
    } else if (field.type === 'select') {
        // For select/dropdown fields
        const select = field.element;
        let matched = false;

        // Try to find matching option (case-insensitive)
        for (let option of select.options) {
            if (option.text.toLowerCase().includes(value.toLowerCase()) ||
                option.value.toLowerCase().includes(value.toLowerCase()) ||
                value.toLowerCase().includes(option.text.toLowerCase())) {
                select.value = option.value;
                matched = true;
                break;
            }
        }

        if (!matched) {
            console.log(`No matching option found for: "${value}"`);
        }

        // Trigger events
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('blur', { bubbles: true }));

        // Visual feedback
        select.style.backgroundColor = '#e8f5e9';
        setTimeout(() => { select.style.backgroundColor = ''; }, 1000);
    } else if (field.type === 'select2-search') {
        // For Select2 search fields - we need to interact with Select2 properly
        const input = field.element;
        const selectElement = field.selectElement;

        // Method 1: If we have the original select element, try to set it directly
        if (selectElement && window.jQuery && window.jQuery(selectElement).data('select2')) {
            try {
                const $select = window.jQuery(selectElement);

                // Try to find matching option in the select
                let matchedOption = null;
                $select.find('option').each(function () {
                    const optionText = window.jQuery(this).text().toLowerCase();
                    const optionValue = window.jQuery(this).val().toLowerCase();
                    if (optionText.includes(value.toLowerCase()) ||
                        value.toLowerCase().includes(optionText) ||
                        optionValue.includes(value.toLowerCase())) {
                        matchedOption = window.jQuery(this).val();
                        return false; // break
                    }
                });

                if (matchedOption) {
                    $select.val(matchedOption).trigger('change');
                    console.log(`✓ Set Select2 via jQuery: "${value}"`);
                } else {
                    // If no match, try to create a new option (for tags/free input)
                    const newOption = new Option(value, value, true, true);
                    $select.append(newOption).trigger('change');
                    console.log(`✓ Created new Select2 option: "${value}"`);
                }

                // Visual feedback on the container
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

        // Method 2: Manual interaction with the search field
        // Click to open the dropdown
        const container = input.closest('.select2-container');
        if (container) {
            container.click();
        }

        setTimeout(() => {
            // Focus and type into the search field
            input.focus();
            input.value = value;

            // Trigger input events
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: value
            }));

            // Wait for results to appear, then select first result
            setTimeout(() => {
                // Try to find and click the first result
                const results = document.querySelector('.select2-results__option[aria-selected="false"]');
                if (results) {
                    results.click();
                    console.log(`✓ Selected Select2 result: "${value}"`);
                } else {
                    // If no results, try pressing Enter
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true
                    });
                    input.dispatchEvent(enterEvent);
                }

                // Visual feedback
                if (container) {
                    container.style.backgroundColor = '#e8f5e9';
                    setTimeout(() => { container.style.backgroundColor = ''; }, 1000);
                }
            }, 500);
        }, 200);
    } else {
        // For text inputs, number inputs, and textareas
        const element = field.element;

        // For number inputs, ensure we're setting a valid number
        if (element.type === 'number') {
            // Extract numbers from the value
            const numericValue = value.replace(/[^0-9.]/g, '');
            element.value = numericValue;
        } else {
            element.value = value;
        }

        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        // Visual feedback
        element.style.backgroundColor = '#e8f5e9';
        setTimeout(() => { element.style.backgroundColor = ''; }, 1000);
    }
}

async function fillFileInput(element, base64Data, fileName, fileType) {
    try {
        // Convert base64 to blob
        const response = await fetch(base64Data);
        const blob = await response.blob();

        // Create a File object
        const file = new File([blob], fileName, { type: fileType });

        // Create a DataTransfer object to set files
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        // Set the files on the input
        element.files = dataTransfer.files;

        // Trigger change event
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // Visual feedback
        if (element.parentElement) {
            element.parentElement.style.backgroundColor = '#e8f5e9';
            setTimeout(() => {
                element.parentElement.style.backgroundColor = '';
            }, 1000);
        }
    } catch (error) {
        console.error('Error filling file input:', error);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

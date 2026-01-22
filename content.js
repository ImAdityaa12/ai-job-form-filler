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
    const { apiKey, resumeText, resumeFileData, resumeFileName, resumeFileType } = await chrome.storage.local.get(['apiKey', 'resumeText', 'resumeFileData', 'resumeFileName', 'resumeFileType']);
    if (!apiKey || !resumeText) throw new Error('API key or resume not found');

    const formFields = findFormFields();
    const fileInputs = findFileInputs();

    if (formFields.length === 0 && fileInputs.length === 0) {
        throw new Error('No form fields found on this page');
    }

    // First, log all questions found
    console.log('=== FORM FIELDS DETECTED ===');
    console.log(`Found ${formFields.length} text fields and ${fileInputs.length} file upload fields`);
    formFields.forEach((field, index) => {
        console.log(`${index + 1}. "${field.label}" (${field.inputType})`);
    });
    fileInputs.forEach((field, index) => {
        console.log(`FILE ${index + 1}. "${field.label}"`);
    });
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
            const answers = await generateAllAnswers(formFields, resumeText, apiKey);

            // Fill the fields with the answers
            for (let i = 0; i < formFields.length; i++) {
                const field = formFields[i];
                const answer = answers[i];

                console.log(`📝 Filling field: "${field.label}"`);
                console.log(`✅ Answer: ${answer}`);

                fillField(field.element, answer, field.type);
                await sleep(200);
            }
        }

        console.log('\n=== FORM FILLING COMPLETE ===');
    } catch (error) {
        console.error('❌ Error filling form:', error);
        throw error;
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

async function generateAllAnswers(formFields, resumeText, apiKey) {
    // Build a list of all questions
    const fieldsList = formFields.map((field, index) => `${index + 1}. ${field.label}`).join('\n');

    const prompt = `You are filling a job application form. Answer ALL questions below in ONE response.

Resume:
${resumeText}

Form Fields to Fill:
${fieldsList}

Task:
Provide answers for ALL fields above. Return your response as a JSON array with exactly ${formFields.length} answers in the same order.

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
- Return ONLY a JSON array with ${formFields.length} strings

Example format:
["Answer for field 1", "Answer for field 2", "Answer for field 3"]

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
                        temperature: 0.7,
                        maxOutputTokens: 2048 // Increased for multiple answers
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
                    console.warn(`Expected ${formFields.length} answers, got ${answers.length}. Padding with N/A...`);
                    // Pad with N/A if needed
                    while (answers.length < formFields.length) {
                        answers.push('N/A');
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
                        answers.push('N/A');
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

function fillField(element, value, type) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    element.style.backgroundColor = '#e8f5e9';
    setTimeout(() => { element.style.backgroundColor = ''; }, 1000);
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

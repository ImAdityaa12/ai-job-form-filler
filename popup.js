const PROVIDERS = {
    groq: {
        consoleUrl: 'https://console.groq.com/keys',
        consoleText: 'Groq Console',
        apiKeyPlaceholder: 'Enter your Groq API key (gsk_...)',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B ⭐' },
            { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Faster)' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
        ]
    },
    nvidia: {
        consoleUrl: 'https://build.nvidia.com/',
        consoleText: 'NVIDIA Build Console',
        apiKeyPlaceholder: 'Enter your NVIDIA API key (nvapi-...)',
        models: [
            { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B ⭐' },
            { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
            { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B' },
            { id: 'mistralai/mistral-7b-instruct-v0.3', name: 'Mistral 7B' },
        ]
    },
    gemini: {
        consoleUrl: 'https://aistudio.google.com/app/apikey',
        consoleText: 'Google AI Studio',
        apiKeyPlaceholder: 'Enter your Gemini API key (AIza...)',
        models: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash ⭐' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B (Faster)' },
        ]
    },
    openrouter: {
        consoleUrl: 'https://openrouter.ai/keys',
        consoleText: 'OpenRouter',
        apiKeyPlaceholder: 'Enter your OpenRouter API key (sk-or-...)',
        models: [
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free) ⭐' },
            { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)' },
            { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)' },
            { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)' },
        ]
    }
};

function updateProviderUI(provider, savedModel) {
    const config = PROVIDERS[provider];
    if (!config) return;

    const modelSelect = document.getElementById('modelSelect');
    const apiKeyInput = document.getElementById('apiKey');
    const apiKeyLink = document.getElementById('apiKeyLink');

    // Populate model dropdown
    modelSelect.innerHTML = '';
    config.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
    });

    // Restore saved model if it belongs to this provider
    if (savedModel) {
        const exists = config.models.some(m => m.id === savedModel);
        if (exists) modelSelect.value = savedModel;
    }

    // Update API key UI
    apiKeyInput.placeholder = config.apiKeyPlaceholder;
    apiKeyLink.href = config.consoleUrl;
    apiKeyLink.textContent = config.consoleText;
}

// Load saved data when popup opens
document.addEventListener('DOMContentLoaded', () => {
    const providerSelect = document.getElementById('providerSelect');
    const apiKeyInput = document.getElementById('apiKey');

    chrome.storage.local.get(['selectedProvider', 'selectedModel', 'apiKeys', 'apiKey', 'resumeText', 'additionalInfo', 'resumeFileName', 'resumeFileData'], (result) => {
        const provider = result.selectedProvider || 'groq';
        providerSelect.value = provider;

        const apiKeys = result.apiKeys || {};
        // Migrate legacy apiKey to groq slot
        if (!apiKeys.groq && result.apiKey) {
            apiKeys.groq = result.apiKey;
        }

        updateProviderUI(provider, result.selectedModel);

        if (apiKeys[provider]) {
            apiKeyInput.value = apiKeys[provider];
        }

        if (result.resumeText) {
            let displayText = result.resumeText;
            if (result.additionalInfo && result.resumeText.includes('Additional Information:')) {
                displayText = result.resumeText.split('\n\nAdditional Information:')[0];
            }
            document.getElementById('resume').value = displayText;
        }

        if (result.additionalInfo) {
            document.getElementById('additionalInfo').value = result.additionalInfo;
        }

        if (result.resumeFileName) {
            const uploadArea = document.getElementById('uploadArea');
            const fileNameDiv = document.getElementById('fileName');
            fileNameDiv.innerHTML = `<span style="color: #10b981;">✓</span> ${result.resumeFileName}`;
            uploadArea.classList.add('has-file');
        }

        if (result.resumeFileData && result.resumeText) {
            showStatus('✓ Resume loaded from storage', 'success');
        }
    });

    // Switch provider: update model list and load saved key for that provider
    providerSelect.addEventListener('change', () => {
        const provider = providerSelect.value;
        updateProviderUI(provider, null);
        chrome.storage.local.get(['apiKeys'], (result) => {
            const apiKeys = result.apiKeys || {};
            apiKeyInput.value = apiKeys[provider] || '';
        });
    });
});

// Handle file upload button click
document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('resumeFile').click();
});

// Handle file selection
document.getElementById('resumeFile').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const uploadArea = document.getElementById('uploadArea');
    const fileNameDiv = document.getElementById('fileName');

    fileNameDiv.innerHTML = `<span style="color: #3b82f6;">⏳</span> Processing ${fileName}...`;
    uploadArea.classList.add('has-file');

    try {
        const base64File = await fileToBase64(file);

        let extractedText = '';
        if (file.type === 'application/pdf') {
            const currentText = document.getElementById('resume').value.trim();

            if (currentText) {
                showStatus('✓ PDF stored for file uploads. Using your existing resume text.', 'success');
            } else {
                showStatus('📄 Extracting text from PDF using AI...', 'success');

                const result = await chrome.storage.local.get(['apiKeys', 'apiKey', 'selectedProvider']);
                const provider = result.selectedProvider || 'groq';
                const apiKeys = result.apiKeys || {};
                if (!apiKeys.groq && result.apiKey) apiKeys.groq = result.apiKey;

                if (!apiKeys[provider]) {
                    showStatus('⚠️ No API key found. Please paste your resume text manually or add an API key to extract from PDF.', 'error');
                    fileNameDiv.innerHTML = `<span style="color: #f59e0b;">⚠️</span> ${fileName} (paste text manually)`;
                    chrome.storage.local.set({ resumeFileData: base64File, resumeFileName: fileName, resumeFileType: file.type });
                    return;
                }

                try {
                    extractedText = await extractTextFromPDFWithAI(base64File, apiKeys[provider]);
                    document.getElementById('resume').value = extractedText;
                    showStatus('✓ PDF text extracted successfully!', 'success');
                } catch (pdfError) {
                    console.error('PDF extraction failed:', pdfError);
                    showStatus(`⚠️ ${pdfError.message}. PDF saved for file uploads. Please paste text manually.`, 'error');
                    fileNameDiv.innerHTML = `<span style="color: #f59e0b;">⚠️</span> ${fileName} (paste text manually)`;
                    chrome.storage.local.set({ resumeFileData: base64File, resumeFileName: fileName, resumeFileType: file.type });
                    return;
                }
            }
        } else if (file.type === 'text/plain') {
            extractedText = await readFileAsText(file);
            document.getElementById('resume').value = extractedText;
            showStatus('✓ Text file loaded!', 'success');
        } else {
            showStatus('⚠️ Please upload PDF or TXT file. For DOC/DOCX, copy and paste the text.', 'error');
            fileNameDiv.innerHTML = '';
            uploadArea.classList.remove('has-file');
            return;
        }

        chrome.storage.local.set({
            resumeFileData: base64File,
            resumeFileName: fileName,
            resumeFileType: file.type,
            resumeText: extractedText || document.getElementById('resume').value
        }, () => {
            fileNameDiv.innerHTML = `<span style="color: #10b981;">✓</span> ${fileName}`;
        });

    } catch (error) {
        showStatus(`✗ Error: ${error.message}`, 'error');
        fileNameDiv.innerHTML = '';
        uploadArea.classList.remove('has-file');
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

async function extractTextFromPDFWithAI(base64Data, apiKey) {
    throw new Error('PDF text extraction is not supported. Please copy and paste your resume text manually into the text box below.');
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        if (file.type === 'application/pdf') {
            showStatus('PDF files need to be converted to text first. Please copy and paste the text.', 'error');
            reject(new Error('PDF files are not supported. Please paste text instead.'));
            return;
        }
        reader.readAsText(file);
    });
}

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
    const provider = document.getElementById('providerSelect').value;
    const model = document.getElementById('modelSelect').value;
    const apiKey = document.getElementById('apiKey').value.trim();
    const resumeText = document.getElementById('resume').value.trim();
    const additionalInfo = document.getElementById('additionalInfo').value.trim();

    const fullResumeText = additionalInfo
        ? `${resumeText}\n\nAdditional Information:\n${additionalInfo}`
        : resumeText;

    chrome.storage.local.get(['apiKeys', 'resumeFileData', 'resumeFileName', 'resumeFileType'], (result) => {
        const apiKeys = result.apiKeys || {};
        apiKeys[provider] = apiKey;

        const dataToSave = {
            selectedProvider: provider,
            selectedModel: model,
            apiKeys,
            apiKey, // backwards compat for groq
            resumeText: fullResumeText,
            additionalInfo
        };

        if (result.resumeFileData) {
            dataToSave.resumeFileData = result.resumeFileData;
            dataToSave.resumeFileName = result.resumeFileName;
            dataToSave.resumeFileType = result.resumeFileType;
        }

        chrome.storage.local.set(dataToSave, () => {
            if (chrome.runtime.lastError) {
                showStatus('✗ Error saving: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus('✓ Settings saved successfully!', 'success');
            }
        });
    });
});

// Clear all data button
document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all saved data? This will delete your API keys, resume, and all settings.')) {
        chrome.storage.local.clear(() => {
            document.getElementById('apiKey').value = '';
            document.getElementById('resume').value = '';
            document.getElementById('additionalInfo').value = '';

            const uploadArea = document.getElementById('uploadArea');
            const fileNameDiv = document.getElementById('fileName');
            fileNameDiv.innerHTML = '';
            uploadArea.classList.remove('has-file');
            document.getElementById('resumeFile').value = '';

            // Reset provider/model to defaults
            document.getElementById('providerSelect').value = 'groq';
            updateProviderUI('groq', null);

            showStatus('✓ All data cleared successfully!', 'success');
        });
    }
});

// Fill form automatically
document.getElementById('fillBtn').addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['selectedProvider', 'apiKeys', 'apiKey', 'resumeText']);

    const provider = result.selectedProvider || 'groq';
    const apiKeys = result.apiKeys || {};
    if (!apiKeys.groq && result.apiKey) apiKeys.groq = result.apiKey;

    if (!apiKeys[provider] || !result.resumeText) {
        showStatus('⚠️ Please save your API key and resume first', 'error');
        return;
    }

    showLoader();

    updateLoaderStep(1, 'active');
    updateProgress(10);
    await sleep(300);
    updateProgress(25);
    await sleep(200);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'fillForm' }, async (response) => {
            if (chrome.runtime.lastError) {
                hideLoader();
                showStatus('✗ Error: ' + chrome.runtime.lastError.message, 'error');
            } else if (response && response.success) {
                updateLoaderStep(1, 'completed');
                updateProgress(30);
                await sleep(200);
                updateLoaderStep(2, 'active');
                updateProgress(40);
                await sleep(400);
                updateProgress(50);
                await sleep(400);

                updateLoaderStep(2, 'completed');
                updateProgress(55);
                await sleep(200);
                updateLoaderStep(3, 'active');
                updateProgress(65);
                await sleep(300);
                updateProgress(75);
                await sleep(300);

                updateLoaderStep(3, 'completed');
                updateProgress(80);
                await sleep(200);
                updateLoaderStep(4, 'active');
                updateProgress(90);
                await sleep(300);
                updateProgress(95);
                await sleep(200);
                updateLoaderStep(4, 'completed');
                updateProgress(100);
                await sleep(500);

                hideLoader();
                showStatus('✓ Form filled successfully!', 'success');
            } else {
                hideLoader();
                showStatus('✗ Error filling form: ' + (response?.error || 'Unknown error'), 'error');
            }
        });
    });
});

function showLoader() {
    const overlay = document.getElementById('loaderOverlay');
    overlay.classList.add('active');
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`step${i}`).classList.remove('active', 'completed');
    }
    updateProgress(0);
}

function hideLoader() {
    document.getElementById('loaderOverlay').classList.remove('active');
}

function updateLoaderStep(stepNumber, status) {
    return new Promise(resolve => {
        const step = document.getElementById(`step${stepNumber}`);
        if (status === 'active') {
            step.classList.add('active');
            step.classList.remove('completed');
        } else if (status === 'completed') {
            step.classList.remove('active');
            step.classList.add('completed');
        }
        resolve();
    });
}

function updateProgress(percentage) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    if (progressBar && progressText) {
        progressBar.style.width = percentage + '%';
        progressText.textContent = percentage + '%';
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}

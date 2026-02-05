// Load saved data when popup opens
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['apiKey', 'resumeText', 'additionalInfo', 'resumeFileName', 'resumeFileData'], (result) => {
        if (result.apiKey) {
            document.getElementById('apiKey').value = result.apiKey;
        }

        // Load resume text (without additional info for display)
        if (result.resumeText) {
            // If there's additional info, extract just the resume part
            let displayText = result.resumeText;
            if (result.additionalInfo && result.resumeText.includes('Additional Information:')) {
                // Extract just the resume part before "Additional Information:"
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
        // Store the file as base64 for later use
        const base64File = await fileToBase64(file);

        // Extract text based on file type
        let extractedText = '';
        if (file.type === 'application/pdf') {
            // Check if user wants to extract or just upload
            const currentText = document.getElementById('resume').value.trim();

            if (currentText) {
                // User already has text, just store the PDF for file uploads
                showStatus('✓ PDF stored for file uploads. Using your existing resume text.', 'success');
            } else {
                // Try to extract text
                showStatus('📄 Extracting text from PDF using AI...', 'success');

                // Get API key
                const result = await chrome.storage.local.get(['apiKey']);
                if (!result.apiKey) {
                    showStatus('⚠️ No API key found. Please paste your resume text manually or add API key to extract from PDF.', 'error');
                    fileNameDiv.innerHTML = `<span style="color: #f59e0b;">⚠️</span> ${fileName} (paste text manually)`;

                    // Save file but don't extract
                    chrome.storage.local.set({
                        resumeFileData: base64File,
                        resumeFileName: fileName,
                        resumeFileType: file.type
                    });
                    return;
                }

                try {
                    extractedText = await extractTextFromPDFWithAI(base64File, result.apiKey);
                    document.getElementById('resume').value = extractedText;
                    showStatus('✓ PDF text extracted successfully!', 'success');
                } catch (pdfError) {
                    console.error('PDF extraction failed:', pdfError);

                    if (pdfError.message.includes('quota')) {
                        showStatus(`⚠️ API quota exceeded. PDF saved for file uploads. Please paste your resume text manually below.`, 'error');
                    } else {
                        showStatus(`⚠️ ${pdfError.message}. PDF saved for file uploads. Please paste text manually.`, 'error');
                    }

                    fileNameDiv.innerHTML = `<span style="color: #f59e0b;">⚠️</span> ${fileName} (paste text manually)`;

                    // Save file even if extraction failed
                    chrome.storage.local.set({
                        resumeFileData: base64File,
                        resumeFileName: fileName,
                        resumeFileType: file.type
                    });
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

        // Save file data and extracted text to storage
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

// Function to convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// Function to extract text from PDF using Gemini AI
async function extractTextFromPDFWithAI(base64Data, apiKey) {
    // Remove the data URL prefix to get just the base64 data
    const base64Content = base64Data.split(',')[1];

    console.log('Extracting PDF text with Gemini...');

    // Try multiple models in order
    const models = [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.0-flash-exp'
    ];

    let lastError = null;

    for (const model of models) {
        try {
            console.log(`Trying PDF extraction with model: ${model}`);

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: "Extract all text content from this PDF document. Return ONLY the raw text content, no explanations, no formatting, no markdown. Include all personal information, contact details, work experience, education, and skills."
                            },
                            {
                                inline_data: {
                                    mime_type: "application/pdf",
                                    data: base64Content
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 8192
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
                    lastError = new Error(`Model ${model} not available`);
                    continue;
                }

                if (response.status === 429) {
                    throw new Error('API quota exceeded. Please wait 10-15 minutes or get a new API key.');
                }

                lastError = new Error(errorData.error?.message || 'API request failed');
                console.log(`Model ${model} error:`, lastError.message);
                continue;
            }

            const data = await response.json();
            console.log(`✓ Success with model ${model}`);

            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                lastError = new Error('No text extracted from PDF. The PDF might be image-based or corrupted.');
                console.log(`Model ${model} returned no content, trying next...`);
                continue;
            }

            const extractedText = data.candidates[0].content.parts[0].text.trim();

            if (!extractedText || extractedText.length < 10) {
                lastError = new Error('Extracted text is too short. Please ensure the PDF contains readable text.');
                console.log(`Model ${model} extracted insufficient text, trying next...`);
                continue;
            }

            console.log('✓ PDF text extracted successfully!');
            return extractedText;

        } catch (error) {
            console.error(`Error with model ${model}:`, error);
            lastError = error;
            if (error.message.includes('quota exceeded')) throw error;
            continue;
        }
    }

    // All models failed
    console.error('All PDF extraction models failed:', lastError);
    throw new Error(`PDF extraction failed with all models. ${lastError?.message || 'Unknown error'}. Please copy and paste your resume text manually.`);
}

// Function to read file as text
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            resolve(e.target.result);
        };

        reader.onerror = (e) => {
            reject(new Error('Failed to read file'));
        };

        // Check file type
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
    const apiKey = document.getElementById('apiKey').value.trim();
    const resumeText = document.getElementById('resume').value.trim();
    const additionalInfo = document.getElementById('additionalInfo').value.trim();

    // Combine resume text with additional info for AI use
    const fullResumeText = additionalInfo
        ? `${resumeText}\n\nAdditional Information:\n${additionalInfo}`
        : resumeText;

    // Get existing file data to preserve it
    chrome.storage.local.get(['resumeFileData', 'resumeFileName', 'resumeFileType'], (result) => {
        // Save all data including file info
        const dataToSave = {
            apiKey,
            resumeText: fullResumeText,
            additionalInfo
        };

        // Preserve file data if it exists
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
                console.log('Saved to storage:', dataToSave);
            }
        });
    });
});

// Clear all data button
document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all saved data? This will delete your API key, resume, and all settings.')) {
        chrome.storage.local.clear(() => {
            // Clear all input fields
            document.getElementById('apiKey').value = '';
            document.getElementById('resume').value = '';
            document.getElementById('additionalInfo').value = '';

            // Clear file upload display
            const uploadArea = document.getElementById('uploadArea');
            const fileNameDiv = document.getElementById('fileName');
            fileNameDiv.innerHTML = '';
            uploadArea.classList.remove('has-file');

            // Reset file input
            document.getElementById('resumeFile').value = '';

            showStatus('✓ All data cleared successfully!', 'success');
            console.log('Storage cleared');
        });
    }
});

// Fill form automatically
document.getElementById('fillBtn').addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['apiKey', 'resumeText']);

    if (!result.apiKey || !result.resumeText) {
        showStatus('⚠️ Please save your API key and resume first', 'error');
        return;
    }

    // Show loader
    showLoader();

    // Step 1: Detecting fields (0-25%)
    updateLoaderStep(1, 'active');
    updateProgress(10);
    await sleep(300);
    updateProgress(25);
    await sleep(200);

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'fillForm' }, async (response) => {
            if (chrome.runtime.lastError) {
                hideLoader();
                showStatus('✗ Error: ' + chrome.runtime.lastError.message, 'error');
            } else if (response && response.success) {
                // Complete step 1 and move to step 2 (25-50%)
                updateLoaderStep(1, 'completed');
                updateProgress(30);
                await sleep(200);
                updateLoaderStep(2, 'active');
                updateProgress(40);
                await sleep(400);
                updateProgress(50);
                await sleep(400);

                // Complete step 2 and move to step 3 (50-75%)
                updateLoaderStep(2, 'completed');
                updateProgress(55);
                await sleep(200);
                updateLoaderStep(3, 'active');
                updateProgress(65);
                await sleep(300);
                updateProgress(75);
                await sleep(300);

                // Complete step 3 and move to step 4 (75-100%)
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
    // Reset all steps and progress
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`step${i}`);
        step.classList.remove('active', 'completed');
    }
    updateProgress(0);
}

function hideLoader() {
    const overlay = document.getElementById('loaderOverlay');
    overlay.classList.remove('active');
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
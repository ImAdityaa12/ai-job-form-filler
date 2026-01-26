// Load saved data when popup opens
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['apiKey', 'resumeText', 'resumeFileName', 'resumeFileData'], (result) => {
        if (result.apiKey) {
            document.getElementById('apiKey').value = result.apiKey;
        }
        if (result.resumeText) {
            document.getElementById('resume').value = result.resumeText;
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

    fileNameDiv.innerHTML = `<span style="color: #10b981;">✓</span> ${fileName}`;
    uploadArea.classList.add('has-file');

    try {
        // Store the file as base64 for later use
        const base64File = await fileToBase64(file);

        // Save file data to storage
        chrome.storage.local.set({
            resumeFileData: base64File,
            resumeFileName: fileName,
            resumeFileType: file.type
        }, () => {
            showStatus(`✓ Resume file loaded: ${fileName}`, 'success');
        });

        // If it's a text file, also populate the textarea
        if (file.type === 'text/plain') {
            const text = await readFileAsText(file);
            document.getElementById('resume').value = text;
        }
    } catch (error) {
        showStatus(`✗ Error reading file: ${error.message}`, 'error');
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

    // Save whatever is entered, no validation
    chrome.storage.local.set({ apiKey, resumeText }, () => {
        if (chrome.runtime.lastError) {
            showStatus('✗ Error saving: ' + chrome.runtime.lastError.message, 'error');
        } else {
            showStatus('✓ Settings saved successfully!', 'success');
            console.log('Saved to storage');
        }
    });
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

    // Step 1: Detecting fields
    updateLoaderStep(1, 'active');
    await sleep(500);

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'fillForm' }, async (response) => {
            if (chrome.runtime.lastError) {
                hideLoader();
                showStatus('✗ Error: ' + chrome.runtime.lastError.message, 'error');
            } else if (response && response.success) {
                // Complete all steps
                updateLoaderStep(1, 'completed');
                await sleep(300);
                updateLoaderStep(2, 'active');
                await sleep(800);
                updateLoaderStep(2, 'completed');
                await sleep(300);
                updateLoaderStep(3, 'active');
                await sleep(600);
                updateLoaderStep(3, 'completed');
                await sleep(300);
                updateLoaderStep(4, 'active');
                await sleep(400);
                updateLoaderStep(4, 'completed');
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
    // Reset all steps
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`step${i}`);
        step.classList.remove('active', 'completed');
    }
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
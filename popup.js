// Load saved data when popup opens
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['apiKey', 'resumeText', 'resumeFileName'], (result) => {
        if (result.apiKey) {
            document.getElementById('apiKey').value = result.apiKey;
        }
        if (result.resumeText) {
            document.getElementById('resume').value = result.resumeText;
            // Show that resume is loaded
            showStatus('✅ Resume loaded from storage', 'success');
        }
        if (result.resumeFileName) {
            document.getElementById('fileName').textContent = `📎 ${result.resumeFileName}`;
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
    document.getElementById('fileName').textContent = `📎 ${fileName}`;

    try {
        // Store the file as base64 for later use
        const base64File = await fileToBase64(file);

        // Save file data to storage
        chrome.storage.local.set({
            resumeFileData: base64File,
            resumeFileName: fileName,
            resumeFileType: file.type
        }, () => {
            showStatus(`Resume file loaded: ${fileName}`, 'success');
        });

        // If it's a text file, also populate the textarea
        if (file.type === 'text/plain') {
            const text = await readFileAsText(file);
            document.getElementById('resume').value = text;
        }
    } catch (error) {
        showStatus(`Error reading file: ${error.message}`, 'error');
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
    const resumePath = document.getElementById('resumePath').value.trim();
    const resumeFileName = document.getElementById('fileName').textContent.replace('📎 ', '');

    if (!apiKey) {
        showStatus('Please enter your Gemini API key', 'error');
        return;
    }

    if (!resumeText) {
        showStatus('Please paste your resume text', 'error');
        return;
    }

    chrome.storage.local.set({ apiKey, resumeText, resumePath, resumeFileName }, () => {
        showStatus('Settings saved successfully!', 'success');
    });
});

// Fill form automatically
document.getElementById('fillBtn').addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['apiKey', 'resumeText']);

    if (!result.apiKey || !result.resumeText) {
        showStatus('⚠️ Please save your API key and resume first', 'error');
        return;
    }

    showStatus('🚀 Using saved resume to fill form...', 'success');

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'fillForm' }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
            } else if (response && response.success) {
                showStatus('✅ Form filled successfully!', 'success');
            } else {
                showStatus('Error filling form: ' + (response?.error || 'Unknown error'), 'error');
            }
        });
    });
});

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
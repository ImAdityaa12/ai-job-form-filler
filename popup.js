// Load saved data when popup opens
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['apiKey', 'resumeText'], (result) => {
        if (result.apiKey) {
            document.getElementById('apiKey').value = result.apiKey;
        }
        if (result.resumeText) {
            document.getElementById('resume').value = result.resumeText;
        }
    });
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const resumeText = document.getElementById('resume').value.trim();

    if (!apiKey) {
        showStatus('Please enter your Gemini API key', 'error');
        return;
    }

    if (!resumeText) {
        showStatus('Please enter your resume text', 'error');
        return;
    }

    chrome.storage.local.set({ apiKey, resumeText }, () => {
        showStatus('Settings saved successfully!', 'success');
    });
});

// Fill form automatically
document.getElementById('fillBtn').addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['apiKey', 'resumeText']);

    if (!result.apiKey || !result.resumeText) {
        showStatus('Please save your API key and resume first', 'error');
        return;
    }

    showStatus('Analyzing form and filling...', 'success');

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'fillForm' }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
            } else if (response && response.success) {
                showStatus('Form filled successfully!', 'success');
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
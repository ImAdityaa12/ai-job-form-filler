// Background service worker for the extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('AI Job Form Filler extension installed');
});

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener((command) => {
    if (command === 'fill-form') {
        console.log('Keyboard shortcut triggered: fill-form');

        // Get the active tab and send message to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'fillForm' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error:', chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log('Form filled successfully via shortcut');
                    } else {
                        console.error('Error filling form:', response?.error);
                    }
                });
            }
        });
    }
});

// Proxy fetch requests from content scripts to bypass CORS restrictions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'proxyFetch') {
        fetch(request.url, request.options)
            .then(async (response) => {
                const text = await response.text();
                sendResponse({ ok: response.ok, status: response.status, text });
            })
            .catch((error) => {
                sendResponse({ error: error.message });
            });
        return true; // Keep channel open for async response
    }
    return true;
});
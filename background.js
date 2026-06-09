// Background service worker for the AI Job Form Filler extension.

chrome.runtime.onInstalled.addListener(() => {
    console.log('AI Job Form Filler extension installed');
});

// ==================== TOOLBAR TOGGLE ====================

// Clicking the extension icon toggles the in-page toolbar (we no longer use a popup).
chrome.action.onClicked.addListener((tab) => {
    if (!tab || !tab.id) return;
    sendToTab(tab.id, { action: 'togglePanel' });
});

// Send a message to a tab's content script. If the content script isn't there
// yet (e.g. the page was open before install, or was just reloaded), inject it
// programmatically and retry once.
function sendToTab(tabId, message) {
    chrome.tabs.sendMessage(tabId, message, () => {
        if (chrome.runtime.lastError) {
            chrome.scripting.executeScript(
                { target: { tabId }, files: ['content.js', 'ui.js'] },
                () => {
                    if (chrome.runtime.lastError) {
                        // Restricted page (chrome://, web store, etc.) — nothing we can do.
                        console.warn('Cannot run on this page:', chrome.runtime.lastError.message);
                        return;
                    }
                    chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime.lastError);
                }
            );
        }
    });
}

// ==================== KEYBOARD SHORTCUTS ====================

chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) return;
        if (command === 'fill-form') {
            sendToTab(tabs[0].id, { action: 'autoFill' });
        } else if (command === 'toggle-panel') {
            sendToTab(tabs[0].id, { action: 'togglePanel' });
        }
    });
});

// ==================== CORS PROXY ====================

// Proxy fetch requests from content scripts to bypass page CORS restrictions.
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
});

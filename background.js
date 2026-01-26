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

// Handle any background tasks if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Add any background processing here if needed
    return true;
});
// Background service worker for the extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('AI Job Form Filler extension installed');
});

async function sendFillFormMessage(tabId) {
    try {
        return await chrome.tabs.sendMessage(tabId, { action: 'fillForm' });
    } catch (error) {
        const receiverMissing = error.message.includes('Receiving end does not exist') ||
            error.message.includes('Could not establish connection');

        if (!receiverMissing) {
            throw error;
        }

        // A page that was already open when the extension was installed or
        // reloaded will not have the content script yet. Inject it and retry.
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });

        return chrome.tabs.sendMessage(tabId, { action: 'fillForm' });
    }
}

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'fill-form') return;

    console.log('Keyboard shortcut triggered: fill-form');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
        const response = await sendFillFormMessage(tab.id);
        if (response?.success) {
            console.log('Form filled successfully via shortcut');
        } else {
            console.warn('Form filling did not complete:', response?.error || 'Unknown error');
        }
    } catch (error) {
        // Chrome internal pages and the Chrome Web Store do not allow script
        // injection. Keep this as a warning so it is not recorded as an
        // extension runtime error.
        console.warn('Form filler cannot run on this page:', error.message);
    }
});

// Handle any background tasks if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Add any background processing here if needed
    return true;
});

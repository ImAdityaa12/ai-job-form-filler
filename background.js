// Background service worker for the extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('AI Job Form Filler extension installed');
});

// Handle any background tasks if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Add any background processing here if needed
    return true;
});
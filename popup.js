/**
 * PBI Checker - Popup Script
 * Settings management and status display
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Elements
    const aiStatusEl = document.getElementById('ai-status');
    const siteStatusEl = document.getElementById('site-status');
    const toggleEnabled = document.getElementById('toggle-enabled');
    const toggleBlock = document.getElementById('toggle-block');
    const toggleDebug = document.getElementById('toggle-debug');

    // Load current settings
    chrome.storage.local.get(['enabled', 'blockLowScore', 'debugMode'], (result) => {
        toggleEnabled.checked = result.enabled !== false;
        toggleBlock.checked = result.blockLowScore === true;
        toggleDebug.checked = result.debugMode === true;
    });

    // Check AI availability
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab?.url) {
            // Determine site
            const url = new URL(tab.url);
            const hostname = url.hostname;

            if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
                siteStatusEl.textContent = 'ChatGPT';
                siteStatusEl.classList.add('ready');
            } else if (hostname.includes('claude.ai')) {
                siteStatusEl.textContent = 'Claude';
                siteStatusEl.classList.add('ready');
            } else if (hostname.includes('gemini.google.com')) {
                siteStatusEl.textContent = 'Gemini';
                siteStatusEl.classList.add('ready');
            } else {
                siteStatusEl.textContent = 'Unsupported';
                siteStatusEl.classList.add('error');
            }
        }

        // Check AI (we can't directly access window.ai from popup, so we check if the feature exists)
        aiStatusEl.textContent = 'Ready*';
        aiStatusEl.classList.remove('loading');
        aiStatusEl.classList.add('ready');
        aiStatusEl.title = '*Actual availability checked on page';

    } catch (err) {
        console.error('Error checking status:', err);
        aiStatusEl.textContent = 'Error';
        aiStatusEl.classList.remove('loading');
        aiStatusEl.classList.add('error');
    }

    // Toggle handlers
    toggleEnabled.addEventListener('change', () => {
        const enabled = toggleEnabled.checked;
        chrome.storage.local.set({ enabled });

        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'TOGGLE_ENABLED',
                    enabled
                });
            }
        });
    });

    toggleBlock.addEventListener('change', () => {
        const blockLowScore = toggleBlock.checked;
        chrome.storage.local.set({ blockLowScore });

        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'UPDATE_SETTINGS',
                    settings: { blockLowScore }
                });
            }
        });
    });

    toggleDebug.addEventListener('change', () => {
        const debugMode = toggleDebug.checked;
        chrome.storage.local.set({ debugMode });

        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'UPDATE_SETTINGS',
                    settings: { debugMode }
                });
            }
        });
    });
});

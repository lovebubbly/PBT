/**
 * PBI Checker - Background Service Worker
 * Handles extension lifecycle and message passing
 */

// Extension installation handler
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[PBI Checker] Extension installed:', details.reason);
  
  // Set default settings
  chrome.storage.local.set({
    enabled: true,
    autoAnalyze: true,
    blockLowScore: false,
    blockThreshold: 30,
    debugMode: false
  });
});

// Message handler for communication with content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[PBI Checker] Message received:', message);
  
  switch (message.type) {
    case 'GET_SETTINGS':
      chrome.storage.local.get(['enabled', 'autoAnalyze', 'blockLowScore', 'blockThreshold', 'debugMode'], (result) => {
        sendResponse(result);
      });
      return true; // Keep channel open for async response
      
    case 'UPDATE_SETTINGS':
      chrome.storage.local.set(message.settings, () => {
        sendResponse({ success: true });
      });
      return true;
      
    case 'PBI_RESULT':
      // Log PBI results for debugging/analytics
      if (message.debugMode) {
        console.log('[PBI Checker] Analysis result:', message.result);
      }
      sendResponse({ received: true });
      break;
      
    default:
      console.log('[PBI Checker] Unknown message type:', message.type);
  }
});

// Handle extension icon click when popup is not available
chrome.action.onClicked.addListener((tab) => {
  // Toggle enabled state
  chrome.storage.local.get(['enabled'], (result) => {
    const newState = !result.enabled;
    chrome.storage.local.set({ enabled: newState });
    
    // Notify content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_ENABLED',
      enabled: newState
    });
  });
});

console.log('[PBI Checker] Background service worker initialized');

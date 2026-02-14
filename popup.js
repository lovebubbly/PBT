/**
 * PBI Checker - Popup Script (Facelift)
 * Runtime-aware status + settings controls.
 */

function setStatusPill(element, text, tone = '') {
  if (!element) return;
  element.textContent = text;
  element.classList.remove('ready', 'loading', 'error');
  if (tone) {
    element.classList.add(tone);
  }
}

function toneForAvailability(value) {
  if (!value) return 'loading';
  if (value === 'available') return 'ready';
  if (value === 'downloadable' || value === 'downloading' || value === 'checking') return 'loading';
  return 'error';
}

function toneForMode(mode) {
  if (!mode) return '';
  if (mode === 'ready' || mode === 'idle') return 'ready';
  if (mode === 'analyzing' || mode === 'refining') return 'loading';
  if (mode === 'error') return 'error';
  return '';
}

function getSiteLabelFromUrl(url) {
  if (!url) return 'Unavailable';
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'ChatGPT';
    if (hostname.includes('claude.ai')) return 'Claude';
    if (hostname.includes('gemini.google.com')) return 'Gemini';
    return 'Unsupported';
  } catch (err) {
    return 'Unavailable';
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function getRuntimeStatus(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_RUNTIME_STATUS' });
    return response || null;
  } catch (err) {
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const aiStatusEl = document.getElementById('ai-status');
  const siteStatusEl = document.getElementById('site-status');
  const runtimeStatusEl = document.getElementById('runtime-status');
  const scoreStatusEl = document.getElementById('score-status');

  const toggleEnabled = document.getElementById('toggle-enabled');
  const toggleAutoAnalyze = document.getElementById('toggle-auto-analyze');
  const toggleBlock = document.getElementById('toggle-block');
  const toggleDebug = document.getElementById('toggle-debug');

  chrome.storage.local.get(['enabled', 'autoAnalyze', 'blockLowScore', 'debugMode'], (result) => {
    toggleEnabled.checked = result.enabled !== false;
    toggleAutoAnalyze.checked = result.autoAnalyze !== false;
    toggleBlock.checked = result.blockLowScore === true;
    toggleDebug.checked = result.debugMode === true;
  });

  const activeTab = await getActiveTab();
  const siteLabel = getSiteLabelFromUrl(activeTab?.url);
  setStatusPill(siteStatusEl, siteLabel, siteLabel === 'Unsupported' || siteLabel === 'Unavailable' ? 'error' : 'ready');

  if (!activeTab?.id || siteLabel === 'Unsupported') {
    setStatusPill(aiStatusEl, 'Unavailable', 'error');
    setStatusPill(runtimeStatusEl, 'Not injected', 'error');
    setStatusPill(scoreStatusEl, '--');
  } else {
    const runtime = await getRuntimeStatus(activeTab.id);

    if (!runtime) {
      setStatusPill(aiStatusEl, 'Unknown', 'loading');
      setStatusPill(runtimeStatusEl, 'No response', 'error');
      setStatusPill(scoreStatusEl, '--');
    } else {
      setStatusPill(aiStatusEl, runtime.aiAvailability || 'unknown', toneForAvailability(runtime.aiAvailability));
      const runtimeLabel = runtime.autoAnalyze === false
        ? `${runtime.mode || 'idle'} (manual)`
        : (runtime.mode || 'idle');
      setStatusPill(runtimeStatusEl, runtimeLabel, toneForMode(runtime.mode));
      setStatusPill(scoreStatusEl, runtime.score == null ? '--' : `${runtime.score}%`, runtime.score == null ? '' : runtime.score >= 60 ? 'ready' : 'error');
    }
  }

  toggleEnabled.addEventListener('change', async () => {
    const enabled = toggleEnabled.checked;
    chrome.storage.local.set({ enabled });

    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'TOGGLE_ENABLED',
        enabled
      });
    }
  });

  toggleAutoAnalyze.addEventListener('change', async () => {
    const autoAnalyze = toggleAutoAnalyze.checked;
    chrome.storage.local.set({ autoAnalyze });

    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'UPDATE_SETTINGS',
        settings: { autoAnalyze }
      });
    }
  });

  toggleBlock.addEventListener('change', async () => {
    const blockLowScore = toggleBlock.checked;
    chrome.storage.local.set({ blockLowScore });

    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'UPDATE_SETTINGS',
        settings: { blockLowScore }
      });
    }
  });

  toggleDebug.addEventListener('change', async () => {
    const debugMode = toggleDebug.checked;
    chrome.storage.local.set({ debugMode });

    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'UPDATE_SETTINGS',
        settings: { debugMode }
      });
    }
  });
});

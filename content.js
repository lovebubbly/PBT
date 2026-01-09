/**
 * PBI Checker - Content Script
 * Main logic for PBI analysis and dashboard injection
 */

console.log('[PBI Checker] 🧠 Initializing Brainrot Protocol...');

// ========================================
// Configuration
// ========================================

const PBI_SYSTEM_PROMPT = `
You are the "PBI Checker," a strict and sarcastic AI prompt engineer coaching a user to stop "Brainrot" (cognitive laziness).

Your task is to evaluate the user's prompt based on the following **Prompt Brainrot Index (PBI)** rubric.
Calculate the total score (0-100%) and identify the specific "Brainrot" symptoms.

### 📊 Scoring Rubric (4 Axes)

1. **Logic (Target: 25pts)**
   - **High Score:** Clear objective, logical causality, specific context provided.
   - **Low Score:** Vague goals, emotional appeals (e.g., "I'm sad, help me"), or lack of context.

2. **Completeness (Target: 25pts)**
   - **High Score:** Specifies output format (e.g., table, JSON, code), table of contents, depth, and priorities.
   - **Low Score:** "Omakase" style (e.g., "Just do it for me," "You decide"), missing requirements.

3. **Constraints (Target: 25pts)**
   - **High Score:** Explicitly sets language, tone, prohibitions (e.g., "No glazing," "No bullet points").
   - **Low Score:** No guardrails, leaving room for hallucinations or generic fluff.

4. **User Capability Erosion Risk (Target: 25pts) [CRITICAL]**
   - **High Score (Low Risk):** The user asks for a specific tool/method to solve it *themselves* (e.g., "Give me the boilerplate," "Explain the logic").
   - **Low Score (High Risk):** The user delegates the *entire* thinking process (e.g., "Write my essay," "Plan my life"). The user acts as a consumer, not an architect.

### 🚨 Diagnosis Rules
- **0-30% (Terminal Brainrot):** Lazy, vague, totally dependent. Critique harshly.
- **31-60% (High Risk):** Needs more specific constraints or logic.
- **61-80% (Moderate):** Good, but missing technical details.
- **81-100% (Lucid):** Perfect engineering prompt.

### 📤 Output Format (JSON Only)
You must output a raw JSON object with no markdown block.
{
  "total_score": <number 0-100>,
  "axis_scores": {
    "logic": <0-25>,
    "completeness": <0-25>,
    "constraints": <0-25>,
    "erosion_risk": <0-25>
  },
  "critique_ko": "<A short, biting sarcastic comment in Korean. Max 1 sentence. Use casual tone like '님아...', '...하시겠습니까?'>",
  "action_item": "<One specific instruction to fix the prompt immediately>"
}
`;

const SITE_CONFIGS = {
    'chatgpt.com': {
        inputSelector: '#prompt-textarea, [data-testid="composer-background"] textarea',
        wrapperSelector: 'form, [data-testid="composer-background"]',
        sendButtonSelector: 'button[data-testid="send-button"], button[data-testid="fruitjuice-send-button"]'
    },
    'chat.openai.com': {
        inputSelector: '#prompt-textarea',
        wrapperSelector: 'form',
        sendButtonSelector: 'button[data-testid="send-button"]'
    },
    'claude.ai': {
        inputSelector: '[contenteditable="true"].ProseMirror, div[contenteditable="true"]',
        wrapperSelector: 'fieldset, .composer-parent, [data-testid="composer"]',
        sendButtonSelector: 'button[aria-label*="Send"], button[type="submit"]'
    },
    'gemini.google.com': {
        inputSelector: '.ql-editor, rich-textarea .ql-editor, [contenteditable="true"]',
        wrapperSelector: '.input-area-container, .input-wrapper, .text-input-field_textarea-wrapper',
        sendButtonSelector: 'button[aria-label*="Send"], .send-button'
    }
};

const DEBOUNCE_DELAY = 1500;
const MIN_TEXT_LENGTH = 20;
const MIN_VISIBILITY_LENGTH = 10;

// ========================================
// State
// ========================================

let settings = {
    enabled: true,
    blockLowScore: false,
    blockThreshold: 30,
    debugMode: false
};

let currentSession = null;
let debounceTimer = null;
let isAnalyzing = false;
let dashboardWidget = null;
let currentSiteConfig = null;
let observer = null;

// ========================================
// AI Integration
// ========================================

async function checkAIAvailability() {
    try {
        if (!window.ai || !window.ai.languageModel) {
            console.warn('[PBI Checker] window.ai.languageModel not available');
            return { available: 'no', reason: 'API not found' };
        }

        const capabilities = await window.ai.languageModel.capabilities();
        console.log('[PBI Checker] AI Capabilities:', capabilities);
        return capabilities;
    } catch (err) {
        console.error('[PBI Checker] Error checking AI availability:', err);
        return { available: 'no', reason: err.message };
    }
}

async function createSession() {
    try {
        if (currentSession) {
            currentSession.destroy();
            currentSession = null;
        }

        const capabilities = await checkAIAvailability();

        if (capabilities.available === 'no') {
            throw new Error('On-device AI not available: ' + (capabilities.reason || 'Unknown'));
        }

        currentSession = await window.ai.languageModel.create({
            systemPrompt: PBI_SYSTEM_PROMPT
        });

        console.log('[PBI Checker] Session created successfully');
        return currentSession;
    } catch (err) {
        console.error('[PBI Checker] Failed to create session:', err);
        throw err;
    }
}

async function analyzePBI(userPrompt) {
    if (isAnalyzing) {
        console.log('[PBI Checker] Analysis already in progress, skipping...');
        return null;
    }

    isAnalyzing = true;
    updateDashboardState('analyzing');

    try {
        if (!currentSession) {
            await createSession();
        }

        const promptText = `
Now, evaluate the following user prompt based on the rubric above.

User Prompt:
"${userPrompt}"
`;

        console.log('[PBI Checker] Sending prompt for analysis...');
        const startTime = performance.now();

        const result = await currentSession.prompt(promptText);

        const elapsed = performance.now() - startTime;
        console.log(`[PBI Checker] Analysis completed in ${elapsed.toFixed(0)}ms`);
        console.log('[PBI Checker] Raw result:', result);

        // Parse JSON response
        const parsed = parseJSONResponse(result);

        if (parsed) {
            updateDashboardWithResult(parsed);
            return parsed;
        } else {
            throw new Error('Failed to parse AI response');
        }

    } catch (err) {
        console.error('[PBI Checker] Analysis error:', err);
        updateDashboardState('error', err.message);

        // Destroy session on error to allow retry
        if (currentSession) {
            currentSession.destroy();
            currentSession = null;
        }

        return null;
    } finally {
        isAnalyzing = false;
    }
}

function parseJSONResponse(rawResponse) {
    try {
        // Try to extract JSON from the response
        let jsonStr = rawResponse.trim();

        // Remove markdown code blocks if present
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        // Try to find JSON object
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            jsonStr = objectMatch[0];
        }

        const parsed = JSON.parse(jsonStr);

        // Validate required fields
        if (typeof parsed.total_score !== 'number') {
            throw new Error('Missing total_score');
        }

        // Set defaults for missing fields
        parsed.axis_scores = parsed.axis_scores || {
            logic: 0,
            completeness: 0,
            constraints: 0,
            erosion_risk: 0
        };
        parsed.critique_ko = parsed.critique_ko || '분석 완료';
        parsed.action_item = parsed.action_item || 'No specific action';

        return parsed;
    } catch (err) {
        console.error('[PBI Checker] JSON parse error:', err);
        console.error('[PBI Checker] Raw response was:', rawResponse);
        return null;
    }
}

// ========================================
// Dashboard Widget
// ========================================

function createDashboardWidget() {
    const widget = document.createElement('div');
    widget.id = 'pbi-dashboard-widget';

    widget.innerHTML = `
    <div class="pbi-score-section">
      <span class="pbi-brain-icon">🧠</span>
      <span class="pbi-score-value">--</span>
    </div>
    <div class="pbi-axis-breakdown">
      <div class="pbi-axis-row">
        <span class="pbi-axis-label">Logic</span>
        <span class="pbi-axis-value" data-axis="logic">--/25</span>
      </div>
      <div class="pbi-axis-row">
        <span class="pbi-axis-label">Completeness</span>
        <span class="pbi-axis-value" data-axis="completeness">--/25</span>
      </div>
      <div class="pbi-axis-row">
        <span class="pbi-axis-label">Constraints</span>
        <span class="pbi-axis-value" data-axis="constraints">--/25</span>
      </div>
      <div class="pbi-axis-row">
        <span class="pbi-axis-label">Erosion Risk</span>
        <span class="pbi-axis-value" data-axis="erosion_risk">--/25</span>
      </div>
    </div>
    <div class="pbi-critique-section">
      <span class="pbi-critique-text pbi-critique-placeholder">Type a prompt to analyze...</span>
    </div>
    <div class="pbi-status-section">
      <div class="pbi-spinner"></div>
      <span class="pbi-status-icon ready" style="display: none;">✓</span>
    </div>
    <div class="pbi-action-tooltip"></div>
  `;

    return widget;
}

function injectDashboard() {
    // Remove existing widget if any
    if (dashboardWidget && dashboardWidget.parentNode) {
        dashboardWidget.remove();
    }

    if (!currentSiteConfig) {
        console.warn('[PBI Checker] No site config found');
        return;
    }

    // Find input wrapper
    const wrapper = document.querySelector(currentSiteConfig.wrapperSelector);
    if (!wrapper) {
        console.warn('[PBI Checker] Could not find input wrapper');
        return;
    }

    dashboardWidget = createDashboardWidget();

    // Try to insert after the input area
    try {
        wrapper.insertAdjacentElement('afterend', dashboardWidget);
    } catch (e) {
        // Fallback: append to parent
        wrapper.parentElement?.appendChild(dashboardWidget);
    }

    console.log('[PBI Checker] Dashboard injected');
}

function updateDashboardVisibility(textLength) {
    if (!dashboardWidget) return;

    if (textLength >= MIN_VISIBILITY_LENGTH) {
        dashboardWidget.classList.add('visible');
    } else {
        dashboardWidget.classList.remove('visible');
    }
}

function updateDashboardState(state, errorMessage = '') {
    if (!dashboardWidget) return;

    const spinner = dashboardWidget.querySelector('.pbi-spinner');
    const statusIcon = dashboardWidget.querySelector('.pbi-status-icon');
    const critiqueText = dashboardWidget.querySelector('.pbi-critique-text');

    switch (state) {
        case 'analyzing':
            spinner.classList.add('active');
            statusIcon.style.display = 'none';
            critiqueText.textContent = 'Analyzing...';
            critiqueText.classList.add('pbi-critique-placeholder');
            critiqueText.classList.add('short');
            break;

        case 'ready':
            spinner.classList.remove('active');
            statusIcon.style.display = 'inline';
            statusIcon.className = 'pbi-status-icon ready';
            statusIcon.textContent = '✓';
            break;

        case 'error':
            spinner.classList.remove('active');
            statusIcon.style.display = 'inline';
            statusIcon.className = 'pbi-status-icon error';
            statusIcon.textContent = '✕';
            critiqueText.textContent = `Error: ${errorMessage}`;
            critiqueText.classList.add('short');
            break;

        case 'idle':
        default:
            spinner.classList.remove('active');
            statusIcon.style.display = 'none';
            break;
    }
}

function updateDashboardWithResult(result) {
    if (!dashboardWidget) return;

    const scoreValue = dashboardWidget.querySelector('.pbi-score-value');
    const critiqueText = dashboardWidget.querySelector('.pbi-critique-text');
    const actionTooltip = dashboardWidget.querySelector('.pbi-action-tooltip');

    // Update score
    const score = Math.round(result.total_score);
    scoreValue.textContent = `${score}%`;

    // Set score color class
    scoreValue.className = 'pbi-score-value';
    if (score <= 30) {
        scoreValue.classList.add('score-critical');
    } else if (score <= 60) {
        scoreValue.classList.add('score-warning');
    } else if (score <= 80) {
        scoreValue.classList.add('score-moderate');
    } else {
        scoreValue.classList.add('score-good');
    }

    // Update axis breakdown
    if (result.axis_scores) {
        const axes = ['logic', 'completeness', 'constraints', 'erosion_risk'];
        axes.forEach(axis => {
            const elem = dashboardWidget.querySelector(`[data-axis="${axis}"]`);
            if (elem) {
                const value = result.axis_scores[axis] || 0;
                elem.textContent = `${value}/25`;
            }
        });
    }

    // Update critique
    critiqueText.textContent = result.critique_ko;
    critiqueText.classList.remove('pbi-critique-placeholder');

    // Handle marquee for long text
    if (result.critique_ko.length > 40) {
        critiqueText.classList.remove('short');
    } else {
        critiqueText.classList.add('short');
    }

    // Update action tooltip
    actionTooltip.textContent = `💡 ${result.action_item}`;

    // Update state
    updateDashboardState('ready');

    // Handle send button blocking
    if (settings.blockLowScore && score < settings.blockThreshold) {
        blockSendButton(true);
    } else {
        blockSendButton(false);
    }
}

function blockSendButton(block) {
    if (!currentSiteConfig) return;

    const sendButton = document.querySelector(currentSiteConfig.sendButtonSelector);
    if (!sendButton) return;

    if (block) {
        sendButton.classList.add('pbi-send-blocker', 'blocked');
    } else {
        sendButton.classList.remove('pbi-send-blocker', 'blocked');
    }
}

// ========================================
// Input Monitoring
// ========================================

function getInputText(inputElement) {
    if (!inputElement) return '';

    // Handle contenteditable
    if (inputElement.contentEditable === 'true') {
        return inputElement.innerText || inputElement.textContent || '';
    }

    // Handle textarea/input
    return inputElement.value || '';
}

function setupInputMonitoring() {
    if (!currentSiteConfig) return;

    const inputElement = document.querySelector(currentSiteConfig.inputSelector);
    if (!inputElement) {
        console.warn('[PBI Checker] Could not find input element');
        return;
    }

    console.log('[PBI Checker] Setting up input monitoring on:', inputElement);

    // Debounced input handler
    const handleInput = () => {
        const text = getInputText(inputElement);
        updateDashboardVisibility(text.length);

        // Clear existing timer
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // Set new timer for analysis
        if (text.length >= MIN_TEXT_LENGTH && settings.enabled) {
            debounceTimer = setTimeout(() => {
                analyzePBI(text);
            }, DEBOUNCE_DELAY);
        }
    };

    // Blur handler for immediate analysis
    const handleBlur = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        const text = getInputText(inputElement);
        if (text.length >= MIN_TEXT_LENGTH && settings.enabled) {
            analyzePBI(text);
        }
    };

    // Add event listeners
    inputElement.addEventListener('input', handleInput);
    inputElement.addEventListener('blur', handleBlur);

    // Initial check
    handleInput();
}

// ========================================
// Site Detection & Initialization
// ========================================

function detectSite() {
    const hostname = window.location.hostname;

    for (const [domain, config] of Object.entries(SITE_CONFIGS)) {
        if (hostname.includes(domain.replace('www.', ''))) {
            console.log('[PBI Checker] Detected site:', domain);
            return config;
        }
    }

    console.warn('[PBI Checker] Unknown site:', hostname);
    return null;
}

function setupMutationObserver() {
    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
        // Check if dashboard was removed (SPA navigation)
        if (dashboardWidget && !document.body.contains(dashboardWidget)) {
            console.log('[PBI Checker] Dashboard removed, re-injecting...');
            setTimeout(() => {
                injectDashboard();
                setupInputMonitoring();
            }, 500);
        }

        // Check for input element changes
        if (currentSiteConfig) {
            const inputElement = document.querySelector(currentSiteConfig.inputSelector);
            if (inputElement && !inputElement.dataset.pbiMonitored) {
                inputElement.dataset.pbiMonitored = 'true';
                setupInputMonitoring();
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

async function loadSettings() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
                if (response) {
                    settings = { ...settings, ...response };
                }
                resolve(settings);
            });
        } else {
            resolve(settings);
        }
    });
}

async function initialize() {
    console.log('[PBI Checker] Starting initialization...');

    // Load settings
    await loadSettings();
    console.log('[PBI Checker] Settings loaded:', settings);

    if (!settings.enabled) {
        console.log('[PBI Checker] Extension disabled by settings');
        return;
    }

    // Detect site
    currentSiteConfig = detectSite();
    if (!currentSiteConfig) {
        console.log('[PBI Checker] Site not supported');
        return;
    }

    // Check AI availability
    const aiStatus = await checkAIAvailability();
    console.log('[PBI Checker] AI Status:', aiStatus);

    // Wait for page to fully load
    if (document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve));
    }

    // Additional delay for SPAs
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Inject dashboard
    injectDashboard();

    // Setup input monitoring
    setupInputMonitoring();

    // Setup mutation observer for SPA
    setupMutationObserver();

    console.log('[PBI Checker] Initialization complete!');
}

// ========================================
// Message Handling
// ========================================

if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[PBI Checker] Message received:', message);

        switch (message.type) {
            case 'TOGGLE_ENABLED':
                settings.enabled = message.enabled;
                if (settings.enabled) {
                    initialize();
                } else if (dashboardWidget) {
                    dashboardWidget.remove();
                    dashboardWidget = null;
                }
                sendResponse({ success: true });
                break;

            case 'UPDATE_SETTINGS':
                settings = { ...settings, ...message.settings };
                sendResponse({ success: true });
                break;
        }
    });
}

// ========================================
// Start
// ========================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

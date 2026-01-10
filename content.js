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
        // Claude uses contenteditable ProseMirror div
        inputSelector: 'div[contenteditable="true"], .ProseMirror[contenteditable="true"]',
        // Try multiple wrapper options - Claude's structure changes
        wrapperSelector: 'fieldset, form, [class*="composer"], [class*="input-container"], [class*="chat-input"]',
        sendButtonSelector: 'button[aria-label="Send Message"], button[aria-label*="Send"], button[type="submit"]'
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
let isRefining = false; // NEW: Prevent double refine
let lastAnalyzedText = ''; // NEW: Track last analyzed text
let dashboardWidget = null;
let currentSiteConfig = null;
let observer = null;

// ========================================
// AI Integration
// ========================================

async function checkAIAvailability() {
    try {
        // Use the global LanguageModel API (not window.ai)
        if (typeof LanguageModel === 'undefined') {
            console.warn('[PBI Checker] LanguageModel API not available');
            return 'unavailable';
        }

        // Pass the same options to availability() that we use in create()
        // Per Chrome docs: "Always pass the same options to the availability() function"
        // Supported languages: ['en', 'es', 'ja'] only - Korean is NOT supported!
        const availability = await LanguageModel.availability({
            expectedInputs: [
                { type: 'text', languages: ['en'] }
            ],
            expectedOutputs: [
                { type: 'text', languages: ['en'] }
            ]
        });
        console.log('[PBI Checker] AI Availability:', availability);
        return availability; // 'unavailable', 'downloadable', 'downloading', 'available'
    } catch (err) {
        console.error('[PBI Checker] Error checking AI availability:', err);
        return 'unavailable';
    }
}



async function createSession(mode = 'analysis') {
    try {
        // ALWAYS create fresh session to prevent context pollution
        if (currentSession) {
            try { currentSession.destroy(); } catch (e) { }
            currentSession = null;
        }

        const availability = await checkAIAvailability();

        if (availability === 'unavailable') {
            throw new Error('On-device AI not available. Please enable Chrome flags.');
        }

        // Wait for download if needed
        if (availability === 'downloadable' || availability === 'after-download') {
            console.log('[PBI Checker] Model needs download...');
            updateDashboardState('downloading');
        }

        const options = {
            temperature: 0.7,
            topK: 40,
            expectedInputs: [
                { type: 'text', languages: ['en'] }
            ],
            expectedOutputs: [
                { type: 'text', languages: ['en'] }
            ]
        };

        // Select System Prompt based on Mode
        if (mode === 'analysis') {
            options.initialPrompts = [
                { role: 'system', content: PBI_SYSTEM_PROMPT }
            ];
            // Hint for JSON if supported
            options.expectedOutputs[0].json = true;
        } else if (mode === 'refine') {
            options.initialPrompts = [
                {
                    role: 'system',
                    content: `You are an expert Prompt Engineer. Your task is to rewrite user prompts to be perfect (100% score) based on the provided critique.
Rules:
1. Keep the user's original intent specific and clear.
2. Apply constraints, format requirements, and context.
3. Remove emotional language or vagueness.
4. Output ONLY the refined prompt text. No explanations.`
                }
            ];
        }

        console.log(`[PBI Checker] Creating new session (Mode: ${mode})...`);

        currentSession = await LanguageModel.create(options);

        // Add progress monitor if supported
        if (currentSession.addEventListener) {
            currentSession.addEventListener('downloadprogress', (e) => {
                const progress = Math.round((e.loaded / e.total) * 100);
                updateDashboardState('downloading', `Downloading model: ${progress}%`);
            });
        }

        // Wait for ready
        console.log('[PBI Checker] Session created successfully');
        return currentSession;
    } catch (err) {
        console.error('[PBI Checker] Session creation failed:', err);
        updateDashboardState('error', 'AI Model Error: ' + err.message);
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
        // Create session in ANALYSIS mode
        await createSession('analysis');

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
        // Destroy session after analysis to prevent context pollution
        if (currentSession) {
            try { currentSession.destroy(); } catch (e) { }
            currentSession = null;
        }
    }
}

async function refinePrompt(originalPrompt, critique) {
    // Prevent double-click issues
    if (isRefining || isAnalyzing) {
        console.log('[PBI Checker] Refine/analyze already in progress');
        return;
    }

    isRefining = true;
    updateDashboardState('refining');

    try {
        // Create session in REFINE mode
        await createSession('refine');

        const refinementPrompt = `
Critique to address: "${critique}"

Original User Prompt:
"${originalPrompt}"

Rewrite this prompt to achieve a 100% PBI score. Output ONLY the refined prompt.
`;

        console.log('[PBI Checker] Refining prompt...');
        const refinedText = await currentSession.prompt(refinementPrompt);
        console.log('[PBI Checker] Refined text:', refinedText);

        // Update input
        const inputElement = document.querySelector(currentSiteConfig.inputSelector);
        if (inputElement) {
            if (inputElement.contentEditable === 'true') {
                inputElement.innerText = refinedText.trim();
            } else {
                inputElement.value = refinedText.trim();
            }

            // Trigger events
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        }

        updateDashboardState('ready');

        // Re-analyze
        setTimeout(() => analyzePBI(refinedText), 500);

    } catch (err) {
        console.error('[PBI Checker] Refinement error:', err);
        updateDashboardState('error', 'Refinement failed');
    } finally {
        isRefining = false;
        // Destroy session after refine
        if (currentSession) {
            try { currentSession.destroy(); } catch (e) { }
            currentSession = null;
        }
    }
}

// NEW: Reset dashboard to idle state
function resetDashboard() {
    if (!dashboardWidget) return;

    const scoreValue = dashboardWidget.querySelector('.pbi-score-value');
    const critiqueText = dashboardWidget.querySelector('.pbi-critique-text');
    const refineBtn = dashboardWidget.querySelector('.pbi-refine-btn');
    const actionTooltip = dashboardWidget.querySelector('.pbi-action-tooltip');

    if (scoreValue) {
        scoreValue.textContent = '--%';
        scoreValue.className = 'pbi-score-value';
    }
    if (critiqueText) {
        critiqueText.textContent = 'Type a prompt to analyze...';
        critiqueText.className = 'pbi-critique-text pbi-critique-placeholder short';
    }
    if (refineBtn) refineBtn.style.display = 'none';
    if (actionTooltip) actionTooltip.textContent = '';

    updateDashboardState('idle');
    blockSendButton(false);
    dashboardWidget.classList.remove('visible');

    lastAnalyzedText = '';
    console.log('[PBI Checker] Dashboard reset to idle');
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
      <button class="pbi-refine-btn" style="display: none;">⚡ Refine</button>
      <div class="pbi-spinner"></div>
      <span class="pbi-status-icon ready" style="display: none;">✓</span>
    </div>
    <div class="pbi-action-tooltip"></div>
  `;

    // Attach Refine listener
    const refineBtn = widget.querySelector('.pbi-refine-btn');
    if (refineBtn) {
        refineBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const inputElement = document.querySelector(currentSiteConfig.inputSelector);
            const text = getInputText(inputElement);
            const critique = widget.querySelector('.pbi-critique-text').textContent;

            if (text && text.length > 0) {
                refinePrompt(text, critique);
            }
        });
    }

    return widget;
}

function injectDashboard() {
    // Remove existing widget if any
    if (dashboardWidget && dashboardWidget.parentNode) {
        dashboardWidget.remove();
        dashboardWidget = null;
    }

    if (!currentSiteConfig) {
        console.warn('[PBI Checker] No site config found');
        return;
    }

    // Find injection target
    let wrapper = document.querySelector(currentSiteConfig.wrapperSelector);
    const inputElement = document.querySelector(currentSiteConfig.inputSelector);

    // Fallback: if wrapper not found but input exists, use input's parent
    if (!wrapper && inputElement) {
        console.log('[PBI Checker] Wrapper not found, using input parent as fallback');
        wrapper = inputElement.parentElement;
    }

    if (!wrapper) {
        console.warn('[PBI Checker] Could not find any injection target');
        return;
    }

    dashboardWidget = createDashboardWidget();
    const hostname = window.location.hostname;

    // Injection Logic with site-specific handling
    try {
        if (hostname.includes('claude.ai')) {
            // Claude: Grid layout causes overlap if injected as sibling in grid-area
            // Target the MAIN GRID CONTAINER or specific wrapper
            const gridContainer = document.querySelector('[data-testid="chat-input-grid-container"]');

            let target = gridContainer || wrapper;

            // If we found the grid container, inject BEFORE it (safest)
            if (gridContainer && gridContainer.parentElement) {
                target = gridContainer;
                console.log('[PBI Checker] Found Claude Grid Container, injecting outside...');
            } else {
                // Fallback logic
                if (wrapper.offsetHeight < 50 && wrapper.parentElement) {
                    target = wrapper.parentElement;
                }
                // Traverse up to find a non-grid area if possible
                for (let i = 0; i < 3; i++) {
                    if (target.classList.contains('flex') || target.tagName === 'FIELDSET') break;
                    if (target.parentElement) target = target.parentElement;
                }
            }

            // Insert BEFORE the target
            if (target.parentElement) {
                target.parentElement.insertBefore(dashboardWidget, target);

                // Force spacing and layout
                dashboardWidget.style.position = 'relative';
                dashboardWidget.style.display = 'flex';
                dashboardWidget.style.marginBottom = '12px';
                dashboardWidget.style.width = '100%';
                dashboardWidget.style.maxWidth = '100%';
                dashboardWidget.style.zIndex = '9999';
            }
            console.log('[PBI Checker] Claude injection complete (Grid Fix)');

        } else if (hostname.includes('gemini.google.com')) {
            wrapper.parentElement?.insertBefore(dashboardWidget, wrapper);
            dashboardWidget.style.marginBottom = '12px';

        } else {
            // Default (ChatGPT): Inject before wrapper
            wrapper.parentElement?.insertBefore(dashboardWidget, wrapper);
        }
    } catch (e) {
        console.error('[PBI Checker] Primary injection failed:', e);
        // Ultimate fallback: append to body at fixed position
        try {
            document.body.appendChild(dashboardWidget);
            dashboardWidget.style.position = 'fixed';
            dashboardWidget.style.bottom = '80px';
            dashboardWidget.style.left = '50%';
            dashboardWidget.style.transform = 'translateX(-50%)';
            console.log('[PBI Checker] Fallback: Fixed position injection');
        } catch (e2) {
            console.error('[PBI Checker] All injection methods failed');
        }
    }

    // Trigger visibility
    requestAnimationFrame(() => {
        dashboardWidget.classList.add('visible');
    });

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
    const refineBtn = dashboardWidget.querySelector('.pbi-refine-btn');

    switch (state) {
        case 'analyzing':
            spinner.classList.add('active');
            statusIcon.style.display = 'none';
            if (refineBtn) refineBtn.style.display = 'none';
            critiqueText.textContent = 'Analyzing...';
            critiqueText.classList.add('pbi-critique-placeholder');
            critiqueText.classList.add('short');
            break;

        case 'refining':
            spinner.classList.add('active');
            statusIcon.style.display = 'none';
            if (refineBtn) refineBtn.style.display = 'none';
            critiqueText.textContent = 'Refining prompt...';
            critiqueText.classList.add('pbi-critique-placeholder');
            critiqueText.classList.add('short');
            break;

        case 'downloading':
            spinner.classList.add('active');
            statusIcon.style.display = 'none';
            if (refineBtn) refineBtn.style.display = 'none';
            critiqueText.textContent = errorMessage || 'Downloading AI model...';
            critiqueText.classList.add('pbi-critique-placeholder');
            critiqueText.classList.add('short');
            break;

        case 'ready':
            spinner.classList.remove('active');
            statusIcon.style.display = 'inline';
            if (refineBtn) refineBtn.style.display = 'flex';
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

    // Show refine button for high-risk prompts
    const refineBtn = dashboardWidget.querySelector('.pbi-refine-btn');
    if (refineBtn) {
        refineBtn.style.display = 'flex';
    }

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

        // Reset if text is cleared or significantly changed
        if (text.length < MIN_TEXT_LENGTH) {
            resetDashboard();
            return;
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

    // Monitor send button for reset after sending
    setupSendButtonMonitoring();

    // Initial check
    handleInput();
}

// NEW: Monitor send button clicks to reset dashboard after sending
function setupSendButtonMonitoring() {
    if (!currentSiteConfig) return;

    const sendButton = document.querySelector(currentSiteConfig.sendButtonSelector);
    if (!sendButton) {
        console.log('[PBI Checker] Send button not found for monitoring');
        return;
    }

    // Add click listener to reset after send
    sendButton.addEventListener('click', () => {
        console.log('[PBI Checker] Send detected, resetting dashboard...');
        // Delay reset to allow message to be sent
        setTimeout(() => {
            resetDashboard();
        }, 500);
    }, { capture: true });

    // Also listen for Enter key in input
    const inputElement = document.querySelector(currentSiteConfig.inputSelector);
    if (inputElement) {
        inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                console.log('[PBI Checker] Enter detected, resetting dashboard...');
                setTimeout(() => {
                    resetDashboard();
                }, 500);
            }
        });
    }

    console.log('[PBI Checker] Send button monitoring active');
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

let reinjectionPending = false;

function setupMutationObserver() {
    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
        // Prevent infinite re-injection loop with debounce flag
        if (reinjectionPending) return;

        // Check if dashboard was removed (SPA navigation)
        if (dashboardWidget && !document.body.contains(dashboardWidget)) {
            console.log('[PBI Checker] Dashboard removed, scheduling re-injection...');
            reinjectionPending = true;
            dashboardWidget = null; // Clear reference to removed widget

            setTimeout(() => {
                reinjectionPending = false;
                injectDashboard();
                setupInputMonitoring();
            }, 1000); // Longer delay to avoid race conditions
        }

        // Check for input element changes (but not too frequently)
        if (currentSiteConfig && !reinjectionPending) {
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

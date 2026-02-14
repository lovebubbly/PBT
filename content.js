/**
 * PBI Checker - Content Script (Facelift)
 * Rebuilt for stable runtime lifecycle and better UX flow.
 */

const PBI_SYSTEM_PROMPT = `
You are PBI Checker.
Evaluate one user prompt and output strict JSON only.

Scoring rubric (0-25 each):
- logic: clear objective, reasoning flow, context
- completeness: output format, depth, acceptance criteria
- constraints: boundaries, prohibited behavior, tone/rules
- erosion_risk: keeps user in the loop vs delegating all thinking

Output schema:
{"total_score":0-100,"axis_scores":{"logic":0-25,"completeness":0-25,"constraints":0-25,"erosion_risk":0-25},"action_item":"one concrete next fix"}
`;

const SITE_CONFIGS = {
  'chatgpt.com': {
    label: 'ChatGPT',
    inputSelector: '#prompt-textarea, [data-testid="composer-background"] textarea',
    wrapperSelector: 'form, [data-testid="composer-background"]',
    sendButtonSelector: 'button[data-testid="send-button"], button[data-testid="fruitjuice-send-button"]'
  },
  'chat.openai.com': {
    label: 'ChatGPT',
    inputSelector: '#prompt-textarea, [data-testid="composer-background"] textarea',
    wrapperSelector: 'form, [data-testid="composer-background"]',
    sendButtonSelector: 'button[data-testid="send-button"]'
  },
  'claude.ai': {
    label: 'Claude',
    inputSelector: 'div[contenteditable="true"], .ProseMirror[contenteditable="true"]',
    wrapperSelector: '[data-testid="chat-input-grid-container"], fieldset, form, [class*="composer"], [class*="chat-input"]',
    sendButtonSelector: 'button[aria-label="Send Message"], button[aria-label*="Send"], button[type="submit"]'
  },
  'gemini.google.com': {
    label: 'Gemini',
    inputSelector: '.ql-editor, rich-textarea .ql-editor, [contenteditable="true"]',
    wrapperSelector: '.input-area-container, .input-wrapper, .text-input-field_textarea-wrapper',
    sendButtonSelector: 'button[aria-label*="Send"], .send-button'
  }
};

const AXIS_CONFIG = {
  logic: { label: 'Logic', threshold: 18, fix: 'Define objective, context, and step order.' },
  completeness: { label: 'Completeness', threshold: 18, fix: 'Specify output format, sections, and quality bar.' },
  constraints: { label: 'Constraints', threshold: 18, fix: 'Add hard rules and explicit limitations.' },
  erosion_risk: { label: 'Erosion Risk', threshold: 15, fix: 'Ask for framework/critique, not full delegation.' }
};

const AXIS_KEYS = Object.keys(AXIS_CONFIG);

const DEBOUNCE_DELAY_MS = 1400;
const MIN_ANALYZE_LENGTH = 18;
const MIN_SHOW_LENGTH = 8;
const SESSION_MAX_USES = 24;
const MIN_REANALYZE_DELTA = 14;
const AI_AVAILABILITY_CACHE_MS = 120000;

const state = {
  initialized: false,
  settings: {
    enabled: true,
    autoAnalyze: true,
    blockLowScore: false,
    blockThreshold: 30,
    debugMode: false
  },
  siteConfig: null,
  aiAvailability: 'checking',
  widget: null,
  ui: null,
  expanded: false,
  mode: 'idle',
  activeInput: null,
  activeSendButton: null,
  cleanupInputBindings: [],
  observer: null,
  observerTicking: false,
  lastUrl: window.location.href,
  urlIntervalId: null,
  postSendTimer: null,
  debounceTimer: null,
  guardMessageTimer: null,
  isAnalyzing: false,
  isRefining: false,
  analyzeCallId: 0,
  lastAnalyzedText: '',
  lastResult: null,
  analysisSession: null,
  analysisSessionUses: 0,
  lastAvailabilityCheckAt: 0
};

function log(...args) {
  if (state.settings.debugMode) {
    console.log('[PBI Checker]', ...args);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isSignificantChange(nextText, previousText) {
  const next = normalizeText(nextText);
  const prev = normalizeText(previousText);
  if (!prev) return true;
  if (next === prev) return false;

  const lengthDelta = Math.abs(next.length - prev.length);
  if (lengthDelta >= MIN_REANALYZE_DELTA) return true;

  // Typing a few more characters at the end should not retrigger immediately.
  if (next.startsWith(prev) || prev.startsWith(next)) {
    return false;
  }

  return true;
}

function toUserErrorMessage(err, context = 'analysis') {
  const raw = String(err?.message || '').toLowerCase();
  if (raw.includes('on-device ai') || raw.includes('languagemodel')) {
    return '온디바이스 AI를 사용할 수 없습니다. Chrome AI 설정을 확인해주세요.';
  }
  if (raw.includes('empty output')) {
    return '개선 결과가 비어 있습니다. 다시 시도해주세요.';
  }
  if (raw.includes('failed to parse') || raw.includes('json')) {
    return '분석 응답 파싱에 실패했습니다. 다시 시도해주세요.';
  }
  return context === 'refine'
    ? '프롬프트 개선 중 오류가 발생했습니다.'
    : '프롬프트 분석 중 오류가 발생했습니다.';
}

function safeDestroySession(session) {
  if (!session) return;
  try {
    session.destroy();
  } catch (err) {
    log('Session destroy skipped:', err);
  }
}

function getVisibleElement(selector) {
  const elements = Array.from(document.querySelectorAll(selector));
  if (elements.length === 0) return null;

  const visible = elements.find((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  });

  return visible || elements[0] || null;
}

function detectSiteConfig() {
  const hostname = window.location.hostname;
  for (const [domain, config] of Object.entries(SITE_CONFIGS)) {
    if (hostname.includes(domain.replace('www.', ''))) {
      return config;
    }
  }
  return null;
}

function getInputText(inputElement) {
  if (!inputElement) return '';

  if (inputElement.contentEditable === 'true') {
    return inputElement.innerText || inputElement.textContent || '';
  }

  return inputElement.value || '';
}

function setInputText(inputElement, text) {
  if (!inputElement) return;

  if (inputElement.contentEditable === 'true') {
    inputElement.innerText = text;
  } else {
    inputElement.value = text;
  }

  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  inputElement.dispatchEvent(new Event('change', { bubbles: true }));
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['enabled', 'autoAnalyze', 'blockLowScore', 'blockThreshold', 'debugMode'], (result) => {
      state.settings = {
        ...state.settings,
        ...result
      };
      resolve(state.settings);
    });
  });
}

async function checkAIAvailability(forceRefresh = false) {
  if (typeof LanguageModel === 'undefined') {
    state.aiAvailability = 'unavailable';
    state.lastAvailabilityCheckAt = Date.now();
    return state.aiAvailability;
  }

  const now = Date.now();
  if (!forceRefresh && state.aiAvailability !== 'checking' && (now - state.lastAvailabilityCheckAt) < AI_AVAILABILITY_CACHE_MS) {
    return state.aiAvailability;
  }

  try {
    const options = {
      expectedInputs: [{ type: 'text' }],
      expectedOutputs: [{ type: 'text' }]
    };
    const availability = await LanguageModel.availability(options);
    state.aiAvailability = availability;
    state.lastAvailabilityCheckAt = now;
    return availability;
  } catch (err) {
    try {
      const fallbackAvailability = await LanguageModel.availability();
      state.aiAvailability = fallbackAvailability;
      state.lastAvailabilityCheckAt = now;
      return fallbackAvailability;
    } catch (fallbackErr) {
      log('AI availability check failed:', err, fallbackErr);
      state.aiAvailability = 'unavailable';
      state.lastAvailabilityCheckAt = now;
      return 'unavailable';
    }
  }
}

async function ensureAIReady() {
  let availability = await checkAIAvailability(false);
  if (availability === 'unavailable') {
    availability = await checkAIAvailability(true);
  }
  if (availability === 'unavailable') {
    throw new Error('On-device AI unavailable. Enable Chrome on-device model flags.');
  }
  return availability;
}

async function createSession({ mode = 'analysis', systemPrompt }) {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('LanguageModel API is not available.');
  }

  const options = {
    temperature: mode === 'analysis' ? 0.2 : 0.7,
    topK: mode === 'analysis' ? 20 : 40,
    expectedInputs: [{ type: 'text' }],
    expectedOutputs: [{ type: 'text' }],
    initialPrompts: [{ role: 'system', content: systemPrompt }]
  };

  return LanguageModel.create(options);
}

async function getAnalysisSession() {
  if (state.analysisSession && state.analysisSessionUses < SESSION_MAX_USES) {
    return state.analysisSession;
  }

  safeDestroySession(state.analysisSession);
  state.analysisSession = await createSession({
    mode: 'analysis',
    systemPrompt: PBI_SYSTEM_PROMPT
  });
  state.analysisSessionUses = 0;
  return state.analysisSession;
}

function destroyAllSessions() {
  safeDestroySession(state.analysisSession);
  state.analysisSession = null;
  state.analysisSessionUses = 0;
}

function extractJsonText(rawText) {
  const text = (rawText || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

function parseAnalysisResponse(rawText) {
  const jsonText = extractJsonText(rawText);
  const parsed = JSON.parse(jsonText);

  const axisScores = parsed.axis_scores || {};
  const normalizedAxis = {
    logic: clamp(Number(axisScores.logic) || 0, 0, 25),
    completeness: clamp(Number(axisScores.completeness) || 0, 0, 25),
    constraints: clamp(Number(axisScores.constraints) || 0, 0, 25),
    erosion_risk: clamp(Number(axisScores.erosion_risk) || 0, 0, 25)
  };

  let totalScore = Number(parsed.total_score);
  if (!Number.isFinite(totalScore)) {
    totalScore = AXIS_KEYS.reduce((sum, key) => sum + normalizedAxis[key], 0);
  }
  totalScore = clamp(Math.round(totalScore), 0, 100);

  let actionItem = normalizeText(parsed.action_item || '');
  if (!actionItem) {
    const weakAxis = AXIS_KEYS.find((key) => normalizedAxis[key] < AXIS_CONFIG[key].threshold);
    actionItem = weakAxis ? AXIS_CONFIG[weakAxis].fix : 'Prompt is strong. You can ship this.';
  }

  return {
    total_score: totalScore,
    axis_scores: normalizedAxis,
    action_item: actionItem
  };
}

function buildRefineSystemPrompt(result) {
  const strategyLines = [];

  if (result && result.axis_scores) {
    for (const key of AXIS_KEYS) {
      const score = Number(result.axis_scores[key]) || 0;
      if (score < AXIS_CONFIG[key].threshold) {
        strategyLines.push(`- ${AXIS_CONFIG[key].fix}`);
      }
    }
  }

  if (strategyLines.length === 0) {
    strategyLines.push('- Tighten clarity, remove ambiguity, and define final deliverable format.');
  }

  return `
You are a strict prompt editor.
Rewrite the user's prompt into a high-clarity execution brief while preserving intent.

Mandatory improvements:
${strategyLines.join('\n')}

Rules:
- Keep the same language as the user prompt.
- Output only the refined prompt text.
- No preamble, no markdown fences, no apology.
`;
}

function scoreBand(score) {
  if (score < 30) return 'critical';
  if (score < 60) return 'warn';
  if (score < 80) return 'good';
  return 'great';
}

function setWidgetVisibility(visible) {
  if (!state.widget) return;
  state.widget.classList.toggle('visible', visible);
}

function updateVisibilityByInput() {
  if (!state.settings.enabled) {
    setWidgetVisibility(false);
    return;
  }

  const text = getInputText(state.activeInput);
  setWidgetVisibility(text.trim().length >= MIN_SHOW_LENGTH);
}

function renderMode(mode, message = '') {
  if (!state.widget || !state.ui) return;

  state.mode = mode;
  state.widget.dataset.mode = mode;

  const { statusText, statusDot, headline, refineButton } = state.ui;

  switch (mode) {
    case 'analyzing':
      statusText.textContent = '프롬프트 분석 중';
      statusDot.dataset.tone = 'busy';
      headline.textContent = '목표, 형식, 제약조건을 스캔하는 중';
      break;
    case 'refining':
      statusText.textContent = '프롬프트 개선 중';
      statusDot.dataset.tone = 'busy';
      headline.textContent = '약한 축을 기준으로 자동 보정 중';
      break;
    case 'ready':
      statusText.textContent = message || '분석 완료';
      statusDot.dataset.tone = 'ok';
      break;
    case 'error':
      statusText.textContent = message || '오류';
      statusDot.dataset.tone = 'error';
      if (message) headline.textContent = message;
      break;
    default:
      statusText.textContent = '프롬프트 입력 대기 중';
      statusDot.dataset.tone = 'idle';
      headline.textContent = '입력하면 즉시 프롬프트 구조를 진단합니다';
      break;
  }

  if (refineButton) {
    refineButton.disabled = mode === 'analyzing' || mode === 'refining' || !state.lastResult;
  }
}

function renderIdle() {
  if (!state.widget || !state.ui) return;

  state.lastResult = null;
  state.lastAnalyzedText = '';

  state.widget.dataset.scoreBand = 'none';
  state.widget.style.setProperty('--pbi-score-angle', '0deg');

  state.ui.scoreText.textContent = '--';
  state.ui.kicker.textContent = 'PBI SCORE';
  state.ui.actionText.textContent = '목표, 출력형식, 제약조건 3가지를 명시하면 점수가 빠르게 올라갑니다.';
  if (!state.settings.enabled) {
    state.ui.metaText.textContent = '비활성화됨';
  } else {
    state.ui.metaText.textContent = state.settings.autoAnalyze ? '자동 분석(변화 클 때만)' : '수동 분석 모드';
  }

  for (const key of AXIS_KEYS) {
    const valueEl = state.ui.axisValues[key];
    const barEl = state.ui.axisBars[key];
    if (valueEl) valueEl.textContent = '--/25';
    if (barEl) barEl.style.width = '0%';
  }

  renderMode('idle');
}

function renderResult(result, source = 'auto') {
  if (!state.widget || !state.ui) return;

  const score = clamp(Math.round(result.total_score), 0, 100);
  const band = scoreBand(score);
  const readyHeadline = score < 40
    ? '핵심 구조가 약합니다. 지금 고치면 품질이 크게 오릅니다'
    : score < 70
      ? '좋은 초안입니다. 제약/형식을 조금만 더 구체화해보세요'
      : '전송 가능한 품질입니다. 필요하면 한 번 더 개선하세요';

  state.widget.dataset.scoreBand = band;
  state.widget.style.setProperty('--pbi-score-angle', `${score * 3.6}deg`);

  state.ui.scoreText.textContent = `${score}%`;
  state.ui.kicker.textContent = score < 40 ? 'REWRITE NOW' : score < 70 ? 'NEEDS TUNING' : 'SHIP READY';
  state.ui.headline.textContent = readyHeadline;
  state.ui.actionText.textContent = result.action_item;
  state.ui.metaText.textContent = source === 'manual' ? '수동 분석' : source === 'refine' ? '개선 후 재분석' : '자동 분석';

  for (const key of AXIS_KEYS) {
    const axisValue = clamp(Number(result.axis_scores[key]) || 0, 0, 25);
    const valueEl = state.ui.axisValues[key];
    const barEl = state.ui.axisBars[key];
    if (valueEl) valueEl.textContent = `${axisValue}/25`;
    if (barEl) barEl.style.width = `${axisValue * 4}%`;
  }

  renderMode('ready', score < state.settings.blockThreshold && state.settings.blockLowScore
    ? `점수 ${score}점: 차단 기준(${state.settings.blockThreshold}) 미만`
    : `분석 완료 · ${score}점`);

  updateGuardVisual();
}

function updateGuardVisual() {
  if (!state.widget || !state.ui) return;

  const shouldWarn = shouldBlockSend();
  state.widget.classList.toggle('guard-active', shouldWarn);

  if (shouldWarn) {
    state.ui.guardMessage.textContent = `전송 차단: 점수가 ${state.settings.blockThreshold}점 미만입니다. '개선' 버튼으로 보정해보세요.`;
  } else {
    state.ui.guardMessage.textContent = '';
  }
}

function showGuardMessage(message) {
  if (!state.ui) return;

  state.ui.guardMessage.textContent = message;
  state.widget.classList.add('guard-flash');

  if (state.guardMessageTimer) {
    clearTimeout(state.guardMessageTimer);
  }

  state.guardMessageTimer = setTimeout(() => {
    state.widget.classList.remove('guard-flash');
    updateGuardVisual();
  }, 1700);
}

function getAxisMarkup() {
  return AXIS_KEYS.map((key) => {
    const label = AXIS_CONFIG[key].label;
    return `
      <div class="pbi-axis-card" data-axis-row="${key}">
        <span class="pbi-axis-label">${label}</span>
        <span class="pbi-axis-value" data-axis-value="${key}">--/25</span>
        <div class="pbi-axis-meter">
          <span class="pbi-axis-fill" data-axis-fill="${key}"></span>
        </div>
      </div>
    `;
  }).join('');
}

function createDashboardWidget() {
  const widget = document.createElement('section');
  widget.id = 'pbi-dashboard-widget';
  widget.dataset.mode = 'idle';
  widget.dataset.scoreBand = 'none';

  widget.innerHTML = `
    <div class="pbi-top-row">
      <div class="pbi-score-area">
        <div class="pbi-score-ring">
          <span class="pbi-score-text">--</span>
        </div>
        <div class="pbi-copy">
          <p class="pbi-kicker">PBI SCORE</p>
          <p class="pbi-headline">입력하면 즉시 프롬프트 구조를 진단합니다</p>
        </div>
      </div>
      <div class="pbi-btn-group">
        <button type="button" class="pbi-btn pbi-btn-ghost" data-action="toggle">상세 보기</button>
        <button type="button" class="pbi-btn pbi-btn-primary" data-action="analyze">분석</button>
        <button type="button" class="pbi-btn pbi-btn-accent" data-action="refine" disabled>개선</button>
      </div>
    </div>

    <div class="pbi-details" aria-hidden="true">
      <div class="pbi-axis-grid">
        ${getAxisMarkup()}
      </div>
      <div class="pbi-action-card">
        <p class="pbi-action-label">NEXT ACTION</p>
        <p class="pbi-action-text">목표, 출력형식, 제약조건 3가지를 명시하면 점수가 빠르게 올라갑니다.</p>
      </div>
    </div>

    <div class="pbi-footer-row">
      <span class="pbi-status-dot" data-tone="idle"></span>
      <span class="pbi-status-text">프롬프트 입력 대기 중</span>
      <span class="pbi-meta-text">자동 분석(변화 클 때만)</span>
    </div>

    <div class="pbi-guard-message" aria-live="polite"></div>
  `;

  const ui = {
    scoreText: widget.querySelector('.pbi-score-text'),
    kicker: widget.querySelector('.pbi-kicker'),
    headline: widget.querySelector('.pbi-headline'),
    actionText: widget.querySelector('.pbi-action-text'),
    statusText: widget.querySelector('.pbi-status-text'),
    statusDot: widget.querySelector('.pbi-status-dot'),
    metaText: widget.querySelector('.pbi-meta-text'),
    guardMessage: widget.querySelector('.pbi-guard-message'),
    toggleButton: widget.querySelector('[data-action="toggle"]'),
    analyzeButton: widget.querySelector('[data-action="analyze"]'),
    refineButton: widget.querySelector('[data-action="refine"]'),
    details: widget.querySelector('.pbi-details'),
    axisValues: {},
    axisBars: {}
  };

  for (const key of AXIS_KEYS) {
    ui.axisValues[key] = widget.querySelector(`[data-axis-value="${key}"]`);
    ui.axisBars[key] = widget.querySelector(`[data-axis-fill="${key}"]`);
  }

  ui.toggleButton.addEventListener('click', () => {
    state.expanded = !state.expanded;
    widget.classList.toggle('pbi-expanded', state.expanded);
    ui.details.setAttribute('aria-hidden', state.expanded ? 'false' : 'true');
    ui.toggleButton.textContent = state.expanded ? '접기' : '상세 보기';
  });

  ui.analyzeButton.addEventListener('click', () => {
    analyzeCurrentInput({ force: true, source: 'manual' });
  });

  ui.refineButton.addEventListener('click', () => {
    refineCurrentInput();
  });

  state.widget = widget;
  state.ui = ui;

  return widget;
}

function injectDashboard() {
  if (!state.siteConfig) return;

  if (state.widget && state.widget.parentNode) {
    state.widget.remove();
  }

  const inputElement = getVisibleElement(state.siteConfig.inputSelector);
  const wrapper = getVisibleElement(state.siteConfig.wrapperSelector) || inputElement?.closest('form') || inputElement?.parentElement;

  if (!wrapper || !wrapper.parentElement) {
    log('Dashboard injection skipped: wrapper not found');
    return;
  }

  const widget = createDashboardWidget();

  const isClaude = window.location.hostname.includes('claude.ai');
  const claudeGrid = document.querySelector('[data-testid="chat-input-grid-container"]');

  if (isClaude && claudeGrid && claudeGrid.parentElement) {
    claudeGrid.parentElement.insertBefore(widget, claudeGrid);
  } else {
    wrapper.parentElement.insertBefore(widget, wrapper);
  }

  requestAnimationFrame(() => {
    updateVisibilityByInput();
  });

  renderIdle();
}

function clearInputBindings() {
  for (const cleanup of state.cleanupInputBindings) {
    try {
      cleanup();
    } catch (err) {
      log('Cleanup skipped:', err);
    }
  }
  state.cleanupInputBindings = [];
  state.activeInput = null;
  state.activeSendButton = null;
}

function shouldBlockSend() {
  if (!state.settings.blockLowScore) return false;
  if (!state.lastResult) return false;

  const currentText = normalizeText(getInputText(state.activeInput));
  if (!currentText) return false;

  if (currentText !== normalizeText(state.lastAnalyzedText)) {
    return false;
  }

  return Number(state.lastResult.total_score) < Number(state.settings.blockThreshold || 30);
}

function schedulePostSendCheck() {
  if (state.postSendTimer) {
    clearTimeout(state.postSendTimer);
  }

  state.postSendTimer = setTimeout(() => {
    const text = normalizeText(getInputText(state.activeInput));
    if (!text) {
      renderIdle();
      setWidgetVisibility(false);
    }
  }, 700);
}

function handlePotentialSend(eventSource, event) {
  if (shouldBlockSend()) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }

    const score = Math.round(Number(state.lastResult?.total_score || 0));
    showGuardMessage(`전송 차단 (${score} < ${state.settings.blockThreshold}). 프롬프트를 수정하거나 '개선'을 눌러주세요.`);
    return false;
  }

  log('Send allowed from', eventSource);
  schedulePostSendCheck();
  return true;
}

function bindComposer() {
  if (!state.siteConfig) return;

  const inputElement = getVisibleElement(state.siteConfig.inputSelector);
  if (!inputElement) return;

  const sendButton = getVisibleElement(state.siteConfig.sendButtonSelector);

  const sameInput = state.activeInput === inputElement;
  const sameButton = state.activeSendButton === sendButton;
  if (sameInput && sameButton) return;

  clearInputBindings();

  state.activeInput = inputElement;
  state.activeSendButton = sendButton;

  const handleInput = () => {
    if (!state.settings.enabled) return;

    const text = normalizeText(getInputText(inputElement));
    updateVisibilityByInput();

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    if (text.length < MIN_ANALYZE_LENGTH) {
      if (!text) {
        renderIdle();
      }
      return;
    }

    if (!state.settings.autoAnalyze) {
      if (state.ui) {
        state.ui.metaText.textContent = '수동 분석 모드';
        state.ui.statusText.textContent = '입력 완료 후 분석 버튼을 눌러주세요';
      }
      return;
    }

    state.debounceTimer = setTimeout(() => {
      analyzeCurrentInput({ force: false, source: 'auto' });
    }, DEBOUNCE_DELAY_MS);
  };

  const handleBlur = () => {
    // Intentionally no immediate analysis on blur to avoid duplicate calls
    // when users click surrounding controls.
  };

  const handleKeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      handlePotentialSend('enter', event);
    }
  };

  inputElement.addEventListener('input', handleInput);
  inputElement.addEventListener('blur', handleBlur);
  inputElement.addEventListener('keydown', handleKeydown, true);

  state.cleanupInputBindings.push(() => inputElement.removeEventListener('input', handleInput));
  state.cleanupInputBindings.push(() => inputElement.removeEventListener('blur', handleBlur));
  state.cleanupInputBindings.push(() => inputElement.removeEventListener('keydown', handleKeydown, true));

  if (sendButton) {
    const handleClick = (event) => {
      handlePotentialSend('button', event);
    };

    sendButton.addEventListener('click', handleClick, true);
    state.cleanupInputBindings.push(() => sendButton.removeEventListener('click', handleClick, true));
  }

  updateVisibilityByInput();
}

async function analyzePromptText(promptText, source = 'auto', force = false, allowWhileRefining = false) {
  const normalized = normalizeText(promptText);
  if (!normalized || normalized.length < MIN_ANALYZE_LENGTH) return null;

  if (!force) {
    if (normalized === normalizeText(state.lastAnalyzedText)) {
      log('Skipping duplicate analysis');
      return state.lastResult;
    }
    if (!isSignificantChange(normalized, state.lastAnalyzedText)) {
      log('Skipping minor edit analysis');
      return state.lastResult;
    }
  }

  if (state.isAnalyzing || (state.isRefining && !allowWhileRefining)) {
    return null;
  }

  state.isAnalyzing = true;
  const callId = ++state.analyzeCallId;
  renderMode('analyzing');

  try {
    await ensureAIReady();

    const session = await getAnalysisSession();
    state.analysisSessionUses += 1;

    const requestPrompt = `Score this prompt and return JSON only.\n${normalized}`;
    const raw = await session.prompt(requestPrompt);

    if (callId !== state.analyzeCallId) {
      return null;
    }

    const parsed = parseAnalysisResponse(raw);
    state.lastAnalyzedText = normalized;
    state.lastResult = parsed;

    renderResult(parsed, source);
    return parsed;
  } catch (err) {
    log('Analysis failed:', err);
    renderMode('error', toUserErrorMessage(err, 'analysis'));
    destroyAllSessions();
    return null;
  } finally {
    state.isAnalyzing = false;
  }
}

function analyzeCurrentInput({ force = false, source = 'auto' } = {}) {
  const text = getInputText(state.activeInput);
  return analyzePromptText(text, source, force);
}

async function refineCurrentInput() {
  if (state.isAnalyzing || state.isRefining) return;

  const inputElement = state.activeInput;
  const originalText = normalizeText(getInputText(inputElement));
  if (!inputElement || originalText.length < MIN_ANALYZE_LENGTH) {
    showGuardMessage('개선 기능을 쓰려면 조금 더 긴 프롬프트가 필요합니다.');
    return;
  }

  state.isRefining = true;
  renderMode('refining');

  let refineSession = null;

  try {
    await ensureAIReady();

    const systemPrompt = buildRefineSystemPrompt(state.lastResult);
    refineSession = await createSession({ mode: 'refine', systemPrompt });

    const refinementPrompt = `Rewrite this prompt with stronger structure and constraints:\n\n${originalText}`;
    const refinedText = normalizeText(await refineSession.prompt(refinementPrompt));

    if (!refinedText) {
      throw new Error('Refine returned empty output.');
    }

    setInputText(inputElement, refinedText);
    state.lastAnalyzedText = '';
    renderMode('ready', '개선 완료, 다시 분석 중...');

    await analyzePromptText(refinedText, 'refine', true, true);
  } catch (err) {
    log('Refine failed:', err);
    renderMode('error', toUserErrorMessage(err, 'refine'));
  } finally {
    state.isRefining = false;
    safeDestroySession(refineSession);
  }
}

function setupMutationObserver() {
  if (state.observer) {
    state.observer.disconnect();
  }

  state.observer = new MutationObserver(() => {
    if (state.observerTicking) return;

    state.observerTicking = true;
    requestAnimationFrame(() => {
      state.observerTicking = false;

      if (!state.settings.enabled) return;

      if (!state.widget || !document.body.contains(state.widget)) {
        injectDashboard();
      }

      bindComposer();
    });
  });

  state.observer.observe(document.body, { childList: true, subtree: true });
}

function handleUrlChange() {
  const nowUrl = window.location.href;
  if (state.lastUrl === nowUrl) return;

  state.lastUrl = nowUrl;
  destroyAllSessions();

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }

  state.lastResult = null;
  state.lastAnalyzedText = '';
  renderIdle();

  setTimeout(() => {
    state.siteConfig = detectSiteConfig();
    if (!state.siteConfig) return;

    injectDashboard();
    bindComposer();
  }, 180);
}

function setupUrlMonitoring() {
  if (!window.__pbiHistoryPatched) {
    window.__pbiHistoryPatched = true;

    const originalPushState = history.pushState;
    history.pushState = function patchedPushState() {
      originalPushState.apply(history, arguments);
      handleUrlChange();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function patchedReplaceState() {
      originalReplaceState.apply(history, arguments);
      handleUrlChange();
    };

    window.addEventListener('popstate', handleUrlChange);
  }

  if (state.urlIntervalId) {
    clearInterval(state.urlIntervalId);
  }

  state.urlIntervalId = setInterval(handleUrlChange, 1200);
}

function cleanupRuntime() {
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
  if (state.postSendTimer) {
    clearTimeout(state.postSendTimer);
    state.postSendTimer = null;
  }
  if (state.guardMessageTimer) {
    clearTimeout(state.guardMessageTimer);
    state.guardMessageTimer = null;
  }
  if (state.urlIntervalId) {
    clearInterval(state.urlIntervalId);
    state.urlIntervalId = null;
  }

  clearInputBindings();

  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }

  destroyAllSessions();

  if (state.widget) {
    state.widget.remove();
    state.widget = null;
    state.ui = null;
  }
}

function getRuntimeStatus() {
  const score = state.lastResult ? Math.round(Number(state.lastResult.total_score || 0)) : null;
  return {
    ok: true,
    enabled: state.settings.enabled,
    autoAnalyze: state.settings.autoAnalyze,
    site: state.siteConfig?.label || null,
    aiAvailability: state.aiAvailability,
    mode: state.mode,
    score,
    hasWidget: Boolean(state.widget)
  };
}

async function startRuntime() {
  await loadSettings();

  if (!state.settings.enabled) {
    cleanupRuntime();
    return;
  }

  state.siteConfig = detectSiteConfig();
  if (!state.siteConfig) {
    cleanupRuntime();
    return;
  }

  await checkAIAvailability();

  injectDashboard();
  bindComposer();
  setupMutationObserver();
  setupUrlMonitoring();

  const existingText = normalizeText(getInputText(state.activeInput));
  if (existingText.length >= MIN_SHOW_LENGTH) {
    setWidgetVisibility(true);
  }
}

function setupMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'TOGGLE_ENABLED':
        state.settings.enabled = Boolean(message.enabled);
        if (state.settings.enabled) {
          startRuntime().then(() => sendResponse({ success: true }));
        } else {
          cleanupRuntime();
          sendResponse({ success: true });
        }
        return true;

      case 'UPDATE_SETTINGS':
        state.settings = { ...state.settings, ...(message.settings || {}) };
        chrome.storage.local.set(message.settings || {});
        if (state.ui && message.settings && Object.prototype.hasOwnProperty.call(message.settings, 'autoAnalyze')) {
          state.ui.metaText.textContent = state.settings.autoAnalyze ? '자동 분석(변화 클 때만)' : '수동 분석 모드';
        }
        updateGuardVisual();
        sendResponse({ success: true });
        return false;

      case 'GET_RUNTIME_STATUS':
        sendResponse(getRuntimeStatus());
        return false;

      default:
        return false;
    }
  });
}

async function initialize() {
  if (state.initialized) return;
  state.initialized = true;

  setupMessageHandlers();
  await startRuntime();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

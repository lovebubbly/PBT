# 🧠 PBI Checker — Anti-Brainrot AI

> Evaluate your prompts **on-device** before you send them. Fight cognitive laziness with local AI.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-brightgreen?logo=googlechrome)](https://github.com/lovebubbly/PBT)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ What is PBI?

**Prompt Brainrot Index (PBI)** is a scoring system (0–100%) that measures the quality of your prompts across 4 key axes:

| Axis | What it Measures |
|------|------------------|
| **Logic** | Clear objectives, causality, specific context |
| **Completeness** | Output format specs, depth, priorities |
| **Constraints** | Explicit guardrails (tone, prohibitions, scope) |
| **Erosion Risk** | Are you outsourcing your thinking entirely? |

Low scores mean your prompt is vague, "omakase" style, or delegates too much thinking to the AI—what we call **"Brainrot."**

---

## 🚀 Features

- **Real-time Analysis**: Monitors your prompts as you type with debounced AI evaluation
- **On-device AI**: Uses Chrome's built-in `LanguageModel` API (no external API calls, privacy-first)
- **Premium UI**: Toss-inspired glassmorphism design with 24px rounded corners and smooth animations
- **Dashboard Overlay**: Seamlessly injected into LLM interfaces without breaking layouts
- **Prompt Refinement**: One-click AI-powered prompt rewriting with context-aware improvements
- **Send Blocker**: Optionally block sending low-score prompts (configurable threshold)
- **Smart Persistence**: Survives SPA navigation and automatically resets after sending
- **Multi-site Support**: Works on ChatGPT, Claude (with grid layout fix), and Gemini

---

## 📸 How It Works

1. **Type your prompt** on any supported LLM site
2. The extension **analyzes** it using Chrome's on-device AI
3. See your **PBI score** + axis breakdown in real-time
4. Get a **sarcastic Korean critique** (님아...) and actionable fix
5. Click **⚡ Refine** to auto-improve your prompt

---

## 🔧 Installation

### Prerequisites

- **Chrome 138+** (or Canary/Dev channel with AI features)
- Enable `chrome://flags/#language-model-api` → **Enabled**
- Enable `chrome://flags/#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**

### Load Extension

1. Clone this repository:
   ```bash
   git clone https://github.com/lovebubbly/PBT.git
   ```

2. Open `chrome://extensions`

3. Enable **Developer mode** (toggle in top-right)

4. Click **Load unpacked** → select the `PBT` folder

5. Visit [ChatGPT](https://chatgpt.com), [Claude](https://claude.ai), or [Gemini](https://gemini.google.com)

---

## 🎛️ Configuration

Click the extension icon to open the popup:

| Setting | Description |
|---------|-------------|
| **Enable PBI Checker** | Toggle extension on/off |
| **Block Low Scores** | Dim send button if PBI < 30% |
| **Debug Mode** | Log detailed analysis info to console |

---

## 🏗️ Architecture

```
PBT/
├── manifest.json                    # Extension configuration (Manifest V3)
├── background.js                    # Service worker for settings & messaging
├── content.js                       # Main logic: AI analysis, dashboard injection
├── popup.html                       # Extension popup UI
├── popup.js                         # Popup interaction logic
├── styles.css                       # Toss-inspired premium styling
├── frontend-design-philosophy.md    # Design system guide for AI agents
└── icons/                           # Extension icons
```

### Key Technical Details

- **AI Integration**: Uses the global `LanguageModel` API with dual-mode sessions (analysis + refinement)
- **Session Management**: Reuses AI sessions for performance, destroys on error for retry
- **SPA Support**: MutationObserver + URL monitoring handles dynamic page changes and navigation
- **Debouncing**: 1.5s delay before analysis to avoid excessive calls
- **Design System**: Follows Toss-style philosophy (see `frontend-design-philosophy.md`)
- **Claude Compatibility**: Special grid layout injection logic to prevent UI breaking

---

## 🌐 Supported Sites

| Site | Status |
|------|--------|
| chatgpt.com | ✅ Supported |
| chat.openai.com | ✅ Supported |
| claude.ai | ✅ Supported |
| gemini.google.com | ✅ Supported |

---

## 🎨 Design Philosophy

This project follows a **Toss-inspired Korean Web App Design System**. See [`frontend-design-philosophy.md`](frontend-design-philosophy.md) for:

- **Color System**: Deep Black (#101013), Toss Blue (#3182F6), semantic grays
- **Glassmorphism**: `backdrop-blur-md`, subtle borders, premium shadows
- **Typography**: Pretendard Variable with optimized letter spacing
- **Animations**: Custom cubic-bezier easing (0.22, 1, 0.36, 1) for smooth transitions

---

## 🗺️ Roadmap

- [ ] Chrome Web Store publishing
- [ ] Multi-language critique support (EN, KO, JA)
- [ ] Session history & analytics dashboard
- [ ] Custom scoring rubric configuration
- [ ] Firefox/Edge support via WebExtensions API

---

## 📜 License

MIT License © 2026

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a PR.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

<p align="center">
  <strong>Stop Brainrot. Start Engineering.</strong><br>
  🧠⚡
</p>

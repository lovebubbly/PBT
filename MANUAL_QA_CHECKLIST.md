# PBI Checker Manual QA Checklist

## Scope
- Build under test: Facelift runtime (`content.js`, `styles.css`, `popup.html`, `popup.js`)
- Target date: 2026-02-13
- Browsers: Chrome 138+ (or Canary/Dev with on-device model flags)

## Preflight
1. Open `chrome://flags/#language-model-api` and set to `Enabled`.
2. Open `chrome://flags/#optimization-guide-on-device-model` and set to `Enabled BypassPerfRequirement`.
3. Reload browser and reload unpacked extension.
4. In popup, ensure `Enable PBI Checker` is ON.

## Core Smoke (All Sites)
Sites:
- `https://chatgpt.com`
- `https://claude.ai`
- `https://gemini.google.com`

1. Injection
- Step: Open each site chat screen.
- Expect: Widget appears near composer when input length >= ~8 chars.
- Fail if: Widget overlays composer permanently or never appears.

2. Idle -> Auto Analyze
- Step: Type 20+ chars and pause.
- Expect: Status moves to `Analyzing...` then `Analysis complete`; score shown.
- Fail if: Spinner hangs forever or score never updates.

3. Manual Analyze
- Step: Click `Analyze` on same text.
- Expect: Fresh analysis runs and status updates.
- Fail if: Button does nothing.

4. Details Panel
- Step: Click `Details` then `Collapse`.
- Expect: Axis bars and values expand/collapse smoothly.
- Fail if: Layout jumps or controls become unclickable.

5. Refine Flow
- Step: Click `Refine` after a completed analysis.
- Expect: Prompt text in composer is replaced, then re-analysis runs automatically.
- Fail if: Text replaced but no follow-up analysis appears.

## Send Guard Behavior
1. Guard OFF
- Setup: Popup `Block Low Scores` OFF.
- Step: Send low-scoring prompt.
- Expect: Send works normally.

2. Guard ON (Low score)
- Setup: Popup `Block Low Scores` ON.
- Step: Use low score prompt and click send or press Enter.
- Expect: Send blocked; guard message appears in widget.
- Fail if: Composer freezes permanently.

3. Guard ON (Edited after analysis)
- Step: After low-score analysis, edit prompt text slightly.
- Expect: Guard should not block based on stale score before next analysis.
- Fail if: Still blocked with outdated score.

4. Disable Extension Recovery
- Step: While guard is ON, toggle `Enable PBI Checker` OFF.
- Expect: Widget removed and send works immediately.
- Fail if: Send remains blocked after disable.

## SPA / Lifecycle Stability
1. Chat Switch Reset
- Step: Move between different chats within same site (no full reload).
- Expect: Widget resets state and rebinds correctly.
- Fail if: Duplicate widgets or dead buttons.

2. Long Session Stability
- Step: Keep tab open 10+ minutes with multiple analyses/refines.
- Expect: No exponential lag; single widget; controls still responsive.
- Fail if: multiple repeated reactions per click/input.

## Popup Verification
1. Supported Site
- Step: Open popup on supported tab.
- Expect: `Current Site`, `AI Availability`, `Runtime Mode`, `Last Score` reflect real runtime.

2. Unsupported Site
- Step: Open popup on non-supported domain.
- Expect: Site = `Unsupported`, runtime not injected.

3. Toggle Sync
- Step: Toggle `Debug Mode`, `Block Low Scores`, `Enable`.
- Expect: Changes apply instantly in active tab behavior.

## Responsive Check
1. Narrow Width
- Step: Shrink browser width under ~780px.
- Expect: Widget stacks cleanly; buttons remain reachable.
- Fail if: buttons clip or overlap composer input.

## Pass Criteria
- No blocker severity issues in any core smoke item.
- No permanent send lock.
- No duplicated widget/listener symptoms during navigation.

## Bug Report Template
- Site:
- URL pattern:
- Steps to reproduce:
- Expected:
- Actual:
- Console errors (if any):
- Screenshot/video:

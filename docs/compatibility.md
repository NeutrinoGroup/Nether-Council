# Cross-Browser & Mobile Compatibility Audit (Gate G5 T17)

## 1. Overview & Evaluation Scope

Nether-Council is a real-time full-duplex conversational voice application requiring low-latency Web Audio playback, continuous microphone streaming via WebSocket, live bilingual subtitle rendering, and Canvas-based identity card export.

This audit evaluates compatibility across desktop, mobile, and constrained in-app browser environments:

| Environment | OS / Version | Engine / Browser | Input & Media Devices | Web Audio & Ducking | Subtitles & Canvas Export | Status |
|-------------|--------------|------------------|-----------------------|---------------------|---------------------------|--------|
| **Mac Desktop** | macOS 14+ | Google Chrome 120+ | ✅ Full Support | ✅ Full (AudioContext + GainNode) | ✅ Smooth Canvas 2D + PNG download | **Tier 1 Supported** |
| **Mac Desktop** | macOS 14+ | Apple Safari 17+ | ✅ Full Support | ✅ Full (User gesture activated) | ✅ Smooth Canvas 2D + PNG download | **Tier 1 Supported** |
| **iPhone** | iOS 16.4 ~ 18.0 | Mobile Safari (WebKit) | ✅ Full Support (Touch start) | ✅ Supported (Gesture resume) | ✅ Mobile touch download + Share API | **Tier 1 Supported** |
| **Android** | Android 12 ~ 14 | Chrome Mobile | ✅ Full Support | ✅ Full Support | ✅ Canvas + Web Share API | **Tier 1 Supported** |
| **WeChat (微信)** | iOS / Android | WeChat In-App WebView | ⚠️ Mic restricted by WKWebView/X5 | ⚠️ Autoplay & background throttled | ✅ Readable; export works | **Guided to External Browser** |
| **Xiaohongshu (小红书)** | iOS / Android | XHS In-App WebView | ⚠️ Mic permission degraded | ⚠️ Autoplay blocked without gesture | ✅ Readable; export works | **Guided to External Browser** |

---

## 2. In-App Browser Guidance (WeChat & Xiaohongshu)

Mobile social apps frequently sandbox or disable WebRTC `getUserMedia()` within their embedded WebViews. To ensure users are not blocked with opaque permission errors:

1. **User Agent Detection (`InAppBrowserBanner.tsx`)**:
   - Detects `MicroMessenger` (WeChat), `xhs` / `XhsMediaPlatform` (Xiaohongshu), and `Weibo`.
2. **Prominent Alert Banner**:
   - Amber alert displayed at the top of the encounter screen with explicit step-by-step instructions:
     - **Chinese**: *“检测到您正在应用内置浏览器中打开，麦克风与音频权限受限。请点击右上角「…」选择「在浏览器中打开」以体验完整全双工实时对话。”*
     - **English**: *“Microphone access is restricted in in-app browsers. Please tap '…' at the top right and select 'Open in Browser' for full duplex voice.”*
3. **Safe Fallback**:
   - Even if opened in an in-app browser, the visual 3D stage, story examples, card reviews, and referral links remain readable.

---

## 3. Mobile Viewport & Touch Optimization

- **Safe Areas**: Managed via `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- **Control Deck & Buttons**:
  - Minimum touch targets of 44×44px for all mobile action buttons (`.deck-btn`, `.start-button`).
  - Horizontal chip scroll for character selection chips on narrow screens (`< 900px`).
- **Audio Context Activation**:
  - `AudioContext` is suspended until user clicks "开麦 / Turn on mic", complying with iOS Safari strict autoplay policies.

---

## 4. Verification Commands

```bash
# E2E cross-device Playwright specs (Desktop 1440x1000 + Mobile 390x844 touch)
pnpm test:e2e

# Real voice integration tests across audio codecs and interruption
pnpm test:integration
```

# 已知问题、边界条件与应对措施 (Known Issues & Boundary Notes)

## 1. 社交应用内置浏览器（微信、小红书）音频权限限制

- **现象**：微信（`MicroMessenger`）或小红书（`xhs`）内置 WebView 沙箱环境对 WebRTC / `navigator.mediaDevices.getUserMedia` 有严格限制，可能会静默拒绝麦克风录音权限或阻塞 Web Audio 自动播放。
- **应对措施**：
  - 应用已内置 `InAppBrowserBanner` 嗅探器，在检测到内嵌 WebView 时，在页面顶部弹出高对比度琥珀色警示框。
  - 明确引导用户点击右上角「···」菜单，选择「在 Safari / Chrome 中打开」。

---

## 2. 移动端 iOS Safari 音频上下文策略 (User Gesture Policy)

- **现象**：iOS Safari 要求 `AudioContext` 必须由显式的用户触摸事件（`touchend` / `click`）驱动恢复，禁止未交互前自动播放背景音或接听语音。
- **应对措施**：
  - 页面加载时默认保持空闲（Idle）视图，用户必须主动点击“开麦，找神仙聊聊”（`.start-button`）后，底层 `VoiceClient` 才会执行 `audioContext.resume()` 并申请麦克风流，严格符合 WebKit 安全策略。

---

## 3. Vercel Hobby 免费版运行时日志保留期边界

- **现象**：Vercel 免费套餐（Hobby Plan）仅保留过去 30 分钟的运行时日志（Runtime Logs）。超过 30 分钟的 `--since` 查询会被 Vercel API 拦截（返回 HTTP 400）。
- **应对措施**：
  - 遥测收集脚本 `scripts/collect-telemetry.ts` 默认设置 `--since 30m`。若需长期留存生产遥测事件，建议将日志流转导出至外部日志仓库或升级团队版。

---

## 4. 全双工中继防刷与连接额度边界

- **现象**：单一 WebSocket 会话被恶意滥用上传过量垃圾音频。
- **应对措施**：
  - 中继端点执行四重防刷：
    1. 单包大小限制：1MB 最大载荷；
    2. 音频上传速率监控：超出 32KB/s 持续流速立即断开；
    3. 全局单次会话上限：最长 3 分钟自动终止录音；
    4. 签名会话有效期保护：过期 Cookie 立即返回 401。

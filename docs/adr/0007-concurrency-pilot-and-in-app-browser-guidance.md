# ADR 0007: 10 客户端真实并发中继与受限应用内浏览器引导策略

## 状态
已采纳（Accepted）

## 上下文
在推进 Gate G5 10 人试场与真实并发压测时，系统面临两个关键生产环境挑战：
1. **中继链路的跨域并发稳定性**：Vercel Serverless WebSocket (`@vercel/functions upgradeWebSocket`) 需与阿里云 Qwen Realtime WebSocket 服务端维持长连接。当多个独立真实客户端发起并发交互时，必须避免因香港节点出口 DNS IPv6 解析黑洞或跨国握手超时导致的 `UPSTREAM_UNAVAILABLE`。
2. **移动端内置浏览器（微信、小红书）的音频沙箱限制**：在真实的万圣节派对与社交传播场景中，参与者普遍通过微信扫码或小红书私信链接进入。iOS/Android 的 WebView 会默认静默禁止 `getUserMedia()` 麦克风录音权限，或限制 Web Audio 自动播放，导致用户困惑于“为什么听不到声音或无法开麦”。

## 决策

1. **中继传输配置规范**：
   - 在 `relayVoice` 的 upstream WebSocket 连接中显式指定 `{ family: 4, handshakeTimeout: 20_000 }`，确保中继函数在香港等边缘节点通过成熟稳定的 IPv4 路由直连通义千问 API，避免偶发性 DNS 解析挂起。
   - 保留每秒 32KB 的匀速音频吞吐配额与 128KB 缓冲区背压保护。

2. **多轮双工压测节拍规范**：
   - 制作标准 16kHz 16-bit 单声道真实发音声学样本，采用 100ms（3200 字节）物理切片均匀上传。
   - 在每段语音结束时连续流式输入 15 块（1.5s）静音数据，精准触发 Qwen 的 `smart_turn_v2` 神经网络 VAD 停顿判定（`speech_stopped`）并生成回复。
   - 客户端在接收到助手首段有效音频后，通过 `response.cancel` 优雅截断并消费 `response.done`，隔离各轮次间的音频流残余。

3. **受限环境嗅探与外部浏览器引导**：
   - 实现 `InAppBrowserBanner` 组件，使用 React `useSyncExternalStore` 订阅客户端 User Agent，识别 `MicroMessenger`、`xhs`、`XhsMediaPlatform`、`Weibo` 等内嵌 WebView 环境。
   - 渲染醒目的琥珀色引导横幅，明确提示用户“点击右上角「…」在系统浏览器中打开”，在尊重平台限制的同时保障完整的全双工实时交互体验。

## 后果
- 经生产正式环境（`https://nether-council.vercel.app`）实测，10 个独立客户端并发执行 3 轮交互持续 120 秒，取得 **30/30 成功率（100%）**，平均首次语音延迟（TTFA）保持在 402ms ~ 785ms。
- 微信与小红书等社交入口具备自解释引导能力，避免了不可排查的静默录音失败。

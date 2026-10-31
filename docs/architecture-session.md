# 会话边界

`packages/contracts` 是 Web 与中继共同使用的运行时 schema。消息必须带协议版本、随机 eventId、sessionId、连接 epoch、递增 seq；PCM 每条应用消息上限 64 KiB。未知字段和客户端自选上游地址被拒绝。

`packages/party-core` 是不依赖 React 的状态与时间预算。重连最多三次，增加 epoch，保留原始绝对到期时间。断开或打断后丢弃旧 response。身份结果只能从 finalizing 接收一次。字幕由 session、epoch、response、segment 和 revision 共同约束。

`apps/web/src/shared/server/tickets.ts` 使用 HMAC-SHA256 与恒定时间签名比较。session、campaign 与 referral 是不同 purpose 的载荷，运行时分别校验。来源 token 不授予语音权限；session 到期不能超过活动窗口。签名密钥至少 32 字符，空密钥关闭授权。

这些结构不提供跨 Vercel 实例的全局连接锁或精确计数。后续中继在每条连接上检查截止时间、顺序和音频预算；客户端重连也沿用原票据。

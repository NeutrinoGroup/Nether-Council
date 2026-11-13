# ADR 0012：身份卡分享凭证与原会话归属

日期：2026-11-07。范围：T12/T18 的身份卡分享及卡片事件；不延长语音、结果生成或活动窗口。

## 问题

原卡片依赖 235 秒有效的 `nc_session` Cookie。卡片展示后继续下载、复制时，原 Cookie 可能已过期；同浏览器另一个标签页开聊又会覆盖 Cookie，导致卡片邀请被错误归因给新会话。卡片语言切换还会重新申请邀请，在网络失败时用缺少签名来源的地址替换已有二维码。

## 决策

`POST /api/sessions` 附带返回 `share: { token, expiresAt }`。`kind: share` 的签名载荷绑定最初 session、campaign、visitorId 及上游 sourceSessionId。截止时间固定为 `min(session.createdAt + 24h, campaign.expiresAt)`；原 session 的 235 秒期限保留，凭证不会通过活动邀请或语音会话 schema。

前端按 sessionId 存在标签页的 sessionStorage，禁用存储时保留内存副本。请求 `/api/referrals` 或卡片事件时通过 `X-Nether-Share` 发送；不把它放入 URL、二维码或遥测。该头显式存在但无效时拒绝，不能回退到共享 Cookie。卡片的分享请求必须同时携带自己的 sessionId；旧客户端无此头时仍可使用有效、匹配的会话 Cookie。

分享凭证只允许六类事件：`conversation_completed`、`card_rendered`、`card_download_clicked`、`card_download_created`、`invite_copied`、`share_invoked`。事件身份从签名上下文恢复；公开邀请的来源是当前卡片 sessionId，遥测的上游来源仍为原 sourceSessionId。公开 referral token 不具备本人卡片事件权限。

语音握手、新建会话、生成结果三个端点拒绝携带此头的请求。持有人仍可通过原活动邀请，在活动政策允许时新建独立会话；分享凭证自身不授予付费权限。

卡片缓存本次成功获得的公开分享 URL。切换中英文只改 `lang`，不重新申请权限。新 session/result/character 清除旧卡片归属；分享请求失败展示重试，不能伪造无签名来源的成功邀请。

## 限制

签发于入场的凭证不是模型已生成专属结果的证明。完成事件仍是经原会话绑定的客户端上报；真实漏斗必须结合实际用户行为，不能据此宣称真人验收通过。签名凭证不提供即时撤销或每人配额；现有活动关闭与语音开关继续控制新付费连接。无新增数据库表、密钥或第三方请求。

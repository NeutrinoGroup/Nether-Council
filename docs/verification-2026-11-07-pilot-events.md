# 试场事件与来源链路验证 · 2026-11-07

本轮修复实际代码中的测量缺口，没有新增真人或实体设备验收结果。独立红色圆形嘴部仍禁止添加；孟婆保留原始 GLB 面部。

## 缺陷与修复

1. `session.ready` 曾提前记录开聊。现在只在首个有效 final 用户故事后发送；重连、重复字幕和 demo 不增加次数。
2. 卡片编码完成曾提前报 `card_rendered`，且从未发送 `conversation_completed`。现在等当前预览可见后发送，通用 fallback 不算个性化完成，昵称/语言重绘不重复。
3. Next 转发缺少 Python 必需的 `campaignId`。现在用签名会话覆盖活动、模式、角色、语言、来源和可选匿名访客，再将实际 HMAC 载荷交 Python parser 验证。
4. 旧报表依赖没有发送方的 `referred_conversation_started`。现在从实际开聊与签名来源推导，排除同设备自测和回访，缺失来源证据单列 unknown。人数仍需真人去重记录。

## 可复现验证

- `pnpm exec vitest run tests/integration/voice-client.test.ts tests/integration/visitor.test.ts`：23 项通过；红测先复现提前开聊、start/prewarm 缺少访客标识。
- `pnpm exec vitest run tests/integration/telemetry.test.ts tests/integration/telemetry-route.test.ts`：9 项通过；先复现 route 缺少签名访客上下文与 report 来源误计。
- 卡片桌面与移动视口 E2E：10 项通过；红测捕获 card_rendered 时预览尚未可见。PNG `toBlob` 在本机有超过 5 秒的回调，卡片就绪等待采用 spec 的 10 秒预算，保留实际编码和扫码断言。
- `pnpm verify:telemetry-bridge`：实际 Next admission/referral/events → Python HMAC/parser 的三条测试链路通过，覆盖主持、好友和旧客户端；篡改载荷全部拒绝。只拦截外部 HTTP，不替换 route、签名或 Python parser。
- `uv run --project services/data --frozen pytest services/data/tests -q`：本机 30 passed / 11 skipped。跳过项全部依赖本机未运行的 PostgreSQL，CI data job 使用真实 PostgreSQL 执行。
- `pnpm check`：基于合并 PR #35 后的 main 通过 lint、typecheck、111 项单元/集成测试、资产哈希检查与生产构建。

完整检查与 CI 结果以本 PR 记录为准。测试凭据为临时 fixture，不访问真实供应商或生产数据库，不输出会话载荷。

## 剩余边界

生产 Python ingestion/Supabase 尚未部署，本轮不能证明生产持久化。访客 UUID 来自浏览器，存储清除、多人共用浏览器、跨设备与日志缺口会影响估算。未新增真人试听、实体手机、现场音响、第二台实体设备扫码、10/50 人试场证据。

独立账号分享弹窗仍使用无效的固定邀请值，需要单独修复；身份卡在会话过期后重新请求来源签名或提交遥测仍可能失败。它们不因本轮事件修复自动视为通过。

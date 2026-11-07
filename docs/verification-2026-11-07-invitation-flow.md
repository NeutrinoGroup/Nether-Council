# 活动邀请与账号分享验证 · 2026-11-07

本轮修复 T12/T18 的软件链路缺陷，不代替第二台实体设备或真人体验验收。角色面部遵守仓库约束，没有添加独立嘴部。

## 复现

原账号分享弹窗将 `invite=halloween` 和用户公开 `nc_...` 推荐码写进二维码。它们不符合服务端 CampaignClaims/ReferralClaims 签名，无法授权朋友开聊。旧测试只验证 PNG data URL 的格式、图片可见和复制提示，不能证明扫码入场。

- route 红测：已有有效活动邀请、但尚无语音会话时，分享返回 401；请求英文入口却返回中文；无效请求体没有被校验。9 项测试中 3 项失败。
- UI 红测：4 项失败，分别为缺少有效邀请拦截、没有请求服务端分享地址、复制失败仍显示成功、请求失败无法重试。
- 新增真实 HTTP 浏览器链路红测：登录后打开弹窗，没有发起 `/api/referrals` 请求，45 秒超时。该测试不替换 sessions/referrals/events 路由。

## 行为边界

有已授权语音会话时，分享链接携带签名的当前会话来源。没有语音会话时，只能传播已有且通过验签的活动邀请，不伪造来源；活动必须匹配当前配置，并至少还剩 235 秒入场预算。登录账号和公开用户推荐码不产生付费模型权限。

Google 登录前仅暂存 `/` 或 `/play` 的 invite/ref/character/lang 与时间；成功返回后一次性恢复，超过 10 分钟或非允许路径丢弃。不保存 hostCredential、OAuth code 或任意外部跳转地址。服务端重新验签真正的活动权限。

浏览器二维码验证使用两个独立 Chromium 上下文、真实 HTTP 路由、测试签名配置和本地语音协议桩。它验证二维码像素、朋友入场与来源绑定，不证明真人语音、Qwen 回复、实体设备扫码或现场声音。

## 已确认结果

- `pnpm exec vitest run tests/integration/referral-admission.test.ts tests/integration/telemetry-route.test.ts tests/integration/verdict.test.ts`：19 项通过。
- `pnpm verify:telemetry-bridge`：实际 Next 载荷与 Python HMAC/parser 桥接通过。
- `pnpm exec vitest run tests/integration/entry-context.test.ts`：11 项通过，覆盖登录回跳白名单、一次性消费与失效。
- 账号分享桌面／手机浏览器测试：16 项通过，包含无效邀请、服务端签名链接、到期禁用、复制失败与重试。
- `pnpm test:e2e:invitation`：4 项通过，解码实际二维码像素后，由独立浏览器上下文经真实 HTTP 路由创建新会话并校验来源。
- `pnpm check`：lint、类型检查、22 个测试文件／130 项单测、GLB 来源与资源校验、Next.js 生产构建全部通过。
- 独立只读审查未发现阻塞问题；`git diff --check` 通过。
- 前序 PR #36：CI data 41 项真实 PostgreSQL 测试通过；CI check 与 Vercel 通过后合并为 `7cfe9727589194d7fdb0faae3e755cbb40dbe685`。正式健康接口返回 revision `7cfe97275891`。
- 在前序 PR #36 的受保护预览上，通过 Vercel CLI 鉴权提交 2 个合成入口事件及 1 次重复。采集到 3 条服务端记录，去重为 2 条，并逐一匹配探针事件 ID。证据保存在本机 `artifacts/g0/telemetry-probe-20261107.json`、`artifacts/g0/telemetry-probe-dedup-20261107.json` 与 `artifacts/telemetry/events.json`。这是日志采集证据，不计入真实参与者指标；日志留存、截断、最多 1000 条、延迟入库与未采集时段仍是盲区，不能证明生产数据库持久化。

身份卡在原会话过期后的分享凭证与跨标签页归属仍需后续单独处理；本轮不延长语音会话期限。

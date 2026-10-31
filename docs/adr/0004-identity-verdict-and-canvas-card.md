# ADR 0004：身份评价生成、暖收尾口播与 Canvas 身份卡分享

日期：2026-11-01。范围：Gate G3 的 T11/T12。基于现有 Next.js、Zod 契约、Qwen 文字模型适配器与 HTML5 Canvas，不引入外部图像生成模型或额外数据库。

## 身份生成与校验 (T11)

- 依据 `specs/001-halloween-party/spec.md` FR-06，专属结果必须基于至少一轮已确认的真实用户表达（`storyTurns > 0`）。若无有效表达，直接返回 `NO_STORY` 错误，绝不伪造个性化称号。
- 服务端生成器 `generateIdentity`：
  - 提示词严格约束输出 JSON 格式，包含双语字段：`title`（中文 ≤ 18 字，英文 ≤ 64 字符）、`verdict`（中文 ≤ 60 字，英文 ≤ 180 字符）、`warmClosing`（中文 ≤ 50 字，英文 ≤ 160 字符）、`tags`（2–3 个趣味标签）以及 `sourceTurnIds`。
  - 采用 `@nether/contracts` 中的 `ResultContent` 与 `validateResultSources` 进行运行时 schema 校验，确保所引用的 `sourceTurnIds` 确实属于本会话确认的用户故事话轮，杜绝幻觉引用。
  - 请求设置 4500ms 有界超时，失败重试一次；若两次均失败，降级返回符合契约格式的明确标注通用来宾卡（`fallback: true`），保证体验不卡死。
- 口播闭环：
  - 在 WebSocket 收到 `session.finalize` 后，中继生成结果并通过 `ServerMessage` 发送 `type: "result"`。
  - 同时向现有 Qwen 全双工上游注入 `conversation.item.create` 携带 `warmClosing` 受控口播文本，并触发 `response.create`，孟婆在 3D 画布中直接进行暖心收尾口播。
  - 口播失败或中断不撤销已生成的身份结果。
- 本地缓存与幂等：
  - 客户端通过 `sessionStorage` 记录 `nc_result_${sessionId}`，避免重连或重复请求重新开奖。
  - 提供 HTTP `POST /api/verdict` 接口作为 WebSocket 异常断开时的安全备用链路。

## 身份卡渲染与分享 (T12)

- 目标输出 1080×1440 高分辨率竖版 PNG。
- 采用原生 2D Canvas 离线绘制：
  - 背景：南瓜暗调氛围渐变（`#160d13` → `#070406`）与径向橘光，双层饰边框。
  - 字体加载：绘制前等待 `document.fonts.ready`，使用打包的 `@fontsource/ma-shan-zheng`（中式手书）与 `@fontsource/bungee`。
  - 隐私保护：用户可在预览页随时勾选“隐去具体经历评价”，勾选后评价框替换为中立占位文案，不展示私人经历细节；可修改卡片称呼，无需重新调用模型。
  - 二维码：使用 `qrcode` 生成黑白高对比度模块与充足留白静区（quiet zone），节日装饰严格位于码区外，确保任何手机扫码 App 均可即时识别。
  - 邀请与归因：二维码指向正式域名 URL，携带活动通行证 `invite` 与签名推荐标识 `ref`。
  - 接口 `POST /api/referrals` 使用 HMAC-SHA256 签发 7 天有效的匿名来源凭证，受 `sameOrigin` 与会话有效性防护。
- 分享操作：
  - 一键导出 1080×1440 PNG 文件并触发浏览器下载。
  - 复制个性化中英分享文案（带生成的称号与链接）。
  - 复制邀请链接。
  - 当移动端浏览器支持时，唤起原生系统分享面板（Web Share API）。
  - 每次渲染、下载、复制与分享均发送匿名遥测事件（`card_rendered`、`card_download_clicked`、`card_download_created`、`share_invoked`、`invite_copied`）。

## 验证与证据

- Vitest 新增 8 项单元／集成测试（`tests/integration/verdict.test.ts`、`tests/integration/card.test.ts`），全套 41 项单元测试全部通过。
- Playwright E2E 覆盖身份卡生成、隐去评价、修改昵称、复制文案、PNG 下载拦截及移动端视口（`tests/e2e/verdict.spec.ts`），全套 16 项 E2E 测试全部通过。
- 视觉产物捕获至 `.impeccable/review/desktop-verdict-card.png` 与 `mobile-verdict-card.png`。

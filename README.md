# Nether Council · 黄泉议会

中式神仙 × 西式万圣派对 × 当代生活梗。通过 Web 与经典角色全双工语音互动，带走一张专属身份卡，邀请朋友继续体验。

- [产品规范](specs/001-halloween-party/spec.md)
- [实施计划](specs/001-halloween-party/plan.md)
- [任务与验收](specs/001-halloween-party/tasks.md)
- [实施进展与证据](docs/progress.md)

项目按单角色语音、真实 GLB、完整流程、七角色、10 人试场、50 人试用的顺序实施。真实 API、设备与用户验收的结果单独记录。

## 本地运行

要求 Node.js 24 或 25、pnpm 11.1.1。

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm probe:providers
```

环境变量见 `.env.example`，在被忽略的 `.env` 或 `.env.local` 配置。浏览器永远不直接取得厂商密钥。当前入口仅为准备页，真实对话按任务闸门逐步开放。

`pnpm dev` 用于界面；WS 开发使用 `pnpm dev:voice`（Vercel CLI）。正式验收仍需 HTTPS 预览及真实设备。探测命令会实际调用已配置的语音和文字接口，3D 仅查询不存在任务，不提交生成；报告不含凭据。普通 CI 不调用付费模型。

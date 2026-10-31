# 实施进展与证据

最后更新：2026-11-01（Asia/Shanghai）。本页只记录已有证据，验收清单的勾选仍以每项完整通过为准。

## 当前状态

- 两份用户附件与仓库中的 plan、spec 逐字一致。
- 开始实施时远端没有分支／提交，本地只有规范、环境示例与忽略文件。
- GitHub 已登录 `moonhotline`，仓库可写；Vercel 连接可访问 `oodai` 团队。
- 用户补充配置后重新读取 `.env`：语音、3D 变量均有值，未输出凭据。真实 Qwen WS 返回 `session.created`；`qwen3.6-flash` 文字请求 HTTP 200。
- 混元密钥在 TokenHub `https://tokenhub.tencentmaas.com/v1/api/3d/query` 查询不存在任务时返回 HTTP 401 / `401002`；尚未核实密钥所属平台，不计为权限通过。原始匿名报告在忽略的 `artifacts/g0/providers.json`。
- 初始化阶段不生成其余六个角色，不把占位模型、模拟语音或自动化浏览器代替真人验收。

## PR 交付

初始空仓库先建立规范基线，后续实现通过可独立审查的 PR 提交与合并。实际 PR 地址、验证命令及结果如下。

- [PR #6](https://github.com/NeutrinoGroup/Nether-Council/pull/6)：工程、CI、健康检查与厂商探测，已合并；GitHub Actions 通过（48 秒）。
- 会话协议 PR：增加严格 schema、签名票据、纯状态机与事件隔离测试。`pnpm check` 本机通过；待 PR CI 与中继集成后继续核验 T04。

## 部署与运行时配置

- Vercel 项目：`oodai/nether-council`，Node 24、Next.js、`apps/web`、Fluid Compute、默认 300 秒函数时限。首个部署自动成为 production，准备页 [nether-council.vercel.app](https://nether-council.vercel.app) 健康检查通过。
- 连接器写项目被拒绝，本机 CLI 自有凭据成功创建并部署；Git 连接因 Vercel 对仓库权限不足未接通，当前使用本机 CLI 上传，不声称 push 自动部署。
- 已通过 CLI 为 preview / production 配置厂商变量与独立 session、campaign、referral、host 密钥；公开变量按 Config 保存，密钥按 Secret 保存。环境是否在函数中正确生效仍由后续真实 smoke 检验。
- [PR #7](https://github.com/NeutrinoGroup/Nether-Council/pull/7) 已通过 CI（42 秒）并合并。中继在后续 PR 集成严格消息、截止清理、上游取消和 64 KiB 输出切片。
- `tests/integration/relay.test.ts` 使用本机测试协议端点验证桥接行为；它不是厂商或真人语音验收。语音入口仍是准备页，完整结束、结果与翻译尚未实现。

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

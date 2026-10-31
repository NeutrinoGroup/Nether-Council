# 实施进展与证据

最后更新：2026-11-01（Asia/Shanghai）。本页只记录已有证据，验收清单的勾选仍以每项完整通过为准。

## 当前状态

- 两份用户附件与仓库中的 plan、spec 逐字一致。
- 开始实施时远端没有分支／提交，本地只有规范、环境示例与忽略文件。
- GitHub 已登录 `moonhotline`，仓库可写；Vercel 连接可访问 `oodai` 团队。
- 用户补充配置后重新读取 `.env`：语音、3D 变量均有值，未输出凭据。真实 Qwen WS 返回 `session.created`；`qwen3.6-flash` 文字请求 HTTP 200。
- 混元密钥在 TokenHub 查询曾返回 HTTP 401 / `401002`。重新核对官方旧接口后，`https://api.ai3d.cloud.tencent.com/v1/ai3d/query` 使用原始 Authorization key 返回 HTTP 200 / `FailedOperation.JobNotFound`，已确认旧平台鉴权。随后提交唯一一份孟婆 textTo3D 3.1、目标 30000 面、PBR 任务；当前 RUN，尚未取得 GLB，不计导出通过。报告在忽略的 `artifacts/g0/hunyuan-legacy.json` 和 `artifacts/g2-model/`。
- 初始化阶段不生成其余六个角色，不把占位模型、模拟语音或自动化浏览器代替真人验收。

## PR 交付

初始空仓库先建立规范基线，后续实现通过可独立审查的 PR 提交与合并。实际 PR 地址、验证命令及结果如下。

- [PR #6](https://github.com/NeutrinoGroup/Nether-Council/pull/6)：工程、CI、健康检查与厂商探测，已合并；GitHub Actions 通过（48 秒）。
- [PR #7](https://github.com/NeutrinoGroup/Nether-Council/pull/7)：会话协议、签名票据、纯状态机与事件隔离测试；CI 通过并合并。
- [PR #8](https://github.com/NeutrinoGroup/Nether-Council/pull/8)：服务端中继、AudioWorklet、ws 外部化与开场请求；CI 通过，2026-10-31 18:26 UTC 合并，main 为 `41730cc`。
- 当前 `codex/browser-duplex`：`/play` 中英原文字幕、真正 AudioWorklet 上传／24kHz 播放、插话清队列、静音、最多三次重连及原截止时间保持。`pnpm check` 通过（19 项 Vitest），6 项 Playwright 通过。测试使用 Chromium 模拟麦克风和协议夹具，涵盖边播边传、打断后的旧音频、静音停止上行与恢复、自然播完恢复、结束及入口参数保留；不计真人或真实手机验收。

## 部署与运行时配置

- Vercel 项目：`oodai/nether-council`，Node 24、Next.js、`apps/web`、Fluid Compute、默认 300 秒函数时限。首个部署自动成为 production，准备页 [nether-council.vercel.app](https://nether-council.vercel.app) 健康检查通过。
- 连接器写项目被拒绝，本机 CLI 自有凭据成功创建并部署；Git 连接因 Vercel 对仓库权限不足未接通，当前使用本机 CLI 上传，不声称 push 自动部署。
- 已通过 CLI 为 preview / production 配置厂商变量与独立 session、campaign、referral、host 密钥；公开变量按 Config 保存，密钥按 Secret 保存。环境是否在函数中正确生效仍由后续真实 smoke 检验。
- [PR #7](https://github.com/NeutrinoGroup/Nether-Council/pull/7) 已通过 CI（42 秒）并合并。中继在后续 PR 集成严格消息、截止清理、上游取消和 64 KiB 输出切片。
- `tests/integration/relay.test.ts` 使用本机测试协议端点验证桥接行为；它不是厂商或真人语音验收。完整结果与翻译尚未实现。
- 两个事件通过预览 `/api/events` 后收到 202，另重发一个重复 eventId。服务端日志采集 3 条，去重为 2 条，报告漏斗均为 0（仅探测事件）。日志有延迟，首次采集为 0 不算无事件；本机证据 `artifacts/g0/telemetry-probe.json`、`artifacts/telemetry/events.json`。
- 真实开场中继探针通过：[hkg1 预览](https://nether-council-zask58bqr-oodai.vercel.app)，模型 `qwen-audio-3.1-realtime-plus`／音色 `longanqian_v3.1`，ready 2356ms、首音频 3935ms、收到 449280 字节，发送取消。取消后仍有 23 个在途音频分片，因此客户端必须按 responseId 丢弃，不能只依赖取消上游。此前 sfo1 预览在约 12 秒的传输握手阶段失败；WS 路由现明确选 hkg1，诊断仅含阶段和有限错误码。该探针仍不是真人双工验收。
- 视觉复核指出的 reduced-motion 播放状态和键盘焦点对比问题已修复；6 张中英桌面／手机测试截图重新生成并核验，复核结论 ship。

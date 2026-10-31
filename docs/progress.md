# 实施进展与证据

最后更新：2026-11-01（Asia/Shanghai）。本页只记录已有证据，验收清单的勾选仍以每项完整通过为准。

## 当前状态

- 两份用户附件与仓库中的 plan、spec 逐字一致。
- 开始实施时远端没有分支／提交，本地只有规范、环境示例与忽略文件。
- GitHub 已登录 `moonhotline`，仓库可写；Vercel 连接可访问 `oodai` 团队。
- 用户补充配置后重新读取 `.env`：语音、3D 变量均有值，未输出凭据。真实 Qwen WS 返回 `session.created`；`qwen3.6-flash` 文字请求 HTTP 200。
- 混元旧接口 `https://api.ai3d.cloud.tencent.com/v1/ai3d/query` 使用原始 Authorization key 鉴权成功；TokenHub Bearer 接口与本账号不匹配。唯一一份孟婆 textTo3D 3.1／PBR 任务已 DONE，消耗 40 积分。原始 GLB 29557484 字节，优化后 1319240 字节，29992 个三角面、三张 2K WebP 贴图，几何未改动。来源、处理命令和哈希见 [资产清单](assets/meng-po.source.json)。
- 初始化阶段不生成其余六个角色，不把占位模型、模拟语音或自动化浏览器代替真人验收。

## PR 交付

初始空仓库先建立规范基线，后续实现通过可独立审查的 PR 提交与合并。实际 PR 地址、验证命令及结果如下。

- [PR #6](https://github.com/NeutrinoGroup/Nether-Council/pull/6)：工程、CI、健康检查与厂商探测，已合并；GitHub Actions 通过（48 秒）。
- [PR #7](https://github.com/NeutrinoGroup/Nether-Council/pull/7)：会话协议、签名票据、纯状态机与事件隔离测试；CI 通过并合并。
- [PR #8](https://github.com/NeutrinoGroup/Nether-Council/pull/8)：服务端中继、AudioWorklet、ws 外部化与开场请求；CI 通过，2026-10-31 18:26 UTC 合并，main 为 `41730cc`。
- [PR #9](https://github.com/NeutrinoGroup/Nether-Council/pull/9)：`/play` 中英原文字幕、AudioWorklet 上传／24kHz 播放、插话清队列、静音、最多三次重连及原截止时间保持。CI 通过并于 2026-10-31 19:24 UTC 合并，main 为 `b57588a`。19 项 Vitest、6 项 Playwright 通过，使用模拟麦克风和协议夹具，不计真人或真实手机验收。
- [PR #10](https://github.com/NeutrinoGroup/Nether-Council/pull/10)：CI 通过（1m29s），2026-10-31 19:58 UTC 合并为 `3d0f1c7`。实际混元 GLB 延迟加载、海报与明确失败状态、独立嘴部的实际播放 RMS 驱动、idle／听／说／打断／庆祝动作、减少动态效果与资源清理。手机字幕区可滚动，控制区在布局底部，避免覆盖字幕。`pnpm check` 通过，19 项 Vitest、8 项 Playwright 通过；新增实际 GLB 渲染、播放与停播的嘴部联动和 GLB 503 降级检查。桌面／手机中英六张截图已复核。

## 部署与运行时配置

- Vercel 项目：`oodai/nether-council`，Node 24、Next.js、`apps/web`、Fluid Compute、默认 300 秒函数时限。首个部署自动成为 production，准备页 [nether-council.vercel.app](https://nether-council.vercel.app) 健康检查通过。
- 连接器写项目被拒绝，本机 CLI 自有凭据成功创建并部署；Git 连接因 Vercel 对仓库权限不足未接通，当前使用本机 CLI 上传，不声称 push 自动部署。
- 已通过 CLI 为 preview / production 配置厂商变量与独立 session、campaign、referral、host 密钥；公开变量按 Config 保存，密钥按 Secret 保存。环境是否在函数中正确生效仍由后续真实 smoke 检验。
- [PR #7](https://github.com/NeutrinoGroup/Nether-Council/pull/7) 已通过 CI（42 秒）并合并。中继在后续 PR 集成严格消息、截止清理、上游取消和 64 KiB 输出切片。
- `tests/integration/relay.test.ts` 使用本机测试协议端点验证桥接行为；它不是厂商或真人语音验收。完整结果与翻译尚未实现。
- 两个事件通过预览 `/api/events` 后收到 202，另重发一个重复 eventId。服务端日志采集 3 条，去重为 2 条，报告漏斗均为 0（仅探测事件）。日志有延迟，首次采集为 0 不算无事件；本机证据 `artifacts/g0/telemetry-probe.json`、`artifacts/telemetry/events.json`。
- 曾成功的真实开场探针：[预览](https://nether-council-zask58bqr-oodai.vercel.app)，模型 `qwen-audio-3.1-realtime-plus`／音色 `longanqian_v3.1`，ready 2356ms、首音频 3935ms、收到 449280 字节，发送取消。取消后仍有 23 个在途分片，客户端必须按 responseId 丢弃。03:42 本地时间复测仍取得开场音频（ready 2609ms／首音频 3881ms），但取消后厂商返回 `invalid_value`，不能据此认为完整交互已通过。
- 握手诊断：PR #9 正式部署及早期 G2 预览曾出现 `HANDSHAKE_TIMEOUT`；函数内 `VERCEL_REGION=hkg1`、DNS 成功。外层日志的 sfo1 是边缘节点，不能据此推断函数地区或声称切换香港解决。单独指定 IPv4 后，新预览连续两次取得开场音频；移除临时 DNS 诊断后，[G2 预览](https://nether-council-ca0j7wnrj-oodai.vercel.app) ready 2451ms、首音频 4019ms、518400 字节并成功取消。保留主机名与 TLS 验证，未固定 IP 或更换模型。正式部署复测结果见下。
- 取消竞态已在真实厂商本机回放复现：`invalid_request_error / invalid_value / response.cancel / Conversation has no active response.`。中继仅在发过取消且字段精确匹配时吸收；回归测试先失败、修复后通过，并验证其他 `invalid_value` 仍然断开。详见 [ADR](adr/0002-single-character-browser-scene.md)。
- 视觉复核指出的 reduced-motion 播放状态和键盘焦点对比问题已修复；6 张中英桌面／手机测试截图重新生成并核验，复核结论 ship。

- 真实浏览器开场探针通过：同一 hkg1 预览，签名邀请 admission HTTP 200，AudioWorklet 与实际 Qwen 中继收到 11 个音频分片，播放分析器 RMS >0，首音频后仍上传 31 个麦克风分片，打断并结束成功。测试输入为 Chromium 合成麦克风，不计真人问答。预览保护需要 cookie；仅附 OIDC header 时 Worklet addModule 曾 AbortError，CLI 合法取得 bypass cookie 后通过。匿名证据 `artifacts/g1-voice/browser-real.json`。
- G2 预览真实浏览器复测通过：admission 200，实际 Qwen 音频 20 片，PCM 上行 165 片、首音频后继续上行 86 片，实际播放 RMS 与嘴部均 >0，插话后嘴部归零，结束成功。测试输入仍为合成麦克风；报告 `artifacts/g1-voice/browser-g2-preview.json`。浏览器预览保护须由 CLI 请求 `?x-vercel-set-bypass-cookie=true` 取得 cookie，仅请求头绕过不能保证 Worklet 子请求可访问。

## G2 资产与持续运行

- 真正 GLB 已在桌面与手机视口的 Chromium 渲染；校验器 0 errors，1 条运行时生成切线空间的 warning。原模型只有烘焙的单网格，没有骨骼、morph 或动画；嘴部采用独立网格，眼睛保持静态，不声称存在面部绑定。
- `pnpm assets:verify` 核对哈希、自包含 GLB、8 MiB 限制与全部贴图不超过 2K；不在页面运行 3D 生成。
- 无头 Chromium 156 在本机 arm64 Mac 以 **SwiftShader 软件渲染**连续运行 121101ms、60 次采样：FPS 最低 19.4／中位 38.8，模型加载 821ms，29992 个三角面和 4 个渲染器纹理资源保持稳定，粗粒度 JS heap 报告约 19.3MB。原始报告在忽略的 `artifacts/g2-model/soak.json`。
- 该结果仅为自动化待机稳定性检查，不能代替真实 GPU Mac 与手机两分钟测试，也没有所有采样 ≥30 FPS 的证据。T08、G1／G2 整体闸门仍未勾选；按 [实机手册](runbooks/model-trial.md)完成后再记录结果。

## 正式部署复测（2026-11-01 04:01 北京时间）

- 版本 `3d0f1c7`，从干净隔离 checkout 上传；部署 `dpl_66beeNceBS2Lr3wtNfaDEWT3SKDq`，地址 [nether-council.vercel.app](https://nether-council.vercel.app)。健康检查通过、签名活动邀请仍必需。CLI 未连接 Git 时健康接口版本号曾为空，因此后续部署显式注入 APP_REVISION，smoke 可用 --revision 核对。
- 实际 Qwen 中继：ready 2192ms、首音频 3683ms、249600 字节；取消后 12 个在途分片，探针成功结束。模型与音色保持 `qwen-audio-3.1-realtime-plus`／`longanqian_v3.1`。
- 正式域名浏览器：admission 200，收到 26 个真实音频分片，PCM 上行 152 片、首音频后继续上行 75 片；实际播放与嘴部 RMS >0，打断后嘴部归零，结束成功。输入是合成麦克风，不计真人三轮。匿名报告在本机 `artifacts/g1-voice/browser-production.json`。
- 本机 **macOS 15.7.5／Apple M4／Chrome 156.0.8078.74／Metal GPU** 独立窗口待机 120348ms、60 次采样：FPS 最低 40.5／中位 60.0／最高 60.1；GLB 加载 743ms（未限速），纹理资源数保持 4，JS heap 首次约 17.3MB／末次约 13.2MB（不代表 GPU 内存）。报告 `artifacts/g2-model/soak-mac-chrome.json`。该测试不包含真人互动、手机或 10Mbps 限速验收。
- T01–T05 与 T07 有对应实现、厂商或自动化证据；T06 的真人三轮与声学延迟、T08 的实体手机与常规互动两分钟仍待结果，因此 G1／G2 整体闸门未通过，未进入其余六角色生成。
- 复核补充：服务器现在按 responseId 忽略上一轮延迟到达的取消，避免误停新回复；回归测试先复现多发一次取消，修复后通过。它补全了响应归属检查，不改变真人验收要求。

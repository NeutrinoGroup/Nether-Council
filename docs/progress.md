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
- `tests/integration/relay.test.ts` 使用本机测试协议端点验证桥接行为；它不是厂商或真人语音验收。翻译在下述 T09/T10 分支实现，完整身份结果尚未实现。
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

## 匿名访问与恢复复核（04:09–04:12）

- 正式部署 `43287f0394b1` 的版本号已通过 smoke --revision 核对，主分支与工作区同步。匿名浏览器不带 Vercel 登录或保护绕过凭证：admission 200、24 个真实音频分片、首音频后继续上传 81 片，RMS 与嘴部联动、插话归零及结束通过。本机 `artifacts/g1-voice/browser-production-final.json`。
- 同一部署第一次匿名试验曾遇到 `HANDSHAKE_TIMEOUT`（20:09:23 UTC）；后续无 OIDC 的 Node 探针 ready 2381ms／首音频 3386ms。**IPv4 并未根治偶发上游握手问题**，上述成功结果不代表稳定性或延迟 SLO 已达标。
- 补充可复现恢复缺口：retryable 错误之后若关闭握手为 1000，旧客户端会结束。客户端现在保留该连接的重试意图；错误、超时和网络失败均可有界重连，主动结束与原截止时间仍优先。单测先失败后通过；本地 pnpm check（20 项 Vitest、lint、类型、资产、构建）和 10 项桌面／手机 Playwright 通过。真实超时的低层网络原因仍未确定，不擅自换模型或部署服务。

## G3 T09/T10 开发（2026-11-01）

- 用户确认 PR #12 已 squash 合并，main 为 `ae4ccb297168`，正式健康检查版本一致；本轮从该版本建立 `codex/encounter-captions`，提交 PR 供用户审查和合并，不自动合并或改动正式环境。
- T09：中英语言切换、24 码点选填昵称、各三个示例、2–3 次追问后暖收尾的角色指令。确认用户故事去重计数；至少一次可主动收尾，两次或已有故事且满 75 秒提示；180 秒关闭采集。语言切换和后台关闭旧麦克风，重新开始须点击。草稿只留本页内存，明确身份／卡片尚未开放，不冒充 T11/T12。
- T10：双方原文先显示，确认短话轮异步翻译，不等待文字模型播放音频。客户端核对八个原文身份字段；服务端取消过期工作，VAD 过滤迟到 ASR。单发言者一个任务、每连接 24 任务，每次 1800ms、最多一次重试；超长／失败保留原文并显示降级。[ADR 0003](adr/0003-encounter-and-bilingual-captions.md)列出预算与客户端草稿的信任边界。
- `pnpm check` 全绿：lint、类型、33 项 Vitest、实际 GLB 哈希／纹理检查和 Next.js 生产构建。新增测试覆盖故事判断、75／180 秒边界、重复修订、重连与停止、字幕错配、忽略 abort 的超时、预算、响应体限制及真实本机 WS 转发。
- `pnpm test:e2e` 桌面／手机视口 14 项通过：保留此前十项，并验证双语字幕在播放期间补齐、翻译失败保留原文、故事收尾和切换语言不自动开启新付费连接。输入是浏览器合成麦克风与应用协议夹具，不算真人／实体手机或完整 G3 验收。
- 真实 `qwen3.6-flash` 翻译四条合成文本，中文到英文 620／682ms，英文到中文 430／638ms；4/4 首次成功。报告 `artifacts/g3-captions/text-smoke.json`。不据此宣布 P95 或语音／字幕整体 SLO 达标。
- T11/T12、真人中英内容质量与第二台设备扫码链路仍未完成；本轮没有新增角色或生成素材。

## G3 T11/T12 身份评价与 Canvas 卡片分享（2026-11-01）

- PR #13（`c976fe2`）已合入 main，完成 T09/T10。从 main 创建分支 `feat/encounter-verdict-card` 推进 T11/T12。
- T11：实现服务端基于 `qwen3.6-flash` 的双语身份评价生成器（`generator.ts`）及 `/api/verdict` 接口。严格按照 `ResultContent`（`title`、`verdict`、`warmClosing`、`tags`、`sourceTurnIds`）进行运行时 Zod 校验，并通过 `validateResultSources` 确保引用的用户话轮确实属于真实故事话轮，无故事时抛出 `NO_STORY` 拒绝伪造。在 WebSocket 协议层面支持 `session.finalize`，并通过全双工上游通道向孟婆注入 `conversation.item.create` 携带 `warmClosing`，完成暖心口播收尾。客户端使用 `sessionStorage` 记录首份结果，防止重复刷新开奖。
- T12：实现 1080×1440 高分辨率 Canvas 身份卡生成器（`canvas.ts`）与 `<IdentityCard />` 交互组件。绘制前等待 `document.fonts.ready`，使用打包字体 `@fontsource/ma-shan-zheng` 与 `@fontsource/bungee`。支持随时勾选“隐去具体经历评价”、即时修改卡片称呼。集成 `qrcode` 生成带充足留白静区的高对比度二维码，指向包含活动凭证与 7 天签名推荐来源（`/api/referrals`）的真实入口。提供 PNG 下载、复制个性化分享文案、复制邀请链接以及系统分享（Web Share API），全链路触发匿名遥测事件。
- 质量验证：
  - `pnpm lint`：0 错误，0 警告。
  - `pnpm typecheck`：全项目类型检查 100% 通过。
  - `pnpm test`：全部 12 个测试套件、41 项 Vitest 单元与集成测试通过（包括 `verdict.test.ts` 与 `card.test.ts`）。
  - `pnpm test:e2e`：全部 16 项 Playwright 跨视口端到端测试通过（涵盖桌面与移动端的身份卡生成、隐去评价、修改昵称、PNG 下载与文案复制）。
  - 视觉产物捕获至 `.impeccable/review/desktop-verdict-card.png` 与 `mobile-verdict-card.png`。


## G4 T13/T14 七角色扩展、官方音色映射与切换巡检（2026-11-01）

- PR #14（`893b867`）已 squash 合并并成功上线 Vercel 正式环境（`https://nether-council.vercel.app`），`smoke --revision` 核验 100% 通过；实机成功调用正式 `qwen3.6-flash` 生产身份卡与 7 天 HMAC 推荐链接。
- 从 main 创建分支 `feat/seven-characters-roster` 推进 T13 与 T14。
- T13 七角色定义与资源：
  - 在 `@nether/party-core` 建立统一的角色定义注册表（`CHARACTERS`），全面覆盖孟婆、黑无常、白无常、钟馗、弗兰肯斯坦怪人、狼人、吸血鬼 7 位角色。
  - 通过与 Qwen 实时音频 WebSocket 端点逐一真实握手探测，锁定并验证了全部 7 位角色的专属官方音色：
    - 孟婆：`longanqian_v3.1`
    - 黑无常：`longyuan_v3.1`
    - 白无常：`longxiaoxia_v3.1`
    - 钟馗：`longhua_v3.1`
    - 弗兰肯斯坦怪人：`longjielidou_v3.1`
    - 狼人：`longxing_v3.1`
    - 吸血鬼：`longwan_v3.1`
  - 为 6 位新角色生成了独立的 512×512 风格化海报资源（`apps/web/public/posters/*.png`），并在 `canvas.ts` 中配置了高对比度、不同色系（青色、赤红、朱砂、荧光绿、紫橙、酒红）的 1080×1440 身份卡专属主题（`CardTheme`）。
  - `CharacterStage` 遵循“只在选中后加载模型”规范：选中孟婆时加载 GLB 3D 模型；选中其他角色时优雅降级并展示专属形象海报，不发起不存在的 3D 模型网络请求。
- T14 角色切换与防串线验证：
  - `/api/sessions` 解除单角色限制，开放全部 7 位角色签名入场。
  - 客户端支持在开聊前自由切换角色，切换时调用 `client.stop("character_change")` 彻底重置语音引擎与会话视图，防止旧会话与异步翻译串线。
  - 编写了 42 组跨角色跨语言的内容评估测试用例（7 角色 × 2 语言 × 3 话轮场景），校验提示词防幻觉约束、不侮辱用户原则及有效故事识别。
- 质量验证：
  - `pnpm lint`：0 错误，0 警告。
  - `pnpm typecheck`：4 个 workspace 全部 100% 通过。
  - `pnpm test`：全部 13 个测试套件、46 项 Vitest 单元与集成测试全绿。
  - `pnpm test:e2e`：全部 18 项 Playwright 跨视口端到端测试全绿。
  - `pnpm check`：lint、类型、测试、资产哈希、生产 Next.js 优化构建全部通过。

## G4 T15 现场主持模式、大屏字幕、BGM 避让压低与全场祝词狂欢（2026-11-01）

- PR #15（`1944a55`）已合入 main 并在线上正式环境通过 `pnpm smoke` 验证。从 main 创建分支 `feat/host-mode-celebration` 推进 T15。
- T15 现场主持大屏与控制台：
  - 路由 `/host` 校验 `HOST_ACCESS_SECRET`，并支持生成指向手机入场页的常驻二维码。
  - 主屏配备超大字号（32px）双语台词与现场发言字幕展示，配备 48 柱音频波形能量条。
  - 实现原生 Web Audio 合成背景音控制器 `BgmController`，支持在角色或现场持麦发言时毫秒级平滑压低增益约 15.5dB（0.12 -> 0.02），静音后平滑复原。
  - 支持主持一键触发全场举杯/祝词（`All-Hall Celebration`），伴随和弦钟鸣与全屏横幅，并在每接待 4 位来宾时自动弹出祝词建议 Toast。
  - 提供“下一位来宾”一键流转：彻底清理并断开上一位来宾的音频与会话上下文，重置状态并安全递增计数。
- 质量验证：
  - `pnpm lint`：0 错误，0 警告。
  - `pnpm typecheck`：通过全部类型检查。
  - `pnpm test`：全部 14 个测试套件、50 个 Vitest 单元与集成测试全绿（包含 `host.test.ts` 4 项测试）。
  - `pnpm test:e2e`：全部 20 项 Playwright 端到端测试全绿（涵盖桌面与移动端的现场大屏主持与全场祝词交互）。
  - 生产构建：`pnpm check`（lint、typecheck、test、assets:verify、build）全部成功。


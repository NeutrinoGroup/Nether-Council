# 黄泉议会 · 完整部署与运维手册 (Deployment & Operations Guide)

## 1. 架构与依赖服务

黄泉议会（Nether Council）采用现代化低延迟语音与 3D 渲染架构：

- **前端层**：Next.js 16 (App Router) + React 19 + React Three Fiber / Three.js + Web Audio API（支持音频分析、BGM 避让压低、和弦钟鸣合成）。
- **中继层**：Vercel Serverless Functions (`runtime = "nodejs"`, `maxDuration = 300`) 借助 `@vercel/functions upgradeWebSocket` 实现客户端与大模型间的安全音频双工中继。
- **大模型核心服务**：
  - **全双工实时语音**：阿里通义千问 `qwen-audio-3.1-realtime-plus`（WebSocket，16kHz 16-bit LE PCM，支持 `smart_turn_v2` 神经网络端点检测与打断）。
  - **身份卡生成**：阿里通义千问 `qwen3.6-flash`（OpenAI 兼容接口，严谨输出 Zod 校验的万圣节身份卡文案与评价）。
  - **3D 资产生成**：腾讯混元 3D API (`hunyuan-3d`)。

---

## 2. 必需环境变量配置矩阵

| 变量名 | 类型 | 说明与规范要求 |
|---|---|---|
| `QWEN_DUPLEX_API_KEY` | Secret | 阿里云通义千问全双工实时语音 WebSocket API Key (`sk-...`) |
| `QWEN_REALTIME_URL` | Config | 默认 `wss://maas.qianwenaiapi.com/api-ws/v1/realtime` |
| `QWEN_REALTIME_MODEL` | Config | 默认 `qwen-audio-3.1-realtime-plus` |
| `QWEN_TEXT_API_KEY` | Secret | 通义千问文本大模型 API Key（可复用全双工 Key） |
| `QWEN_TEXT_BASE_URL` | Config | 默认 `https://maas.qianwenaiapi.com/compatible-mode/v1` |
| `QWEN_TEXT_MODEL` | Config | 默认 `qwen3.6-flash` |
| `SESSION_SIGNING_SECRET` | Secret | 会话 Cookie HMAC 签名密钥（不少于 32 位随机字符） |
| `CAMPAIGN_SIGNING_SECRET`| Secret | 活动入场券 HMAC 签名密钥（防伪造与时效保护） |
| `REFERRAL_SIGNING_SECRET`| Secret | 朋友邀请推荐链接签名密钥 |
| `HOST_ACCESS_SECRET` | Secret | 现场大屏主持工作台准入密码 |
| `NEXT_PUBLIC_SITE_URL` | Config | 正式站点基准 URL（例如 `https://nether-council.vercel.app`） |
| `NEXT_PUBLIC_CAMPAIGN_ID` | Config | 当前活动标识（例如 `halloween-2026`） |
| `VOICE_ENABLED` | Secret | **紧急全局停服开关**：设为 `"true"` 开放，设为 `"false"` 立即拒绝所有付费连接 |

---

## 3. Vercel 部署配置关键约束

在根目录 `vercel.json` 及 `apps/web/vercel.json` 中，必须配置：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["hkg1"]
}
```

> [!IMPORTANT]
> **香港节点锁定（`hkg1`）必要性**：通义千问 API 位于中国大陆华东地区。Vercel 部署函数锁定在 `hkg1`（香港），并通过 IPv4 连接，可将往返延迟降至最低（TTFA 400ms~600ms），并消除跨国网络波动与 IPv6 路由解析超时风险。

---

## 4. 部署与运维标准命令

### 4.1 本地编译、静态检查与回归测试
```bash
# 执行 ESLint 语法检查、TypeScript 跨包类型校验、Vitest 单元/集成测试、资产验证及 Next.js 构建
pnpm check

# 执行跨桌面与手机视口 Playwright 端到端交互测试（28 项，使用受控 API / WS）
pnpm test:e2e
```

### 4.2 部署后冒烟自检 (Smoke Test)
```bash
# 验证正式端点健康状态、版本指纹与语音开关
pnpm smoke --url https://nether-council.vercel.app
```

### 4.3 现场活动入场券签发
```bash
# 生成 2 小时有效期的活动邀请入场链接
pnpm invite:create --url https://nether-council.vercel.app --hours 2

# 生成 24 小时全天候有效期的活动邀请链接
pnpm invite:create --url https://nether-council.vercel.app --hours 24
```

### 4.4 线上真实多客户端全双工压测
```bash
# 启动 10 个独立客户端进行 3 轮真实语音交互（持续 120 秒）
pnpm test:load --clients 10 --turns 3 --duration 120 --url https://nether-council.vercel.app
```

### 4.5 单角色真实浏览器验证（产生 API 用量）

```bash
pnpm verify:real --real-provider --url https://<本项目预览部署>.vercel.app --mobile-soak
```

读取本机已有签名配置，使用真实 Chrome、AudioWorklet 和 Qwen；输入来自仓库合成语音素材。中文／英文各三轮，检查边播边传、VAD 插话、字幕翻译、身份结果、告别播放结束、PNG 下载和卡片二维码解码后的入场。中文分支在 Mac 手机尺寸视口运行至少两分钟，不能替代实体手机与真人验收。仅输出状态和计数，不输出故事或签名入口。预览站点受 Vercel Authentication 保护时，以 CLI 获取的 Netscape cookie 文件传入 `--cookies <文件>`，不得将 cookie 提交入库。

三表 Python 持久化方案见 [ADR 0008](adr/0008-three-table-python-data-layer.md)，尚未部署接线。实时音频继续沿用现有中继。

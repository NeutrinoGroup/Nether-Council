# ADR 0009 — 用真实语音验收选择部署区域

2026-11-01。决定：本分支默认函数区域从 `hkg1` 调整为 `sin1`；正式旧部署未切换。

新页面的 HTTP 健康、WebGL、受控 WebSocket 测试及 CI 均通过，但新香港预览连接 Qwen 返回 `UPSTREAM_UNAVAILABLE`。最小 `probe:relay` 同样失败；受限服务端诊断显示对预期主机 `maas.qianwenaiapi.com` 的 TCP 连接 `ETIMEDOUT`，尚未收到供应商会话或音频。

逐项对照：显式指定已验证的模型地址仍失败；在新页面中仅恢复旧中继仍失败；从干净 worktree 部署完整新提交仍失败。与此同时，未修改的 main 预览与现有正式版能够播放真实开场音频。将同一干净提交 `d165fac` 的区域仅覆盖为 `sin1` 后，短连接成功，首段音频约 4.4 秒，完整英文三轮也通过。

这些结果支持新部署的区域／实例出站路径差异这一判断，尚不足以断言供应商故障、整个香港不可用或 Vercel 内部具体原因。保留现有 `{ family: 4, handshakeTimeout: 20_000 }`，同步修改根目录与 apps/web 的 vercel.json。没有固定供应商 IP，也没有放宽会话、Origin 或部署保护。

回归 seam 是实际部署的 `probe:relay` 与 `verify:real`。本机单元测试无法复现云端 TCP 路由，不能用一个永远成功的模拟网络测试来证明修复。CI 继续覆盖应用协议与生命周期；上线前另外确认目标部署健康版本、真实开场、三轮输入与插话、字幕、告别排空、卡片和二维码入场。

临时网络日志已移除，本机 QA 适配器等探索原型移至忽略的 artifacts/debug。本次未发布到生产。后续区域变化应重复供应商验收；可按部署版本回退至已知可用版本。

依据：[Vercel 区域列表](https://vercel.com/docs/regions)、[函数区域配置](https://vercel.com/docs/functions/configuring-functions/region)。

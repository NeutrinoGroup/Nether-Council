# ADR 0010 — 麦克风许可先于付费连接

2026-11-01。恢复 spec FR-01 与 plan §5 的既有边界。

`da78a93` 在个人体验挂载时预连上游。页面浏览、换语言和换角色会提前创建付费语音连接；其 effect 依赖 `active`，开麦切换阶段时还可能清理同一客户端。首条连接应由明确的开麦操作发起，先完成实际麦克风许可和采集初始化，再取得票据及连接 Qwen。

移除 `VoiceTrial` 挂载预连与激活捷径，沿用 `VoiceClient.start()` 的许可顺序。正常关闭、重试与播放排空逻辑保持由客户端管理。服务端预连协议暂保留兼容，网页不调用。后续需要优化首包时，先测量具体阶段，不能用浏览页面消耗语音会话或缩短体验截止时间。

浏览器回归覆盖：带有效格式邀请浏览时不申请票据、不打开 WS；用户拒绝麦克风后仍无票据/WS；正常开麦、播放期间上传、插话和告别排空由完整 E2E 覆盖。

本机诊断另发现系统音频输出时钟停滞：AudioContext 状态为 running，等待 1.2 秒后 currentTime 仅约 0.005 秒；Chromium 虚拟输出对照约 1.21 秒。确定性 E2E 显式使用 `--disable-audio-output`，其含义见 [Chromium 源码](https://chromium.googlesource.com/chromium/src/+/HEAD/media/base/media_switches.cc)。它保留真实 Worklet、PCM、播放器队列和 RMS 数字链路，但不认证扬声器或听感。

`verify:real` 默认仍使用系统输出，在建立付费连接前检查音频时钟。需要仅验证真实厂商与数字播放链路时，操作者显式选择 `--virtual-audio-output`；报告记录输出类型。虚拟输出与合成输入均不计 T06 真人试听、T08 实体手机或 T15 现场音响验收。

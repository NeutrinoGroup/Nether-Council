# 0002 单角色浏览器场景与部署连接

日期：2026-11-01。状态：采用，实机性能仍待验收。

## 场景

沿用 Next.js／React，在客户端动态加载 R3F／Drei／Three。真实孟婆 GLB 优化到 1.26 MiB、三张 2K WebP；仅进入可见区才请求场景。模型无面部绑定，用独立嘴部网格读取实际播放分析器 RMS，停播清队列后同步闭合，眼睛保持静态。加载失败明确显示生成海报，不伪造已加载模型。

现阶段 VoiceClient 管理音频资源，组件通过 useSyncExternalStore 订阅状态；场景逐帧读取 RMS，避免经 React 状态转发音量。页面使用现有 CSS，不为单角色 UI 引入全局游戏状态层。后续多角色与主持功能按原 plan 再决定是否需要 Zustand。

## 部署连接

Next.js 16.4.3 提示路由 preferredRegion 配置已弃用，地区改由 apps/web/vercel.json 与 CLI --regions hkg1 指定，并通过部署 API 与函数内 VERCEL_REGION 验证。外层请求日志地区不等于函数执行地区。

多个香港部署在 DNS 解析成功后遇到上游握手超时；单独设置 WebSocket 的 family: 4 后，新预览连续获得真实开场音频。因此保留显式 IPv4、原主机名和 TLS 证书验证，不硬编码 IP、不更换厂商或模型。此证据支持地址选择的兼容性处理，尚不能证明故障网络的具体 IPv6 路由原因；后续以正式部署复测为准。

## 取消竞态

实际 Qwen 回放复现：推理完成后收到 response.cancel 会返回 invalid_request_error／invalid_value，param=response.cancel，message=Conversation has no active response.。只在本连接曾发出取消且错误字段精确匹配时吸收这一竞态；其他 invalid_value 仍报错并断开。回归测试验证取消后可接收新响应，以及其他参数错误不会被吞掉。[厂商客户端事件](https://platform.qianwenai.com/docs/api-reference/qwen-audio-realtime/client-events)与[服务端错误](https://platform.qianwenai.com/docs/api-reference/qwen-audio-realtime/server-events)为协议依据。

客户端携带 responseId 的取消只作用于同一活动响应；上一轮的延迟取消不应中断新一轮。服务端也验证这一点，不能只依赖客户端清理。

## 可重试错误与关闭握手

应用层 retryable 不能被后续正常关闭码覆盖。每条连接保留重试意图，由现有三次重连和原采集截止控制；主动结束仍不重连。单测和浏览器协议测试覆盖错误后 1000 关闭这一组合。匿名正式部署仍出现过一次上游握手超时，因此显式 IPv4 仅是已观察到有效的兼容处理，不代表已确定或消除底层网络故障。

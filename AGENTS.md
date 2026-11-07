# 规范

# 思考

# 记忆

# 文档

# 架构

# 技术栈

# 测试

# 结果

# 复盘

# RSI迭代

# 模块化

# 复用

# 抽象

# OKR目标与结果验收

# 流程跑通再规模化
例如ws duplex 一个角色聊天没有问题
例如textTo3D 一个模型创建精度与threejs 加载没有问题
才能规模化 scaling

# 角色面部约束

保留孟婆 GLB 原有面部。用户已明确删除独立嘴部组件：禁止再次添加红色圆形、球体或覆盖原嘴的贴片。当前播放 RMS 仅表示音频活动，不可作为实际口型动画的验收证据。

# Google OAuth 与无状态会话规范

- 每个独立项目必须使用独立的 Google OAuth 2.0 Web 客户端（`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`），授权来源与重定向 URI 显式绑定站点根 Origin（如 `https://ghost.oodai.space`、`https://nether-council.vercel.app`、`http://localhost:3100`）。
- 服务端登录采用 PKCE（`S256`）与 10 分钟有效的签名 `nc_google_flow` Cookie 校验 `state` 与 `redirectUri`。
- 已验证身份凭证写入 HMAC-SHA256 签名的 `HttpOnly` Cookie（`nc_identity`），内嵌经核验的用户资料摘要与确定性推荐码（`nc_<sha256>`）。在未开启强制外部数据库（`SUPABASE_REQUIRED=true`）时，Serverless 多实例与冷启动须直接从验签 Cookie 与内存缓存恢复会话，禁止因可选 Supabase 未配置而向用户返回 `503 Identity service unavailable`。
- 每次修复与迭代须执行回归测试，通过独立分支提交 PR 并 Rebase 合并至 `main`，同步部署至生产环境。


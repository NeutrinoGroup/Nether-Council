# Nether Council · 黄泉议会

中式神仙 × 西式万圣派对 × 当代生活梗。通过 Web 与经典角色全双工语音互动，带走一张专属身份卡，邀请朋友继续体验。

- [产品规范](specs/001-halloween-party/spec.md)
- [实施计划](specs/001-halloween-party/plan.md)
- [任务与验收](specs/001-halloween-party/tasks.md)
- [实施进展与证据](docs/progress.md)

项目按单角色语音、真实 GLB、完整流程、七角色、10 人试场、50 人试用的顺序实施。真实 API、设备与用户验收的结果单独记录。

## 本地运行

要求 Node.js 24 或 25、pnpm 11.1.1。

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm probe:providers
pnpm test:e2e
```

环境变量见 `.env.example`，在被忽略的 `.env` 或 `.env.local` 配置。浏览器永远不直接取得厂商密钥。当前 `/play` 提供中／英文孟婆语音试场：实际 AudioWorklet 采集与流式播放、插话、静音和有界重连。需要签名邀请；身份卡和其他角色尚未开放。真人与现场设备验收仍待完成。

`pnpm dev` 用于界面；WS 开发使用 `pnpm dev:voice`（Vercel CLI）。正式验收仍需 HTTPS 预览及真实设备。探测命令会实际调用已配置的语音和文字接口，3D 仅查询不存在任务，不提交生成；报告不含凭据。普通 CI 不调用付费模型。

## 部署与验证

```bash
pnpm env:vercel
pnpm exec vercel deploy --scope oodai --non-interactive --yes
pnpm smoke --url https://nether-council.vercel.app
pnpm probe:relay --url https://<preview-host>
pnpm telemetry:collect --since 30m
pnpm report:pilot
```

`env:vercel` 校验本项目 ID 后从本机配置经 stdin 上传环境变量，不打印值；可追加变量名只更新所选项。默认关闭语音，开启时必须保留签名活动邀请鉴权。项目 Git 自动部署尚未接通，现由已登录的 CLI 上传。`probe:relay` 只验证自动开场的真实音频和取消链路，不能替代真人双工验收。

日志采集依赖 Vercel 保留期与主动运行命令；分页边界、延迟、截断和未采集期间可能丢失事件。下载文件生成与系统分享唤起均不代表用户真的保存或分享，真实试场需观察记录。

开场邀请：`pnpm invite:create --url https://nether-council.vercel.app --hours 2`，在本机 `artifacts/invites/latest.json` 读取链接。[真人语音试场手册](docs/runbooks/voice-trial.md)说明三轮中英问答、插话和声学延迟的验收方法。

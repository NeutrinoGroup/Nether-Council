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

环境变量见 `.env.example`，在被忽略的 `.env` 或 `.env.local` 配置。浏览器永远不直接取得厂商密钥。

- **个人体验入口 (`/play`)**：开放全部 7 位角色（孟婆、黑无常、白无常、钟馗、科学怪人、狼人、吸血鬼）与中英双语选择。支持 AudioWorklet 采集、流式双工问答、即时插话（Barge-in）、双语异步字幕与 1080×1440 万圣节身份卡结算导出（PNG 下载、Web Share、免手填码推荐二维码）。
- **现场主持大屏 (`/host`)**：现场专属大屏沉浸模式，支持 32px 超大双语字幕、Web Audio 背景音智能避让压低（~15.5dB Ducking）、全场举杯狂欢祝词（All-Hall Celebration）、一键流转下一位来宾（无串线状态重置）及现场常驻扫码二维码。

详见以下核心文档：
- [完整部署与运维手册](docs/deploy.md)
- [现场主持与大屏操作手册](docs/runbooks/host-handbook.md)
- [跨浏览器与移动端兼容性审计](docs/compatibility.md)
- [10 客户端真实并发压测报告](artifacts/g5-pilot/load-report.md)
- [10 人试场观察报告](docs/trials/pilot-10-report.md)
- [50 人全景漏斗与角色复盘报告](docs/trials/pilot-50-funnel.md)
- [已知问题与应对措施](docs/known-issues.md)

## 部署与验证

```bash
pnpm env:vercel
pnpm exec vercel deploy --prod --regions hkg1 --local-config apps/web/vercel.json --scope oodai --non-interactive --yes
pnpm smoke --url https://nether-council.vercel.app
pnpm test:load --clients 10 --turns 3 --duration 120 --url https://nether-council.vercel.app
pnpm invite:create --url https://nether-council.vercel.app --hours 2
```

`env:vercel` 校验本项目 ID 后从本机配置经 stdin 上传环境变量，不打印值；可追加变量名只更新所选项。默认关闭语音，开启时必须保留签名活动邀请鉴权。项目 Git 自动部署尚未接通，现由已登录的 CLI 上传。`probe:relay` 只验证自动开场的真实音频和取消链路，不能替代真人双工验收。

CLI 部署须从干净提交执行并附 `APP_REVISION`，因为未连接 Git 的部署可能没有 `VERCEL_GIT_COMMIT_SHA`。部署后可用 `pnpm smoke --url https://<deployment-host> --revision <commit>`核对实际运行版本；正式部署追加 `--prod`。

日志采集依赖 Vercel 保留期与主动运行命令；分页边界、延迟、截断和未采集期间可能丢失事件。下载文件生成与系统分享唤起均不代表用户真的保存或分享，真实试场需观察记录。

开场邀请：`pnpm invite:create --url https://nether-council.vercel.app --hours 2`，在本机 `artifacts/invites/latest.json` 读取链接。[真人语音试场手册](docs/runbooks/voice-trial.md)说明三轮中英问答、插话和声学延迟的验收方法。

## 孟婆模型

已提交 1.26 MiB 自包含 GLB 与生成海报，来源及精确哈希见 [资产清单](docs/assets/meng-po.source.json)。单网格无面部绑定，使用独立嘴部；眼睛静态。3D 加载失败会明确显示海报提示，语音可独立工作。

`pnpm assets:verify` 校验哈希、8 MiB 大小限制和 2K 贴图；包含于 `pnpm check`。需要复现优化时执行 `pnpm assets:prepare:meng-po --input /absolute/path/original.glb`，输入须匹配来源清单中的原始哈希。该命令不调用付费生成。Mac 与手机两分钟验收方法见 [模型试场手册](docs/runbooks/model-trial.md)。

实时语音网关与断线演示：参见 [FastAPI 服务](services/voice/README.md) 和 [Demo 排练步骤](docs/runbooks/realtime-demo.md)。

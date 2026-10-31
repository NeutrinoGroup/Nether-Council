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

环境变量见 `.env.example`，在被忽略的 `.env` 或 `.env.local` 配置。浏览器永远不直接取得厂商密钥。当前 `/play` 提供中／英文孟婆语音试场：实际 AudioWorklet 采集与流式播放、插话、静音和有界重连，并加载真实混元 GLB，以播放 RMS 驱动独立嘴部。需要签名邀请；身份卡和其他角色尚未开放。最新部署验证及真人、现场设备验收状态见实施进展。

本地 G3 分支增加选填昵称、三个双语开聊示例、有效故事进度与「收好故事」。两次有效发言或已有故事且满 75 秒时提示收尾；180 秒关闭麦克风，重连不延长时限。昵称最多 24 个 Unicode 字符，仅留在页面内存；收尾草稿也不写入磁盘或分享链接。切换语言结束旧连接，需再次点击开麦。T11 身份生成和 T12 卡片尚未开放。

确认的双方原文异步翻译，语音播放不等待文字 API。译文失败保留原文并显示状态；打断、修订、换语言和重连会使旧翻译失效。文字接口使用 `QWEN_TEXT_API_KEY`，未单独配置时沿用语音密钥，实际权限须验证。详见 [G3 流程与字幕 ADR](docs/adr/0003-encounter-and-bilingual-captions.md)。

`pnpm dev` 用于界面；WS 开发使用 `pnpm dev:voice`（Vercel CLI）。正式验收仍需 HTTPS 预览及真实设备。探测命令会实际调用已配置的语音和文字接口，3D 仅查询不存在任务，不提交生成；报告不含凭据。普通 CI 不调用付费模型。

## 部署与验证

```bash
pnpm env:vercel
pnpm exec vercel deploy --regions hkg1 --local-config apps/web/vercel.json --scope oodai --env APP_REVISION="$(git rev-parse HEAD)" --non-interactive --yes
pnpm smoke --url https://nether-council.vercel.app
pnpm probe:relay --url https://<preview-host>
pnpm telemetry:collect --since 30m
pnpm report:pilot
```

`env:vercel` 校验本项目 ID 后从本机配置经 stdin 上传环境变量，不打印值；可追加变量名只更新所选项。默认关闭语音，开启时必须保留签名活动邀请鉴权。项目 Git 自动部署尚未接通，现由已登录的 CLI 上传。`probe:relay` 只验证自动开场的真实音频和取消链路，不能替代真人双工验收。

CLI 部署须从干净提交执行并附 `APP_REVISION`，因为未连接 Git 的部署可能没有 `VERCEL_GIT_COMMIT_SHA`。部署后可用 `pnpm smoke --url https://<deployment-host> --revision <commit>`核对实际运行版本；正式部署追加 `--prod`。

日志采集依赖 Vercel 保留期与主动运行命令；分页边界、延迟、截断和未采集期间可能丢失事件。下载文件生成与系统分享唤起均不代表用户真的保存或分享，真实试场需观察记录。

开场邀请：`pnpm invite:create --url https://nether-council.vercel.app --hours 2`，在本机 `artifacts/invites/latest.json` 读取链接。[真人语音试场手册](docs/runbooks/voice-trial.md)说明三轮中英问答、插话和声学延迟的验收方法。

## 孟婆模型

已提交 1.26 MiB 自包含 GLB 与生成海报，来源及精确哈希见 [资产清单](docs/assets/meng-po.source.json)。单网格无面部绑定，使用独立嘴部；眼睛静态。3D 加载失败会明确显示海报提示，语音可独立工作。

`pnpm assets:verify` 校验哈希、8 MiB 大小限制和 2K 贴图；包含于 `pnpm check`。需要复现优化时执行 `pnpm assets:prepare:meng-po --input /absolute/path/original.glb`，输入须匹配来源清单中的原始哈希。该命令不调用付费生成。Mac 与手机两分钟验收方法见 [模型试场手册](docs/runbooks/model-trial.md)。

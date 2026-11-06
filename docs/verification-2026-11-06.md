# 正式环境并发与页面复核 · 2026-11-06

代码基线和被测生产版本：`13466bce0a912b13b874979eb229b492b784e943`。本轮修改仅为压测工具、证据判定和文档；保留主目录其他正在进行的改动。通过 `git fetch origin` 核对后，在独立工作区执行。

## 真实 API，并非真人验收

端点 `https://ghost.oodai.space`；UTC 2026-11-06 13:30:04.705 至 13:32:10.766。命令：

```sh
pnpm test:load --real-provider --clients 10 --turns 3 --duration 120 --url https://ghost.oodai.space
```

- 十条独立 ready 连接的共同连续区间：**120.061 秒**。进程运行 126 秒，两者分开记录。
- 30/30 轮成功；每轮要求有效用户最终转写及对应响应音频。十个客户端均无错误、无重连。
- 输入上传完成到响应首块音频：30 个样本，最小 1715ms、中位 2086ms、P95 2840ms、最大 2849ms。它不是浏览器播放延迟，也不含听感判断。
- PCM 输入为仓库 macOS TTS；中英文各五条连接，轮换七个语音角色。回应截取后取消以限制费用，不能证明所有角色完整告别、接梗质量或身份生成。
- 先前的单客户端短测前两次尝试失败、第三次连通；它是排障记录，不计入本次十路成功结果，也不证明长期可用性。

| 客户端 | 角色 | 语言 | 成功轮次 | 单条 ready 连接秒数 |
|---|---|---|---|---|
| 0 | meng-po | zh | 3/3 | 122.209 |
| 1 | hei-wuchang | en | 3/3 | 121.809 |
| 2 | bai-wuchang | zh | 3/3 | 120.845 |
| 3 | zhong-kui | en | 3/3 | 121.384 |
| 4 | frankenstein | zh | 3/3 | 120.954 |
| 5 | werewolf | en | 3/3 | 121.094 |
| 6 | vampire | zh | 3/3 | 120.062 |
| 7 | meng-po | en | 3/3 | 121.138 |
| 8 | hei-wuchang | zh | 3/3 | 121.656 |
| 9 | bai-wuchang | en | 3/3 | 120.962 |

本地完整机器报告：`artifacts/g5-pilot/load-2026-11-06T13-30-04-705Z.json`，SHA256 `21c0d29f87b16593b9bf7b06458424e230f4ebf8c30288faf9260e2a5e5fc0ad`。文件含会话标识，留在忽略目录；此文只归档不含票据、故事、字幕或音频的汇总。

测量使用的工具源码 SHA256（当时尚未提交，故基线 revision 不能单独代表 runner 内容）：

- `scripts/load-test.ts`: `0d64e21f72d5db1b3dcb55bd990afb37671d04fc025a2e17935a92e9468b5100`
- `scripts/lib/load-evidence.ts`: `a35683611c8cbcb069cb7eb0c5f3386d0e38b46686dd2047e3ab9f6455ca05e5`
- `scripts/lib/audio-samples.ts`: `334335c55025e125a75bf9408ea5515715c707b61b3e0f1f426d519da33bb7f2`

## 页面与存储边界

正式站通过 macOS Headless Chrome 156 检查桌面 1280px 与 390×844 视口：真实孟婆 GLB 状态 `data-model-loaded=true`、可见 Canvas、无横向溢出。页面保留暖黑舞台、中文书写体、南瓜灯色、连续叙事与 GSAP/Framer Motion；不是卡片网格。Awwwards 参考与取舍见 [设计 brief](design/halloween-scroll-brief.md)。只有孟婆有真实 GLB，其他六位是语音与海报。

三张业务宽表及 Python 数据库测试在 [ADR 0008](adr/0008-three-table-python-data-layer.md)；未接入线上事件路由。最新 main 的另一轮 OAuth 变更新增了 `public.users`，因此仓库当前不能称为“总共仅三张表”；`nether` 业务 schema 仍为 calls/cache/outbox。尚未迁移的生产接线与这一模型差异需独立处理，不通过删除现有认证表解决。

## 验收限制

T16 连续并发与成功数技术门槛通过；样本使用依据尚未归档，任务暂不整体打勾。真人中英文各三轮、现场音响回声与接梗质量、实体手机两分钟及真实分享转化仍没有本轮证据。浏览器虚拟麦克风、手机尺寸和真实供应商都不能代替这些验收。

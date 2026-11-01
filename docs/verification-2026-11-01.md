# 万圣夜剧场验证记录 · 2026-11-01

实现分支 `codex/halloween-scroll-data-layer`，基于 PR #18 后的 main；开始工作与提交前均检查 origin/main，无落后提交。评审入口：[PR #19](https://github.com/NeutrinoGroup/Nether-Council/pull/19)。生产站点尚未切换。

## 自动检查

| 检查 | 结果 | 范围 |
|---|---|---|
| `pnpm check` | 通过 | ESLint、TypeScript、14 个文件共 54 项 Vitest、GLB 资产校验、Next.js 生产构建 |
| `pnpm test:e2e` | 28 项通过 | 桌面 1440×1000、手机视口 390×844；受控 API/WS，真实浏览器 Worklet、WebGL 和身份卡画布 |
| PostgreSQL 17 + Python | 9 项通过 | 隔离数据库中的实际迁移、三表/RLS、事务去重、TTL、并发领取、租约 fencing、死信与乱序事件 |
| GitHub CI | check / data 通过 | [运行记录](https://github.com/NeutrinoGroup/Nether-Council/actions/runs/41277099122) |
| 预览健康 | 通过 | `voiceEnabled=true`，实现版本 `a5f22c0` |

浏览器回归包括首页真实孟婆模型与失败降级、滚动与减少动画模式、双语切换和邀请码传递、播放中上传与插话、静音/重连/角色隔离、延迟结果与告别播放排空、旧 HTTP 结果失效、PNG 下载及实际画布二维码解码。领取测试等待延迟结果和音频排空；默认 5 秒断言不足以覆盖该异步流程，使用 15 秒断言上限。

## 边界

独立设计审查列出的三项问题已修复：手机准备区与禁用原因可见、首页箭头改为 SVG、主持界面装饰性眉题和表情移除。设计审查的 ship 结论限于这些修改，不代替语音或性能验收。

只有孟婆有真实 GLB，其他六位仍为语音加海报。手机尺寸 Chromium/Chrome 不能证明实体手机、Safari、现场音响回声或真人接梗体验。三表方案有真实数据库验证，尚未部署 Python 服务或迁移线上 Supabase；当前事件路径仍为既有遥测。主持台此次只做有限的视觉衔接，未重做其手机固定操作区布局。

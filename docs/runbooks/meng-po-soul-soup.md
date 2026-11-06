# 万圣节孟婆汤

首页沉浸式入口、`/play` 和主持人舞台共用孟婆会话状态。孟婆使用独立的三个工具；其他角色继续使用通用舞台工具。

- `change_mood`：`laughing`、`angry_support`、`mystical`、`healing`；工作吐槽点亮幽冥紫火。
- `extract_worry_keyword`：经过合约校验的简短关键词，最多保留三个不同烦恼。
- `trigger_soul_soup_ritual`：南瓜盅抬起、烦恼化灰、展示万圣解忧签。每场只接收一次，开场不接受。

提示词要求中文每次 2–3 句、30–60 字，先招呼、倾听 1–2 轮，再在第三次有效发言或用户主动喝汤时熬汤。语音和文字发言共用计数；重连恢复发言数及已完成的仪式。中断、过期响应、重复调用和无效参数不会重放特效。

直连和 FastAPI 网关均由 Next 中继处理孟婆工具的校验、回执及续说；网关看到孟婆工具注册表后透传原始函数事件，避免与通用 `change_mood` 重名。音频与函数事件走同一响应标识。

减少动态效果时，保留颜色、关键词和赐福结果，关闭浮动、饮汤位移和灰烬运动。WebGL 不可用时保留海报、语音和文字特效。

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:voice
pnpm assets:verify
pnpm test:e2e
pnpm build
```

真实供应商验证会消耗接口额度，必须显式选择：

```bash
pnpm verify:soul-soup --real-provider
pnpm verify:soul-soup --real-provider --anxiety
```

这两项通过实际中继向 Qwen 发送合成的中文语音，核对口播句数、字数、情绪、关键词及一次仪式调用，写入 `artifacts/soul-soup/real-provider-{work,anxiety}.json`。合成音频可通过 macOS 的 `pnpm exec tsx scripts/generate-soul-fixtures.ts` 重建。它们验证供应商集成，不能替代真人听感或现场扬声器验收。

浏览器的 `tests/e2e/soul-soup.spec.ts` 覆盖首页与 `/play`、桌面与手机、正常与减少动态效果、重复仪式、迟到事件和角色切换。使用虚拟麦克风、无声输出设备和模拟 WebSocket；截图输出到 `artifacts/soul-soup/`。

# 黄泉议会：同页入场与声波仪式

用户目标：中式神仙过西式万圣节，把烦恼留在人间。保留现有书法、暖黑舞台、真实混元孟婆和 Qwen 全双工语音，改为同页镜头推进、剧场字幕与汤盅仪式。

## 依赖

当前 workspace 已包含以下依赖，无需重复安装：

```sh
pnpm --filter @nether/web add three @react-three/fiber @react-three/drei gsap @gsap/react framer-motion
pnpm --filter @nether/web add -D @types/three
```

保持浏览器原生滚动；ScrollTrigger 只编排角色轮盘和舞台。没有引入 Lenis 或新的音频依赖。前端严格使用 pnpm，Python 服务保持 uv。

## 目录与完整实现

```text
apps/web/src/features/
├── landing/
│   ├── HalloweenTheatre.tsx      # landing → entering → conversation；邀请与语言保留
│   ├── TheatreScene.tsx          # 全屏 Canvas、模型、南瓜点光、视线/点头替代动作
│   ├── CastCarousel.tsx          # 原生横向轮盘 + 桌面 ScrollTrigger
│   └── theatre.css               # 响应式构图、暗角、液态玻璃面板
├── world3d/
│   ├── CameraRig.tsx             # 完整 GSAP 运镜与 quickTo 视差代码
│   ├── NetherAtmosphere.tsx      # 顶点薄雾 Shader、彼岸花、南瓜、浮尘
│   └── HalloweenRelics.tsx       # 竹柄扫帚、朱砂魔杖几何道具
├── voice/
│   ├── VoiceTrial.tsx            # 复用客户端、独立 /play 与首页沉浸模式
│   ├── ImmersiveEncounter.tsx    # 可访问语音操作、明确开麦、错误恢复
│   ├── useAudioReactive.ts       # 完整双通道频谱钩子
│   ├── TheatreCaptions.tsx       # 双语逐字字幕与离场漂散
│   ├── SoupAltar.tsx             # 麦克风输入驱动圆环汤盅 Canvas
│   ├── client.ts                 # 现有 Qwen WS 协议与播放状态
│   └── audio/engine.ts           # 真实麦克风/PCM 播放的 AnalyserNode
└── ritual/
    └── LettingGoRitual.tsx       # 真实故事片段聚拢、燃灰、解忧卡 PNG
```

`CameraRig.tsx` 与 `useAudioReactive.ts` 是完整可运行模块，直接由首页和 VoiceTrial 引用，不是伪代码。运镜将相机 Z 从桌面 6.5 推到 3.7、FOV 从 39 收到 35；手机使用独立构图。切到 conversation 不重启镜头。返回时恢复入口与焦点；场景失败仍可通过定时回退唤醒语音面板。

## 音频图

```text
MediaStream → inputAnalyser （仅观测，不连接扬声器）
            → capture worklet → 静音 gain → destination
Qwen PCM → 现有播放节点 → outputAnalyser → destination
```

钩子通过 getter 读取当前客户端的节点，避免重启时持有旧音频图。使用时域 RMS 衡量响度、按 AudioContext 真实采样率取 2–8 kHz 能量。FFT 缓冲按节点复用；指数 attack/release 平滑；ref 更新不触发 React 每帧渲染。静音、打断、停止、卸载后没有模拟活动。输入能量驱动汤盅，输出能量驱动独立嘴部替代网格、点头与南瓜光源。

## 交互与真实性边界

- CTA 不导航、不申请麦克风。面板出现后由明确的开麦按钮启动授权。
- 七个角色沿用各自服务端人格、音色与同页语音路径。当前只有孟婆具备真实 GLB；其他角色明确展示为海报，不伪装为模型。
- 孟婆 GLB 是烘焙网格，没有脸部 morph 或头骨骼。当前采用独立嘴部网格和极轻的整体点头/转向；不能宣称完成面部骨骼绑定。
- 薄雾是低面数程序 Shader，不是物理体积散射。
- 解忧签复用服务端结果及现有 PNG/QR 导出；燃字来自真实已确认用户发言中的短片段，不编造烦恼。视觉燃灰不等于删除服务器记录。
- 减少动态效果偏好跳过镜头行进、漂移和燃字运动；字幕、语音、卡片仍可用。海报和失败提示保留。
- 如果语音客户端进入演示回退，沉浸界面明确标出“演示模式 · 预置故事与语音”；不得作为真实 Qwen 验收证据。

## 验证

`tests/e2e/landing.spec.ts` 覆盖同页入口、返回焦点、不开麦导航、角色选择、GLB 失败和连续镜头。`tests/e2e/immersive.spec.ts` 使用明确标记的模拟 WS 与真实 Web Audio PCM，覆盖频谱能量、字幕、打断、收尾燃字和 PNG 下载。模拟协议测试不能替代实际设备上的 Qwen 对话验收。

最终以运行记录为准；尚需在实际麦克风/扬声器设备上完成一通真实 Qwen 对话，确认声音驱动灯光、连续打断和实际情绪收尾。额外混元模型尚未生成或验收。

## 2026-11-01 本地实现记录

- `pnpm build`：生产构建与 TypeScript 检查通过。
- `pnpm test`：当前工作树 15 个测试文件、66 项测试通过。
- 浏览器测试使用合成 PCM、模拟 WS 与 Chromium 假输出设备；不走真实扬声器，不产生模型调用费用。
- `playwright.immersive.config.ts` 提供 3200 端口与独立测试结果目录，便于与默认 3100 的测试隔离。运行：`pnpm exec playwright test tests/e2e/landing.spec.ts tests/e2e/immersive.spec.ts --config=playwright.immersive.config.ts --workers=1`。
- 本机初始 Chromium 音频时钟不推进，最小振荡器复现同样问题。测试增加 `--disable-audio-output` 使用假输出设备后恢复；未用模拟能量替代 AnalyserNode。
- 机械设计检测已执行：42 项建议（字体级别、舞台色与旧 CSS 的设计文档映射），无非建议级问题；它不能代替视觉审查或真人设备验收。

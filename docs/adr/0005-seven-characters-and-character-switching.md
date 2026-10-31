# ADR 0005: 七角色阵容扩展、官方音色映射与无串线角色切换

## 状态

已实施 (Accepted)

## 背景

在通过 G0-G3 单角色（孟婆）验证后，系统进入 Gate G4 扩展黄泉议会 7 位角色阵容：
1. 孟婆 (Meng Po · Afterlife Bartender)
2. 黑无常 (Hei Wuchang · Night Shift Host)
3. 白无常 (Bai Wuchang · Afterlife Hype Host)
4. 钟馗 (Zhong Kui · Demon-Hunting Bouncer)
5. 弗兰肯斯坦怪人 (Frankenstein's Monster · Misfit Inventor)
6. 狼人 (Werewolf · Full-Moon Party Animal)
7. 吸血鬼 (Vampire · Elegant Night Owl)

规范要求：
- 每角色配置可辨别的形象海报、人设指令、已试听通过的真实官方音色、双语开场与介绍、卡片定制主题与专属身份生成逻辑。
- 只在选中角色后加载 3D 模型；无 3D 资产时优雅降级为高清形象海报，不虚假请求或阻断全双工语音。
- 切换角色必须安全关闭旧语音连接与异步任务，严防多角色串线。
- 提供 42 条多维度内容评估矩阵覆盖 7 角色 × 2 语言 × 3 场景话轮。

## 架构决策

1. **统一角色注册表 (`@nether/party-core`)**:
   - 在 `packages/party-core/src/characters.ts` 中建立类型安全的 `CHARACTERS` 静态定义库，包含 7 位角色的中英文姓名、职位、开场介绍、收尾方向、试听音色、话题示例、开场 Prompt 提示词与 1080×1440 Canvas 卡片调色板（`CardTheme`）。
2. **千问官方实时语音音色真实探测与锁定**:
   - 经与官方 WebSocket 端点真实握手探测，7 位角色分别绑定并通过了以下系统音色：
     - 孟婆：`longanqian_v3.1`（温和长者叙事音）
     - 黑无常：`longyuan_v3.1`（沉稳冷静断案音）
     - 白无常：`longxiaoxia_v3.1`（活泼喜庆热场音）
     - 钟馗：`longhua_v3.1`（豪迈威武天师音）
     - 弗兰肯斯坦怪人：`longjielidou_v3.1`（独特真诚创客音）
     - 狼人：`longxing_v3.1`（高亢狂野破压音）
     - 吸血鬼：`longwan_v3.1`（优雅从容午夜音）
3. **入场与服务端中继解耦支持**:
   - `POST /api/sessions` 解除原先 `characterId: z.literal("meng-po")` 的单角色约束，改为支持完整的 `CharacterId` 枚举校验。
   - `relay.ts` 在收到上游 `session.created` 时，根据 `session.characterId` 动态获取对应官方音色与定制 System Prompt，开场问候语亦按角色设定定向注入。
4. **个性化身份生成与卡片主题渲染**:
   - `generator.ts` 结合角色的人设与收尾目标引导大模型生成匹配其角色神话内涵的称号与暖心结语；即使网络失败，亦提供 7 种风格迥异的确定性 Fallback 身份卡。
   - `canvas.ts` 读取 `CardTheme`，按角色动态渲染背景径向光晕、装饰外边框、标签徽章与批注栏，保持高对比度与视觉辨识度。
5. **切换状态机与防串线清理**:
   - 客户端触发 `changeCharacter` 时，执行 `client.stop("character_change")` 彻底关闭旧 WebSocket 与麦克风采集流，重置会话视图为 `idleView`，确保无旧角色音频残留或跨连接事件冲突。

## 验证与证据

- `pnpm lint`：0 错误，0 警告。
- `pnpm typecheck`：4 个工作区（contracts, party-core, web, root）100% 通过。
- `pnpm test`：全部 13 个 Vitest 测试套件、46 项单元与集成测试全绿，包含 42 条跨角色多场景内容评估矩阵。
- `pnpm test:e2e`：全部 18 项 Playwright 跨视口端到端测试全绿，新增角色切换无缝切换验证。
- 自动化构建：`pnpm check`（Next.js 生产优化构建与资产哈希核查）一次性成功。

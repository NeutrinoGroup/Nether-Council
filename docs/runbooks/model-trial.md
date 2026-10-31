# 孟婆模型实机验收

先运行 `pnpm assets:verify`，记录提交、部署 URL、设备／系统／浏览器版本与网络。桌面以目标 Mac 的真实 Chrome／Safari，手机至少一台实体 iPhone 或 Android；手机视口模拟和 SwiftShader 均单独归类，不计实机通过。

打开 `/play?lang=zh` 和英文入口，检查真实 GLB 的服装、南瓜碗、面部、材质与手机裁切。模型没有骨骼或 morph，眼睛为静态烘焙；嘴部是独立网格。关闭 WebGL 或阻断 GLB 时，应显示海报和明确降级提示，开麦控件仍可操作。

使用签名邀请点击开麦，连续运行至少两分钟，包含待机、听、说、插话和停播。听到真实回复时观察嘴部，停播后应闭合，静音不能通过假波形让角色说话。检查字幕与底部控制互不遮挡，页面退出后麦克风关闭。

每两秒记录 `.character-stage` 的 `data-fps`、`data-triangles`、`data-textures`、`data-draw-calls`，开发者工具另记模型请求耗时、传输大小、GPU／内存趋势及页面错误。FPS 为最近约两秒渲染帧率；JS heap 不能代表 GPU 内存。单个 GLB 目标 ≤8 MiB、贴图 ≤2K、目标设备 ≥30 FPS，首屏等指标以 spec 为准。记录最低／中位 FPS 和实际波动，失败项保留。

匿名报告存本机 `artifacts/g2-model/device-YYYYMMDD.json`：版本、URL、设备、浏览器、两分钟持续时间、模型加载、FPS 分布、资源趋势、语音同步／停播结论、错误。不要包含邀请凭据、音频或私人故事。只有目标 Mac 与手机均有记录且达标后，才勾选 T08。

已有自动化基线：arm64 Mac、无头 Chromium 156、SwiftShader，121101ms 待机，FPS 最低 19.4／中位 38.8；它没有证明实体设备性能达标。

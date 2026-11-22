# 青年求生者 · 托腮弹牌 Spine 工程

《The End》· 2026-11-21 · 历史手臂版。用户要求复用 R3 全身骨骼及原部件，当前动作见 `spine-flick-full-body/`。

用户决定用骨骼动画制作这段表演。沿用黄金腰线三视图的右侧原画及已确定的托腮姿势。右手指节托腮，左手托住右肘。胸前三张牌中，中间的格挡牌在第 0.44 秒被右手食指弹出，之后右手回到下巴。单次动作长 1.20 秒。

工程由 12 根骨骼和 10 张独立部件图组成。前臂、手腕和食指使用各自的旋转轨道和贝塞尔曲线，三张牌各有独立骨骼。头部、身体、左手托肘、右臂和纸牌的绘制顺序在 Spine 插槽中可调。运行资源为一页直通透明 RGBA 图集与 Spine 3.8.75 JSON，Cocos 使用原生 `sp.Skeleton` 和实时缓存模式。

| 检查 | 结果 |
| --- | --- |
| Spine 可编辑工程 | 3.8.75 实际导入、保存并导回 JSON。保留 12 根骨骼、10 个插槽及思考、弹格挡两个动作。前臂、手腕、食指分别保留 12、16、10 个旋转关键帧。 |
| 贴图 | 图集逐部位对照了 146,639 个可见 RGBA 像素，差异为 0。 |
| Cocos 实播 | Web Desktop 构建退出 0。正常和半速均完成弹牌，实测约 1.20 和 2.40 秒。暂停后的轨道时间差为 0。点「思考」恢复三张浮牌。 |
| 触牌和固定区域 | 第 0.44 秒食指骨尖距卡牌边缘约 1.92 个骨架单位。两张未选中的牌坐标逐段一致。六个姿势中，头部和下半身 35,666 个截图像素的对照差异为 0。已查看托腮、触牌和飞出的原生截图。 |

解压 `survivor-flick-spine-3.8.75.zip` 后，在 Spine 3.8.75 打开 `survivor-flick.spine`。同级 `parts/` 是编辑所需的十张部件图，`runtime/` 是导出的运行资源。Cocos 场景为 `assets/SurvivorFlickSpineReview.scene`，控制组件为 `assets/game/presentation/actors/SurvivorFlickSpineReview.ts`。本机预览使用 `node tools/spine/survivor-flick.cjs serve`，默认监听 7488。此前的逐帧样片是历史记录。

详细数据见 `verification.json`。OpenViking 记录为 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/flick-spine-review.md`，数据为 `viking://~/resources/projects/the-end/docs/survivor-flick-spine-check.json`。

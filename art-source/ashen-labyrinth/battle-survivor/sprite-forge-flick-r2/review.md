# 焦土迷宫青年求生者 · 托腮弹牌序列帧 R2

《The End》· 2026-11-21 · 历史逐帧样片，已完成制作者自审。用户已改用 Spine 骨骼动画。当前演示和验收见 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/flick-spine-review.md`。

用户退回 R1，原因是整个人物逐格重绘导致造型和色彩变动。R2 的唯一角色母图是定稿黄金腰线三视图的右侧面。项目的 `frames/source/profile.png` 是该侧面的透明抠图。可见区 RGB 已对照 `turnaround-golden.png` 的右侧裁切逐像素确认。原姿势的下垂手臂占住衣料，托肘和肘后遮挡使用固定补片。动作各帧共用母图、原近侧护臂纹理，以及同一份右掌与食指图层。

右手指节托腮，左手托着右肘。中间的格挡牌在第 0.44 秒接触右手食指，向右翻转离开，随后右手归位。照明牌和回击牌使用 `assets/ashen-survivor-frames/survivor-props.png` 的原牌面，固定摆放。首轮审片发现护臂硬边和照明牌与手腕重叠，最终版已修护臂遮罩并把照明牌放到手腕运动范围外。

| 检查 | 结果 |
| --- | --- |
| 三视图原色 | 头发与面颈、围巾、披风背侧、牌匣、布袋、下摆、裤腿和靴子等保护区含 76,821 个原画像素。60 帧逐点比较 RGBA，错位和变色像素均为 0。 |
| 动作范围 | 动作范围外的变化像素为 0。被弹出的格挡牌离手后翻转。其他两张牌的周边区域逐帧相同。手收回后，人物层与首帧完全相同。 |
| 出手连接 | 逐帧检查了托腮、蓄力、触牌、离手和收手，抽查 11 张身体帧均只有一个主要可见连通轮廓。第 0.44 秒接触处的可见像素间距约 1 像素。 |
| 预览 | Agent Sprite Forge 浏览器审片在 1 倍和半速都显示了 60 个时间位置，单轮实测约 1.21 秒和 2.41 秒。分别检查深色和浅色底上的轮廓和接缝。GIF 全片共用色表，复解码确认固定区域 RGB 无变化。WebP 已由 Forge 验证可见 RGB、透明度和时序。 |
| 交付 | 60 张 576 × 944 RGBA PNG，50 帧/秒，1.20 秒，统一锚点 (199, 919)。交付含原色 WebP、正常速度与半速 GIF，以及三视图对照。 |

Agent Sprite Forge 沿用本机已核对的提交 `25203d03900b46b444bdd72a75768c33d1895ad6`，使用 `master_still.py` 登记侧面、`build_animation_clips.py` 核对 PNG、无损 WebP 和时序、`animation_review.py` 实播审片。交付范围为独立序列帧预览。原生姿势参照为 `assets/SurvivorFrameReview.scene`。

本地资料位于 `art-source/ashen-labyrinth/battle-survivor/sprite-forge-flick-r2/`。R1 的历史产物和验证保留在同级 `sprite-forge-flick-r1/`。本版 OpenViking 复核数据见 `viking://~/resources/projects/the-end/docs/survivor-sprite-forge-flick-check.json`。

# 青年求生者 · 托腮弹牌深度与回放修订

《The End》· 2026-11-21 · 7490 历史评审稿。用户反馈双手穿插。当前双手修订与实机核对见 `spine-flick-hands/`。

用户反馈 7489 全身版缺乏立体感。旧版在 0.30 秒左右连点会立即重置轨道，格挡牌到 0.69 秒仍在视口内却已隐藏。旧版的双臂长度固定，左手一直画在右臂前方，右腕收势弯到约 52°。沿用 R3 骨架、双腿 IK 和 35 张原身体部件图，以原图的侧面为准。

蓄势先降低重心，接着前脚承重，髋部推动胸肩。后脚绕原画鞋底的脚尖抬跟。近侧右肩前移，远侧左肩后收。近远两条手臂分别改变投影长度，左手托住右肘时在前面，松手后让到右臂后方。右手食指第 0.44 秒触中间牌，格挡牌由正面翻到薄边，飞出视口后隐藏。照明和回击保持原位。收手后恢复有呼吸的思考姿势。

连续输入排一次后续弹牌。键位交接按当前弹牌轨道的时间结算。原 Cocos 混合轨道的结束事件会多触发一次，已改用当前轨道时间判断收势。用户点「思考」可恢复三张牌。

| 检查 | 结果 |
| --- | --- |
| 部件与原生导出 | 35 张旧部件图逐文件 SHA-256 一致，旧项目源、45 根原有骨骼、原蒙皮、双腿 IK 和旧七个动作回读一致。新工程共 60 根骨骼、50 个插槽，Spine 3.8.75 导入导出成功。 |
| 立体与落脚 | 在实际 Cocos 中按约 100 Hz 取样。右前臂投影长度在绑定长度的 73% 到 98.5% 之间变化。左手在 0.235 秒切向右臂后侧。前脚漂移小于 0.001 个骨架单位，后脚趾最大漂移约 0.104，后跟抬约 8.01。右腕最大弯折约 41.7°。查看了托腮、换层前后、触牌、牌翻到薄边及收手的原生图。 |
| 牌和连续输入 | 新版在旧隐藏时点之后仍保留格挡牌，牌的边缘越过视口后才隐藏。两张未选牌位置一致。0.20 秒的连点保持当前轨道时间，随后只播放一次排队动作。 |
| 回放 | Cocos Web Desktop 构建成功。正常和半速约 1.22 秒、2.42 秒。暂停时轨道时间差为 0，点「思考」复位，采集的浏览器错误为 0。 |

当前预览端口为 7490。工程路径为 `art-source/ashen-labyrinth/battle-survivor/spine-flick-depth/`，解压 `survivor-flick-depth-spine-3.8.75.zip` 后在 Spine 3.8.75 打开 `survivor-flick.spine`。原生场景为 `assets/SurvivorFlickSpineReview.scene`，动画控制位于 `assets/game/presentation/actors/SurvivorFlickSpineReview.ts`。详细实播取样保存在 `output/playwright/survivor-flick-depth/runtime-check.json`。

OpenViking 评审记录为 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/flick-spine-review.md`，验证数据为 `viking://~/resources/projects/the-end/docs/survivor-flick-spine-check.json`。

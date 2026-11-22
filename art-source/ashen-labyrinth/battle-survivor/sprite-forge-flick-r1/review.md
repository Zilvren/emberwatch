# 焦土迷宫青年求生者 · 托腮弹牌序列帧

《The End》· 2026-11-21 · 单动作视觉评审草案。

制作以 `art-source/ashen-labyrinth/battle-survivor/turnaround-golden.png` 的右侧面为角色参考。托腮和出手姿势对照 `frames/source/model-cel.png` 与 `frames/preview/native-gesture-strip.png`。待机时右手指节贴下巴，左臂横在胸前，左手托住右肘。胸前三张纸牌浮空，当前样片选中间的格挡。第 0.44 秒右手食指伸出，格挡牌翻转向画面右方飞出。照明、回击留在固定位置，右手随后回到下巴。腰间抽牌的早期生成结果没有进入本次交付。

身体使用 Codex 内置 ImageGen 绘制，同一张原始图包含八张全身姿势。Agent Sprite Forge 按靴底登记切帧并写入动作时间线。三张卡面从项目自己的 `assets/ashen-survivor-frames/survivor-props.png` 读取，在独立位置合成。生成原图、提示词、切框和校验记录与成品一起保留。制作依据 GitHub 提交 `25203d03900b46b444bdd72a75768c33d1895ad6`。

| 检查 | 结果 |
| --- | --- |
| 安装 | 五个 Codex 技能目录的 184 个文件均与该提交 Git blob 一致。 |
| 逐帧与登记 | 8 张独立 400 × 456 RGBA PNG，统一锚点 (128, 441)，八帧的脚底高度一致。 |
| 动作和卡牌 | 1.20 秒单次动作，第 0.44 秒触牌。触牌时指尖与牌的可见像素最小间距约 1 像素。另两张牌位置固定，中心区像素逐帧一致。 |
| 预览 | 逐帧检查了全身姿势与手部连接。GIF 与 WebP 均解码出 8 帧，累计 1.20 秒。 |
| 观感 | 托腮、伸指和恢复姿势清楚。出手后撤腕至回手之间的位移较大，节奏仍看得出换帧。用户观感待审阅。 |

本次使用独立图像预览。原生参照为 `assets/SurvivorFrameReview.scene` 和 `assets/ashen-survivor-frames/SurvivorFrameReview.ts`。素材包为 `survivor-guard-flick-r1.zip`。详细校验与卡牌位置见同目录 `verification.json`。

OpenViking 复核记录位于 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/sprite-forge-flick-review.md`，逐项数据位于 `viking://~/resources/projects/the-end/docs/survivor-sprite-forge-flick-check.json`。

# 青年求生者 · 托腮弹牌双手修订

《The End》· 2026-11-21 · 7491 历史评审稿。用户随后明确右手托腮、左手弹牌，并要求增强立体感。当前工程见相邻 `spine-flick-left/`。

用户指出 7490 的左右手存在穿插。旧版右手引用左手指片，放大时托腮和出牌会露出额外指尖，掌根和腕口有缝。旧版左手在托肘阶段整体切到右袖前方，0.19 秒时明亮像素掩模与右袖相交 1,206 像素。

本版在同一套全身骨骼上复用早期工程已有的右掌、右食指两张图。右手腕、掌根与食指各有骨骼，掌根压住袖口，托腮时按脸的可见边缘留出间隙。第 0.44 秒由右食指触格挡牌边。左手使用 R3 原左手，指尖贴着右肘下方，出手时撤到胸前，避开右袖和腰牌匣，收手后从下方复位。左手沿用远侧绘制顺序。全身重心、脚底、三张浮牌及输入排队沿用《The End》现行评审动作。

| 检查 | 结果 |
| --- | --- |
| 实际渲染轮廓 | 原生 Cocos 放大至 2.98 倍，沿 1.20 秒动作分离渲染了 31 个姿势。右手对脸、右手对格挡牌、左手对右袖及腰牌匣、左右手彼此的取样相交像素均为 0。 |
| 袖口和接触 | 左右腕口在全部取样中均保持可见搭接。放大图中托肘的最近间隙为 1 像素，触牌时指尖至牌缘为 2 像素。查看了旧版和修订后的托腮、触牌，以及新版的收手特写。 |
| 运行 | 按钮的正常速度、半速、暂停、复位和连点排队复测通过。格挡牌在 0.44 秒离手后飞出视口。浏览器记录无运行错误。 |
| 原画与工程 | R3 的 35 张部件图与旧工程逐文件一致，两张右手图与早期可编辑工程中的部件图逐文件一致。Spine 3.8.75 实际导入与导出通过。56 根骨骼、45 个插槽、39 张图。Cocos Web Desktop 构建退出 0。 |

解压 `survivor-flick-hands-spine-3.8.75.zip` 后，用 Spine 3.8.75 打开 `survivor-flick.spine`，选择 `think` 或 `guard-flick`。同级 `parts/` 含原部件和现成右手图，`runtime/` 含 Spine JSON 和图集。Cocos 评审地址为本机端口 7491，原生场景为 `assets/SurvivorFlickSpineReview.scene`。

实际特写对照为 `output/playwright/survivor-flick-hands/hands-compare.png`，轮廓验证详情在同目录 `hand-clearance.json`。OpenViking 评审记录为 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/flick-spine-review.md`，验证数据为 `viking://~/resources/projects/the-end/docs/survivor-flick-spine-check.json`。

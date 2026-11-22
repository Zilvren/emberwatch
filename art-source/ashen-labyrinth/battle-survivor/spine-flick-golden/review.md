# 青年求生者 · 托腮和出牌的身体修订

《The End》焦土迷宫，2026-11-22。独立 Pink/Cocos 动作评审，端口 7494。本次改动针对用户截图中脸以下的身体，以及随后指出的右手手型。新版视觉效果待用户审阅。

## 身体与右手

`../turnaround-golden-master.png` 是全身定稿，`../head-turnaround.png` 是头部定稿。沿用上轮加宽两颊与下颌的 3/4 脸，头部绘画及其已有骨骼附件单独保存。根据三视图补绘了同机位的全身定位稿 `reference/body-think-three-quarter.png`。衣料露出面位于 `reference/body-cloth-underpaint.png`。只把需要随骨骼移动的部件装入角色，面部继续使用原来的头骨附件。

待机时，人物自己的右掌托住右侧下颌，弯曲的手指贴在耳前的脸颊，嘴唇露出。右手的局部修订来自 `reference/right-cheek-support.png`。支撑手与袖口分别切出，手腕、肘窝和掌侧接触位置登记在同一坐标系内。左掌从下方承住右肘，拇指和指节画在肘部前缘。出牌时左掌向腰侧让位，右手先离开脸，再翻腕。翻腕中用同一只手腕上的形态变形和手套视角切换交接，露出的上臂有独立袖筒，披肩下方有连续衣料。

披肩、里衣、斜带、布袋、牌匣和两条腿分属原骨架上的部件。布袋的侧面随腰摆动，牌匣贴合腰带，近脚承重，远脚后撤。两只靴子各有落地点和接触阴影。保留原 R3 的部件与既有动作，新动作复用其上臂袖筒与腿部 IK。出手的手背以原手套为参考补绘在 `reference/right-wrist-release.png`，短拇指位于桡侧，与微弯的四指可分辨。三张牌在身前错开高度，让拨牌的右前臂从左前臂上方经过。分件来源及定位见 `source-reuse.json`。

## 实际操作

点悬浮牌或按 1、2、3 只选择位置。确认「出牌」或按 Enter 后，托腮的同一只右手离脸，在 0.385 秒接触选中牌的近侧边，0.44 秒离手，1.20 秒完成回位。三张牌共用双门纹牌背，倾斜飞出时仍露出这一面。「看手势」可放大上身，「速度 ×0.5」可看半速。未选的牌留在原位。

## 实机证据

`output/playwright/survivor-golden/body-before-after.png` 将用户发来的身体截图与新版 Cocos 画面按相同位置和比例并排。`right-cheek-and-play.png` 是实际游戏中的托腮与弹牌两个时刻。`motion-before-after.webm` 并排回放旧版与本次正常速度及半速动作。对照三视图可打开 `turnaround-comparison.png`。

检查覆盖右掌与近侧脸颊的接触、嘴眼遮挡、左手在右肘前的可见部分、双腕与双肘的连接、前后靴底与身体原画的落点、三张牌的触发和飞行。数据在 `verification.json`。本次实际运行的是 `assets/SurvivorFlickSpineReview.scene`。

用 Spine 3.8.75 打开 `survivor-flick.spine`，保留同级 `parts/`。待机动作叫 `think`，左下、中间和右上分别对应 `lantern-flick`、`guard-flick`、`repel-flick`。身体原画配准与分件在 `tools/spine/three_quarter_body.py`，蒙皮在 `tools/spine/quarter_skin.py`，动作在 `tools/spine/prepare-quarter-flick.py`。

OpenViking 评审记录为 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/flick-spine-review.md`，验证记录为 `viking://~/resources/projects/the-end/docs/survivor-flick-spine-check.json`。

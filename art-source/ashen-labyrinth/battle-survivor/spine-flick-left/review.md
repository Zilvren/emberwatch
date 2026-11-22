# 青年求生者 · 右手托腮、左手弹牌

《The End》· 2026-11-21 · 独立动作评审稿。7492 的原生 Cocos 实播和放大画面已复核。

用户明确校正左右手分工。右手一直托在下巴旁，左手由右肘下方绕出，0.44 秒伸食指弹走中间的格挡牌，随后收回。格挡牌翻向薄边后飞出画面，照明与回击继续浮在原位。复用已有 R3 的 35 张身体部件图和两张现成右手图。

蓄势时右肩在前，左肩后收。出手时左肩前送，右肩让开，左前臂从缩短到伸展。披风原网格随胸部转动产生横向透视变化，领口及后缘的搭接点固定。右手沿下颌运动，腿部保持前脚承重和后脚尖支撑。项目中 7491 及更早的右手出牌记录作为历史参考。

| 检查 | 结果 |
| --- | --- |
| 左右手分工 | 实机 125 次取样，左食指的触牌轨迹最远移动约 118.76 个骨架单位。右指节在头部局部坐标中的最大漂移约 0.67。 |
| 可见轮廓 | 31 张放大渲染里，右手和头、左手和右袖及腰牌匣、双手彼此的取样交叠像素为 0。靠近触牌的三次取样中，左手与牌面的交叠像素为 0。右手和下颌最近间隙各次取样均不超过 1.42 个放大像素。双腕袖口各自持续搭接。 |
| 前后层次 | 蓄势阶段右肩向画面右方领先约 19.76 个骨架单位，触牌时左肩领先约 31.97。左前臂投影从约 72.2% 变化到 98.7%。用同姿势关闭披风变形作对照，Cocos 中披风顶点最大位移约 8.55 个骨架单位。检查了托腮、绕出、触牌和收手画面。 |
| 原生实播 | Spine 3.8.75 原生导出通过，57 根骨骼、45 个插槽、39 张图。Cocos Web Desktop 构建退出 0。正常与半速约 1.23、2.42 秒，暂停、复位与连点排队均通过，采集的浏览器错误为 0。 |

解压 `survivor-flick-left-spine-3.8.75.zip` 后，在 Spine 3.8.75 打开 `survivor-flick.spine`。新动作名为 `think` 和 `guard-flick`，同级 `parts/` 含独立部件图。Cocos 评审端口为 7492，场景位于 `assets/SurvivorFlickSpineReview.scene`。原生特写为 `output/playwright/survivor-flick-left/left-hand-closeup.png`。

OpenViking 评审记录为 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/flick-spine-review.md`，验证数据为 `viking://~/resources/projects/the-end/docs/survivor-flick-spine-check.json`。

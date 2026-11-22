# 焦土迷宫主角逐帧动作

《The End》评审稿，2026 年 11 月 21 日。以黄金腰线三视图的右侧面为定稿参考，对应独立场景 `assets/SurvivorFrameReview.scene` 和角色 Prefab `assets/ashen-survivor-frames/AshenSurvivorFrames.prefab`。

上一稿分开叠加两只手臂时，披风、袖口和托肘的手遮挡有误。此次用 ImageGen 重画完整上身姿势，在同一张画里画清两臂和衣料的遮挡，再用围巾和腰带登记上身。每帧复用原稿的脸、发梢与下颌。静立的腿和靴子也使用同一份原稿。透明边缘在原稿抠图后统一登记，细部见 `source/prompts.json` 和 `preview/art-check.json`。

| 动作 | 时长 | 表演 |
| --- | ---: | --- |
| 展牌 | 0.64 秒 | 三张牌在胸前浮空展开。 |
| 思考待机 | 3.40 秒循环 | 右手指节托腮，左前臂横抱胸前，左手托住右肘。肩和袖口轻动，牌各自微浮。 |
| 照明、格挡、回击 | 各 1.20 秒 | 近、中、远三条手势各有伸手、触牌和收势帧。第 0.44 秒右手食指弹出选中的牌，其余牌维持位置。手收回托腮姿势。 |

15 张全身透明 PNG 均为 512 × 944。图集保留原尺寸和脚底登记，动画以每秒 25 格计时，在 Cocos 的 `Body` 节点切换整张全身 SpriteFrame。可选的牌面保留各自的原生位置与飞行轨道，离手事件供表现层使用。各格开始时点保存在 `preview/timing.json`。

## 预览与素材

- `preview/survivor-frames.gif` 是从 Cocos 录制的连续动图，`preview/survivor-frames.webm` 保留完整时序。 `preview/face-comparison.png` 和 `preview/native-gesture-strip.png` 分别显示同尺度原稿侧脸及原生出牌连续帧。
- `survivor-frame-sequence.zip` 包含全套全身透明帧、脚底与触牌点登记以及使用时序。
- 本机审片入口为 `node tools/survivor-frames/review.cjs --serve`，默认端口 7487。点击浮牌或按 1–3 出牌，R 重新展牌，空格暂停或继续，V 切换全身与手势特写。半速可通过底部按钮切换。
- 制作入口依次为 `python -B tools/survivor-frames/pack.py`、图集导入、`node tools/survivor-frames/author.cjs` 和 `node tools/pink.cjs build --project . --platform web-desktop --build-config build-survivor-frames.json`。现有 PNG、SpriteFrame、场景和 Prefab 可直接使用。

## 核对结果

原稿脸部及发型区域的 12,410 个实色像素和透明轮廓在 15 张输出中均一致。对比 15 帧的脚底区域，坐标与 RGBA 值一致。已逐帧观察原生待机、伸手、触牌和收势。原生交互、暂停、半速设置、三张牌的触点与飞行数据见 `preview/runtime-check.json`，最终观感由用户审片确认。

OpenViking 位置为 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/frame-review.md`，验收记录为 `viking://~/resources/projects/the-end/docs/survivor-frame-animation-check.json`。

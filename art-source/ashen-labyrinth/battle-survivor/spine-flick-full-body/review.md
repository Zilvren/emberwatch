# 青年求生者 · 全身骨骼托腮弹牌

《The End》· 2026-11-21 · 7489 历史评审稿。用户反馈缺乏立体感，当前修订和实播核对见相邻 `spine-flick-depth/`。

用户要求复用旧工程的角色部件和全身绑定。底稿取自 `art-source/ashen-labyrinth/battle-survivor/spine/survivor.spine` 的 Spine 3.8.75 R3。编辑工程保留其 45 根原有骨骼、双腿 IK、旧皮肤和原有的七个动作。35 张原部件图与旧工程逐文件 SHA-256 一致。照明和回击沿用已有卡面。当前工程包含 55 根骨骼、46 个插槽和 37 张部件图。

`think` 为 2.56 秒的循环待机。右手指节托腮，左手托右肘，胸前有三张浮牌。`guard-flick` 长 1.20 秒。髋部下沉带动双膝屈曲，胸肩向前送力，左手撤到胸前，右手食指在第 0.44 秒弹出中间的格挡牌。头、围巾、披风、衣摆、口粮袋依次跟随。两脚沿用原来的着地控制。右上臂在新动作中使用 R3 已有的闭合袖片，右护臂沿原纹理调整到肘部的搭接。这个版本的旧动作仍使用原绑定和原插槽。

| 检查 | 结果 |
| --- | --- |
| 旧资源 | 原有部件图、45 根骨骼、双腿 IK 和七个动作的源数据逐项回读一致。新图集与各部件原图对比 1,493,691 个可见 RGBA 像素，像素值一致。 |
| 可编辑及构建 | Spine 3.8.75 原生导入、保存并导出成功，保留全身关键帧。Cocos Web Desktop 独立评审场景构建退出 0。 |
| 实播 | 在 Cocos 实际点按，正常与半速均通过，约 1.23 秒、2.42 秒。暂停时轨道时间差为 0，返回「思考」时恢复三张牌。 |
| 全身动作 | 髋部最大位移约 18.87 个骨架单位，胸部 22.65，披风末端 35.54，两膝 23.38 和 18.58。双足落点最大漂移小于 0.001。 |
| 触牌和视觉 | 0.44 秒骨尖到牌边距离约 0.66 个骨架单位。两张未选中的牌位置逐段一致。查看了托腮、蓄势、触牌和收手姿势，重点核对袖肘搭接与双腿承重。 |

解压 `survivor-flick-full-body-spine-3.8.75.zip` 后，用 Spine 3.8.75 打开 `survivor-flick.spine`，选择 `think` 或 `guard-flick` 动作。同级 `parts/` 保持原目录结构，`runtime/` 为 Cocos 用的 JSON 与图集。场景为 `assets/SurvivorFlickSpineReview.scene`。本机评审使用 `node tools/spine/survivor-flick.cjs serve`，端口 7489。

OpenViking 评审记录为 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation/flick-spine-review.md`，逐项数据为 `viking://~/resources/projects/the-end/docs/survivor-flick-spine-check.json`。

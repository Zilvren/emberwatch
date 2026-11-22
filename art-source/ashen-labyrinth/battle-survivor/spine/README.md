# 青年求生者 · Spine 动作工程

《The End》焦土迷宫，2026 年 11 月 20 日左手修订版 R3。人物沿用黄金腰线三视图的右侧面。

解压整个资源包，用 **Spine 3.8.75** 打开 `spine/survivor.spine`。编辑器从同目录的 `parts/` 读取 35 张透明 PNG。

| 动作 | 时间线 | 时长 | 动作与衔接 |
| --- | --- | ---: | --- |
| 待机 | `idle` | 2.56 秒 | 空手靠近腰间牌匣，呼吸与披风回摆循环。 |
| 取牌 | `prepare` | 0.67 秒 | 手指从匣口抽起一张牌，最后停在蓄势姿势。 |
| 出牌 | `attack` | 1.10 秒 | 单独播放包含一次取牌。接在取牌末尾时由 0.22 秒开始，第 0.36 秒离手，第 0.58 秒命中。空手收回匣口，下一次出牌时再抽牌。 |
| 受击 | `hurt` | 0.47 秒 | 胸口先向后让，髋部下沉，护臂抬起后回到待机。 |
| 倒下 | `death` | 1.38 秒 | 先失去重心，前脚抬起、落地，髋与肩依次着地，衣摆铺开。一张牌从倾斜的牌匣滑落。 |

## 左手的夹牌与松指

左手从腰间牌匣取牌。护臂的肘端以实心布褶承接前臂，手腕转动时袖口仍有连续的重叠。腕部、拇指指腹和牌角的登记坐标保存在 `parts-register.json` 的 `leftHand`。拇指画在牌前，食指画在牌后。食指和中指有跨指节的网格，无名指与小指在掌部原画上。离手时先松拇指，食指展开，中指稍后跟随。手掌与袖口共用腕点，撑地时按手掌和指尖的可见轮廓求接触高度。

手部近景见 `preview/left-hand-motion-r3.gif`，同尺度旧版与修订版截图在 `preview/left-hand-comparison.png`。手型原画为包内 `left-hand-poses.png` 和 `left-hand-release.png`。这些图用于手部绑定，装备和战斗结算沿用各自的系统。

## 接入与编辑

- `CardMouth` 是匣口标记，`AttackTip` 是指尖标记。`release`、`impact` 分别标记离手与命中。编辑出牌轨迹时检查交接处的位置、方向和速度。
- `card-flight` 和 `carry-card` 是辅助轨道。出牌被打断时，已离手的牌沿原轨迹飞完，仍在手里的牌随手回到匣口。反复点击出牌会排入一张后续动作。
- 膝和肘位于裤管、袖子内部。跨关节的网格同时接受上下两段骨骼的权重。近侧与远侧脚点分别由 `near-plant` 和 `far-plant` 控制。倒地动作的 `deform` 关键帧让软布接触地面后铺开。
- `parts-sheet.png` 标注所有拆件。`parts-register.json` 记录原画来源、轴心和补绘范围。中立姿势可与三视图核对，战斗姿势会使用完整裤腿和松手手型。遮挡后露出的衣料补在 `coat-underpaint.png`。
- Cocos 角色为 `assets/prefabs/actors/AshenSurvivor.prefab`。独立场景 `assets/SurvivorSpineReview.scene` 提供取牌、出牌、受击打断、连播、半速及暂停。运行包的骨架 JSON、atlas 和配套纹理页在 `runtime/`，采用直通透明度。
- 在仓库执行 `npm run build:survivor` 和 `npm run survivor:preview` 可打开本机预览。`preview/` 中的动图与视频来自同一次连续 Cocos 播放。`verification.json` 包含关节、实体轮廓、重复输入、打断和媒体的实测结果。

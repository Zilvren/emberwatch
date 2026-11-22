# 焦土迷宫战斗怪物与场景

The end · 2026 年 11 月 19 日 · Spine 3.8.75 制作评审包

以本轮用户最后上传的三怪图为造型基准。灰灯蛾的月纹、叩石螯的背甲和守像的面具都直接从这张图提取。[选定原图](monster-concepts.png) · [三档画风对照](styles/comparison.png)

## 看动画

打开 [Cocos 实播动图](preview/battle-motion.gif)。第一段在折光回廊分别看三种起手和攻击，第二段在沉灯井庭看受击和死亡停姿。画面底部标有怪物与当前动作。

| 怪物 | 可编辑工程 | 拆件图 | 图像插槽 | 骨骼及控制 | 攻击接触 |
| --- | --- | --- | ---: | ---: | ---: |
| 灰灯蛾 | [ash-moth.spine](ash-moth/ash-moth.spine) | [部件图](ash-moth/parts-sheet.png) | 16 | 17 | 0.43 秒 |
| 叩石螯 | [stone-claw.spine](stone-claw/stone-claw.spine) | [部件图](stone-claw/parts-sheet.png) | 14 | 16 | 0.55 秒 |
| 垂幡守像 | [veil-idol.spine](veil-idol/veil-idol.spine) | [部件图](veil-idol/parts-sheet.png) | 18 | 16 | 0.68 秒 |

灰灯蛾在俯冲前先收前翅，后翅和触角晚半拍跟上。石螯先抬主螯，活动上指合向螯掌，两条近侧腿由 IK 锚定足尖。守像从袖口伸手，垂幡的末端沿两段骨骼加权弯曲，石座承担固定支点。

## 在 Spine 中调整

解压整个资源包，用 **Spine 3.8.75** 打开上表任一工程。每只怪的 `parts/` 与 `.spine` 放在同一目录。切到 Animate，可以分别播放 `idle`、`prepare`、`attack`、`hurt`、`death`。待机按循环播放，其余动作按一次播放。攻击时间线含一个 `impact` 事件。

| 目录或文件 | 用途 |
| --- | --- |
| 每只怪的 `parts/` | 可替换的透明 PNG。41 张承载原画可见部位，另有 7 张专用衬层承接肢体转开后露出的区域。 |
| 每只怪的 `parts-register.json` | 各部件的原图坐标、旋转中心、图层顺序和可见像素校验。 |
| 每只怪的 `runtime/` | Spine 实际导出的骨架 JSON、atlas 和配套纹理页。守像使用两页图集，导入时一起放入同一目录。 |
| `backgrounds/` | 两张独立的无角色战斗底图，分别为 [折光回廊](backgrounds/light-cut-passage.png) 和 [沉灯井庭](backgrounds/sunken-lamp-court.png)。 |
| `source-parts.png` | 各怪物用于隐藏关节的补绘材料。外露部件以用户选定原画为准。 |

## 接入和复核

运行包使用直通透明度的 PNG 和线性过滤，Cocos 加载时 `premultipliedAlpha = false`。两张背景都为横向游戏视角。回廊的落脚区在近侧灰坡，井庭的落脚区在跨井石道。压缩动图供桌面审阅，原尺寸素材与可编辑动画随包交付。

项目显式作者入口为 `tools/spine/bestiary-author.cjs`。在仓库根目录运行 `node tools/spine/bestiary-author.cjs prepare` 会重建拆件与 `.authoring.json`。设置 `SPINE_EXE` 后，`export` 可从作者数据制作新工程并打包运行资源。`--replace-projects` 会覆盖对应编辑工程，手工改过的动作请从 Spine 编辑器直接导出。命令行格式可查阅 [Spine 官方 CLI 文档](https://esotericsoftware.com/spine-command-line-interface)。

已在项目的 Pink/Cocos 桌面预览加载三套运行资源。主游戏中的遭遇编排、数值和伤害结算属于后续玩法接入。造型依据已选定，动作节奏与战斗场景为本轮评审稿。

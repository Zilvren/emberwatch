# 焦土迷宫战斗怪物与场景

The end · 2026 年 11 月 19 日 · Spine 3.8.75 制作评审包

以本轮用户最后上传的三怪图为造型基准。灰灯蛾的月纹、叩石螯的背甲和守像的面具都直接从这张图提取。[选定原图](monster-concepts.png) · [三档画风对照](styles/comparison.png)

## 2026-11-28 · 神话遭遇

六种演员已接入 Pink/Cocos 正式战斗，原始三怪在下图第一排。角色工程按 Spine 3.8.75 原生格式保存，各工程旁的 `parts/`、`parts-register.json`、`parts-sheet.png` 和 `runtime/` 用于改画、复核轴点和重新导出。[九种怪物同尺度对照](preview/mythic-lineup.png)

| 遭遇 | 可编辑工程 | 动作读法 |
| --- | --- | --- |
| 风蚀栖台／双翼风廊 | [斯廷法洛斯鸟](stymphalian-bird/stymphalian-bird.spine) | 收起飞羽后俯冲，双鸟各自轮换普攻、蓄势和重击。 |
| 断柱石场 | [独眼石巨人](cyclops/cyclops.spine) | 肩与前臂抬起蓄力，前拳落下。 |
| 岔角庭 | [弥诺陶洛斯](minotaur/minotaur.spine) | 压低牛角、蹬蹄前冲。 |
| 沉水窟 | [许德拉](hydra/hydra.spine) | 低首、高首先后虚探，中首出击。 |
| 沉潮井 | [卡律布狄斯](charybdis/charybdis.spine) | 涡喉收紧吸石，潮唇向外涌出。 |
| 合岩隘口 | [相撞双岩](symplegades/symplegades.spine) | 石壁先分开，再向中线闭合，碎石随冲击弹起。 |

源图为 ImageGen 参考本项目三怪生成的原创绘画。两种环境怪分别取意于荷马描写的吞吐海水，以及《阿尔戈英雄纪》中船只需要穿越的相撞岩壁。[《奥德赛》第十二卷](https://beta.perseus.tufts.edu/urn%3Acts%3AgreekLit%3Atlg0012.tlg002.bryant1873-eng2/book%3A12/) · [《阿尔戈英雄纪》第二卷](https://www.theoi.com/Text/ApolloniusRhodius2.html)

使用 `node tools/spine/bestiary-author.cjs prepare --actor hydra` 重建单个演员的部件和作者数据。使用相同入口的 `export --actor hydra` 生成新工程或直接用 Spine 导出已改好的工程。六种演员在主游戏中的安装入口为 `node tools/spine/install-labyrinth-actors.cjs --mythic-bestiary`，拆件与对照图由 `python tools/spine/mythic-bestiary-sheets.py` 输出。

## 2026-11-28 · 七处房间背景

每个地点有独立的空场原画。玩家从程序地图进入房间、恢复战斗或查看战后奖励时，原生场景读取同一房间对应的画作。[七张空场对照](preview/mythic-rooms/empty-rooms.jpg) · [主游戏战斗取景](preview/mythic-rooms/in-battle.jpg)

| 地点 | 原画 | 画面地标 |
| --- | --- | --- |
| 岔角庭 | [原尺寸 PNG](backgrounds/rooms/horn-court.png) | 暖光中的巨型墩座与左右岔门 |
| 断柱石场 | [原尺寸 PNG](backgrounds/rooms/broken-column-quarry.png) | 横卧的断柱、方形凿痕与阶梯采石面 |
| 沉水窟 | [原尺寸 PNG](backgrounds/rooms/flooded-vault.png) | 天然岩拱、幽蓝静水与洞口倒影 |
| 风蚀栖台 | [原尺寸 PNG](backgrounds/rooms/windworn-perch.png) | 高处悬岩、低矮石栏与开阔远山 |
| 双翼风廊 | [原尺寸 PNG](backgrounds/rooms/twin-wind-gallery.png) | 两扇高窗、中央窄柱与斜照长廊 |
| 沉潮井 | [原尺寸 PNG](backgrounds/rooms/ebb-well.png) | 环形井阶、三道水位刻痕与冷色顶光 |
| 合岩隘口 | [原尺寸 PNG](backgrounds/rooms/clashing-pass.png) | 相向岩壁与狭缝深处的日光 |

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

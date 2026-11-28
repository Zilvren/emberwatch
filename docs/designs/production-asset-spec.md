# The end 素材生产与原生接入规格

## 2026-11-28 · 神话房间背景的导入与取景

《The end》七张房间原画使用 ImageGen 参照已有的 `light-cut-passage.png` 和 `sunken-lamp-court.png` 绘制。源文件在 `art-source/ashen-labyrinth/battle-bestiary/backgrounds/rooms/`，尺寸为 1585 或 1586 × 992。显式运行 `python tools/author-battle-room-backgrounds.py` 以质量 92、4:4:4 色度采样输出等尺寸 JPEG。Pink 将 `assets/resources/art/battle-rooms/` 的七张运行图导入为 SpriteFrame，图像文件共 1,549,514 字节。

`GameRenderer.ts` 按当前战斗所在地图点解析房间，`RewardScreenPresenter.ts` 按奖励来源解析房间。`SceneAtmosphere.ts` 按需载入对应画作，离开时释放资源引用。读档复用存档里该坐标的房间身份。战斗地面登记在源图高度约 71.55% 处，窗口变化时按实际图像比例覆盖画面。奖励底图、边缘遮罩和选牌遮罩跟随可见窗口尺寸。

原画与实机取景见工作区 `art-source/ashen-labyrinth/battle-bestiary/preview/mythic-rooms/`。原始 PNG 的 OpenViking 目录为 `viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-bestiary/backgrounds/rooms/`。

## 2026-11-28 · 六种神话战斗演员

《The end》使用 1536 × 1024 的透明原画 `mythic-creatures.png` 和 `mythic-passages.png`。前一张按玩家选定的两次出图逐格保留牛头、独眼、三头蛇和鸟的原始绘画，后一张提供吞潮与合岩两种环境形体。ImageGen 使用项目现有三怪原画作参考。注册脚本从原图分取可见像素，以本部件的邻近颜色补足旋转时会露出的关节。源 PNG 的轻微透明噪声在取样时统一处理。六套部件在注册坐标合成后，与对应的标准化透明原画逐像素相符。

| 原生演员 | 透明拆件 | 作者骨骼 | 攻击接触 | 主要分层 |
| --- | ---: | ---: | ---: | --- |
| 斯廷法洛斯鸟 | 10 | 12 | 0.36 秒 | 两翼、初级飞羽、鸟喙和前后足爪 |
| 独眼石巨人 | 12 | 14 | 0.60 秒 | 单眼头石、肩臂、拳面与腰间垂布 |
| 弥诺陶洛斯 | 14 | 16 | 0.52 秒 | 牛首、两角、双臂、蹄腿与裙幅 |
| 许德拉 | 10 | 12 | 0.64 秒 | 共享盘躯、三条颈链和三个蛇首 |
| 卡律布狄斯 | 11 | 13 | 0.68 秒 | 涡喉、前后潮唇、泡沫带、基座与悬石 |
| 相撞双岩 | 8 | 10 | 0.62 秒 | 两块主岩、磨亮的撞击面、岩足与碎片 |

每种都有可编辑 `.spine`、独立 PNG、轴点登记、Spine 3.8.75 导出数据及 Cocos Prefab。五段动作沿用 `idle / prepare / attack / hurt / death`，待机循环，攻击按唯一的 `impact` 事件结算。涡潮与撞岩还在冲击到达前发出 `release`。地面基线为 Spine 的 0，原生点击区域来自中立姿势的可见像素边界。战斗与作者入口分别为 `assets/prefabs/screens/BattleScreen.prefab`、`tools/spine/bestiary-author.cjs` 和 `tools/spine/install-labyrinth-actors.cjs --mythic-bestiary`。

## 2026-11-28 · 战斗 HUD 石材插画

《The end》本轮已接入十五张分离的手绘风格 SpriteFrame。ImageGen 参照石廊与沉灯庭背景生成插画，独立原图保存在 `art-source/ashen-labyrinth/combat-ui/`。运行图位于 `assets/ashen-labyrinth/interface/`，按透明边界居中，采用线性采样。

| 用途 | 资源 | 运行像素 |
| --- | --- | --- |
| 城堡、能量盘、护甲 | `citadel-crest`、`stamina-seal`、`guard-shield` | 前两张 256 × 256，盾牌 160 × 192 |
| 抽牌、弃牌、空背包 | `draw-gate`、`discard-descent`、`supply-satchel` | 牌背 240 × 352，行囊 512 × 512 |
| 导航小像与物资 | `nav-deck`、`nav-satchel`、`nav-map`、`nav-recipes`、`nav-settings`、`nav-stores` | 112 × 112 |
| 顶栏、回合按钮、弹窗 | `nav-lintel`、`turn-plaque`、`field-tablet` | 1152 × 98、448 × 144、480 × 320 |

顶栏和弹窗使用九宫格缩放，固定角点纹样。导航小像保留原画颜色，回合按钮的响应色列在 `assets/ashen-labyrinth/interface/theme.json`。生命、格挡、能量、堆数和按键文案使用原生 Label。资源绑定在 `HUD.prefab`、`BattleScreen.prefab`、`SettingsPopup.prefab` 与 `BattlePilePopup.prefab`。

## 2026-11-28 · 旧地图专用素材与启动画面

《The end》已实装。正式新局的地图是焦土迷宫。灰烬街区的旧场景背景与退潮盐原的背景、角色、卡图集及原画已从工程移除。复用的原生界面预制体采用焦土迷宫的避难所和石廊背景，卡面使用迷宫插画图集。历史场景存档仍由现有读取器处理，旧角色骨骼由共用预制体提供。

`assets/TheEnd.scene` 的日志页和 HUD 初始隐藏。牌库与日志数据就绪后，由 `assets/game/presentation/GameRenderer.ts` 的首次渲染显示当前存档或新局对应的原生界面。首帧约束由 `tests/native-bindings.test.cjs` 检查。

## 2026-11-27 · 焦土迷宫执灯人战斗角色

本版已接入 Pink/Cocos 主场景。11 月 28 日用户提供的 `standing-reference.png` 是战斗站姿的逐像素依据。原始画稿和早期九件拆件保存在 `art-source/ashen-labyrinth/lantern-keeper/`。本版按 `standing-registration.json` 的可见边界从参考图切出独立纹理。1024×1536 画布以像素 (512, 1520) 对准游戏根节点，每个原图像素对应 0.2875 个 Spine 单位。

运行资源位于 `assets/ashen-labyrinth/lantern-keeper/`，使用 Spine 3.8.75、31 根骨骼和 19 个绘制插槽。站姿拆件及纸牌使用一页原尺寸图集，力竭曝光帧使用另一页，两页边长均在 2048 像素以内。`cloak-front` 与 `cloak-lining` 共用原画布料、网格顶点和骨骼权重，沿画稿中的弧形褶边分置于近袖前后。`cloak-back` 绘制身后的衣料。手和衣摆遮住的布纹由相邻同类材质补足，重叠处按原画透明度计算。左手的 `GripThumb` 与 `GripFingers` 在出牌时维持绑定姿势，纸面由 `CastOrigin` 和两侧折痕骨骼变形。

使用 `node tools/spine/build-lantern-keeper.cjs` 生成资源，`npm run build:web` 导出游戏。`tools/spine/capture-lantern-keeper-pixels.cjs` 在主场景读取实际玩家骨架，固定待机零时刻，将游戏额外显示的悬牌移出比对。黑白两次同姿势读回得到颜色和覆盖率，再由 `tools/spine/compare-lantern-keeper-pixels.py` 逐像素计算全图、可见披风、铜扣、袖口和翻边的差异。

| 动作 | 时长 | 表演与事件 |
| --- | --- | --- |
| 待机 | 2.50 秒循环 | 双脚固定，胸口、手腕与披风后摆错开呼吸 |
| 攻击出牌 | 0.66 秒 | 左手保持张开，纸在掌中折起，0.42 秒碎裂并结算攻击 |
| 格挡准备 | 0.58 秒 | 左手收回身前，0.28 秒捏碎并结算牌效 |
| 受击 | 0.38 秒 | 髋、胸、头依次后撤，再随披肩回稳 |
| 力竭 | 1.02 秒 | 腰侧右手收拳下击，0.60 秒右拳接地，后膝与前脚落稳。失败页定格在第 21 张画面 |

力竭动作使用 21 张注册在同一地面上的透明画面。起始衣料来自站姿拆件，弯身与跪姿使用对应原画中的披肩、袖根、内衬和下摆。关节、铜扣与衣摆落点配准中间画面。头部绕耳侧转动，灯光直接取自站姿参考像素。近侧右手从自然垂下收指，0.40 秒起沿用同一张闭合拳面，0.60 秒触地。前脚掌、后膝和拳峰在余下七张画面各自保持接触位置。

运行时由 `death` 时间线在 `landing-body` 插槽逐张切换普通 Spine 区域附件。待机、出牌和受击使用现有骨骼。`tools/spine/lantern-keeper-frames.py` 编排画面，`lantern_keeper_layers.py` 负责持续可见部位的配准、收指和头部采样。显式重制素材需要 Python、Pillow、NumPy、SciPy 和 OpenCV。Pink 构建直接导入已生成的 PNG、atlas 和 JSON。

`tools/spine/lantern-keeper-motion.cjs` 编排掌中纸面折皱和纸屑。碎裂帧隐藏整张牌、露出四片碎纸并发出一次 `impact`。碎纸在约 0.18 秒内淡出。待机与受击显式还原纸面展开的姿势。`SpineActorRig.ts` 转发动画事件，`GameDirector.ts` 提交现有 `play-card` 命令。

## 2026-11-26 · 焦土迷宫羊皮纸底图

用户确认素羊皮纸样式。`assets/ashen-labyrinth/interface/route-parchment.png` 是 Codex 内置 ImageGen 产出的 768×2048 原始 PNG，纸色参考 `assets/ashen-labyrinth/paper-back.png`。文件和输出原稿逐字节一致，SHA-256 为 `193d2021f23dd424dc9d8c6211b3354ddc0043f588ee672c5ecf90698adbb228`。

`RouteMapPanel.prefab` 与 `RouteMapPopup.prefab` 绑定同一个 SpriteFrame。`RouteMap.ts` 把底图放在滚动内容根节点上，由原生裁切区域裁切，随内容滚动。`RoutePoint.ts` 在纸面上使用深色文字和图标，状态沿用原生选路模型。验收检查两种桌面尺寸的对比、滚动位移和单击节点。

生成提示词

> Edit the supplied game card paper by transforming its parchment material into a full-bleed 3:8 tall vertical map paper strip. Keep its warm light honey-beige paper tone and restrained natural grain. Remove the card frame and the geometric symbol. The result is an entirely blank flat sheet of clean antique parchment with softly aged edges, very fine vellum fibers, and two or three understated horizontal fold creases. Uniform bright warm beige center for dark game route lines and labels. No map drawings, no contour lines, no objects, no ornaments, no logos, no writing, no numbers, no symbols, no wooden frame, no tabletop, no shadows outside the paper. It is only the paper that a map would be printed on. Entire image covered by parchment with subtle edge aging, suitable for a long vertical game UI scroller.

## 2026-11-26 · 焦土迷宫地图节点图标

The end 用户要求使用现成的节点图标。`assets/resources/ui/map-icons/` 收纳 Tabler Icons v3.53.0 官方 PNG。原图为 240×240 透明底，运行副本仅反转 RGB 将黑线换成白线，保留原图形和 Alpha，进入地图后由 Sprite 按节点状态着色。资源目录保留官方 MIT 许可证。 [Tabler Icons PNG](https://github.com/tabler/tabler-icons/tree/v3.53.0/packages/icons-png) · [MIT 许可证](https://github.com/tabler/tabler-icons/blob/v3.53.0/LICENSE)

| 资源 | 地点类型 | Tabler 原名 |
| --- | --- | --- |
| `battle.png` | 战斗 | `swords` |
| `elite.png` | 强敌 | `skull` |
| `rest.png` | 休整 | `campfire` |
| `unknown.png` | 补给和搜刮 | `question-mark` |
| `home.png` | 避难所 | `home-2` |

五张 SpriteFrame 居中注册，由 `assets/prefabs/ui/RoutePoint.prefab` 绑定，用 `assets/game/presentation/map/RoutePoint.ts` 以 62×62 逻辑单位显示。交互与只读视图共用同一图标尺度，主图继续通过原生按钮响应。验收检查 Pink/Cocos 导入、共享问号图标、主图与只读地图滚动、两种窗口尺寸及单次点击结果。

## 2026-11-21 求生者单件制作 · 脸部精修参考

按部件制作，第一件为青年脸部与颈根。脸模校形以精修侧光稿的眼睑、鼻翼、唇缘、耳廓为直接对照，用对应的 16 位正交深度确定距离。人物造型、绑定与三渲二动作分阶段验收。

精修稿及两张 768 × 710 单通道深度裁切保存在 [脸部参考目录](../../art-source/ashen-labyrinth/battle-survivor/model/parts/01-head/references/)。`face-detail-review.png` 并列同一局部的精修侧光稿、原深度再照明及新深度再照明。裁切相对于定稿头部面板的坐标、线性深度编码、源文件哈希与方向光校验见 `reference.json`。这组资料的美术状态为待审阅。

## 2026-11-21 青年求生者正交深度参考

本组资料供 Blender 角色校形使用，状态为待美术审阅。头部取自用户定稿的 `head-turnaround.png`，全身取自腿部加长后的 `turnaround-golden-master.png`。头部原尺寸为 2076 × 758，全身原尺寸为 5539 × 3467。两张整图和正面、朝画面右方的侧面、背面各自的单图位于 [模型深度参考目录](../../art-source/ashen-labyrinth/battle-survivor/model/depth-guides/)。

数据采用 16 位单通道线性 PNG。数值 0 表示背景，32768 表示相机轴的相对原点。其余有效灰度在三个方向和两个尺寸之间共用全身高度的 −0.22 至 +0.22 范围，较亮的位置更靠近对应相机。在 Blender 中按 Non-Color 读取，沿相机轴对照可见表面。裁切、符号、原稿哈希、面部配对点和校验结果见同目录 `guide.json`。

可将 `Survivor-depth-reference.blend` 中的「头部 · 正交深度参考」或「全身 · 正交深度参考」集合作为参考追加到角色工程。六张纹理已打包到该文件并按当前模型的单位对齐。Blender 4.5.15 重读参考库时逐张核对了文件哈希和一个 16 位像素样本。

先以鼻尖、下巴、耳轮及外轮廓核对正交位置，再检查眼睑、围巾与披风的层次。头发下面的头皮、披风里面的肩背和被遮住的远侧肢体仍需推定。预览中的侧光图由深度梯度生成。游戏演员、绑定与动作另行验收。

## 2026-11-20 青年求生者持牌左手

R3 把左手腕、纸牌夹持点登记到同一坐标系，拇指在牌前，食指在牌后，中指有独立屈伸。肘端布褶连续承接前臂，撑地时使用手掌真实轮廓求接触高度。35 张透明图像与 45 根骨骼保存在 `art-source/ashen-labyrinth/battle-survivor/spine/survivor.spine`。以 `spine/preview/left-hand-motion-r3.gif` 与 `spine/preview/left-hand-comparison.png` 核对袖口和手指，验收明细在该目录的 `verification.json`。

## 2026-11-20 青年求生者动作复审

动作修订以黄金腰线版右侧面为造型基准。肘、膝按身体关节重新绑定，衣料跨关节变形。手在匣口取牌，离手继承手腕速度，已经飞出的牌可以独立于受击播放。倒下动作记录了衣摆接地变形和分时落脚。工程保留五段人物主动作和两条持牌辅助轨道。修订记录见 `art-source/ashen-labyrinth/battle-survivor/spine/motion-review.md`，可编辑包为 `art-source/ashen-labyrinth/battle-survivor/survivor-spine-3.8.75-r2.zip`。

## 2026-11-19 焦土迷宫青年求生者骨骼动画

战斗演员以黄金腰线三视图的右侧面拆件。静置时核对头肩与腿部比例，持牌站姿在 `idle` 时间线展开。32 张透明图像对应 37 根骨骼、33 个插槽、3 片加权披布和 2 条腿部 IK。卡牌在 `attack` 第 0.36 秒离手，第 0.58 秒命中。角色工程位于 `art-source/ashen-labyrinth/battle-survivor/spine/survivor.spine`，原生 Prefab 位于 `assets/prefabs/actors/AshenSurvivor.prefab`，独立动作场景为 `assets/SurvivorSpineReview.scene`。同目录 `verification.json` 和 `delivery.json` 分别记录实播与异地解包复核。动作的视觉状态为待评审。

## 2026-11-19 焦土迷宫怪物与战斗背景

本轮造型以用户最后提交的三怪原图为准。灰灯蛾、叩石螯、垂幡守像的可见部位从该图分取。翅根、螯指和披布转动时会揭开遮挡，关节内部用独立补绘纹理补足。脚底基准、插槽顺序、各部件的轮廓来源和旋转中心记录在各自的 `parts-register.json`。

| 怪物 | 透明 PNG（含专用衬层） | 骨骼及控制 | 攻击节奏 |
| --- | ---: | ---: | --- |
| 灰灯蛾 | 16（1 张衬层） | 17 | 收翼后俯冲，0.43 秒接触 |
| 叩石螯 | 14（2 张衬层） | 16 | 抬螯、合指，0.55 秒接触，两条近侧腿使用 IK |
| 垂幡守像 | 18（4 张衬层） | 16 | 收袖后挥臂，0.68 秒接触，两条垂幡以加权网格弯曲 |

每只怪提供 Spine 3.8.75 编辑工程以及待机、预备、攻击、受击、死亡五段动作。资源包还包含折光回廊与沉灯井庭两张空场背景，构图保留左右站位及手牌区。原生播放记录见 [制作与播放核验](../../art-source/ashen-labyrinth/battle-bestiary/verification.json)，目录和使用方式见 [战斗素材包](../../art-source/ashen-labyrinth/battle-bestiary/README.md)。

## 2026-11-18 · 盐原素材接入

已实装三幅场景原画、三张角色贴图及一张 4 列 × 3 行的卡图集。生产原稿位于 `art-source/tide/`，输出位于 `assets/resources/tide/`。普通构建直接读取已导入资源。更换角色原稿后，按原始画布像素调好注册点，再显式执行 `node tools/author-tide-art.cjs`。脚本导出 Spine 3.8 网格、骨骼、五段动作、事件、接触几何和卡图 plist。所有资源通过 Pink 生成的 .meta 与正式 Prefab 引用接入。

主角和闸轮使用 release 与 impact 两个事件，巡标机采用实体接触点。角色、仪器和地面位置分别由网格、接触骨骼和基线控制。实际游戏中的判定见 `SpineActorRig.ts`、`ActorPresentation.ts` 与 `GameDirector.ts`。

- 项目：The end，Pink/Cocos 4.0.0-beta.1，Web desktop。
- 日期：2026-11-15，Asia/Shanghai。
- 状态：本轮背景与材质规格已实施并导入原生游戏；角色动作规格继续作为后续制作依据，不表示本轮增加了人物绘制帧。
- 美术依据：`docs/designs/art-bible.md`；动作现状：`docs/designs/character-style-exploration/sketch08-sequence-plan.md`。
- 归档：viking://~/resources/projects/the-end/designs/production-asset-spec.md。

## 资源规格表

| 资源族 | 当前源文件与尺寸 | 消费者 | 生产与验收约束 |
| --- | --- | --- | --- |
| 08 三角色原画 | `assets/resources/actors/sketch08/master08-thin.png`，1536×1024 | 三份 rig、Player/Wanderer/BruteActor 原生 Prefab | 固定人物造型、配色和装备；透明区、切片和显示比例以现有资源为基准，不逐帧按人物边界重新缩放 |
| 待机 | `assets/animations/sketch08/Sketch08_*_idle.anim` 与 `*-rig.json` | 原生 Animation、ActorPresentation、StableActorSprite | 3 秒循环、局部呼吸；24 个浮点关键帧与绘制帧数分开记录，头/脚不漂移 |
| 攻击/受击/倒下 | `assets/resources/actors/sketch08/*-attack/hurt/death.png` 与原生片段 | 主游戏角色和 ActorMotionReview | 当前每段 8 张序列；后续帧数按动作设计确定，不能用复制帧或变形插帧替代同造型的真实动作质量 |
| 街道 | `assets/resources/art/field-sketch-street-v2.png`，1585×992 | MapScreen、BattleScreen | 已减少碎线与锈斑；保留构图和人物比例，配合场景接触阴影检查正常/较小桌面 |
| 站点外景 | `field-sketch-depot-v2.png`，1585×992，同上目录 | JournalScreen、RewardScreen、FailureScreen | 参照新街道的线条、色块和材质；简化栅栏、远景与地面，保留入口局部灯光 |
| 避难所 | `field-sketch-shelter-v2.png`，1586×992，同上目录 | RestScreen、ShelterScreen、DayTwoScreen | 简化重复墙板与道具细节；保留睡眠区、窗景和工作台，统一环境光 |
| 卡牌与物品 | 既有手绘物品及 `assets/resources/ui/field-card-theme.json` | Card/RewardChoice/InventoryRow | 卡牌资源规格 224×340，标题 20、正文 16、次级 13；这些是卡面坐标值，实际扇形手牌会缩放，必须实机读牌 |
| HUD/按钮/面板 | 既有原生 UI Prefab 与同一主题 | HUD、ConfirmPopup、InventoryPopup 等 | 图标、文字、纸面分别维护；正常/悬停/焦点/按下/禁用/忙碌/确认状态可辨认；实色文字不套厚描边 |

表中背景的简写文件名均位于 `assets/resources/art/`。不存在“本轮新画了更多动作帧”的交付声明。

## 人物动作交付单

每次只选择一个角色的一段动作进入制作。交付前记录：动作意图、预备/接触/回收的时间、帧数、循环规则、可中断点、命中事件和死亡末帧。

1. 同一动作整段用固定画布、切片尺寸、脚底注册点、边距和比例；不按每帧身高独立归一化。
2. 拿 08 原图核对脸、衣物缺口、背包、刀和手的体积，逐帧与接触表一起检查。动作末尾回到待机时不能换人或跳高度。
3. 攻击保留一次命中回调。规则仍经 GameSession 执行，动画只给表现时点；动画结束不能重复造成伤害。
4. 输出透明 PNG、图集来源、分帧清单、原生 `.anim` 和可编辑 Prefab 引用。不要把不透明底纸烘焙到角色里。
5. 正常速度、半速、暂停/恢复、受击返回、死亡停帧、减少动态效果逐项记录；帧表与截图不能替代播放观察。

评审场景的 430/465/500 显示高度是该场景的历史基准，不能直接覆盖主游戏的比例。主游戏以现有 Prefab/场景实例为准；首次应用已对 414 份运行代码与资源建立哈希基线。

## 导入顺序与边界

读取当前 `.pink/settings.json`，使用 `tools/pink.cjs` 选择已安装 SDK。新图集由 Pink 导入分配 UUID 后再编写动画/Prefab；已有 `.meta` 和 fileId 原位保留。原生序列化结构依赖当前 SDK，升级引擎后复验，尤其是隔离在 `StableActorSprite.ts` 中的网格桥接。

当前贴图不全是二次幂尺寸；是否使用图集、压缩、过滤与 mipmap 要按实际用途和平台验证。背景不得为了套通用规范而被拉伸到方形。普通 `npm run build:web` 不调用 `tools/build-actor-review-assets.cjs` 或布局重生成工具。

素材提示词、来源图和生成结果分开记录。图片编辑用适用的图像工具；像素分析、切片元数据与原生引用工具不能被描述为已经重画素材。

## 本轮实际交付

三张 v2 PNG、三份按真实尺寸编写的 plist 和 Pink 分配的元数据均已放入 `assets/resources/art/`。先导入新资源，再从实际 `.plist.meta` 读取 cover UUID，最后更新八份场景 Prefab；不根据旧图集猜测新 UUID。新旧背景均保留，人物源文件保持原字节。

场景接触阴影作为独立原生组件与节点维护，位于演员所在 World 内，原地跟随根节点脚底；旧实例阴影停用，演员 Prefab 本体不变。牌堆读取 field-card-theme 的纸色，卡牌、面板、背包和按钮按同一材料关系修订；地图禁用状态保留信息的完整透明度。

执行入口是 `node tools/apply-visual-coherence.cjs --prepare`，经 Pink 导入后执行 `--apply`；常规构建不隐式调用。工具针对当前资源编写，保留已有数组索引、UUID、fileId 与事件。重复执行的资源一致性及真实播放检查见 `docs/coherence-verification.json`。

改前依据保存在 `output/playwright/material-coherence/before/`，新图与实机对照使用同一旧人物尺寸。正常/较小桌面、真实拖牌、三类背景引用、敌人切换与脚底阴影均纳入本轮验证；最终整体视觉认可单列。

新增原生 UI：SelectableCard 为 236×345 的完整卡面及状态区域；EntryTierPopup 使用 1440×900 设计坐标，四个 230×130 档位控件；BattleScreen 中体力徽标为 96×96。战斗手牌已从 156×242 精修为 174×258，与完整卡面分开维护。牌名/费用/效果优先，探索负重与完整关键词留在整卡；较小窗口的长说明仍支持长按阅读。

RoutePoint 图标为原生 Graphics 路径，细线与少量灰橄榄/淡棕/土黄色块，五类地点保留不同轮廓；不是新贴图或参考游戏图标。接触影作者工具按实际 target 引用复用现有节点，避免序列化重排后重复添加。新增 UI 绑定与截图见 deck-map-components.md、stamina-system.md 和 stamina-verification.json。

2026-11-15 手牌/结算精修：在 1024×768 实机中，当前六张默认牌的实际字号结合 Canvas 显示缩放换算，牌名约 16.36、费用 18.49、核心效果 14.93 CSS px；这是本次内容与窗口下的观测，不作为任意自定义长牌名的保证。手牌与结算布局的正常/较小窗口图已查看。护甲修复控件为 300×48，结算主操作为 370×56；现有 UUID、fileId、角色与动画保持，细节见 docs/hand-shelter-verification.json。

## 2026-11-16 主角攻击明细

资源为 `assets/resources/actors/sketch08/survivor-attack-detail-a.png` 与 `-b.png`，实际各 1448×1086，真透明背景，原 PNG 不重采样。`prepare-attack-detail.py` 只做只读像素分析和图集元数据编写，自动识别透明间隙避免裁掉刀尖；不能导入该脚本去执行旧全量素材生成流程。

原 640×256 逻辑画布映射到统一 1360×544 源画布，动作全段比例 0.47058823529411764；中立主体 493 像素映射为 232 逻辑单位。所有脚底为 -112，左脚锚点保持，演员的原生场景缩放不变。8 个时序帧中，07 是 00 中立姿势的图集别名，7 张不同绘制图；端点复用用于稳定回待机，不宣称增加绘制数量。

先执行 `python tools/prepare-attack-detail.py`，经 Pink 原生导入两份 plist 后执行 `node tools/connect-attack-detail.cjs`，读取实际分配的 SpriteFrame UUID 并更新现有攻击片段。普通构建不调用作者工具。旧全量作者工具已加活动资源保护，避免无意把清晰稿换回旧帧。片段、演员与既有元数据标识保留，测试与原生正常/半速检查见 docs/quality-fixes-verification.json。

## 2026-11-16 原生纸娃娃资源合同

PlayerActor.prefab 已接入 PaperDoll/Bones 与 PaperDoll/Slots，20 个骨骼/定位节点、18 个独立 Sprite 插槽，五组新的原生变换动画位于 assets/animations/paperdoll08/。现有根节点和场景缩放继续使用，地面锚点不变；腿部使用固定脚目标和二维 IK。

两张新透明部件图、真实帧矩形、来源与哈希位于 assets/resources/actors/paperdoll08/ 与 character-style-exploration/paperdoll08.prompt.json。新分层图是参考 08 绘制的部件，不声称像素级复用原人物；保留原 master 的字节。图集按实际导入的 SpriteFrame UUID 连接。关节的源延伸区域由原生帧矩形选择并用层级遮挡处理，不重采样 PNG。

idle 使用原生曲线插值并固定头脚；attack 保留 .56 秒和 .28 秒单次事件，半速只改变表现速度。普通构建不触发作者工具。旧序列帧评审场景继续作为历史对照，不能作为新骨架已被评审的证据。详见 paperdoll08.md 与 docs/module-refactor-verification.json；技术接入通过、最终视觉认可开放。

## 2026-11-16：当前 Cocos 原生 08 动作资源

当前三个主游戏演员使用 assets/resources/actors/native08/{survivor,wanderer,brute}-geometry.json 与 -skin.json，纹理仍为原 master08-thin.png。原生片段位于 assets/animations/native08/，每角色五个动作，共十五个。现有演员根 UUID、原画和场景缩放保持，旧资源留作历史参考。

Animation 驱动 NativeBones 的角度、位置和 approach 属性；NativeActorSkin 仅做原画部件到节点的绑定与 SDK 渲染桥接。躯干衣物保持一体，沿关节边界细分原几何并设置重叠，按骨骼和完整顶点属性共用顶点。当前顶点为 874/1119/1385，设定 4000 的固定 SDK 预算并在导出/测试时检查，避免启动时缓冲区超限。

主角、游荡者和重型怪攻击分别为 .72/.80/.94 秒，单次事件分别在 .34/.38/.46 秒。Cocos 三次曲线控制预备、前移、接触、收回；不把姿势键或播放采样数当成绘制帧数。具体维护命令、接入范围和证据见 character-style-exploration/cocos-native08-motion.md。普通构建不运行作者工具，完整行走与换装不在本轮范围内。

## 2026-11-17：人物骨架制作建议（草案）

- 项目：The end；日期：2026-11-17，Asia/Shanghai。
- 状态：技术与制作建议，待用户选择；尚未确认采购 Spine 或迁移现有演员。此前用户选择的 Cocos 原生 Animation 仍是当前运行方案。
- 依据：本次只读检查原画、当前 native08 三份 skin、NativeActorSkin.ts、ActorPresentation.ts、本机固定 SDK 的 Spine 模块配置及官方文档；没有重新播放并验收现有动作。
- 归档：viking://~/resources/projects/the-end/designs/production-asset-spec.md。

### 当前事实与建议方向

当前三个角色各有 10 个骨骼/控制节点。三份 native08 skin 的全部顶点均只有一个骨骼影响；腿、躯干与背包保持一体，属于二维刚性部件方案。NativeActorSkin 的代码能按权重累计变换，但现有资源没有多骨骼混合权重。其完整迈步与衣物弯曲能力受素材拆分及绑定结构限制；继续增加采样或关键帧不能补出被遮挡的图像。

推荐正式制作采用“二维分层骨骼、局部网格蒙皮、少量关键姿势替换”的组合。保持 08 的脸部、服装、配色、装备和游戏显示比例；原 master 保留，另建可编辑分层源稿。肩、肘、胯、膝和衣物背面的遮挡区域需要补画，并以原画核对身份；不能声称机械裁切能恢复未绘制部分。刀、靴子、头和背包等硬部件保持形状，袖口、披风与衣摆仅做局部柔性变形。

如用户接受付费动画工具，长期优先评估 Spine Professional，由其制作并通过 Cocos 的 sp.Skeleton 播放。其网格、权重和 IK 能覆盖建议制作范围；Essential 缺少该范围的关键功能。如果继续采用 Cocos 原生 Animation，可制作完整分层关节与原生曲线，但蒙皮编辑、约束和导出工具的维护成本需要计入开发。

本机 Pink/Cocos 4.0.0-beta.1 的 engine/cc.config.json（安装目录下 cocos-clipackagesengine/cc.config.json）定义 spine-3.8 与 spine-4.2，两套运行库也实际存在。该事实不等于项目已验证 Spine。若迁移，先选定并显式配置一种运行库，用对应编辑器主/次版本导出的样例完成导入和 web-desktop 构建播放检查，再锁定动画制作版本；不能直接按最新编辑器制作全部资源。

### 首套角色的制作与接入

1. 先做主角的前后侧上臂、前臂、手，前后侧大腿、小腿、脚，以及骨盆、胸腔、头、披风、背包、刀的分层源稿和遮挡补画；骨骼数量服从动作需要。
2. 躯干设置腰胯与胸腔控制；手足按需要使用两骨骼 IK，支撑脚稳定落地，武器设手部挂点与刀尖接触点。腿、骨盆、胸腔、肩和武器形成连续发力；衣物轻微跟随。转面、持刀角度及大幅度姿势用替换附件补足透视。
3. 首次样片只验证待机、一次完整攻击与受击；现有 prepare、death 的完整迁移随后单独验收，行走只在实际玩法需要时制作。正常速度、半速与原画静止对照同时检查，再扩展两个怪物。
4. 通过现有 ActorPresentation 表现入口接入，规则仍归 GameSession。接触事件转发给既有命中流程且保证单次执行；覆盖动作中断、暂停恢复、死亡末姿势、回位及减少动态效果。使用 Spine 时先以 REALTIME 验证事件与混合，再根据实测决定缓存。
5. 新增资源经 Pink SDK 导入并使用实际 UUID；保留既有引用关系。交付含可编辑分层源稿、骨骼动画工程、导出骨骼数据/图集/纹理，以及主游戏真实出牌的正常与半速录像。技术检查、执行者视觉观察和用户最终认可分别记录。

### 官方参考（2026-11-17 查询）

- Spine 功能与许可版本：https://esotericsoftware.com/spine-purchase
- 编辑器与运行库版本匹配：https://esotericsoftware.com/spine-versioning
- Cocos Spine Skeleton、实时模式及缓存限制：https://docs.cocos.com/creator/3.8/manual/zh/editor/components/spine.html
- Cocos 骨骼资源导入格式：https://docs.cocos.com/creator/3.8/manual/en/asset/spine.html

## 2026-11-17：Spine 08 动作交付

项目 The end；状态：本地 MCP 制作和原生接入已实施，替代前述 native08 活跃动作。版本固定为本机编辑器及导出 3.8.75、当前 Pink/Cocos 4.0.0-beta.1 的 Spine 3.8 运行库。

- 编辑源为 art-source/spine08/{survivor,wanderer,brute}.spine 及同名 .authoring.json；运行资源位于 assets/resources/actors/spine08/，含三份 JSON/atlas/contract、一份原画相同字节副本、三份透明死亡身体附件和 SDK 分配的 .meta。既有演员 Prefab 根 UUID/fileId、原视觉比例与原素材保持。
- 每角色 28 根骨骼/控制、五动作；3 秒待机循环，攻击接触为 0.40/0.45/0.54 秒，结束为 0.84/0.94/1.10 秒。头和靴子刚性绑定，身体局部权重混合、双脚 IK；武器/手部接触点进入原表现命令链且只触发一次。
- 死亡采用骨骼倒下加侧卧身体附件，原头/兜帽/铁盔网格复用。身体图由内置 image_gen 参考原 08 生成，源与运行 PNG 保持相同字节；透明边界、原始尺寸和哈希见 tools/spine/corpse-regions.json，提示词来源见 character-style-exploration/spine08-corpse-prompts.json。
- 显式制作入口 npm run author:spine -- --mcp <本地MCP目录> --spine <Spine.com>。MCP 经 stdio 写五动作、导入新临时工程、导出并验证；3.8 曲线序列化由适配器转换。先用 Pink SDK 导入资源分配元数据，再执行 npm run connect:spine。普通构建不运行作者工具。
- 三角色正常/半速、暂停恢复、中断、死亡保持、减少动态效果和主游戏真实输入均有本轮证据。web-desktop 构建与微信小游戏测试编译通过；微信真机、性能和发布不属于已通过结论。详情与未验证边界为 docs/spine08-verification.json。

## 2026-11-18：独立拆解与绑定返工

项目 The end。当前活跃源为 art-source/spine08/{actor}-parts.spine、同名 .authoring.json 和 parts/{actor}/ 下各部位独立 PNG、parts.json。主角 19 张/27 骨骼，游荡者 16 张/26 骨骼，重型怪 18 张/27 骨骼；Root/Approach/IK 为控制。图片与骨骼明确对应，取消整图 Artwork 网格及整体 Corpse 末姿势。普通构建不生成素材，手调后不能用作者命令覆盖动画。

真实 alpha 经渲染纹理导出与 53 文件审计，Windows 发布为原子替换；唯一图片加载 URL 与临时骨架 UUID 防止缓存串图。原画/既有 UUID、Prefab 身份与比例保持。原文件及用户编辑备份保持。作者步骤、源图与提示词见 character-style-exploration/spine08-motion.md、spine08-parts-prompts.json；记录复用 docs/spine08-verification.json。

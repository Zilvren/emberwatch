# The end 素材生产与原生接入规格

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

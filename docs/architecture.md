# The end 当前架构

- 项目：The end。
- 日期：2026-11-16，Asia/Shanghai。
- 状态：保留具名界面绑定、稳定内容 ID、规则状态权限和原生角色演出；关键节点日志与连续探索已接入。
- 最新流程：取消每日结算，探索成功或正式失败推进一天；教学失败仍第 1 天。
- 同步地址：`viking://~/resources/projects/the-end/docs/architecture.md`；保存及回读记录见 `docs/openviking-sync-status.json`。

## 模块职责

| 位置 | 责任 |
| --- | --- |
| `assets/game/core/SurvivalGame.ts` | 当前状态、生命周期、序列化入口，以及对各规则模块的明确委派。 |
| `core/systems/CombatRules.ts` | 战斗初始化、抽牌、出牌、意图与回合结算。 |
| `core/systems/InventoryRules.ts` | 携带容量、溢出转入、卡组选择与丢弃。 |
| `core/systems/RewardRules.ts` | 奖励资格、领取与节点奖励结束。 |
| `core/systems/ExplorationRules.ts` | 路线选择、节点进入、休整和自动返回。 |
| `core/systems/ShelterRules.ts` | 返回避难所、成功过天、提交通关事件与可选修复；没有每日扣费。 |
| `core/systems/JournalRules.ts` | 进度事件、配置条件、日志前置、去重、触发日期与待阅读队列。 |
| `core/content/` | 教学情景配置、卡牌配置校验、每局冻结的内容快照。 |
| `core/state/GameState.ts` | 无引擎对象的存档数据与读取校验。 |
| `core/GameReadModel.ts` | 表现层使用的深只读状态和查询接口，不暴露规则命令。 |
| `assets/game/application/GameSession.ts` | 游戏命令、规则执行、保存时机和进度恢复。 |
| `assets/game/infrastructure/SaveRepository.ts` | 存储接口、版本、完整性校验、上一份有效备份、配置不兼容保护。 |
| `assets/game/presentation/GameDirector.ts` | 场景装配、引擎更新、出牌目标判定、角色动作与命中回调协调。 |
| `presentation/GameRenderer.ts` | 原生节点、文字、按钮状态、页面与弹窗的显示绑定。 |
| `presentation/ui/UiActionRouter.ts` | 将界面意图转换为应用命令及表现回调，不依赖引擎。 |
| `presentation/ui/UiState.ts` | 选牌、弹窗、分页和操作锁等临时界面状态，不进入玩家存档。 |
| `presentation/cards/` | 卡面显示、手势输入、手牌布局与组件评审。 |
| `presentation/actors/` | 原生角色动画和固定原画网格表现。 |

表中 `core/`、`presentation/` 的简写均位于 `assets/game/` 下。根目录 `assets/SurvivalRules.ts` 和 `assets/CardCatalog.ts` 仅保留旧教学代码的导入入口，实际实现已移动。

## 输入与表现

普通按钮在原生 `cc.Button.clickEvents` 中绑定自身 `ButtonAction.activate`。该函数发送沿节点层级冒泡的界面事件，由所在游戏根节点接收。已移除共享全局 EventTarget，组件预览与主游戏分别接收自己的输入。

主游戏的调用路径为：ButtonAction、CardInteraction → UiActionRouter → GameSession → 对应规则模块。规则变化由 GameSession 保存；GameRenderer 读取状态更新原生界面。攻击等表现由 GameDirector 在动画命中事件处执行一次命令，再等待动作结束。

按钮外观与命令入口已拆分：ButtonPresentation 只负责表面、指针状态与焦点框，ButtonFocusGroup 负责局部键盘导航；ButtonAction 保留原生点击绑定与命令意图。主题统一，普通操作按钮原位接入，地图等独立组件保持待设计状态。

通用面板的几何由纯函数 PanelLayout 计算，CommonPanel 排列纸面、标题、正文滚动区和底部操作。ModalPanel 只发送关闭意图并支持键盘阅读。ButtonFocusGroup 为弹窗捕获键盘范围并在关闭后恢复原焦点。生存手册、行动记录、确认窗口已接入同一结构；确认仍由原生 ButtonAction 进入应用命令，不由面板执行游戏规则。组件评审及平台边界见 designs/ui/panel-component.md。

角色与卡牌的固定布局保存在原生 Scene、Prefab 和 AnimationClip。移动脚本时保留原 .meta UUID；现有场景与预制体仍可在 Pink 中编辑。常规构建不重新生成这些资源，`tools/build-card-component.cjs` 等工具仅供明确的组件资源编写使用。

## 内容与存档边界

每局使用冻结的卡牌配置快照。网页编辑器保存配置后，重新开始的试玩读取新配置，已运行的一局不受全局配置替换影响。存档记录卡牌实例 ID、牌堆、装备、随机状态、奖励领取标记和结算状态，不记录 Node、SpriteFrame 或临时动画。

主存档损坏时尝试有效备份；未来版本、不兼容卡牌配置或不可读取的原数据不会自动覆盖。确认重开后才允许替换。当前写入 v2，并迁移 v1 的每日结算与固定 day2 终点，保存事件计数、日志 ID、实际日期和已读状态。详见 designs/key-node-journal-system.md。

## 正式系统表的边界

用户提供的正式系统表规定物资点、战斗体力、物资卡分离，并包含独立战斗资格、多关键词、消耗品、仓库、实例升级、遗物与蓝图配方。正式口径见 `formal-system-reference.md`。

新开局默认 `stamina-v1`，按确认档位扣一次入场费并提供回合体力，物资点不占负重。`tutorial-v1` 的出牌扣物资、物资占负重继续服务旧存档和明确的兼容回归，不能视为正式版通用规则。`CardCatalog` v1 校验通用卡库与 30 点实体携带上限，并非正式版卡牌模型的全部边界。

正式表卡牌数据用于组件参考预览，位于 `assets/resources/ui/card-reference.json`，不直接替换可玩卡库。体力规则已按最新要求迁移；仓库、制作、正式失败代价和多日循环等继续逐项设计，不随本次费用单位切换自动启用。

状态栏已将 `header/textN` 迁移为 StatusBar 的日期、保存、物资、护甲与携带字段，使用纯展示模型和容器几何计算。原生 HUD.prefab 的 UUID 和原操作 fileId 保留；GameRenderer 只传入只读数据。卡牌组件已经采用 Title、Cost、CostUnit、Keywords、Effect、Description、Weight 等明确字段，其他旧绑定键随对应 UI 组件继续迁移。

人物/背景材质协调版使用三张同线条的手绘场景图集；手牌和奖励牌的旧纸材质由 field-card-theme.json 提供，本地卡牌编辑器的预览读取同一份主题，避免配置工具与引擎卡面材质分叉。新正式内容草案位于 docs/designs/formal-content-draft.json，不在运行资源目录，不会被游戏当作已启用卡库。

presentation/platform/WebViewport.ts 负责当前桌面全窗口宿主的尺寸同步，通过公开 screen.windowSize 更新引擎窗口及点击坐标；主游戏和状态栏评审接入。它不参与规则或持久化，也不替代尚未完成的全游戏移动端布局。

## 验证

场景优先改版继续沿用同一命令层；SceneAtmosphere 只处理环境与已有命中事件的短反馈，SceneShade 只提供柔和边缘对比，DeckStackGraphic 绘制与手绘素材一致的牌堆。人物原画与演员预制体未修改；位置和接触阴影在场景实例调整。临时 EncounterPreview 仅在显式 seed 且 save=off 时，通过常规命令到达首战，不覆盖玩家进度。普通构建不运行布局编写工具，布局基线已持久保存在 tools/editor-authoring/baselines/layout-v0/。

自动测试、类型检查、原生构建、规则重构前后状态对照，以及实际 Canvas 交互记录见 `refactor-verification.json`。它们证明相应技术行为，不代替用户对美术和界面的评审。

2026-11-15 完整作品复审补充：UiActionRouter 在应用命令之前处理部分物资领取、放弃奖励及教学重玩的确认；取消不写入规则状态。UiState 记录丢弃窗口是否来自背包，保证返回原背包页。规则模块和存档格式不变。GameDirector 动态订阅减少动态效果偏好，ButtonPresentation 仅给透明 HUD 文字保留场景描边。背包与路线的原生资源由 tools/apply-review-polish.cjs 显式修订当前文件，不加载旧基线，也不参与普通构建。详细证据见 full-game-review.md 和 full-game-review-verification.json。

## 2026-11-15 整卡与路线视图

InventoryViewModel 提供只读筛选、排序与操作资格；InventoryGrid 管理整卡实例、滚动和大卡阅读，SelectableCard 复用完整卡面并发送选择意图。RewardSelection 将比较和领取分开，比较只更新 UiState，确认仍使用 GameSession 的领取命令。UiState 的筛选、排序、阅读、编组模式和候选索引不进入存档。

RouteMapModel 把当前 scenario.routes 投影为点和边，RouteMap/RoutePoint 负责原生绘制、节点、滚动定位和只读查看。地图覆盖层使用稳定场景容器作为第五个 popup，保留实际游戏阶段。ContactShadow 为场景拥有的地面接触表现，不修改演员、动画或规则。

原生作者工具 build-deck-map-ui.cjs 维护模板、屏幕与主场景绑定；显式登记嵌套预制体根，控制器通过普通容器解析内部视图，迁移保留根资源身份。所有作者工具均不在常规构建脚本中执行。组件合同及验证见 designs/ui/deck-map-components.md 与 deck-map-verification.json。

## 2026-11-15 体力接入

EntryTiers 是档位内容表，ExplorationRules 扣一次入场费，CombatRules 在回合边界刷新/清空体力；InventoryRules 按当前情景决定物资点是否占负重。GameSession 默认使用 stamina-v1，恢复时尊重存档所带情景；只有玩家确认 new-game 才把旧局切换为新规则。SurvivalGame 为每局复制情景，重开在同一状态对象上更新配置，避免组件持有的只读引用失效。

存档增加 entryTier 与 battle.stamina/maxStamina，按档位验证预算。EntrySelection 负责四档展示，临时比较不写规则；主场景第六个 popup 是独立进入档位窗口。卡牌费用单位来自当前情景，编辑器使用新规则口径。每日消耗与风险修复仍由原 SettlementRules 处理，详细边界见 designs/stamina-system.md 与 stamina-verification.json。

## 2026-11-15 手牌与返家显示精修

CardPresentation.compact 是原生卡面显示变体，由 HandCard.prefab 开启，减少战斗常态元信息；背包/奖励等完整卡面保持默认变体。几何与字体仍由 Prefab 编写，CardInteraction 沿用原手势和应用命令路径。

ShelterSummaryModel 投影带回、护甲、修复资格和探索进度，不修改状态。2026-11-16 取消每日预测，daily-* 绑定改为 progress-*，主按钮直接整备出发。ButtonAction 和 GameSession 负责修复与出发。历史显示验证见 hand-shelter-verification.json，最新循环见 core-loop-verification.json。

## 2026-11-16 五项质量修复

RulesNoticeModel 把当前规则与 GameSession.newGameRuleset 元数据投影为 HUD、帮助和重开确认文案；不执行迁移。StatusBar 的常驻入口与保存状态分开，RulesNotice 的点击仍经过 ButtonAction/UiActionRouter。UiState 的编组入口重置显示筛选，不改 selected 卡牌。

GameDirector 同步动态偏好，ActorPresentation 只处理自己的 idle 播放/停止。动作执行期间只记住偏好，保留单次命中和完成；偏好事件不在 ui.busy 时完整刷新页面，以免规则阶段已变而表现回调尚未完成时销毁演员。自动 map→shelter 的通知同样由协调器更新，不进入规则层。

主角攻击继续使用原生 AnimationClip，新的两个透明图集由元数据注册到固定逻辑画布。prepare/connect 作者入口与普通构建分开，保留既有资源身份和动画事件；旧生成工具有保护。验证记录为 quality-fixes-verification.json。

## 2026-11-16 架构耦合核查

用户询问模块是否分清、是否会牵一发动全身。本节是基于当前代码的工程评估，不是一次新的重构或功能修改。静态结果见 `docs/architecture-audit.json`。

已检查 `assets/game/` 的 72 份 TypeScript：core 与 application 均无 cc 导入，检查的依赖方向没有发现 core 反向依赖表现/应用/持久化实现，也没有发现普通 TypeScript 转译后的静态相对 require 依赖环。类型引用被区分处理；原生 Scene/Prefab/UUID、动态加载和构建工具不在此循环检查结论内。

清楚的边界包括：GameSession 集中执行命令与保存，五类规则模块不依赖引擎；GameReadModel 使用明确字段/查询白名单和深只读类型，普通界面不获得规则命令；角色/手势/面板等组件负责表现；CardSet 冻结每局配置，编辑器的后续全局配置变更不会直接替换该局的规则快照。

### 改动的预期影响

| 改动 | 正常涉及范围 | 说明 |
| --- | --- | --- |
| 已有卡牌的伤害、费用和文案 | cards.json 及相应校验/回归 | 使用已有机制时，通常不需要改场景协调器、存档实现或每一屏 |
| 卡面材质、字体和角色攻击绘制 | 表现组件、主题、Prefab/Animation/图集 | 原生元数据和动画命中事件必须验证，业务规则通常保持 |
| 背包筛选与编组界面状态 | UiActionRouter、InventoryGrid、相关视图模型 | 临时界面状态不进入玩家存档；卡牌 selected 变化仍走命令 |
| 新增一种已有机制的敌人数值配置 | 内容数据及相关界面验证 | 当前敌人类型仍写死为 enemy1/enemy2，增加第三种类型并不只是填一行数据 |
| 新资源或保存字段、持续多日生命周期 | 规则、状态、校验、应用、相关界面与测试 | 属于真实的跨系统需求，需要成组改动与兼容策略；不是每个系统都应改 |

### 尚未彻底收紧的耦合

1. 页面与弹窗仍由 GameRenderer 的数组位置对应主场景绑定，GameDirector 也有 screens[2] 等访问；Phase 定义、验证列表与界面列表分散。新增页面或调整顺序容易漏改。优先改成按 Phase/Overlay 名称绑定并在启动时校验缺失/重复。
2. Route、NodeKind、Battle.enemy、敌人配置和存档校验仍有 A/B、enemy1/enemy2 等固定类型。内容扩展尚未完全数据驱动；在增加第三类敌人或正式地图前，先建立稳定内容 ID 和明确的内容校验/表现映射。
3. 所有规则服务拿到几乎整局的可变 RuleState，状态所有权主要靠约定。GameDirector 与 GameRenderer 分别集中协调与整屏绑定，职责虽可解释，但继续加内容会反复经过这些文件。按实际系统收窄状态接口，按页面逐步委派显示模型，避免一次重写整个状态体系。
4. 当前没有专门的跨层导入/依赖环自动门禁。现有行为测试、只读接口和原生回归有保护作用，但不会自动阻止后来某人从规则模块引入 UI。应增加小范围架构约束与必需资源绑定检查。

这些是后续工程优先级建议，用户本次没有要求立即重构。评估结论是：日常小改动已有局部维护条件，大系统改动需要明确边界配合；还不能承诺任意新功能只改一处、或不会出现回归。上次动态偏好修复涉及协调器与演员表现，但没有修改 CombatRules 或 SaveRepository，属于边界内的配合。此前一次体力改造同时涉及费用、负重、存档与界面，跨文件是需求本身的影响范围。

本次没有改运行代码，也没有重复运行构建或 113 项测试；已有技术结果来自 quality-fixes-verification.json，不能当作架构完全解耦的证明。

## 2026-11-16 四项架构耦合修复（当前实现）

状态：已实现；上方“架构耦合核查”保留为改前记录。用户本轮明确授权立即修改。技术验证详见 docs/module-refactor-verification.json；不是对所有未来系统完全解耦的承诺。

1. Phase 只在 core/state/GamePhase.ts 声明。原生 GameView 标记每个屏幕/弹窗的稳定键；GameDirector 使用 bindScene 建立键到 Node 的映射。实际主场景数组已逆序保存，依赖位置的 screens[2]/popups[0] 已移除。缺失、重复、未知键和缺失/重复战斗角色均在初始化时报错。
2. GameScenario 分开稳定节点 ID、节点行为、敌人 ID 和 actorId。ExplorationRules 按 scavenge/rest/battle 行为分派，CombatRules 按敌人定义读取数值与奖励；奖励来源仍保存节点 ID。路线、敌人、visited 与 reward source 按注册配置校验。注册表拒绝同 ID/版本被不同定义覆盖，保留 A/B、enemy1/2 等旧存档 ID；没有迁移存档格式。单路线也保留地图选择入口；每条路线的节点 ID 唯一，重复遇到同敌人应使用不同地点 ID。
3. RuleContext 为反馈、探索、战斗、背包、奖励、结算分别声明最小 Pick 状态权限；Combat 只通过只读 currentNode 回调取得奖励来源。GameSession 依赖 RunPersistence 应用接口，SaveRepository 实现该接口。GameRenderer 委派 PopupPresenter、RewardScreenPresenter 和 NativeViewWriter，保持界面绑定与规则命令分离；GameDirector 继续作为组装与异步动作协调入口，不把业务分散到通用消息框架。
4. npm run check:architecture 与 npm test 检查转译后静态相对运行依赖的方向和环；TypeScript 合同检查规则状态权限及只读 UI；原生资源检查屏幕/弹窗唯一标记、演员 ID、分层插槽与单次动画事件。此门禁不覆盖任意动态 import、运行时脚本注入或所有平台表现。

原生主角通过 ActorPresentation 保持同一命中/完成接口，内部可选择 PaperDollRig 或既有 Sprite 适配器。Scene 与 PlayerActor 根身份、卡牌数据、体力玩法、日耗最后执行及允许风险修复均保持。人物迁移不要求 CombatRules、SaveRepository 知道骨骼或分层素材。

扩展一个已有行为的节点/敌人主要修改 GameScenario 定义及相应的原生 actorId 资源绑定；扩展一种新机制或新保存字段仍需要规则、校验与相关界面配合。新功能的真实依赖不会被隐藏。

## 2026-11-16：Cocos 原生角色演出

ActorPresentation 继续作为游戏协调器使用的角色接口，新增可选目标参数仅服务近战演出；GameDirector 仍在单次命中信号中执行原有 GameSession 命令。approach 属性轨道控制临时前移，按目标可见轮廓匹配接触点，完成/禁用恢复原站位。没有把骨骼、渲染或演员位置写入 GameState/SaveRepository。

NativeActorSkin 复用隔离的 StableActorSprite 网格桥接，把同一张 08 原画的刚性部件绑定到 Cocos 节点；姿势插值由原生 AnimationClip 负责。三个演员通过 Prefab/JSON/anim 数据共用组件，未引入 Spine。角色资源作者工具和普通构建保持分离。源覆盖、比例和 GPU 预算有自动门禁，实际渲染还检查 renderReady 和浏览器错误。细节见 cocos-native08-motion.md 与 native08-verification.json。

## 2026-11-17：合并日志系统与主干架构

当前工作区为 C:/Users/Knock/Desktop/The end。main 合并 origin/rizhixitong 时保留主干的稳定内容 ID、RunPersistence 接口、规则状态权限、具名视图和 Cocos 原生角色演出，同时接入日志分支的 schema-v2 存档迁移与连续探索。取消旧 completionDay 和游戏 phase=day2；资源键 day2 仅保留为后续日志视图，SCREEN_KEYS 从唯一 GAME_PHASES 派生并加上这一原生视图别名。

JournalRules 只获取日志/进度状态，ShelterRules 对 route/pathIndex 只读；ExplorationRules 在新探索时可以清空战斗与上次返家数据。PopupPresenter 承接新规则的帮助、重开文案，避免把弹窗数组下标与旧每日风险逻辑重新合入。应用命令层的路线选择继续委派配置 ID，不退回 A/B 白名单。验证见 docs/merge-resolution-20261117.json。

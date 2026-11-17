# The end 当前架构

- 项目：The end。
- 日期：2026-11-17，Asia/Hong_Kong。
- 状态：本轮分层与组件基础已实现；正式版资源规则及其他 UI 组件继续按件设计。
- 最新流程：关键节点日志与连续探索已接入，取消每日结算。教学关卡作为兼容样例保留，失败仍第 1 天。
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
| `presentation/map/` | 根据情景路线与探索索引投影当前层和下一层，原生实例化图标、连线与输入；只读地图不推进规则。 |

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

## 2026-11-17 地图可见范围与入口

已确认并实现：教学和当前标准情景的固定起始节点投影为两个同效入口，后续原 A/B 路线不变。配置 `openingNodeCount` 只决定固定遭遇的视图入口数量；二者仍发送同一个 `enter-fixed` 命令，不产生两份奖励或新的路线存档。

`RouteMapModel` 按 `fixedDone`、`route` 与 `pathIndex` 计算当前层，返回当前层/下一层节点及端点都可见的连线。完成步骤按索引判断，不依赖节点种类是否曾经出现。`RouteMap` 和房间内只读覆盖层使用同一投影；`RoutePoint` 仅显示实际节点图标，原生标题与状态标签由 MCP 关闭，悬停不会重新打开。无需存档迁移。合同见 `designs/ui/deck-map-components.md`，本轮证据见 `map-window-verification.json`。

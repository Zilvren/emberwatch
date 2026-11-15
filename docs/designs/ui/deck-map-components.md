# The end 行囊、选牌与局内地图组件

- 项目：The end，Pink/Cocos 4.0.0-beta.1。
- 日期：2026-11-15，Asia/Shanghai。
- 状态：已接入原生主游戏并完成本轮操作验证；整体视觉认可保留给用户。
- 已确认范围：用户明确要求战后奖励选牌和出战卡组选择都改；不新增卡牌规则、随机路线、仓库或正式多日系统。
- 归档：viking://~/resources/projects/the-end/designs/ui/deck-map-components.md。

## 参考与保持

布局与交互参考 Mega Crit 的官方媒体：https://www.megacrit.com/press-kits/slay-the-spire-2/ 、Steam 官方商店 https://store.steampowered.com/app/2868840/Slay_the_Spire_2/ 。官方地图说明与图片：https://www.megacrit.com/news/2024-11-07-neowsletter-issue-4/ 、https://www.megacrit.com/images/map_qol.jpg 。2024 地图图是开发期参考，不视为当前版本的逐像素规格。

采用完整卡面网格、聚焦候选卡与可滚动节点路线的组织方式。美术继续使用 The end 的 08 人物、细线手绘、灰橄榄/浅土黄/淡棕色、v2 场景和统一纸材质。参考素材不作为本游戏的运行美术。

## 行囊与出战编组

大面积暗场覆盖层中展示完整卡面网格，原生 ScrollView 支持滚轮/拖动，按实例显示，不将同名卡合并成一个可误操作的对象。顶部显示携带与暂存、出战数量；提供全部/出战/暂存筛选与名称/费用/负重排序。

普通模式点击卡牌查看大卡与状态、效果及当前可用操作；丢弃仍先确认并返回原行囊上下文。营地编组模式可清楚标记当前出战牌；加入、移出仍走现有 toggle-card 命令，暂存、现金与不在营地时的限制由现有规则和明示状态保持。物资单独显示，不虚构成可战斗卡。

输入、展示和保存分开：UiState 仅持有筛选、排序、查看对象和阅读模式；UiActionRouter 将动作转为 GameSession 命令；原生组件只投影只读状态。使用可复用的 SelectableCard Prefab，不将整张行囊写成运行时绘图。

## 战后选牌

背景退后，中央并排展示实际候选大卡。点卡先选择和比较，再由明确的确认操作领取；选择候选本身不更改规则状态或消耗奖励机会。单候选居中，多候选按同一间距排列。

领取物资、查看行囊与放弃余下奖励仍是不同操作，保留容量风险和放弃确认。领取后不可重复领取；确认按钮说明当前选择及会进入携带/暂存的位置。

## 局内地图

地图采用从下往上的原生滚动内容、手绘地点图标、虚线与分支路径。当前地点、可前往、已完成、另一条路线和未到达状态区分，说明不通过整块透明度淡化。进入地图时把当前可行动节点带入视口，用户滚动不在每次刷新时被强行重置。

路线从当前 scenario.routes 投影为视图模型，共同后缀汇合。现有 A/B 教学内容作为当前数据，不在通用绘制组件中固定“只能两条路线”。图标仍对应现有战斗、搜刮、营地、强敌和返回避难所，不展示尚未实现的商店/事件为可操作节点。

## 验收

在真实主游戏检查卡面网格与筛选、滚动与点击取消、候选选择不改状态、确认只领取一次、营地编组、丢弃取消/确认、地图分支与自动定位、完整 A/B 路线、存档恢复、Escape 和 1024×768 桌面。对旧浏览器脚本按新的真实操作步骤更新，不用隐藏旧按钮来维持测试。

## 实施与绑定

- `SelectableCard` + `assets/prefabs/cards/SelectableCard.prefab`：完整尺寸卡面、选择输入和状态；去掉战斗拖牌处理，不把查看卡牌变成出牌。
- `InventoryViewModel`、`InventoryGrid`：筛选/排序与操作资格投影、实例卡池、原生滚动、大卡查看和营地编组。排序使用数组副本，不重排规则状态。
- `RewardSelection`：候选卡、暂态选择和唯一确认入口；`reward-select-*` 只改 UiState，`claim-card-*` 仍进入 GameSession。
- `RouteMapModel`、`RouteMap`、`RoutePoint`：scenario.routes 投影、公共后缀合流、滚动定位、地点图标和节点状态。HUD 地图打开只读覆盖层，不改变游戏阶段或进度。
- `InventoryPopup`、`RewardScreen`、`MapScreen`、`HUD`、`TheEnd.scene` 已更新；Root UUID 与主场景入口保持。

Pink/Cocos 4.0.0-beta.1 的嵌套预制体需要在拥有者根节点 PrefabInfo 的 `nestedPrefabInstanceRoots` 中登记。作者工具按实际子树重建此列表，防止预制体停留为空节点。控制器引用普通容器节点，再用 getComponentInChildren 找到嵌套实例，避免把旧占位对象当作最终节点。

整卡模板从完整 RewardCard 派生，保留独立 UUID；不使用战斗手牌中已缩小的几何。奖励页保持唯一 RewardSelection 控制器，迁移时先移除旧控制器，避免第一个旧绑定遮蔽新界面。

明确作者入口：`tools/build-deck-map-ui.cjs --templates` → Pink 导入 → `--map-panels` → Pink 导入 → `--apply` → 常规构建。普通构建不执行作者工具。地图预览和候选比较都不是规则命令；确认、入组、移出、丢弃继续经过原有应用层。

验证见 `docs/deck-map-verification.json`；改前/改后与本轮图片、完整操作日志分别保留。当前验证通过 93 项自动测试与 11 类原生浏览器场景，覆盖营地真实加入/移出和 A/B 完整路线；不将截图或测试通过写成用户已认可美术。

上述 93/11 为体力接入前阶段。随后新开局默认 stamina-v1，三类卡面同步体力费用，物资点不再占负重；既有完整网格、比较确认和地图操作保持。地图节点增加同色系填色，反馈避开标题。最新 104 项自动测试及体力、整卡/地图、材质的最终原生复测见 `docs/stamina-verification.json`；旧存档回归仍明确使用 tutorial-v1。

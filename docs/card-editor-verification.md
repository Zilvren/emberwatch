# 本地卡牌编辑器验证记录

- 项目：The end，C:/Users/Knock/Desktop/The end
- 日期：2026-11-14（Asia/Shanghai）
- 状态：已实现并验证
- 代码：assets/CardCatalog.ts、assets/SurvivalRules.ts、assets/SurvivalView.ts、tools/card-editor-server.cjs、tools/card-editor/
- OpenViking：viking://~/resources/projects/the-end/docs/card-editor-verification.md

## 2026-11-27 · 类型搜索、奖励与插画控件

《The end》已在 Edge 桌面 1440×900 与窄屏 390×844 复核。运行页面来自 `tools/card-editor/`。实际验证了类型别名「武器」匹配「装备」、名称与类型组合、键盘选择与 Escape 关闭、窄屏候选列表滚动及卡牌页和配方页切换。桌面用鼠标点击整行和键盘 Space 改变奖励状态，权重字段随之显示。插画通过名称下拉框选取，变更后中栏画面更新。

临时牌库实际完成两次保存并核对数据。重载后「盾矛」的奖励、权重与插画一致。另验证了焦土迷宫发现组的勾选保存。浏览器运行时异常为 0。编辑器接口与规则专项测试 7 项通过，`invalid install does not replace the last valid catalog` 在本次改动前后均失败。

[桌面编辑页](../output/playwright/card-editor-controls-20261127/editor-desktop.png) · [焦土迷宫发现牌组](../output/playwright/card-editor-controls-20261127/editor-discovery.png) · [窄屏类型搜索](../output/playwright/card-editor-controls-20261127/editor-type-mobile.png)。截图归档并回读核对于 `viking://~/resources/projects/the-end/docs/card-editor-controls-20261127/`。

## 2026-11-27 · 奖励池页与插画缩略图

《The end》已实装并复核。Edge 1440×900 下每行五张整卡，390×844 下每行两张。滚轮只滚动卡牌区域，章节下拉框和保存入口留在上方。实际点卡面、用 Space 切换、筛选加入状态、切页和重载均通过。用临时牌库验证了焦土迷宫及合成探索的设置分别写入和恢复。卡牌编辑页的插画缩略图随所选插画实时更新，「备用插画」显示下拉框选择的素材。

Pink/Cocos Web Desktop 构建、类型和架构检查通过。种子 17 原生试玩从搜刮点抽出了临时配置中逐卡选中的三张牌。清空名单并保存后，重新出发到同一地点可直接领取物资。本机工坊已加载单一奖励池校验。本轮全量测试 183 项通过，16 项失败名在改动前的提交使用同一份牌库能复现。

[桌面奖励池](../output/playwright/reward-pool-editor-20261127/reward-pool-desktop.png) · [滚动后](../output/playwright/reward-pool-editor-20261127/reward-pool-scrolled.png) · [窄屏](../output/playwright/reward-pool-editor-20261127/reward-pool-mobile.png) · [原生试玩](../output/playwright/reward-pool-editor-20261127/reward-pool-native-discovery.png) · [插画缩略图](../output/playwright/reward-pool-editor-20261127/selected-illustration-thumbnail.png)。五张截图已归档并回读核对于 `viking://~/resources/projects/the-end/docs/reward-pool-editor-20261127/`。

## 2026-11-27 · 怪物动作编辑页与原生战斗

《The end》已复核。Edge 在 1440×900 与 390×844 检查了怪物切换、上下移、移除、新增、循环起点、伤害编辑和恢复默认。用临时牌库保存灰灯蛾，重载后核对配置。实际从门前营地进入悬灯窄道，开场为蓄势，接下来伤害预告依次为 4、2、4，依次结算后的玩家血量为 10、6、4。截图和输入都来自 Pink/Cocos Web Desktop。

类型检查、原生构建、架构检查和 7 项定向测试通过。定向测试覆盖配置更改后读回旧战斗、暂缓不推进动作及空奖励池。全量为 182 通过、18 失败。16 条与奖励池页验证时一致，另外两条单独复现于当前执灯人落地素材的 Spine 测试。

[桌面编辑页](../output/playwright/monster-actions-20261127/monster-actions-desktop.png) · [窄屏编辑页](../output/playwright/monster-actions-20261127/monster-actions-mobile.png) · [开场蓄势实机图](../output/playwright/monster-actions-20261127/monster-actions-native-prepare.png)。截图归档于 `viking://~/resources/projects/the-end/docs/monster-actions-20261127/`。

## 2026-11-27 · 焦土迷宫单一奖励池与工坊试玩

《The end》正式地图为焦土迷宫。工坊奖励池页只列出焦土迷宫牌，保留整卡网格、纵向滚动和加入状态筛选。卡牌编辑右栏和奖励池页直接编辑 `labyrinth.discoveryPool`。各页「试玩游戏」都打开焦土迷宫。

用临时牌库在 1440×900 Edge 实测。新增一张普通抽牌卡，在右栏加入奖励池。从奖励池页确认名单后保存，从配方页点试玩进入焦土迷宫。种子 17 的裂口料斗给出这张候选，点选并领取后入本趟牌组。临时存盘保留 33 张旧版卡牌的原投放标记。四项地图与奖励规则回归通过。

[正式奖励池界面](../output/playwright/only-labyrinth-rewards-20261127/labyrinth-pool-desktop.png) · [新牌搜刮候选](../output/playwright/only-labyrinth-rewards-20261127/labyrinth-new-card-reward.png)。截图归档于 `viking://~/resources/projects/the-end/docs/only-labyrinth-rewards-20261127/`。

## 2026-11-28 · 焦土迷宫 23 张牌迁移

《The end》已实装。单一奖励池实机显示 23 张已加入牌。种子 17 在裂口料斗抽到粗制长矛、废钢短刃和屠龙宝刀，领取粗制长矛后加入本趟牌组。在独立战斗存档中实际验证了双武器选择、取消时体力保留、重载后确认替换，以及盾矛从下回合生成四张临时牌。

23 张牌逐一通过出牌检查，8 项定向测试通过。原生构建、类型与架构检查通过。完整测试 186 项通过，17 项失败名称与迁移前相同。结构化证据见 `docs/game-studios-evidence.json` 的 `ashenLabyrinthCardMigration20261128`。截图归档于 `viking://~/resources/projects/the-end/docs/labyrinth-migrated-cards-20261128/`。

## 结果

| 检查 | 实际结果 |
| --- | --- |
| 规则与接口 | 40 / 40 通过，包含原有 32 条规则与 8 条配置/效果/服务测试 |
| COCOS 构建 | web-desktop 成功，temp/card-editor-build.log |
| 网页新增、刷新持久化、复制、删除 | 实际浏览器操作通过 |
| 新卡在游戏中生效 | 真实 COCOS 对局扣费 2，敌人护甲 6 → 3；卡面显示伤害 3 |
| 修改在游戏中生效 | 同一 ID 改名、费用 1、伤害 4；新对局扣费 1，敌人护甲 6 → 2 |
| 固定搜刮奖励 | 使用新卡 ID，地图提示也读取新卡名称 |
| 删除在游戏中生效 | 删除并保存后，新对局不再携带该 ID |
| 引用保护 | 重复 ID、删除系统牌、直接删除固定奖励被拦截 |
| 保存可靠性 | 非法配置不改磁盘，旧修订号返回 409，上一版备份内容一致 |
| 检索与适配 | 名称搜索、效果筛选、390 像素宽度无水平溢出 |
| 独立游戏回归 | A、B 两条路线走到第 2 天，B 路线含失败重试及确认修复后的每日缺口 |
| 浏览器异常 | 各流程 pageerror 为 0 |
| 清理 | 测试牌已删除，原始八张定义与固定奖励恢复 |

完整记录：output/card-editor-verification.json。截图：output/playwright/card-editor-*.png。浏览器驱动：tools/browser-card-editor.js.txt；规则和接口测试：tests/card-editor.test.cjs、tests/survival.test.cjs。

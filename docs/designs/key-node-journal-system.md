# The end 关键节点日志与探索时间

## 2026-11-28 · 战斗行动记录下线

《The end》已按用户要求移除「本日行动记录」及写入存档的行动流水。营地剧情继续保存关键节点、固定文案 ID、发生天数和已读标记。旧探索续局时沿用这些字段及原有战斗牌序。兼容读取见 `assets/game/core/state/GameState.ts`，节点触发见 `assets/game/core/systems/JournalRules.ts`，恢复回归见 `tests/session-save.test.cjs`。

## 2026-11-22 · 血量与失败返营

已确认并实装。血量归零当次即进入失败页，正式探索推进一天并保留已记录的关键日志，教学失败仍留在第 1 天。从失败页返营时重新获得初始血量、物资和牌组。版本 3 的存档保留旧日志的实际日期与已读情况。当前实现见 `assets/game/core/SurvivalGame.ts` 和 `assets/game/application/GameSession.ts`，验证见 `docs/game-studios-evidence.json`。

- 项目：The end，`D:/qsrizhi/emberwatch`。
- 日期：2026-11-16，Asia/Hong_Kong。
- 状态：循环与失败恢复规则已由用户确认；已实现，验收见 `docs/core-loop-verification.json`。现有文案是首批内容，后续剧情尚未定稿。
- 归档于 `viking://~/resources/projects/the-end/designs/key-node-journal-system.md`。2026-11-28 已回读核对全文。

## 已确认规则

正式地图每结束一次探索，无论通关或失败，都推进一天。取消每日结算与每日生存物资扣除。教学失败仍锁第 1 天，教学通关后可以继续正式探索。

日志按关键节点触发。条件满足时保存固定文案 ID、实际日期和已读状态；普通日子不显示日志。同一节点文案相同，触发日期随玩家而变。按探索结果产生后推进一天的口径，从第 1 天开始挑战，第 2 次尝试通关记第 3 天，第 10 次记第 11 天。

用户另行确认正式失败沿用现有恢复规则：恢复初始补给、牌组和护甲，保留累计天数和关键日志进度；失败不获得通关节点。只有明确确认重新开始游戏才清空整份进度。

## 流程与原生界面

开局日志 → 选择进入档位 → 地图探索。

成功自动返家，清点物品并解除感染临界，推进一天并记录通关事件；有新日志则显示日志，否则进入避难所。阅读完待阅读队列后，可选修复并再次出发。正式失败推进一天并恢复初始补给，显示失败结果，之后返回避难所；教学失败使用相同重试入口但不推进天数。

重试、阅读日志、选择档位、修复、等待和读档不额外过天。避难所原每日消耗区域改为探索进度，主按钮为“整备出发”。修复只检查实际修复费，可直接用完物资。入场费、战斗体力、搜刮和携带规则继续按当前情景执行。

原生 JournalScreen 显示开局日志，保留资源身份的 DayTwoScreen 现在显示后续关键日志，不再表示固定第 2 天终点。标题使用日志记录日期，正文来自配置。失败页属于探索反馈，不登记为每日剧情日志。

## 内容配置与扩展

统一内容源为 `assets/resources/data/journals.json`：

```json
{
  "id": "street-cleared",
  "title": "灰烬街区的归路",
  "body": "该节点的固定文案。",
  "conditions": [{ "milestone": "map-cleared:stamina-expedition", "count": 1 }],
  "prerequisites": ["departure"]
}
```

同条日志的进度条件必须全部满足，前置日志必须全部已经触发。count 是累计次数下限，日期不参与条件。每个 ID 在一份游戏进度中只登记一次；前置以已触发判断，不要求已阅读。多条同时解锁时按依赖顺序进入队列，阅读不改变触发日期。

当前事件为 campaign-started 与 map-cleared:<scenario.id>。新增现有事件的文案、次数条件和日志依赖，只需修改内容数据；新游戏事件由对应规则模块在真实进度变化处调用 JournalRules.record。UI、渲染帧和存档读取不提交进度事件。配置拒绝重复 ID、缺失前置、循环依赖与无效次数；发布后保持 ID 稳定。

## 代码与存档

- `assets/game/core/content/JournalCatalog.ts`：格式、内容校验与配置快照。
- `assets/game/core/systems/JournalRules.ts`：进度累计、条件、去重、触发日期及阅读队列。
- `assets/game/core/systems/ShelterRules.ts`：返家、成功过天、提交通关事件和修复，由 SettlementRules 移动并保留原 .meta UUID。
- `assets/game/core/SurvivalGame.ts`：生命周期、失败恢复、教学例外和规则委派。
- `assets/game/application/GameSession.ts`：continue-journal、retry、start 和自动保存，移除 finish-day。
- `assets/game/core/state/GameState.ts`、`assets/game/infrastructure/SaveRepository.ts`：v2 状态/存档，保存 milestones 和 journalEntries，同时保留随机、背包和战斗进度。
- `assets/game/presentation/GameDirector.ts` 在创建会话前通过原生 resources.load 加载日志 JSON；GameRenderer、ShelterSummaryModel 和 UiActionRouter 只负责界面及输入。

旧 v1 校验后迁移：探索中继续原节点；旧返家状态补记完成地图并过一天，取消未支付的每日费用；旧 day2 终点转为可继续整备，不重复过天或重播完成记录。历史已支付费用不退款。旧正式失败补记一天，旧教学失败仍第 1 天。当前版本缺失进度字段不会通过存档校验。

当前地图仍使用现有 A/B 内容。日志系统可扩展不等于新增地图、完整主线或新失败惩罚已经制作。本次保持人物与动画资源，技术验证不替代用户最终视觉认可。

## 2026-11-17：当前工作区合并与归档

适用工作区：C:/Users/Knock/Desktop/The end；时区 Asia/Shanghai。上文 D:/qsrizhi/emberwatch 和 OpenViking 不可用描述是来源分支执行时的历史状态。当前 main 已合并日志规则与原生角色/架构改进；本轮重新检查 OpenViking，可保存时更新原 URI 并回读，结果见 docs/merge-resolution-20261117.json 和同步状态文件。

## 2026-11-20 新版卡组接续

新开探索使用 `stamina-expedition` 第 2 版。成功返回时，仓库先收下行囊物资卡，然后按关键节点规则显示新日志。读完后可在避难所兑换物资卡或直接选档出发。出发恢复初始护甲和固定初始卡组，保留已累计的天数、关键日志及仓库。旧卡组模式仍可按当前修复费整备。

`assets/game/core/systems/ShelterRules.ts` 处理返家和物资卡兑换，`assets/game/core/SurvivalGame.ts` 在确认出发后重置本局战斗卡组。存档保留未读日志和已入库的物资卡。合并验收见 `docs/game-studios-evidence.json`。

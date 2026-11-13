# 原生场景与 Prefab 迁移验证

日期：2026-11-13。工程：the end。引擎：Pink / COCOS 4.0.0-beta.1。

## 已落地的结构

- 主场景直接保存八个页面、HUD 和四个弹窗的 Prefab 实例；固定节点不在运行时重建。
- 22 个原生 Prefab 包含页面、手牌、奖励卡、三类角色和临时效果。
- 19 个原生 AnimationClip 保存待机、攻击、受击、蓄势、发牌、出牌、飘字等时间线资源。角色动作通过 cc.Animation 播放，命中由 notifyImpact 事件结算。
- 8 个原生图集保存 39 个可选用的 SpriteFrame，卡牌和角色不再运行时裁切 PNG。
- 旧版 PixelUI、GameArt、BattleCard 和导出工具源代码已移到 tools/editor-authoring/；assets 内没有运行时页面生成器。
- 游戏规则和结算顺序保存在 SurvivalRules.ts，本次没有修改规则模型。

## 实际验证

| 检查 | 结果与证据 |
| --- | --- |
| 规则测试 | 32 / 32 通过 |
| COCOS web-desktop 构建 | 通过，temp/prefab-build.log |
| 官方 MCP 打开和查询主场景 | 通过，output/game-mcp.json |
| 编辑器修改保留 | 通过 MCP 将开场标题移动到 x=333.5、y=170，字号改为 40；构建后和进入地图再重开后均保持 |
| 测试改动还原 | 当前标题已恢复到 x=325.5、y=164、字号 37 |
| A 路线 | 完成两场战斗、搜刮、休整、返家和第 2 天；拖拽取消、命中姿态、菜刀生成挥砍、现金丢弃与卡组调整通过 |
| B 路线 | 完成失败重试和整个日循环；护甲归零存活、再次受伤失败、修复风险提示的取消与确认、每日缺口通过 |
| 窗口适配与减少动态效果 | 1024×768 下实际点击、拖牌和帮助弹窗通过 |
| 输入可靠性 | 连点攻击和防御只结算一次；长按拖牌超过提示消失时间后仍可取消 |
| 原生资源实际使用 | 运行中读取到八个页面与四个弹窗的 Prefab UUID、角色 Prefab UUID、手牌模板 UUID 和六条角色 AnimationClip UUID |
| 浏览器异常 | 各测试监听的 pageerror 均为 0 |

完整结构化记录：output/native-ui-verification.json。截图：output/playwright/。图像只作为视觉证据，浏览器测试以实际鼠标操作和游戏状态断言判定通过。

## 后续编辑

在 Pink 打开 assets/TheEnd.scene。页面布局在 assets/prefabs/screens/，卡面在 assets/prefabs/cards/，角色在 assets/prefabs/actors/，动画在 assets/animations/。UIValue.key 和 UIAction.actionId 用于绑定状态与操作；保留标识即可调整位置、字号、图片和尺寸。动态手牌的间距、扇形、悬停参数在 HandPresentation 中调整。详细入口见 README.md。

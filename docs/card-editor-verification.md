# 本地卡牌编辑器验证记录

- 项目：The end，C:/Users/Knock/Desktop/The end
- 日期：2026-11-14（Asia/Shanghai）
- 状态：已实现并验证
- 代码：assets/CardCatalog.ts、assets/SurvivalRules.ts、assets/SurvivalView.ts、tools/card-editor-server.cjs、tools/card-editor/
- OpenViking：viking://~/resources/projects/the-end/docs/card-editor-verification.md

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

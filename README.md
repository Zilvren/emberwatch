# the end

使用 Pink / COCOS 4 制作的末日生存卡牌教学原型。完整流程从第 1 天日志开始，经过两条可选路线、搜刮、战斗、休整与避难所结算，在第 2 天日志结束。

## 运行

```powershell
npm run build:web
npm run preview
```

打开 <http://127.0.0.1:7457/>。浏览器桌面版采用 1440×900 设计分辨率，并按窗口等比适配。

- 攻击牌：点击卡牌再点击敌人，或者把牌拖向敌人。
- 防御、修复和武器：点击使用，或者拖入战斗场地。
- 把牌拖出有效区域可取消。出牌期间会短暂锁定重复操作。
- 奖励的卡牌和物资分别领取；可以先打开背包丢弃物品。
- 现金只能在休整时丢弃，卡组也在休整时调整。
- 顶部可打开背包、生存手册、行动记录，或关闭音效。

## 规则与来源

原始规格保存在 `docs/tutorial-spec.md`；实现约定和本次对话确认的调整见 `docs/implementation-notes.md`。

修复会导致每日物资不足时，先提示风险。玩家可以取消或确认修复。每日消耗只在结算最后处理，不足部分显示缺口，物资不为负数。

## 开发与 MCP

```powershell
npm run mcp
node tools/mcp.cjs list
node tools/mcp-check.cjs
```

官方 MCP 默认端点为 <http://127.0.0.1:9527/mcp>，直接操作本项目的场景、资源和构建。它使用独立场景会话，与 Pink 窗口内的原生 Agent Tools 分开。

`tools/pink.cjs` 使用 Pink 自带 Electron 运行时来匹配引擎原生模块。默认 Pink 路径为 `C:/software/work/PinK/PinK.exe`，可用 `PINK_EXECUTABLE` 指定其他安装位置。引擎版本读取 `.pink/settings.json`。

## 验证

```powershell
npm test
```

规则测试覆盖资源、负重、临时溢出、战斗、感染、随机、失败重试和结算。浏览器通过实际鼠标点击和拖牌完成两条路线，相关驱动在 `tools/browser-*.js.txt`。固定种子可用 `?seed=17`；不提供种子时正常随机。

测试结果、截图与录像位于 `output/`，MCP 构建输出位于 `temp/game-build-v2.log`。项目的 `skipLibCheck` 用于跳过 Beta 引擎声明文件中的内部类型问题；游戏脚本继续执行类型检查。

## 工程入口

| 文件 | 用途 |
| --- | --- |
| `assets/TheEnd.scene` | MCP 创建并保存的游戏场景 |
| `assets/SurvivalRules.ts` | 独立游戏规则与状态机 |
| `assets/SurvivalView.ts` | 场景呈现、交互和战斗反馈 |
| `assets/BattleCard.ts` | 卡面、悬停、点击与拖动 |
| `assets/GameArt.ts` | 像素图集、姿态和裁切 |
| `assets/PixelUI.ts` | 绘制控件与界面几何 |
| `assets/GameAudio.ts` | 本地合成音效 |
| `assets/resources/art/` | 项目实际使用的原创美术 |
| `docs/art-manifest.json` | 美术来源与生成提示词 |

美术使用内置 image_gen 制作，参考图只提供像素风和配色方向，未沿用其内容。最初的背景连通性测试已归档到 `samples/background-smoke/`，不参与当前游戏构建。

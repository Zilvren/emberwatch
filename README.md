# the end

使用 Pink / COCOS 4 制作的末日生存卡牌教学原型。流程从第 1 天日志开始，经过固定搜刮、A/B 路线、战斗、休整和避难所结算，在第 2 天日志结束。

## 在 Pink 中编辑

用 Pink 打开此项目，打开 `assets/TheEnd.scene`。展开 `Canvas/GameRoot`，可以看到已经保存的界面节点：

```text
GameRoot (SurvivalView)
├─ Screens
│  ├─ JournalScreen
│  ├─ MapScreen
│  ├─ BattleScreen
│  ├─ RewardScreen
│  ├─ RestScreen
│  ├─ ShelterScreen
│  ├─ DayTwoScreen
│  └─ FailureScreen
├─ HUD
├─ Popups
├─ Effects
├─ DragLayer
└─ Toast
```

页面与 HUD 都是真实的 Prefab 实例。双击 `assets/prefabs/screens/` 中的对应 Prefab，修改标题位置、Label 字号、面板颜色、Sprite 图片或按钮尺寸后保存即可。运行时会保留这些布局设置。数值标签由 `UIValue.key` 绑定游戏数据，按钮通过 `UIAction.actionId` 绑定操作；改布局时保留这两个标识。

| 编辑内容 | 原生资源 |
| --- | --- |
| 开场、地图、战斗、奖励、休整、结算等页面 | `assets/prefabs/screens/` |
| 顶栏、背包、帮助、记录、确认弹窗 | `assets/prefabs/ui/` |
| 手牌和奖励卡面的布局与插画引用 | `assets/prefabs/cards/HandCard.prefab`、`RewardCard.prefab` |
| 幸存者与两种感染者 | `assets/prefabs/actors/` |
| 待机、攻击、受击、发牌、出牌和飘字关键帧 | `assets/animations/` |
| 伤害、格挡、修复和飘字效果 | `assets/prefabs/effects/` |
| 像素插画及可直接选用的 SpriteFrame | `assets/resources/art/` 下的 PNG 与 `*-frames.plist` |

角色动画只修改 `Visual` 子节点，页面中角色实例的位置和缩放由编辑器保存。攻击动画里的 `notifyImpact` 事件负责结算命中，完成事件解除操作锁。编辑动作时保留事件。`HandPresentation` 负责按实际手牌数量摆放卡牌，间距、扇形角度、悬停高度与缩放可以在 Inspector 调整。

`PixelGraphic` 是保存到 Prefab 的绘图组件，形状、颜色、边框和像素块均可在 Inspector 调整；它重画自己的 Graphics，不生成页面节点。固定界面不再由脚本整页重建。

## 运行

```powershell
npm run build:web
npm run preview
```

打开 <http://127.0.0.1:7457/>。桌面版采用 1440×900 设计分辨率，按窗口等比适配。

- 攻击牌：点击选牌再点击敌人，或将牌拖向敌人。
- 防御、修复和武器牌：点击使用，或拖入战斗场地。
- 拖出有效区域可以取消。动画结算期间锁定重复操作。
- 奖励卡与物资分别领取；可以先打开背包整理空间。
- 现金只在休整时丢弃；休整时也能调整出战卡组。
- 顶部可打开背包、手册和记录，或关闭音效。

## 规则与实现

原始规格保存在 `docs/tutorial-spec.md`，确认过的规则和实现约定见 `docs/implementation-notes.md`。

修复后无法支付每日消耗时，先提示风险。玩家仍然可以确认修复。每日消耗在结算最后执行，不足部分记录为缺口，物资最低为 0。

`SurvivalRules.ts` 保存独立的游戏规则，`SurvivalView.ts` 处理界面数据绑定与流程，`HandPresentation.ts` 处理卡牌实例和手势，`ActorPresentation.ts`、`CardPresentation.ts` 播放原生 AnimationClip，`GameAudio.ts` 提供合成音效。旧版绘制页面的代码已移至 `tools/editor-authoring/` 留档，不参与运行。

## CLI 与 MCP

```powershell
npm run mcp
node tools/mcp.cjs list
node tools/mcp-check.cjs
```

独立 MCP 默认监听 `127.0.0.1:9527`，直接操作当前项目的场景与资源。工具优先发现当前项目的后端；也可设置 `PINK_MCP_URL` 指定已经启动的实例。它与 Pink 窗口中的原生 Agent Tools 是不同入口。

`tools/pink.cjs` 使用 Pink 自带的 Electron 运行时匹配引擎原生模块。默认可执行文件为 `C:/software/work/PinK/PinK.exe`，可通过 `PINK_EXECUTABLE` 修改。引擎版本读取 `.pink/settings.json`。

## 验证

```powershell
npm test
```

32 条规则测试覆盖资源、负重、溢出、战斗、感染、随机、失败重试、返家和结算。浏览器驱动位于 `tools/browser-*.js.txt`，通过实际鼠标点击、拖动验证完整路线。`?seed=17` 可固定随机种子，不带参数时正常随机。

本次原生场景迁移的验证记录见 `docs/native-ui-migration.md`；本地运行报告和截图位于 `output/`，构建日志位于 `temp/prefab-build.log`。

原创像素美术使用 image_gen 制作，来源见 `docs/art-manifest.json`。用户参考图片只用于风格和配色方向，没有沿用其建筑、角色、文字或标识。最初的背景连通性测试保存在 `samples/background-smoke/`。

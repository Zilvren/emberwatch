# the end

The end 是用 Pink/Cocos 制作的架空废土卡牌游戏。正式地图为焦土迷宫。玩家从 12 张基础牌起步，在 17 层地图上选路。战后与指定搜刮点可以补充随行牌组。返家后恢复基础牌组，可继续下一趟探索。

## 本地卡牌编辑器

```powershell
npm run cards
```

打开 <http://127.0.0.1:7460/?page=rewards>，逐张点牌设置奖励池。卡牌横向成排，可以向下滚动。焦土迷宫的战后或指定搜刮点每次最多抽三张，空池直接结算物资。

首次试玩或修改游戏脚本后先执行 `npm run build:web`。之后修改卡牌数据时，点击「保存并试玩」即可读取最新数据，不需要反复构建；当前对局保持原配置，独立预览与发布版本使用构建中打包的数据。

错误数据和保存冲突不会覆盖文件，每次保存自动备份上一版。操作说明见 `docs/card-editor-usage.md`，设计与验证见 `docs/card-editor-design.md`、`docs/card-editor-verification.md`。

## 在 Pink 中编辑

用 Pink 打开此项目，打开 `assets/TheEnd.scene`。展开 `Canvas/GameRoot`，可以看到已经保存的界面节点：

```text
GameRoot (GameDirector)
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

页面与 HUD 都是真实的 Prefab 实例。双击 `assets/prefabs/screens/` 中的对应 Prefab，修改标题位置、Label 字号、面板颜色、Sprite 图片或按钮尺寸后保存即可。运行时会保留这些布局设置。数值标签由 `UIValue.key` 绑定游戏数据，按钮通过 `ButtonAction.actionId` 绑定操作；改布局时保留这两个标识。

| 编辑内容 | 原生资源 |
| --- | --- |
| 开场、地图、战斗、奖励、休整、结算等页面 | `assets/prefabs/screens/` |
| 顶栏、背包、帮助、记录、确认弹窗 | `assets/prefabs/ui/` |
| 手牌和奖励卡面的布局与插画引用 | `assets/prefabs/cards/HandCard.prefab`、`RewardCard.prefab` |
| 青年求生者与三只迷宫怪物 | `assets/prefabs/actors/`、`assets/ashen-labyrinth/` |
| 迷宫牌面、避难所绘画和 UI 色板 | `assets/ashen-labyrinth/interface/` |
| 待机、攻击、受击、发牌、出牌和飘字关键帧 | `assets/animations/` |
| 伤害、格挡、修复和飘字效果 | `assets/prefabs/effects/` |
| 迷宫场景背景和原生 SpriteFrame | `assets/ashen-labyrinth/`、`assets/ashen-survivor/light-cut-passage.png` |

迷宫四个战斗角色由 Spine 3.8 驱动。主角确认出牌后由独立牌背投射物承接出牌结算。怪物通过 Spine 命中与完成事件结算动作。原生演员和插画的制作命令见 `tools/spine/install-labyrinth-actors.cjs`、`tools/author-labyrinth-interface.py`。`HandPresentation` 负责手牌交互。

`ShapeGraphic` 是保存到 Prefab 的绘图组件，形状、颜色、边框和像素块均可在 Inspector 调整；它重画自己的 Graphics，不生成页面节点。固定界面不再由脚本整页重建。

## 运行

```powershell
npm run build:web
npm run preview
```

打开 <http://127.0.0.1:7457/>。桌面版采用 1440×900 设计分辨率，按窗口等比适配。

- 攻击牌：点击选牌再点击敌人，或将牌拖向敌人。
- 防御、修复和武器牌：点击使用，或拖入战斗场地。
- 拖出有效区域可以取消。动画结算期间锁定重复操作。
- 正式新局的物资自动入账。战斗胜利后和指定搜刮点可比较最多三张发现牌，拿一张或略过。选中的牌从下一场开始可抽。
- 发现牌在本次探索内有效，成功返家后恢复基础牌组。营地恢复护甲并可查阅牌组。
- 顶部可打开背包、手册和记录，或关闭音效。
- 长按手牌查看完整说明。正式探索成败都推进一天。旧进度可继续，重开需要确认。

## 规则与实现

原始规格保存在 `docs/tutorial-spec.md`，确认过的规则和实现约定见 `docs/implementation-notes.md`。

修复只支付实际修复费。正式探索失败时恢复初始物资、护甲和牌组，保留天数与关键日志。

当前实现位于 `assets/game/`：`core/SurvivalGame.ts` 委派各规则模块，`application/GameSession.ts` 执行命令与保存，`infrastructure/SaveRepository.ts` 管理进度存储。`presentation/GameDirector.ts` 协调场景和命中回调，`GameRenderer.ts` 绑定界面，`ui/UiActionRouter.ts` 转换输入意图；卡牌、角色和音效各在对应表现目录。根目录 `assets/SurvivalRules.ts` 是兼容导入入口，旧版页面绘制代码在 `tools/editor-authoring/` 留档。

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

用 `npm run typecheck` 检查引擎类型。`node tools/check-labyrinth-browser.cjs` 在独立浏览器中检查焦土迷宫的营地、路线、发现和存档。`?seed=17&save=off` 提供独立的固定种子试玩。

焦土迷宫的图文评审见 `docs/vertical-slice.md`，验证报告与截图位于 `output/playwright/ashen-labyrinth/`。普通构建直接使用已导入的原生资源。

本次原生场景迁移的验证记录见 `docs/native-ui-migration.md`；本地运行报告和截图位于 `output/`，构建日志位于 `temp/prefab-build.log`。

盐原角色、场景和卡图的原始提示及参考来源见 `art-source/tide/provenance.json`。早期像素与 08 方案的资料继续保存在 `docs/art-manifest.json` 和 `samples/background-smoke/`。

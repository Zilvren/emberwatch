# 按钮组件设计

- 项目：The end。
- 日期：2026-11-14，Asia/Shanghai。
- 状态：第二件 UI 组件的可运行评审稿。
- 依据：卡牌组件已采用的纸色、细灰棕线、浅土黄与灰橄榄。保留现有玩法流程和命令含义。
- OpenViking：`viking://~/resources/projects/the-end/designs/ui/button-component.md`；保存与回读记录见 docs/openviking-sync-status.json。

## 用途与状态

主操作用低饱和土黄填色和较强字重；次要操作用纸色；轻操作默认透明；危险操作用淡棕红纸色和深红棕文字。普通、悬停、按下、禁用和键盘焦点均有独立状态，状态优先级由纯函数集中决定。

悬停仅换色。指针按下时，ButtonSurface 层下移 2、缩放至 0.99，在 100 毫秒内完成轻反馈；原生根节点命中区域保持固定。移动到按钮外松开取消。快速切换会停止旧过渡并从当前变换继续，不排队。

禁用状态不再把整个按钮半透明处理，保留文字可读性。纸底与深底的所有用途、状态文字对比度均以 4.5 为最低检查值。旧 HUD 和弹窗上的透明轻操作使用深底适配，避免深字落在深色背景上。

键盘焦点使用额外细框。Tab / Shift+Tab 跳过不可用或未显示的按钮；Enter 和空格只激活一次，按键重复不反复发送命令。键盘激活不移动文字。减少动态效果偏好下保持换色，关闭按压位移和缩放。

默认高度 48；评审页另有 40 高紧凑样例及 56 高长文案样例。已有游戏按钮保持原来的占位与绑定，不借按钮改造重新排列页面。

## 责任划分

- `ButtonStyle.ts`：状态优先级和主题配色，不依赖引擎。
- `ButtonPresentation.ts`：纸面、文字、焦点框、指针反馈与取消判定，不执行游戏规则。
- `ButtonFocusGroup.ts`：所在游戏根节点的键盘顺序和激活。Web 适配忽略 HTML 输入框，原生平台保留 Cocos 输入入口。
- `ButtonAction.ts`：原生点击绑定的入口，只发送作用于所在根节点的界面意图；新外观缺失时保留旧控件的兼容行为。
- `ButtonDesignReview.ts`：独立状态矩阵、点击计数、禁用与深底对照，不调用 GameSession。

标准预制体位于 `assets/prefabs/ui/buttons/`，四种用途共用同一套组件。它们的 `cc.Button.clickEvents` 明确绑定自身的 `ButtonAction.activate`，Inspector 可以直接看到目标和函数。

复用时配置 ButtonAction 的 actionId/payload 和 Caption；四个基础预制体的默认标识用于演示，不能凭显示文案推断命令。darkSurface 标记所在容器是否为深底，后续面板设计改变背景时应同步配置。

表面对旧有原生按钮采用 ButtonSurface 子层，原来的 ButtonAction、Caption、根节点大小和本地 fileId 保留。地图节点、敌人目标等非普通操作控件不在本次外观迁移内。重开和丢弃确认采用危险样式，修复风险确认保留主操作样式，命令与结算规则不变。

## 查看与验证

原生评审场景为 `assets/ButtonDesignReview.scene`，包含四用途乘五状态的对照矩阵，以及实际操作区。运行 `npm run buttons` 后打开 http://127.0.0.1:7464/，构建用 `npm run build:buttons`。

正常构建不会重新生成设计资源；`tools/build-button-component.cjs` 是明确的资源编写与采用工具。所有配色和反馈参数来自 `assets/resources/ui/theme.json` 的 button 段。

验证包括点击一次、移出取消、禁用不激活、正反向 Tab、键盘无位移、重复按键抑制、深底、减少动态效果，以及主游戏的既有流程回归。结果见 `docs/button-verification.json`，评审图为同目录 button-states.png、button-focus.png 和 button-dark.png。美术与触感仍供用户逐件评审。

# 卡牌组件设计

- 项目：The end。
- 日期：2026-11-14，Asia/Shanghai。
- 状态：第一件 UI 组件的可运行评审稿。
- 依据：08 细描边人物稿的配色与线条，以及正式系统简表的卡牌字段。当前不设计或实现新的玩法流程。
- OpenViking：`viking://~/resources/projects/the-end/designs/ui/card-component.md`；保存与回读记录见 docs/openviking-sync-status.json。

## 视觉与信息

采用纸色、细灰棕线、灰橄榄与淡棕物品插画。主文字 #454238，次文字 #626650，风险文字 #8c5547；在纸色 #f2eadb 上的对比度分别约 8.41、4.97、5.01。面板边缘变化是固定几何，不在每帧随机生成。

卡牌按费用和资源单位、名称、类型、物品插画、关键词、关键效果、补充说明、状态及负重组织。卡面按固定字号保留简短信息，完整说明通过展开阅读；长名称保留全称，正面明确显示省略号，不靠持续缩字号填满。

费用数值与资源名独立。正式参考显示体力；兼容教学配置显示物资。非战斗卡不显示费用徽标；可配置但未填写的费用显示破折号并在完整说明中注明待配置，不显示为 0。

十种插画为攻击、躲避、刀具、强化躲避、修复、重击、挥砍、现金、绳子和电池。由内置 image_gen 生成，提示词和来源见同目录 JSON。图集工具只读取像素并输出切片元数据，不修改原图像素。

## 状态与交互

| 状态 | 表现与行为 |
| --- | --- |
| 普通 | 纸色、稳定细线，效果与负重可直接读取。 |
| 悬停 | 暖土黄边线，轻抬 12，缩放 1.025；减少动态效果时保留颜色反馈。 |
| 选中 | 较暖纸色和额外细边线，状态文字明确标注，不只靠颜色区分。 |
| 战斗内不可用 | 显示具体原因和风险色，插画降强调；正文仍保持可读。 |
| 完整说明 | 长按 0.45 秒展开，不触发出牌；说明可滚动，底部可收起。 |
| 小尺寸手牌阅读 | 保持原手牌占位，临时放大至标准卡面并摆正，放到本容器前层，避免斜着读小字。 |
| 拖动取消 | 目标未接收时回到原父节点、位置与角度；不改游戏状态。 |

## 组件结构

- `CardPresentation`：绑定显示模型、费用单位、关键词、状态、说明和原生动画。
- `CardInteraction`：悬停、长按、拖动、回弹，只发界面意图。
- `CardViewModel`：Cocos 与网页编辑器共用的语义模型，包含教学兼容适配和正式参考适配。
- `PaperPanel`：固定纸边几何与颜色，独立于规则。
- `HandPresentation`：手牌容器与排列，向交互组件提供上下文。
- `CardDesignReview`：独立的状态、长文本和十张参考卡预览，未调用游戏命令。

两份原生资源 `assets/prefabs/cards/HandCard.prefab`、`RewardCard.prefab` 复用这套组件。Motion 层由 AnimationClip 驱动，Visual 层由交互反馈驱动，避免悬停与打出动画争用同一个变换。

主要源码在 `assets/game/presentation/cards/`；主题在 `assets/resources/ui/theme.json`；图集在其 cards 子目录；正式参考在 `assets/resources/ui/card-reference.json`。

## 查看与边界

原生场景：`assets/CardDesignReview.scene`。运行 `npm run ui` 后打开 http://127.0.0.1:7462/；重新构建用 `npm run build:ui`。场景支持切换十种卡、展开说明和长文本检查。该页的控制按钮是原先评审工具；按钮组件另在 ButtonDesignReview.scene 中逐件设计，见 button-component.md。

当前手牌、奖励容器保持原有外部占位，角色造型与大小不因卡牌设计改变。其余 UI 组件按次序设计，现有 HUD、地图、背包等外观尚未统一。正式版运行规则、材料玩法与遗物/配方也尚未因展示参考而启用。

验证记录见 `docs/refactor-verification.json`。评审图位于本目录的 card-states.png、card-details.png；原始截图来自 Cocos 实际播放。

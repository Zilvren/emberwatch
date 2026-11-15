# 通用面板组件设计

- 项目：The end，C:/Users/Knock/Desktop/The end。
- 日期：2026-11-15，Asia/Shanghai；制作开始于 2026-11-14。
- 状态：第三件 UI 组件的可运行评审稿，最终画风和触感仍待逐件评审。
- 范围：统一容器与弹窗交互，接入现有生存手册、行动记录和确认窗口；不增加玩法流程。背包行、地图和 HUD 继续按各自组件处理。
- 依据：08 造型方向对应的纸色、细灰棕线、浅土黄与灰橄榄，沿用卡牌与按钮主题。
- 相关代码：assets/game/presentation/ui/CommonPanel.ts、PanelLayout.ts、ModalPanel.ts、ButtonFocusGroup.ts、PanelDesignReview.ts；资源位于 assets/prefabs/ui/panels/。
- OpenViking：viking://~/resources/projects/the-end/designs/ui/panel-component.md；保存与回读状态见 docs/panel-verification.json。

## 结构和布局

面板分为标题区、中间内容区和底部操作区。标题允许自然换行，关闭按钮有独立的 40×40 命中区。正文使用原生 Label、Mask 与 ScrollView；内容变长时只滚动正文，标题和操作区固定。滚动提示指明还有下方内容，末尾显示向上提示。每次打开从顶部阅读。

默认内边距 24、区域间距 12、按钮高度 48、容器外边距 20；窄面板减少到至少 16 的内边距。底部按钮保持原来的顺序与用途，宽度不足时改为纵向全宽排列。长标题增加标题区域高度；空间允许时，容器适当增高以至少保留 128 的阅读区域。尺寸来自实际容器，当前桌面游戏仍使用原有设计分辨率；这不表示全游戏的手机布局已完成。

InfoPanel 为常规阅读窗口，ConfirmPanel 为确认窗口，WidePanel 为宽内容窗口。三者复用 CommonPanel 和已有按钮组件。纸面轮廓固定，开关直接响应；本次没有增加反复播放的缩放或装饰动画。

## 弹窗行为

遮罩覆盖游戏区域并阻止指针穿透。普通阅读窗口可用关闭按钮、返回按钮、Escape 或遮罩关闭。确认窗口点击遮罩不关闭；Escape、关闭按钮和返回都只发取消意图，确认必须点击确认按钮。默认焦点落在返回/取消，危险操作不会默认得到确认焦点。

弹窗打开后，Tab 和 Shift+Tab 在弹窗内部循环，Enter、空格仍由原生 Button 点击绑定激活。关闭后恢复打开窗口的按钮焦点。PageDown、PageUp、Home、End、上下方向键可阅读滚动内容；输入框中的键盘事件不被接管。键盘范围由场景内的 ButtonFocusGroup 管理，没有新的全局命令总线。

## 职责与接入

PanelLayout 只计算几何，不依赖引擎或游戏规则。CommonPanel 负责纸面、标题与内容排版；ModalPanel 只负责关闭意图与键盘阅读。调用者提供文案及 ButtonAction.actionId，不从文案推断业务。

三个既有弹窗保留原来的 UIValue、ButtonAction、本地 fileId 与命令绑定。修复风险仍允许确认修复，每日消耗仍在结算末尾执行。背包窗口在本次之外，后续与背包行一起整理。

原生评审场景为 assets/PanelDesignReview.scene。npm run build:panels 构建，npm run panels 启动 http://127.0.0.1:7465/。评审页包含三个嵌入式样例与三个实际可打开的原生预制体，并可切换窄尺寸和长标题。

## 验证范围

验证布局边界、不同宽度的操作区、滚轮/拖动/键盘阅读、正文裁剪、焦点循环与恢复、遮罩不穿透、取消与确认隔离，以及游戏现有 A/B 路线。结果和实际截图见 docs/panel-verification.json。本轮运行验证以 Web 桌面端为准，其他平台需单独检查。

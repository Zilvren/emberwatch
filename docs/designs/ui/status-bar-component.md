# 状态栏组件设计

- 项目：The end，C:/Users/Knock/Desktop/The end。
- 日期：2026-11-15，Asia/Shanghai。
- 状态：第四件 UI 组件的可运行评审稿，画风和触感仍按件评审。
- 范围：日期、保存状态、物资、护甲、携带/暂存与五个现有操作按钮；不增加玩法流程。
- 相关代码：assets/game/presentation/ui/StatusBar.ts、StatusBarModel.ts、StatusBarLayout.ts、StatusBarDesignReview.ts，及 GameRenderer.ts、GameDirector.ts。
- 原生资源：assets/prefabs/ui/HUD.prefab、assets/StatusBarDesignReview.scene。
- OpenViking：viking://~/resources/projects/the-end/designs/ui/status-bar-component.md；保存及回读状态见 docs/openviking-sync-status.json。

## 信息与画风

左侧显示项目标识、保存情况和日期，中间分别显示物资、护甲与携带情况，右侧为记录、帮助、声音和重开。背包入口位于携带区域。使用卡牌、按钮和面板一致的纸色、细灰棕线、灰橄榄与淡棕警示色。数值保留准确整数，不把大数值静默四舍五入。

物资为 1 时显示“补给偏低”，为 0 显示“补给用尽”；护甲低于等于 2 显示偏低，实际 critical 状态显示感染临界。护甲刻度对应实际比例，不把 0 护甲改称死亡。负重已满和暂存有物品分别说明；这些都是展示提示，不改变规则或按钮资格。保存失败保留“勿关闭”提示，备份恢复与原存档保护单独展示。

当前教学兼容规则仍使用物资、携带容量 30、暂存 10。本次不把未启用的正式战斗体力、无限仓库等展示为现有系统。每日消耗最后执行、风险提示后仍可确认修复等规则保持不变。

## 布局与输入

宽度至少 1180 时使用 80 高单行；720 至 1179 使用 144 高两行；更窄时分成 264 高的四个区域。工具按钮统一 40 高，长数字和窄尺寸不改变命中区。主游戏保持原来的 1440 设计宽度与 80 高顶部区域，角色造型、大小和场景占位不变。容器宽度适配不等于全游戏手机布局已完成。

数值和护甲刻度直接更新，没有滚动数字、闪烁或反复缩放。按钮复用已有指针反馈、键盘焦点和减少动态效果处理。界面忙碌或弹窗打开时，顶部操作暂时禁用，解锁后恢复原来的命令与焦点行为。

StatusBarModel 只生成文案和状态；StatusBarLayout 只计算几何；StatusBar 更新原生 Label、UIProgress、PaperPanel 和 ButtonAction。GameRenderer 把只读游戏状态传给组件，组件不调用规则或存储。GameDirector 的调试快照只读暴露状态栏结果以便验证。

窗口缩放验证发现，旧桌面预览模板只用 CSS 拉伸固定引擎画布，画面与输入坐标会错位。主游戏和本组件评审场景新增 presentation/platform/WebViewport.ts，通过公开的 screen.windowSize 同步实际窗口与设备像素比，关闭时移除监听；不修改引擎源码或游戏状态。窗口缩放后重新验证真实按钮命中。

HUD.prefab 保留原 UUID、根 fileId，以及五个原有操作按钮的命令与 fileId。旧 header/textN 绑定改为明确的日期、物资、护甲等组件字段。旧子节点的 y=410 改到主场景 HUD 实例位置，预制体本身以原点排布，便于在编辑器查看和复用。评审场景的四个例子链接同一个 HUD.prefab。

## 查看与验证

npm run build:status 构建，npm run status 启动 http://127.0.0.1:7466/。评审页提供充足、低资源、感染临界和大数值/存档提醒四组例子，可切换资源、宽度和操作锁。

验证包括边界文案、数值精度、布局和命中区、五个真实按钮、声音切换、键盘、禁用、弹窗焦点恢复、主游戏状态同步和 A/B 路线。记录见 docs/status-bar-verification.json，运行平台为 Web 桌面。其他 UI、正式资源规则和其他平台仍分别推进。

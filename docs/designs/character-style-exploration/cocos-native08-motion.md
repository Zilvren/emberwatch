# The end：08 原画的 Cocos 原生角色动作

- 项目：The end；日期：2026-11-16，Asia/Shanghai。
- 用户决定：此前提出 Spine 后，最新明确改选“用 cocos 自带的吧”；本轮采用 Cocos 原生 Animation 与节点层级，不依赖 Spine 编辑器。
- 状态：三个现有演员已接入原生游戏，技术回归和实际输入检查通过；用户对最终动作手感的认可保持开放。
- 归档：viking://~/resources/projects/the-end/designs/character-style-exploration/cocos-native08-motion.md。

## 实际技术边界

AnimationClip 的原生角度、位置和属性轨道驱动 Prefab 内的节点。Visual/NativeBones/PoseRoot/Body 下可查看头部、两侧手臂及武器接触定位节点。NativeActorSkin 是项目的原画分区绑定组件，复用已隔离的 StableActorSprite SDK 网格桥接；它不执行游戏命令，不冒充 Spine 或 Cocos 的 3D SkeletalAnimation。

当前是二维刚性部件动画：躯干、背包、腰包和腿部保持一体，头部与左右手臂/手部独立。完整行走、独立腿部动作及换装菜单不在本轮交付内。保留相同纹理而把全部像素连续拉扯，会在衣物边界产生尖角；因此按关节边界细分原有三角形，各部件跟随自己的节点，在关节后方复用原画局部作为重叠。

原画仍为 assets/resources/actors/sketch08/master08-thin.png，SHA-256：42c8f2393d8b08eb7f69f4900e12b9e04d9e768587b96aff3637964900243e1f。没有生成替代脸、重新调色或缩放 PNG。新几何位于 assets/resources/actors/native08/，保留旧几何的渲染覆盖和 UV；原来 420 的基础显示高度、场景实例缩放和原站位保持。未被索引引用的旧几何顶点不用于计算可见边界。

本轮早期候选发生过衣物跨关节拉伸、碎片接缝和渲染缓冲区超限，这些不能视为已交付效果。当前按骨骼及完整顶点属性去重，共用顶点后为 survivor 874、wanderer 1119、brute 1385，均低于本项目为固定 SDK 设置的 4000 顶点预算。源码还保留 renderReady 检查，不能只凭节点存在就宣称角色已经显示。

## 动作与事件

| 角色 | 攻击总长 | 单次接触事件 | 动作侧重 |
| --- | --- | --- | --- |
| 主角 | 0.72 秒 | 0.34 秒 | 预备、前移、刀刃接触、收势回位 |
| 游荡者 | 0.80 秒 | 0.38 秒 | 前伸抓击与身体倾斜 |
| 重型怪 | 0.94 秒 | 0.46 秒 | 更长预备、重拳接触、回收 |

这些是演出时序调整，没有改卡牌伤害、体力、护甲、存档或结算规则。原生曲线采用带切线的三次插值；每段攻击有九个时序姿势键，不将其称为九张独立绘制帧。待机三秒循环，保留局部呼吸并锁定头部部件；准备、受击和倒下也在三个演员的原生片段中维护，倒下末姿势停留。

ActorPresentation 在攻击前计算预计刀尖/手部接触位置，在同一高度求目标可见轮廓；approach 原生属性轨道把演员移动到该位置。命中信号仍只调用既有 GameSession 命令一次。动作完成和禁用时恢复原站位，减少动态效果继续走即时反馈路径。脚底的竖向调整与身体倾斜同步，保持接触地面。

## 资源与维护

- 当前消费者：PlayerActor.prefab、WandererActor.prefab、BruteActor.prefab，根 UUID/fileId 保留。
- 原生片段：assets/animations/native08/Native08_{角色}_{动作}.anim，共十五个。
- 显式作者工具：node tools/author-native-actor-motion.cjs --prepare；首次连接指定角色，当前连接的结构修订须显式 --refresh。
- 新脚本或新资源须先经 Pink SDK 导入，再引用实际元数据。普通构建不调用作者工具。
- 旧序列帧、原画、原网格及被否决的 paperdoll08 资源继续保留，后者停用，不把旧失败记录改写成视觉通过。

## 当前验收依据

129 项自动测试检查原生绑定、原画覆盖、比例、静止还原、刚性部件面积、顶点预算及既有玩法。14 组原生 Canvas 实际操作回归检查卡牌、路线、体力、背包、奖励、存档及结算。

output/playwright/native08-motion-report.json 记录真实出牌、回合结束及正常/半速动作采样；清晰的暂停接触截图属于明确标记的表现诊断，隐藏特效后观察接缝，没有伪造游戏命中。诊断前后规则状态一致。正常速度纯实战录像为 1440×900 的 native08-wanderer-gameplay.webm 和 native08-brute-gameplay.webm，均位于 output/playwright/，没有直接调用动画方法。混合检查录像另存 native08-motion-verified.webm，包含明确区分的表现诊断；正常/半速时序采样不等同于性能达标或用户视觉认可。

当前说明只支持已记录的接入、形状保持、接触、回位和动作时序，不宣称整个正式游戏、所有运动类型或最终美术已经定稿。详细证据为 docs/native08-verification.json。

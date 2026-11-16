# The end 原生纸娃娃骨架接入

- 项目：The end；日期：2026-11-16，Asia/Shanghai。
- 状态：主角工程接入与技术验证通过；整体造型、动作手感与最终美术认可待用户实机评审。
- 依据：用户要求先修复四项架构耦合，并提出人物使用骨架、纸娃娃技术；沿用 08 的角色身份、细线和浅土黄、灰橄榄、淡棕配色方向。
- 归档：viking://~/resources/projects/the-end/designs/character-style-exploration/paperdoll08.md。

## 当前实现

主角使用 Cocos 原生层级 Node 作为变换骨骼，cc.AnimationClip 驱动角度、位置和披风缩放；18 个 Sprite 插槽按独立绘制顺序跟随 20 个骨骼/定位节点。它是刚性分层纸娃娃骨架，不是完整的 Spine 蒙皮系统。现有角色根节点、场景站位、原场景/Prefab UUID、旧图集和旧动画均保留。

资源位于 assets/resources/actors/paperdoll08/；PlayerActor.prefab 中可以展开 PaperDoll/Bones 和 PaperDoll/Slots 查看编辑。PaperDollRig.ts 负责骨骼到插槽的绑定与双腿 IK；TwoBoneIK.ts 是无引擎依赖的二维求解。插槽支持 setAttachment，但没有擅自新增装备规则或完整换装菜单。

新分层稿由图像工具参考 approved08 绘制，包含头罩、躯干、披风、背包、腰胯、武器和四肢。它们不是原整个人物的像素级拆图，不能声称新组合与原图每个像素一致。原 master08-thin.png 字节保持。Python 仅分析透明边界并编写原生帧取样矩形，隐藏关节延伸部分；不改写、重采样 PNG。两张原始生成图、真实尺寸、哈希、透明率和分片边界见 parts.json；来源与完整提示词见 paperdoll08.prompt.json。

## 动作合同

| 动作 | 时长与机制 | 结算/循环 |
| --- | --- | --- |
| idle | 3 秒；披风极小呼吸与手臂轻微变化，头部与腿部位置不循环漂移 | 原生插值循环；不是逐帧重画或换脸 |
| attack | 0.56 秒；0.15 秒预备、0.28 秒接触、0.34 秒跟随、0.46 秒回收 | notifyImpact 仅一次，仍交给 GameDirector/GameSession 执行规则 |
| hurt | 0.31 秒；躯干后撤 | 完成后恢复待机 |
| prepare | 0.56 秒；抬臂准备 | 完成后恢复待机 |
| death | 0.91 秒；停止脚底固定，倒地 | 停在末姿势，不自动返回待机 |

两腿固定的目标位于角色局部地面；攻击时躯干下沉，IK 调整腿部角度。头部、手和装备共享各自固定图像，动作时不更换整个人物绘图。减少动态效果会把待机采样到初始姿势再停止；动作中的单次命中/完成约定继续由原接口维护。

## 验证与范围

主游戏实机中的正常/半速攻击、单次伤害和费用、待机头脚稳定、固定部件 UUID、受击返回、暂停恢复、死亡停帧与动态偏好见 output/playwright/paperdoll-motion-report.json。录像为 output/playwright/paperdoll-playback.webm。单独的暂停采样和插槽替换是表现诊断，不代表玩家装备流程；诊断前后规则状态一致。

已查看待机、预备、接触、死亡停帧的原生截图；正常与半速有真实播放采样和录像，不以 sample=60 推断观感或性能。用户尚未认可新的分层组合与最终动作手感。游荡者和重型怪仍沿用现有 Sprite/稳定局部网格表现适配器，未宣称已完成骨架迁移；旧 ActorMotionReview 保留序列帧比较用途。

作者入口 author-paperdoll.cjs、prepare-paperdoll.py、polish-paperdoll.cjs 均为显式工具，不在普通构建链中。已连接的 PlayerActor 不允许通过首次 author 入口重复重建。未来修订骨架/插槽时在当前原生资源上维护引用，再检查单次命中、地面和头脸稳定。

## 2026-11-16 用户否决后的录像复核

状态：视觉验收失败，当前动作需要返工；历史技术测试结果保留，不代表动作质量通过。当前主角并未使用 Spine：实际为自制 PaperDollRig、Node/Sprite 和 cc.Animation，没有接入 sp.Skeleton 或 Spine 导出资源。

已从原 WebM 解码核对正常攻击约 7.4 秒和半速攻击约 10.0 秒及前后时刻。刀仍距敌人很远时已出现命中特效；手臂刚性伸出与身体下蹲缺少协调的发力。不能以骨骼/插槽数量、脚底误差或单次结算测试替代视觉判断。此次按用户要求先复核现有结果，两个怪物尚未迁移。详细记录见 docs/paperdoll-visual-review.json。

## 当前方案指向

本页保留为已否决的早期候选。用户最新改选 Cocos 原生 Animation 后，主角和两个怪物的当前实现、原画保持与验证范围见 cocos-native08-motion.md 和 docs/native08-verification.json。旧 FAILED 结果不改写成新候选通过。

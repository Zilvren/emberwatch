# The end：Spine 08 角色骨骼动作

- 项目：The end，Pink/Cocos 4.0.0-beta.1。
- 日期：2026-11-17，Asia/Shanghai。
- 状态：已实施；三角色十五动作已接入原生游戏，技术回归及执行者美术审查完成。动作时序、骨骼参数与权重为本轮制作值，用户最终主观认可尚未记录。
- 归档：viking://~/resources/projects/the-end/designs/character-style-exploration/spine08-motion.md。
- 当前测试工具结论见 docs/spine-mcp-verification.md；此前 Cocos 原生与被否决纸娃娃的记录保留为历史。

## 确认范围与实现方向

当前三角色 survivor、wanderer、brute 的 idle、attack、prepare、hurt、death 共十五个动作改为 Spine 3.8.75 骨骼动画；主游戏仍使用 Cocos 原生 Scene/Prefab、sp.Skeleton 和原应用命令，不迁移引擎或增加游戏规则。

保留 08 原画 master08-thin.png 的字节、原头脸/头盔、既有显示比例和站位。以现有原画覆盖几何为基础制作网格蒙皮，每角色 28 根骨骼/控制，包含腰胯、胸腔、双臂、双腿、衣物、武器/刀尖及双脚 IK。头脸与靴子使用刚性绑定，衣物关节局部混合权重；待机不做全身缩放或头脚漂移。原画被手臂遮住的局部由使用同一原图颜色/线条 UV 的覆盖网格补足，避免抬臂时缺一截。

三角色的五个动作均经本地 MCP spine_control_bones 写入关键帧，经 spine_import_json / spine_export 创建可编辑工程并生成运行 JSON。几何和基础骨架由明确作者工具生成，不声称 MCP 已提供自动绑权重功能。

## 资源与模块

- 作者工具：tools/spine/rig-authoring.cjs、tools/spine/author.mjs、tools/spine/connect.cjs，均为显式命令，普通构建不执行。
- 编辑源：art-source/spine08/*.spine 和 *.authoring.json；不放入运行资源目录。
- 运行资源：assets/resources/actors/spine08/，包含三个 Spine JSON、atlas、contract.json、一份原画的相同字节副本和三个死亡身体附件。当前 SDK 图集导入器只按页面 basename 查找同目录纹理，所以显式共享这一副本，不修改原图。
- 接入：assets/game/presentation/actors/SpineActorRig.ts、SpineRigGeometry.ts、ActorPresentation.ts，以及现有三个演员 Prefab。
- 保留根 UUID/fileId、视觉节点比例和已有原生资源；新增资源先由 Pink SDK 导入，再引用实际元数据。
- 契约中的骨骼蒙皮轮廓只服务接触定位；伤害、体力、日期、奖励和保存仍由原 GameSession/规则执行。

## 动作与死亡附件

| 动作 | 主角 | 游荡者 | 重型感染者 | 行为 |
| --- | --- | --- | --- | --- |
| idle | 3.00 s | 3.00 s | 3.00 s | 循环；局部呼吸，头和双脚稳定 |
| prepare | 0.66 s | 0.66 s | 0.66 s | 预备后恢复 |
| attack | 0.84 s / 0.40 s 接触 | 0.94 s / 0.45 s 接触 | 1.10 s / 0.54 s 接触 | 预备、前移、单次接触、回收与回位 |
| hurt | 0.38 s | 0.38 s | 0.38 s | 局部受击后回待机 |
| death | 1.12 s | 1.18 s | 1.28 s | 骨骼倒下，过渡到贴地终姿势并保持 |

死亡采用 Spine 骨骼倒下与替换附件的组合。前段保留原画身体体积，以连续骨骼关键帧倾倒；末段过渡到独立绘制的侧卧身体附件，Corpse/CorpseHead 控制贴地位置并重用原图的头、兜帽或铁盔网格。不是将死亡终姿势的每一根手指和腿继续分别蒙皮，也不是重新生成头脸。三份身体附件通过内置 image_gen 参考已确认原图生成，原始文件不重采样，尺寸/透明边界/注册点见 tools/spine/corpse-regions.json，提示词与来源见 spine08-corpse-prompts.json。

曾测试的深度屈膝折叠候选出现衣摆尖刺和身体悬空，已否决；证据保留在 output/playwright/spine08/before/death-deep-fold-rejected.png。当前终姿势已在原生场景核对轮廓、原头脸、颈部连接、脚底与地面，不把被否决候选算作通过。

## 接触与运行边界

SpineActorRig 隔离 sp.Skeleton 播放、速度、暂停、采样、取消和事件。ActorPresentation 继续向既有命令链转交一次命中，规则、费用与存档由原模块负责。当前 SDK 的动画时间线与世界骨骼矩阵并非同时更新，曾导致接触点取到上一帧；现于 EVENT_BEFORE_DRAW 更新骨骼世界矩阵、同步前移后再分发事件，隔离在此适配器中。升级 SDK 时应复验这一桥接。

真实出牌/敌方回合实测接触误差分别约为主角 0.0204、游荡者 0.0406、重型 0.0083 设计单位。这是指定战斗样本的刀尖/手部对目标轮廓的诊断，不是任意装备或所有敌人的保证。ContactShadow 同帧跟随最终角色位置。动作被覆盖、禁用或取消后，旧回调不会再执行；减少动态效果仍保留进行中的命中与完成。

## 审查与验证

已应用项目 art-bible、asset-spec、ux-review、vertical-slice 和 test-evidence-review。执行者查看了真实主场景命中图及三角色动作、倒下和 1024×768 诊断图，并核对正常/半速的时序采样与最终录屏抽帧。主要修正为手臂遮挡后的缺口、接触矩阵滞后一帧以及倒下终姿势悬空。最终接触轮廓连贯、原头脸可识别、死亡身体落地；不把骨骼数、抽帧或视频编码帧率写成主观流畅度或设备性能结论。

- 149 项自动测试通过，包含七项 Spine 资源、网格、曲线、地面与引用测试；类型、架构和原生 web-desktop 构建通过。
- 同一原生包的 14 组浏览器回归通过，覆盖 A/B 路线、保存/恢复、奖励、失败、体力、拖牌取消、快速输入、弹窗、减少动态效果及较小桌面。
- 实际主角/游荡者与重型战斗均通过真实输入验证一次命中、费用与结束；独立展示诊断覆盖三角色的正常/半速五动作、暂停恢复、中断与死亡保持，诊断前后游戏状态完全相同。
- 微信小游戏测试编译成功，输出 build/wechatgame-spine08，使用 SDK 测试 AppId。编译适配只作用于当前 4.0.0-beta.1 SDK 子进程，详见 tools/spine/wechat-babel-compat.cjs。未做微信开发者工具/真机运行、性能测量或发布。
- 完整证据矩阵：docs/spine08-verification.json；MCP 调用：docs/spine08-mcp-report.json。

技术实现与本轮执行者视觉审查已交付。用户最终主观视觉认可、微信真机及性能证据保持未验证；本次没有更改玩法、日期/日志或保存规则。

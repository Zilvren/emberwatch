# The end：当前独立部件骨架（2026-11-18）

项目 The end，Pink/Cocos 4.0.0-beta.1、Spine 3.8.75。当前版本更新于 2026-11-18（Asia/Shanghai）。用户于 11 月 17 日明确否决整图网格绑定，要求每个部位具有独立拆解图。下方旧版本记录保留为历史，当前实现以本节和 docs/spine08-verification.json 为准。

| 角色 | 独立 PNG | 骨骼/控制 | 当前编辑工程 |
| --- | --- | --- | --- |
| 主角 survivor | 19 | 27 | art-source/spine08/survivor-parts.spine |
| 游荡者 wanderer | 16 | 26 | art-source/spine08/wanderer-parts.spine |
| 重型怪 brute | 18 | 27 | art-source/spine08/brute-parts.spine |

53 张实际透明 PNG 位于 art-source/spine08/parts/对应角色/。头、躯干、腰胯、衣摆、双侧上臂/前臂/手、大腿/小腿/脚分别成图，主角另有背包、腰包和刀；重型怪另有肩甲和肩关节补底。Root、Approach 和脚部 IK 目标为控制，不承载绘图。

每个部件使用自己的 Spine region attachment 和明确的对应骨骼。活跃数据已移除 Artwork 整图网格及 Corpse 整体死亡附件。待机、预备、攻击、受击、死亡十五个动作均使用独立部件；死亡由逐部位骨骼倒下与腿、手臂屈折完成，末姿势继续可单独编辑。动作节奏和倒下终姿势仍是可编辑候选，技术通过不表示自然度已最终定稿。

原 master08-thin.png 保持原字节，SHA-256 为 42c8f2393d8b08eb7f69f4900e12b9e04d9e768587b96aff3637964900243e1f。37 张部件直接提取可见原画；16 张对隐藏上臂、膝踝、背包和手部等做补绘/清理，源图、提示词保留在 art-source/spine08/reconstruction-sources/ 及 spine08-parts-prompts.json。头脸、兜帽和铁盔使用原画提取。补绘部分不宣称逐像素等同原画。

拆图边界由 tools/spine/parts-layout.cjs 明确记录。图像通过 Cocos 原生 Spine 渲染纹理导出 RGBA，检查真实 alpha 与非空彩色内容；临时图片和骨架采用唯一加载标识防止缓存串图。原始补绘图保留。每个 parts.json 记录对应骨骼、固定注册、来源和轮廓。运行合同的逐部件轮廓只服务接触与诊断，实际绘图读取独立 PNG 的打包图集。

本轮修复：手臂不再接受背包图案/权重；肩甲独立于上臂；调整髋/膝/踝坐标和游荡者大腿裁片；上臂位于披风后，刀柄位于手指后；肩部补底只填关节缺口，保持原衣摆外轮廓。每段动作从 setup pose 应用轨道，清除被中断动作留下的未打键变换；原单次命中、完成、取消、暂停及减少动态效果约定继续保留。

原三份不带 -parts 的 .spine 以及用户手调的主角文件均保持。备份为 art-source/spine08/backups/20261117-before-binding-fix/，含哈希记录。现在应编辑上表带 -parts 的新工程。Scene/Prefab 身份、原显示比例与站位保持，原 SkeletonData UUID 保留；PNG 发布使用原子替换，普通构建不运行作者工具。

手动编辑：使用 Spine 3.8.75，图片路径为 art-source/spine08/parts/对应角色/。切 Animate，选 idle 或另一动作，选择对应骨骼调整；腿优先移动 Front/RearFootTarget。开启 Auto Key 或修改后按 K 打键，播放检查后保存。GUI 导出 JSON 到 assets/resources/actors/spine08/，保留骨架名 survivor/wanderer/brute 和既有 .meta；开启 Nonessential data，关闭 Pack 与 Animation clean up。只改姿势不重打包图片。

修改攻击接触姿势、时点、动作总长或 setup 绑定时，需要同步 .contract.json 的 contactTip、motions 和绑定/轮廓。author:spine 是按脚本重建命令，会覆盖生成工程和动画；手调后使用 Spine 导出。普通 build:web 不重做动作。

作者入口：decompose.cjs、export-parts-browser.cjs、prepare-part-repairs.cjs、finish-part-repairs.cjs、audit-parts.py、author.mjs，均位于 tools/spine/。补绘准备从已保留的工作区来源重建，不依赖默认生成目录；需要 Python/Pillow/OpenCV、Cocos 预览、本地 MCP 和 Spine。运行包不依赖这些作者环境。

验证与媒体：docs/spine08-verification.json、docs/spine08-part-image-audit.json、docs/spine08-mcp-report.json，以及 output/playwright/spine08-binding-fix/。技术、具体画面观察、用户最终主观认可、微信真机/性能分别列项。旧 docs/spine08-verification.json 的可编辑/视觉验收已由用户反馈判为失败，历史技术运行结果保留。

归档：viking://~/resources/projects/the-end/designs/character-style-exploration/spine08-motion.md。


---

## 历史记录：已被当前分件版取代

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

## 2026-11-17：手动编辑与导回游戏

状态：针对当前工程核对的操作指南；本次未修改动画。使用已安装的 Spine 3.8.75，直接打开 art-source/spine08/survivor.spine、wanderer.spine 或 brute.spine。可先另存副本作为练习；骨架名保留 survivor/wanderer/brute，避免导出名称变化。若显示缺图，将树中 Images 路径设为 C:/Users/Knock/Desktop/The end/assets/resources/actors/spine08/。

切到 Animate（动画）模式，在 Animations 列表选 idle。Setup（设置）会改变绑定姿势，不用于这一轮动作微调。在底部 Dopesheet 选择已有关键帧，然后在树中选择骨骼，用旋转/移动工具调姿势。未启用 Auto Key 时，修改后按 K（Key Edited）或点属性旁的钥匙按钮记录；移动时间线前必须记录，否则未打键修改会丢失。启用 Auto Key 则修改会自动打键。按播放按钮检查循环衔接。

第一次优先调主角 idle：Breath 是局部呼吸，Cloth 是衣摆，Pack 是背包，Front/RearUpperArm、Forearm、Hand 是前/后侧手臂，Chest/Torso 是胸腔/躯干。Front/RearFootTarget 是腿部 IK 目标，调整腿部优先移动目标；普通微调不改骨骼层级、绑定、名称、原比例或贴图。头脚稳定与循环起止相接仍是本项目的待机要求。

调好后保存 .spine，再用主菜单 Export（导出，默认 Ctrl+E），选择 JSON，输出到 assets/resources/actors/spine08/，覆盖相应角色的 .json。保留 Nonessential data，关闭 Animation clean up 和 Pack；本轮只改动作，不重新打包现有 atlas 或替换纹理。保留既有 .meta。随后在项目根目录运行 npm run build:web，刷新预览；预览未启动时运行 npm run preview 并打开其输出地址。已有角色绑定不需要重复执行 connect:spine。

手调后不要运行 npm run author:spine：它会从 rig-authoring.cjs 的预设重建 .authoring.json、.spine 和运行 JSON，覆盖手工动画。手调 .spine 是新的编辑源，旧 .authoring.json 不会自动跟随；需要再次脚本制作时，应先合并手工修改。普通 build:web 不执行该作者命令。

攻击和大幅骨架调整多一个接入步骤：保留 idle/prepare/attack/hurt/death 名称与单次 impact 事件。当前主角/游荡者/重型攻击接触为 0.40/0.45/0.54 秒。修改攻击接触姿势后，需重新采样 AttackTip 并同步对应 .contract.json 的 contactTip；修改时长或接触时间还需同步 motions.*.duration、motions.attack.contact。修改绑定、权重或几何则需同步合同中的骨骼/蒙皮轮廓。仅导出 JSON 不会自动更新这些项目接触数据，因此新手第一轮从不涉及接触合同的 idle 开始。

已核对当前 .authoring.json 的绝对贴图路径、作者工具覆盖行为和运行代码读取合同的方式。Spine 界面操作参考原厂 [Keys](https://esotericsoftware.com/spine-keys) 与 [Export](https://esotericsoftware.com/spine-export)；页面包含新版本功能，本指南仅采用本项目需要的基础动画、打键和 JSON 导出操作。

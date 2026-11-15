# 08 细描边角色动作评审

- 项目：The end，`C:\Users\Knock\Desktop\The end`。
- 日期：2026-11-14，Asia/Shanghai。
- 状态：设计依据已确认；生成资源与动作效果仍为评审稿。
- 设计依据：用户明确指定 08 的造型、配色、阴影、纹理和装备，唯一美术修改为减细人物描边。10-08-thin-outline.png 为此次对应稿。
- 当前优先级：修正用户指出的待机诡异，增加实际绘制帧，随后继续评审其他动作。

## 当前资源与节奏

本节原先的“24 张待机换图”方案已停用。当前待机使用 `master08-thin.png`，它与 10-08-thin-outline.png 的字节一致；三份 rig JSON 只定义纹理几何与局部呼吸权重。原生 AnimationClip 以 24 个浮点关键帧驱动 3 秒循环，头部与脚底权重为零，避免变脸、线条换形和脚底滑动。`StableActorSprite` 是隔离的 Pink COCOS 4.0.0-beta.1 网格适配，当前验证平台为 Web 桌面；引擎升级或其他平台需复验。

主游戏的 PlayerActor、WandererActor、BruteActor 已原位更新，保留原 UUID 与节点/组件 fileId。主游戏使用攻击、受击、准备、倒下和待机片段；倒下结束后再进入奖励或失败页。评审场景仍提供三角色四种动作对照，并恢复最初的 430 / 465 / 500 显示高度。其他动作当前仍使用上一轮各 8 帧序列，后续按组件计划继续评审，不宣称所有角色动作已达到最终生产质量。

以下 144 张帧图是保留的生成资源清单，不等于当前待机运行方案。

幸存者、游荡感染者、重型感染者各有四段动作。待机每人 24 张不同绘制帧，6 列 × 4 行，3 秒循环。攻击、受击、倒下每人各 8 帧，2 列 × 4 行，时长分别为 0.56、0.31、0.91 秒，总计 144 张帧图、12 段原生动画、3 个原生预制体。

待机保持站姿，以轻微胸口和衣物变化表达呼吸。修订时将原先不足一秒的循环放慢，并移除按每帧身高计算的不同缩放，避免把绘制误差放大为身体伸缩。切片通过脚底位置注册，所有动作整段使用固定比例。攻击第 0.28 秒发出一次命中事件；受击和攻击结束返回待机；倒下停在末帧。

待机帧数增加不能自动证明自然流畅。还需在正常速度下评审脸部、手脚、装备的逐帧一致性、循环首尾衔接、动作力度和缩小后的清晰度。技术检查只能确认实际换帧、引用、事件与暂停等行为，不能代替美术体验判断。

## 引擎资源与查看

- `assets/resources/actors/sketch08/`：12 张透明 PNG、12 份原生图集和 motion-manifest.json。当前待机来源见 11-idle-24.sources.json，首轮其他动作来源见 sequence-sources.json。
- `assets/animations/sketch08/`：12 个可在 Pink 编辑器查看的 `.anim`，包含真实 SpriteFrame 关键帧。
- `assets/prefabs/actors/sketch08/`：3 个角色预制体，已挂 cc.Animation、SpriteActorMotion，并引用上述片段。
- `assets/game/presentation/actors/SpriteActorMotion.ts`：动画切换、命中回调、播放速度和暂停，只负责表现。
- `assets/ActorMotionReview.scene`、`assets/game/presentation/actors/ActorMotionReview.ts`：独立动作评审场景，七个原生按钮的 Inspector Click Events 直接绑定该组件的公开方法。
- `tools/inspect-actor-sheets.py`：只读取 PNG 像素分析透明度、边界、脚底、帧内容散列并写入图集元数据，不修改图像像素。
- `tools/build-actor-review-assets.cjs`：将已导入 SpriteFrame 的 UUID 写入原生 clip/prefab/scene。

启动本地预览执行 `npm run actors`，浏览器打开 http://127.0.0.1:7461/。需要重新构建时执行 `npm run build:actors`。场景支持单动作、连续播放、半速和暂停。

重新生成图集的顺序为：运行 Python 分析脚本；通过 Pink 导入更新后的图集；运行原生资源生成脚本；执行 `npm run build:actors`。原生资源生成脚本必须在图集导入之后运行，因为新帧需要真实引擎分配的 UUID。Python 脚本重新生成 manifest 后，还需运行原生资源生成脚本补回 UUID。

当前新角色同时用于独立评审与主游戏。主角按 08 造型始终持刀，游戏武器槽由规则与界面独立表达；不再通过更换人物造型表示装备状态。

## 验证与资料同步

验证命令为 `npm test`、SDK TypeScript `tsc --noEmit -p tsconfig.json`、原生构建以及 `node tools/run-actor-review-test.cjs`。浏览器脚本检查真实 Canvas 按钮、每轮实际帧名、命中次数、倒下停帧、慢放、暂停和连续播放；结果记录见 motion-verification.json，以最后执行结果为准。

2026-11-15 本地服务与 MCP 工具恢复。作者说明、README 和验证记录的逐项保存与回读状态见 docs/openviking-sync-status.json，保留先前离线制作的来源记录。

归档目录为 `viking://~/resources/projects/the-end/designs/character-style-exploration/`。作者说明使用 write/edit 保存；原有图片和来源文件在实际登记的导入清单内使用 add_resource，并分别核实异步状态。未登记或未处理的历史图片不因此视为已经导入。

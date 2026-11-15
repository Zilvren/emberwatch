# Claude Code Game Studios 技能适用性评估

- 项目：The end，Pink/Cocos 4.0.0-beta.1。
- 日期：2026-11-15，Asia/Shanghai。
- 状态：只读评估与迁移建议，未安装、执行该仓库技能，未改变游戏或工作流配置。
- 来源：https://github.com/Donchitos/Claude-Code-Game-Studios/ 。
- 固定快照：abc0de79d6ceb0b5d7aa693945849b3937afbe6a（main，Release 1.3.0）。
- 检查范围：技能目录、23 个相关 SKILL.md 的定义与关键流程、UX/HUD 章节指南、自动化/配置解析说明、引擎表。目录有 78 项；README 区分 75 个技能与 3 个旧名称，不把所有目录当作独立能力。
- 归档：viking://~/resources/projects/the-end/docs/game-studios-skills-assessment.md。

## 判断

最适合当前项目的是美术方向、素材规格、整屏 UX 与可玩片段评审方法。仓库更多提供设计/生产/评审的操作规范，不提供 Pink 编辑器控制、可直接使用的 Cocos 角色动作或自动统一画风的资源生成器。

本项目最新问题是整屏游戏感以及人物、背景与材质协调；只增加文档数量、组件矩阵或代理数量不能解决它。第一批建议迁移 art-bible、asset-spec、ux-design、ux-review、vertical-slice、test-evidence-review 的精简项目版，而非直接套整个工作室。

## 当前优先使用的方法

| 技能 | 原版实际职责 | 对 The end 的用途 | 适配要点 |
| --- | --- | --- | --- |
| art-bible | 视觉身份、情绪、形状、配色、人物、环境、HUD、资产标准与参考方向 | 以 08 为锚，把轮廓、线宽、建筑尺度、地面基线、光照与纸布锈铁材质写成统一判据 | 关联实际战斗参考与反例；原版部分阶段强制委派，项目版不自动启用代理 |
| asset-spec | 按资产定义视觉规格、尺寸/格式/导出约束及图像生成提示词 | 人物动作、背景、牌面、图标分别有生产规格，减少贴纸感、比例漂移与画风混用 | 加入锚点/脚底、原造型不变、序列一致性；接入现有 image_gen 与原生导入流程；它本身不是图片生成工具 |
| ux-design | 按 screen / flow / HUD 编写玩家目标、信息、布局、状态与交互规范 | 从完整战斗的注意力与场景占比开始，明确常驻、上下文和隐藏信息 | 先整屏，后组件；不把原版逐节问答照搬为每个细节确认 |
| ux-review | 验证 UX/HUD 文档的状态、输入、可读性、需求覆盖等 | 检查意图、手牌、资源是否互相遮挡，禁用与确认是否可理解 | 这是规范评审，仍需真实画面与操作验收；不能把文档通过当美术认可 |
| vertical-slice | 构建完整循环的可玩片段并作继续/转向/停止/未评估判断 | 用现有首战到奖励/返回检验场景、动作、反馈与操作是否成为完整体验 | 复用实际 Pink 游戏，不扩新流程；未实际玩过、关键体验不成立都不记为通过 |
| test-evidence-review | 检查测试断言和手工证据是否足够 | 将规则、UI 功能、画风/手感的证据分开，防止用测试数替代体验判断 | 当前改版要归入 Visual/Feel；原版普通 UI 可凭保留截图收尾，不能套到用户要求的沉浸感评审 |
| playtest-report | 把实际游玩意见整理成结构化问题 | 将“像 PPT”“材质不协调”落实到具体画面、行为和复验场景 | 保留用户原判断，不改写成助手自评通过 |
| asset-audit | 命名、文件预算、格式、孤立/缺失引用检查 | 查运行引用是否仍指向旧资源、图集/纹理设置、资源遗漏与引用风险 | 增加 Cocos UUID、.meta、Scene/Prefab/Animation、resources.load 追踪；无代码路径引用不等于可删除；尺寸/是否二次幂按实际平台与用途判断，不照搬原版规则 |

## 后续值得使用

| 技能 | 对应工作 |
| --- | --- |
| balance-check | 正式体力与入场档位、免费档收益、物资兑换、失败成本和可压倒其他选择的卡牌策略；分别评估现有规则与设计提案 |
| consistency-check | 对照原表、设计稿、内容 JSON 和兼容运行库，避免把物资点、体力和物资卡混成同一资源 |
| design-review | 单个玩法系统的明确规则、公式、边界、依赖与可实现性 |
| content-audit | 区分设计中的 25 张定义与真正实现/制作/测试的内容，不用目标数量充当完成数量 |
| architecture-review | 正式仓库、跨局成长和存档演进时检查需求到技术决策的缺口 |
| propagate-design-change | 规则改变后找到受影响的设计、UI、配置、存档与测试，避免只改一处 |
| quick-design | 小范围调优和修订采用轻量设计差异，避免每次改按钮都扩成长篇 GDD |

team-ui 和 team-polish 的阶段清单有价值：UX → 视觉 → 实现 → 评审 → 打磨，以及性能/技术美术/声音/QA 联合检查。但原版属于代理编排，不是一个现成 UI 皮肤或自动动画工具。建议先迁为单会话检查表；需要团队协作时再按明确授权接入。

## 不应直接套用的部分

1. 引擎表只有 Web、Godot、Unity、Unreal，没有 Pink/Cocos 的专用构建/资源适配。Cocos 的 Web 导出目标不等于这个仓库的通用 Web 引擎项目。
2. prototype 在未配置引擎或 engine.name=Web 时走 HTML 浏览器游戏；若误判会偏离当前项目。已具名引擎有 engine 路径，但仍需补 Pink 的命令和资产检查。
3. setup-engine 的现成分支不能直接解决 Pink；team-*、完整 Studio、冲刺/发布/在线运营流程也不是当前美术问题的首要解法。
4. SKILL.md 依赖 project.yaml、CLAUDE.md、.claude/docs/、references/、模板、Bash YAML helper 与部分 Agent/Task/AskUserQuestion 工具。只复制一个文件不会保留其完整运行能力。
5. model、allowed-tools、命令内联展开和 Claude hooks 需要改写为当前工具与权限机制；评估这些文件不等于执行其中的委派、提交或发布指令。
6. 目录与资料映射应遵循已有 assets/game/、tests/、docs/ 和 OpenViking 项目 URI，不覆盖 AGENTS.md 或重建一套相互竞争的规则。

## 名称陷阱

- design-system 是“设计一个玩法/技术系统的 GDD”，不是 UI design system 组件库生成。
- create-control-manifest 是从已接受 ADR 提炼程序员必须/禁止的规则，不是按钮绑定与回调函数清单。
- asset-audit 不是视觉审美检查；asset-spec 主要产出规格和提示词；team-polish 主要编排过程。它们都不保证产出自动具备游戏感。

## 建议在本项目采用的顺序

锁定 08 的美术判据和整屏参考 → 定义人物/环境/材质的同一生产规格 → 设计完整战斗的注意力与信息区 → 在 Pink 中制作可玩片段 → 用实际操作、录屏与用户判断评审 → 再补资源、证据和数值审计。

只将其中适合当前工具、引擎与授权的部分迁移成项目技能。原版的逐节审批、多代理和自动提交不是本次用户已请求的操作。

## 已检查的技能与参考

23 个技能：art-bible、asset-spec、asset-audit、ux-design、ux-review、team-ui、team-polish、create-control-manifest、design-system、design-review、balance-check、consistency-check、propagate-design-change、map-systems、vertical-slice、prototype、architecture-review、qa-plan、playtest-report、test-evidence-review、content-audit、quick-design、cut。

关键原文位于固定快照下的 .claude/skills/<name>/SKILL.md；另核对 ux-design/references/sections-hud.md、sections-ux-spec.md、.claude/docs/automation-modes.md、config-resolution.md 和 .claude/engines/engines.tsv。上述外部内容仅作为评估资料读取。

## 后续执行状态：2026-11-15

用户随后明确要求安装六个优先技能、适配 Pink/Cocos 并应用到项目。安装与首次应用已按该授权执行：维护源为 `tools/game-studios/skills/`，Codex 安装目录为 `C:/Users/Knock/.codex/skills/`。详细结果见 `docs/game-studios-skills.md` 与 `docs/game-studios-evidence.json`。本文上方“只读评估、尚未安装”描述评估时点，保留为来源和决策记录，不代表后续执行仍未完成。

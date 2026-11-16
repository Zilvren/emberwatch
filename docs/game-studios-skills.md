# The end 六个游戏开发技能安装与首次应用

- 项目：The end，Pink/Cocos 4.0.0-beta.1，Windows。
- 日期：2026-11-15，Asia/Shanghai。
- 状态：适配版已安装，首次应用和验证见 `docs/game-studios-evidence.json`；视觉定稿不是本次安装的完成条件。
- 来源：Donchitos/Claude-Code-Game-Studios，固定提交 `abc0de79d6ceb0b5d7aa693945849b3937afbe6a`，MIT。
- 归档：viking://~/resources/projects/the-end/docs/game-studios-skills.md。

## 安装内容

`art-bible`、`asset-spec`、`ux-design`、`ux-review`、`vertical-slice`、`test-evidence-review` 已通过官方 skill-installer 下载固定版本，再按 skill-creator 的格式要求编写为独立的 Codex/Pink 适配包。原版下载留在临时目录；没有安装原版的全套 studio、agents、hooks、CLAUDE.md 或 project.yaml。

项目维护源为 `tools/game-studios/skills/<name>/`。每个包包含 SKILL.md、agents/openai.yaml、SOURCE.md 和 MIT LICENSE；SOURCE.md 保留原文件路径、提交与适配范围。安装位置默认是 `$CODEX_HOME/skills/<name>`，此机器实际为 `C:/Users/Knock/.codex/skills/<name>`。

安装后下一条消息起可由 Codex 重新发现并自动选择，也可以显式输入 `$art-bible` 等名称。本轮已直接读取适配包并用于本项目，无需等下一轮才能应用。项目 AGENTS.md 同时指向维护源，避免依赖某台电脑的全局安装副本。

## 适配内容

| 原有假设 | 本项目适配 |
| --- | --- |
| Claude Agent/Task/AskUserQuestion、模型与团队编排 | 使用当前 Codex 会话可用工具；不要求另开代理团队或逐节确认 |
| Bash 配置注入、CLAUDE_SKILL_DIR、project.yaml | 自包含指引与 `tools/game-studios/pink-cocos.project.json`，通过 Node 读取当前项目事实 |
| Godot/Unity/Unreal/普通 Web 项目 | `.pink/settings.json` 选择实际 SDK，原生 Scene/Prefab/Animation/.meta，沿用当前构建命令 |
| 通用素材路径和产出目录 | `assets/game` 分层、`assets/resources`、原生资源、现有 docs 路径及 OpenViking URI |
| 文档写完或截图存在即结束 | 实机输入、原生构建、状态断言、视觉观察和用户认可分别记录 |
| 新建一个 HTML 原型 | 在现有 Cocos 可玩片段上工作；浏览器仅承载引擎导出与 QA |

08 人物造型/比例、每日消耗最后执行、修复风险仍可确认等事实放在项目适配配置与相关设计中，不强加给其他 Pink 游戏。

## 首次应用产出

| 技能 | 已落到项目的用途 |
| --- | --- |
| art-bible | `docs/designs/art-bible.md`：统一人物、背景、材质、轮廓、光照、物品和 HUD 的制作依据 |
| asset-spec | `docs/designs/production-asset-spec.md`：真实素材尺寸、序列帧注册、原生导入顺序、当前与待制作资源边界 |
| ux-design | 更新既有 `docs/designs/ui/wasteland-page-redesign.md`：八个页面的信息层级与交互验收，不另立相反布局 |
| ux-review | `docs/designs/ui/ux-review.md`：本轮完整流程与实际截图检查、待项和复测边界 |
| vertical-slice | `docs/vertical-slice.md`：当前可玩循环、品质门槛和不能越过的正式版/视觉验收边界 |
| test-evidence-review | `docs/game-studios-evidence.json`：技能安装、技术检查、真实操作、资源保护、视觉认可的逐项证据 |

## 可复用命令

```powershell
npm run skills:check
npm run skills:inspect -- --out temp/game-studios-inspection.json
npm test
npm run typecheck
npm run build:web
npm run preview
npm run skills:playtest
```

`skills:check` 对比全部安装文件与项目源，包含 UI 元数据、来源和许可证。`skills:inspect` 只读盘点与哈希；报告仅允许输出到 temp 或 output/playwright。`typecheck` 使用已安装 Pink SDK 的 TypeScript，不要求另装不同版本的编译器。

`skills:playtest` 复用现有 9 组原生 Canvas 场景，用独立 QA 会话和新的证据目录。预览服务需已启动；若已有服务，先确认它确实提供当前 build/web-desktop，避免关闭用户服务。CLI 优先使用 PLAYWRIGHT_CLI，再寻找本地/现有 npm 缓存中的 @playwright/cli；缺少时明确报错，不在验证时偷偷安装依赖。浏览器测试含专用 QA 存档，不碰用户浏览器资料。

在受限 Windows 沙箱中，Pink 构建可能需要写 SDK 的 AppData 缓存，Chromium 也可能无法启动。本轮均通过工具的单次提升权限运行已授权命令，没有删除锁、改 ACL 或关闭用户进程。记录最终运行结果，不把首次环境失败写成产品通过。

重新安装命令为 `npm run skills:install`。安装器先检查所有目标：相同内容重复执行为无操作；已有不同技能会报错，必须先检查差异再更新，不自动覆盖。换电脑时从项目维护源安装并验证即可。

## 交付边界

技能负责生产与验收方法，安装不会自动重画素材或让人物动作变流畅。本次已实际用于规格整理和原生流程检查，画面像素与运行规则保持。后续改进依据这些规范逐项实施，最终视觉认可继续明确保留。

2026-11-15 后续实作：已用六技能完成 v2 背景、原生接触阴影和材质统一，当前验证见 docs/coherence-verification.json。`skills:playtest` 新增材质接入场景，现有 9 组流程加 1 组材质检查；支持 PLAYWRIGHT_SESSION 与 PLAYWRIGHT_EVIDENCE_DIR，后者限定在 output/playwright 下，以保留不同工作的证据。上文 9 组与运行资源不变描述安装阶段的历史首次应用。

最新实作包括整卡网格、奖励比较确认、营地编组、滚动地图、体力，以及手牌/结算和五项质量修复。测试器现在包含 14 类场景，PLAYWRIGHT_TASKS 可选择受影响项；旧流程明确选择 tutorial-v1，stamina-system、hand-shelter、quality-fixes 使用新开局规则。体力阶段 104 项测试见 docs/stamina-verification.json，手牌阶段 107 项见 docs/hand-shelter-verification.json；当前 113 项、14 类原生检查及正常/半速动作复核见 docs/quality-fixes-verification.json。不将历史安装阶段“资源哈希不变”的描述延伸到后续实现。

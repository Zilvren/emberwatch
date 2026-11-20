# The end：迁移 Godot 的成本与微信首发评估

- 项目：The end，C:/Users/Knock/Desktop/The end。
- 日期：2026-11-17，Asia/Shanghai。
- 状态：评估草案；用户要求评估，未授权开始引擎迁移或更改当前选型。
- 用户已确认的平台优先级：微信入口优先，其次浏览器，最后桌面。
- 产品形态假设：用户使用“微信小程序”一词，并询问它与微信小游戏的区别。根据现有卡牌战斗、动画与持续状态，本文建议按微信小游戏评估；具体账号/发布类型仍待最终确定。
- 当前引擎：Pink/Cocos 4.0.0-beta.1，现有构建目标 web-desktop。
- 证据范围：当前源代码、原生资源、工具、配置、本轮自动检查和官方/社区维护者文档。没有启动 Godot 迁移样片，没有做微信开发者工具或微信真机测试。
- 工作区基线：main，HEAD 307308bf8f50d490a663b5291e658300ed795ddf；盘点时已有 66 个 Git 变更条目，无未合并索引条目。合并后的未提交实现也在评估范围，不能只按 HEAD 统计。
- OpenViking：viking://~/resources/projects/the-end/designs/godot-migration-assessment.md。

## 结论

工程上可以迁移，当前规模属于中等到偏高工作量。规则边界已经分离，能按现有行为移植；主要成本来自表现层重建、脚本语言转换和微信运行环境验证。动画工具变方便是收益之一，迁移不会自动完成分层补画或动作设计。

以微信小游戏首发为目标，当前更建议先保留 Cocos，验证微信构建、真机交互和存档，再决定是否迁移。Godot 有可用的社区微信导出候选，不能简单判断为“不能上微信”；同时也不能把浏览器导出成功当成微信发布成功。若长期更重视 Godot 的编辑工作流，可先做 2–4 人日的微信平台验证，过关后再批准全量移植。

当前 Godot/微信平台运行结论为 NOT ASSESSED，本文完成的是成本与风险评估，不是平台适配交付。

## 当前工程盘点

统计来自 assets/game 下 TypeScript 和 assets 下原生资源；源文件行数包含空行。资源统计含历史候选与组件评审场景，不表示所有资源都要迁移，也不表示这些节点同时运行。

| 项目 | 当前数量 | 对迁移的意义 |
| --- | --- | --- |
| 核心规则 | 18 个文件，2,111 行 | 不依赖 cc；保留规则设计，按所选 Godot 语言移植 |
| 应用命令与存储接口 | 2 个文件，145 行 | 不依赖 cc，命令入口与持久化端口可沿用结构 |
| 存储适配 | 1 个文件，123 行 | JSON 格式、校验、主备份保护需要逐项复现 |
| 表现层 | 63 个文件，6,250 行 | 其中 47 个文件直接导入 cc，重做量最大 |
| 游戏运行代码合计 | 84 个文件，8,629 行 | 37 个文件不直接导入 cc，不代表它们全都没有平台依赖 |
| 原生资源 | 6 个 Scene、37 个 Prefab、56 个 AnimationClip | Cocos 序列化、UUID 和组件脚本不能原样成为 Godot 场景 |
| 主游戏界面 | 8 个屏幕视图、6 类弹窗绑定 | 需重建布局、主题、状态显示与触摸输入；day2 为遗留资源键，不是当前固定第 2 天终点 |
| 当前角色动作 | 3 个演员、15 个 native08 片段 | 迁移先覆盖正在使用的动作，旧评审/被否决候选另存 |
| 运行内容 | cards.json 8 张卡定义、journals.json 3 篇日志；另有教学/正式情景配置 | 保留当前 ID、版本和语义，不把设计草案中的未实现内容加入移植范围 |
| PNG 源资源 | resources 下 33 张，合计 55.32 MiB | 含历史图；需要按当前用途选择打包，不等于发布包或首次下载体积 |
| 明确的当前原画与背景 | master08-thin.png 加三张 v2 背景合计 7,841,168 字节 | 可复用图像，导入设置、过滤、图集、锚点与比例另验 |
| 项目字体文件 | 未发现 ttf/otf/woff | 微信 Godot 候选路线需验证中文字体，并准备实际字体资源 |
| 自动检查 | 21 个测试文件，本轮执行 142 个测试 | 规则与数据断言可作行为对照；Node 测试不能直接运行 GDScript |

不按源代码行数计算“可直接复用百分比”。规则可以保留设计与断言，但脚本仍需翻译；图片可保留字节，但布局、绑定、动画与平台行为仍要验证。

## 各层迁移方式

| 模块 | 建议处理 | 工作量/风险 |
| --- | --- | --- |
| 已确认角色、背景和 UI 图像 | 复用源图，建立 Godot 导入与切片，按真实显示大小检查 | 较低；最终清晰度与轮廓需实机确认 |
| 卡牌、日志与情景定义 | 保留 JSON/稳定 ID/版本，重建读取校验；TS 情景表需转换 | 较低到中等 |
| core + GameSession | 采用类型化 GDScript 手工移植，保留命令/只读查询/状态分层 | 中等；重点验证随机、费用、失败和日期 |
| 卡牌编辑器 | 现有 Node 工具与 JSON 可继续用；改预览启动与构建接线 | 较低到中等，不必把内容编辑器整体重写为 Godot 插件 |
| 屏幕、弹窗、HUD、卡面 | Godot 原生场景与 Control 组件重建，共享主题和通用控件 | 高；布局、遮挡、输入锁、长按、滚动、焦点逐项迁移 |
| 手牌拖动与出牌 | 重建触摸坐标、拖动层级、命中区域、取消、忙碌与重复输入保护 | 高；当前已有触摸事件基础，但不等于手机验收完成 |
| 角色和特效 | 复用原画与动作合同，重做骨架/权重与时间轴，替换 SDK 私有网格桥接 | 中到高；动作自然度仍依赖分层源稿与动画设计 |
| 存档 | 保留 schema-v2 的字段语义与主备份策略，建立新平台存储适配；旧档导入单独验证 | 中等，不能仅凭 JSON 格式认定兼容 |
| 音频、视口与动态偏好 | 将浏览器 AudioContext/DOM/matchMedia 等分支改成目标平台适配 | 中等；Cocos 微信发布也要检查这些位置 |
| 自动测试与发布工具 | 原 TS 作为对照实现，新增 Godot headless 行为测试与微信真机验证流程 | 中到高，原 Prefab/UUID 测试不能原样沿用 |

关键代码依据：assets/game/application/GameSession.ts、application/RunPersistence.ts、core/state/GameState.ts、core/Random.ts、infrastructure/SaveRepository.ts、presentation/GameDirector.ts、presentation/cards/CardInteraction.ts、presentation/actors/StableActorSprite.ts、NativeActorSkin.ts、presentation/platform/WebViewport.ts、presentation/audio/GameAudio.ts。

## 微信优先带来的额外约束

### 发布链

Cocos 官方文档提供微信小游戏构建入口，输出 game.json 与 project.config.json；本机固定 SDK 也实际包含 packages/platforms/wechat。但本项目目前只有桌面 Web 构建配置，本轮没有证明 Pink 这一固定 beta SDK 能在微信真机交付。

Godot 官方支持平台列表包含 Web 与桌面/移动端，没有提供与 Cocos 相同的官方微信发布路径。当前可评估的社区候选包括：

- AnranS/godot_for_minigame：README 声明支持微信等宿主，提供匹配 Godot 4.6.1、4.6.3、4.7.2 的模板，要求编辑器与模板精确匹配。当前 v0.3.1；这是维护者支持声明，尚未在本项目验证。
- godothub/godot-minigame：提供 Godot 4.4+ 的编辑器插件与 Release 模板匹配。需要具体选定版本、模板、导出设置并实际复现。

其中 AnranS 候选 README 明示：小游戏运行引擎为单线程，不支持 C#、GDExtension 等；需要打包中日韩字体；微信/抖音目前按 1×逻辑像素渲染；自定义游戏资源分包暂不支持。这些是该候选的现状，不能泛化成所有 Godot 微信路线都具有同样限制。对于已有 55.32 MiB 历史 PNG 的仓库，资源选择和分包能力尤其需要提前验证。

### 语言选择

Godot 官方支持 GDScript、C#、C++，TypeScript 不是内置脚本语言。当前官方文档仍注明 Godot 4 C# 项目不能导出 Web。综合微信优先和浏览器第二的目标，迁移方案优先采用类型化 GDScript；不建议为保留 TS 又叠加未经本项目验证的语言绑定与微信模板。

### 手机交互与显示

当前主游戏为 1440×900 设计坐标，既有较小桌面检查点为 1024×768。CardInteraction 已有 TOUCH_START/MOVE/END/CANCEL 与长按细节入口，可作为交互合同；手机卡面可读性、触摸范围、屏幕比例、安全区、后台恢复尚需单独验收。保持现有设计意图，横竖屏方案在手机样片后确定。

### 存档与确定性

SaveRepository 当前使用 the-end.run.v1 存储键、v2 envelope、schema-v2 状态、卡库哈希和主备份校验。校验基于 JavaScript JSON.stringify 与 32 位乘法；Random 为 xorshift32，包含无符号移位和截断。移植时要重现抽牌/随机序列及数值边界，不能直接换用 Godot 默认 RNG。

旧浏览器存储、微信本地存储和桌面文件不共享。跨平台进度连续需要显式导入/同步方案；当前评估不默认增加账号与云存档。若保留旧档导入，应先在原语义下验证旧 envelope，再转换为目标格式，并保留原文件；仅复制 JSON 字段不足以保证哈希、版本和抽牌行为相同。

### 音频与资源

当前 GameAudio 实时合成 Web Audio 振荡器音效，assets 中没有独立音频文件。发布微信时应使用平台可用的音频入口并实测，可将相同提示音预制为短音频；不能让受保护分支静默跳过声音就算功能通过。

应按实际场景引用建立发布清单，保留历史原图但不把所有候选都放入首包。55.32 MiB 是 PNG 源文件合计，既不是最终纹理内存，也不是首包大小；所有大小和内存预算须以选定模板及真机导出结果为准。

## 工作量区间

以下是静态评估的工程量级，按一名熟悉现有代码及两种引擎的开发者计算有效人日，不是交付承诺。范围为复现当前玩法和已确认画面、完成微信手机适配；不含新增玩法、整套角色重新绘制、平台账号/审核等待、广告支付登录云存档等新增系统。第三方引擎底层问题可能使工作量超出区间。

| Godot 迁移阶段 | 估计人日 | 主要产物 |
| --- | --- | --- |
| 微信导出与真机验证样片 | 2–4 | 确定模板、中文、触摸、音频、存储及重复构建流程 |
| 规则、命令、内容与行为对照 | 3–5 | GDScript 规则与固定种子/命令结果一致 |
| 主界面、卡牌、背包、地图与弹窗 | 6–10 | 重建原生场景、主题、输入和显示状态 |
| 当前角色动作与特效 | 3–6 | 三角色现有动作合同与单次接触事件，不等于新增全套行走 |
| 存档/平台适配、集成回归与发布整理 | 4–7 | 恢复、主备份、后台、真机回归和构建记录 |

分项为 18–32 人日，预留常规整合余量后按约 20–35 人日规划；若开发者边学 Godot 边迁移，应再留学习余量。平台样片通过后再修正区间。

沿用 Cocos 完成当前游戏的微信适配，可先按约 5–10 人日估算，重点为微信构建配置、手机排版与交互、声音、存档、资源打包和真机回归；这一分支也尚未经过微信样片校准。两条路线均不包含把当前有限内容扩为完整正式游戏的成本。

## 建议的最小验证片段

建议先用同一段真实游戏流程验证发布风险：从合法新局进入首场战斗，拖动一张攻击牌，角色接触时只结算一次；领取奖励并进入保存点，关闭后重新打开，检查牌堆、费用、日期和关键日志。通过正常命令与真实输入到达各阶段，不直接修改状态。

如要试 Godot，可先限制到主角与一个敌人，并保留这一完整输入—规则—表现—保存链；这只是迁移验证范围，不减少最终需要复现的玩法。

通过条件：

1. 微信开发者工具及至少 Android、iOS 各一台真实手机可重复启动；中文、图片和触摸坐标正确。
2. 正常拖牌、取消、长按读牌、重复点击与一次命中事件符合当前规则。
3. 切后台/恢复及关闭重开不会重复扣费、重复领牌或丢失已保存日志；损坏存档不覆盖有效备份。
4. 记录冷启动、包体、内存和战斗中的帧时间；验收预算在样片前按目标设备确定，不用“无报错”替代性能。
5. 连续重新导出可复现，不依赖每次手改生成目录或更改第三方引擎内部文件。
6. 同一套规则也能构建浏览器试玩；平台接口通过适配层接入，规则不依赖微信 API。
7. 角色正常/半速动作回放分别检查轮廓、脚底、接触、回位；视觉接受与技术成功分开记录。

若在这一步遇到模板版本、音频、存储或包体的底层问题，应先估算该问题的修复与维护成本，再决定是否投入其余表现层重建。

## 本轮验证与证据边界

| 声明 | 本轮证据 | 结论 |
| --- | --- | --- |
| 当前规则/应用与 cc 分离 | 源文件导入盘点、CodeGraph、架构检查 84 文件/148 条运行依赖，无失败 | SUPPORTED，限所检查边界 |
| 当前自动回归基线可用 | npm test：142 通过、0 失败，退出 0 | SUPPORTED，不代表 Godot 已通过 |
| 当前类型合同 | npm run typecheck：退出 0 | SUPPORTED |
| 当前依赖方向与环 | npm run check:architecture：退出 0，无失败 | SUPPORTED |
| Godot 微信模板可用于本项目 | 仅维护者文档，未导出、未运行 | NOT ASSESSED |
| 现有 Pink SDK 微信真机可交付 | SDK 平台目录与官方发布文档，未构建微信包 | NOT ASSESSED |
| 手机 UI、动作观感与性能 | 没有本轮手机/微信录像或测量 | NEEDS EVIDENCE |
| 迁移后旧档兼容 | 已读当前状态/哈希/随机实现，未制作导入器 | NEEDS EVIDENCE |

历史 native08、core-loop、merge-resolution 等验证记录只用于理解当前实现；本次没有把它们当成微信或 Godot 交付证据。命令通过、资源数量与官方功能都不能替代平台样片。

## 参考来源（2026-11-17 检索）

- [Godot 官方平台与语言 FAQ](https://docs.godotengine.org/en/stable/about/faq.html)
- [Godot 官方 Web 导出限制](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
- [Godot 官方 2D 骨骼教程](https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html)
- [Cocos 4.0 官方微信小游戏发布](https://docs.cocos.com/creator/4.0/manual/zh/editor/publish/publish-wechatgame.html)
- [Godot Mini Game 社区导出器及限制](https://github.com/AnranS/godot_for_minigame)
- [godothub 社区微信导出插件](https://github.com/godothub/godot-minigame)
- [旧 Godot 4.3 微信转换项目的停维声明](https://github.com/yuchenyang1994/godot-love-wechat)

项目依据：AGENTS.md、docs/architecture.md（含 2026-11-17 合并补充）、docs/designs/key-node-journal-system.md、docs/designs/production-asset-spec.md、docs/designs/character-style-exploration/cocos-native08-motion.md、tools/game-studios/pink-cocos.project.json，以及正文列出的当前代码。

# Spine MCP 连接与兼容性验证

- 项目：The end；日期：2026-11-17，Asia/Shanghai。
- 状态：本地 TypeScript MCP 的实际读写、导入与导出已通过；用户已选定并用于三个角色、十五个动作的制作。游戏原生接入及本轮技术回归完成，最终主观视觉认可另列。
- 用户目标：采用本地 MCP，重做主角与两个怪物的骨骼动画，使用美术相关技能审查并整体测试。
- 本地源：C:/Users/Knock/Desktop/spine-MCP；包 spine-mcp 0.1.0；Spine C:/Users/Knock/Desktop/Spine3.8.75/Spine.com。
- 归档：viking://~/resources/projects/the-end/docs/spine-mcp-verification.md。

## 实际验证

通过 MCP SDK 的 stdio 客户端完成 initialize、tools/list、tools/call，没有把直接调用内部函数冒充 MCP 调用。

1. 在项目 temp 下复制本地服务，使用锁文件安装；build、typecheck、五项 smoke 检查退出 0，注册 16 个工具。
2. spine_analyze_json 读取官方示例；spine_control_bones 给 head 与 hip 各写 3 个关键帧。
3. 自动对照原文件哈希、骨架/插槽/皮肤及已有动画：原源文件和既有内容保持。
4. spine_info 实际读取新增动画后的 JSON：64 根骨骼、52 插槽、12 个动画，包含 mcp_probe。
5. spine_import_json 生成新 .spine 文件，38,972 字节；spine_export 重新输出 3.8.75 JSON，保留新旧动画。两项 CLI 退出均为 0。
6. 用户选定后，在其原始 MCP 目录安装锁定依赖并构建成功；没有修改该 MCP 源码或 Codex 全局配置。

可回读证据：temp/spine-mcp-evaluation-20261117/probe-output/probe-report.json。测试工程为同目录 mcp-bone-test.spine，导出位于 exported/。测试使用官方示例，不是当前游戏的新人物动画。

## 边界和修正

本地 MCP 通过 CLI 与 JSON 工作，不直接操作编辑器画布，也不负责自动画出被遮挡部件、自动绑网格权重或评判动作质量。作者工具生成骨架/网格基础数据，MCP 写入动作关键帧并执行 .spine 导入/导出。

首次 CLI 调用在受限环境中无法写 C:/Users/Knock/Spine/spine.log，导致超时；经正常用户权限运行后完成。没有导入下载包中的注册表或绿化脚本。

实际三角色制作发现 MCP 的四值 Bezier 数组不是 Spine 3.8 的落盘形式。项目 tools/spine/author.mjs 将其转换为 curve、c2、c3、c4 后再通过 MCP 导入；依据是当前 SDK Spine 3.8 SkeletonJson.cpp 和原厂 3.8 示例。该转换保留曲线，不以线性插值代替；未宣称本地 MCP 原样支持这些曲线。

CLI 导入已有 .spine 会合并骨架，早期验证曾产生重复导出；作者工具已改为每次导入到全新临时工程，验证单一骨架、附件和动作后才替换最终编辑源及运行 JSON。三个最终工程均完成五次 spine_control_bones、一次 spine_import_json 和一次 spine_export 的真实 MCP 调用，各为 28 根骨骼/控制、五个动作、3.8.75 数据；导入与导出退出均为 0。完整调用记录为 docs/spine08-mcp-report.json。

当前已通过 Cocos 原生 sp.Skeleton 接入、149 项测试、类型与架构检查、web-desktop 构建、14 组浏览器回归、三角色正常/半速动作诊断以及微信小游戏测试编译。微信真机运行与用户最终审美认可没有记为通过。制作范围、替换附件和视觉审查见 designs/character-style-exploration/spine08-motion.md，证据矩阵为 docs/spine08-verification.json。

## egorfedorov/spine-mcp 对照

来源：https://github.com/egorfedorov/spine-mcp ，实际检出 faf78bb307a6ea36dad8c258897cdba229171320，保存在 temp/spine-mcp-egorfedorov-20261117。

- Python 服务能初始化并列出 9 个工具；spine_doctor 的本机调用超过测试等待时间，未记为调用成功。
- 对其纯 Python build_rig 做了单独执行：三张未改像素的示例部件及测试布局产出 4.2.00 JSON、atlas、PNG；实际骨骼只有 root/body/head，arm 插槽绑定 body。
- 该纯函数执行不是 MCP 工具调用。CLI 包装面向 4.3，默认路径为 macOS，可通过 SPINE_BIN 改路径；改路径不会转换其固定 4.2 数据。
- 默认实现适合身体/头部、表情切换和弹跳的小角色，不满足本项目双臂、双腿、武器接触和独立动作的当前制作需求；没有把它接入主游戏。

本次选择本地 MCP，不将另一个仓库的宣传或近似拼图预览当作游戏动作验收。

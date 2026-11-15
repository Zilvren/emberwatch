# TypeScript 格式化约定

- 适用项目：The end，`C:\Users\Knock\Desktop\The end`
- 日期：2026-11-14（Asia/Shanghai）
- 状态：本地配置与验证完成；OpenViking 待同步。
- 相关文件：`.prettierrc.json`、`.prettierignore`、`.vscode/settings.json`、`.vscode/extensions.json`、`package.json`、`package-lock.json`、`assets/**/*.ts`。
- 待同步目标：`viking://~/resources/projects/the-end/docs/typescript-formatting.md`。本次连接本地 OpenViking 服务 `127.0.0.1:1933` 被拒绝，尚未写入或完成索引；恢复后需要检查目标目录、更新或创建该 URI，并回读验证。

## 工具与编辑器

项目安装并锁定 Prettier 3.10.1，Pink 安装了 `esbenp.prettier-vscode` 12.4.0。工作区将该扩展设为 TypeScript 默认格式化工具，并开启 TypeScript 文件保存时格式化。设置只作用于本项目的 TypeScript，不修改全局用户偏好。

在 Pink 中打开 `.ts` 文件，按 Shift+Alt+F 执行整篇格式化；Ctrl+S 保存时也会触发格式化。项目配置要求存在 Prettier 配置，统一使用本地依赖版本。

```powershell
npm run format
npm run format:check
```

第一条命令整理运行脚本，第二条只检查格式。新电脑安装项目依赖使用 `npm install`；Pink 工作区会推荐安装相同的 Prettier 扩展。

## 范围与样式

格式化命令只针对 `assets/**/*.ts`，使用 4 空格缩进、100 字符目标行宽、单引号、分号、ES5 尾随逗号和 LF 换行。Prettier 负责将拥挤的函数和回调展开，保留已有语义。

忽略构建、缓存、历史导出工具与引擎资源，避免改写 `.meta`、`.scene`、`.prefab`、`.anim` 和资源数据。`.vscode` 只将格式化设置与扩展推荐纳入版本管理，其余工作区状态继续忽略。

## 本次验证

- 17 个运行 TypeScript 模块完成格式化。
- `npm run format:check` 通过。
- TypeScript `tsc --noEmit` 通过。
- 40 条现有规则与接口测试全部通过。
- 对比格式化前后的 TypeScript 编译结果：移除注释并统一 JavaScript 排版后，17 个模块的输出完全一致，未改变游戏逻辑。

本地证据：`temp/format-before.json`、`temp/format-behavior-check.json`、`temp/format-tests.log`。未重新构建游戏预览。

参考：Prettier 官方安装文档 https://prettier.io/docs/install ，编辑器集成文档 https://prettier.io/docs/editors 。

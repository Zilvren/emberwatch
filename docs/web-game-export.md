# The end 主游戏 Web 导出

- 项目：The end，Pink/Cocos 4.0.0-beta.1。
- 日期：2026-11-17（Asia/Shanghai）。
- 状态：主游戏入口与已测完整路线验证通过；角色黑底矩形问题已观察到，画面验收未通过。
- 相关路径：`build-config.json`、`assets/TheEnd.scene`、`build/web-desktop-001/cocos.compile.config.json`、`tools/pink.cjs`。
- OpenViking：`viking://~/resources/projects/the-end/docs/web-game-export.md`。

## 为什么原来的包只有动画

`build/web-desktop-001/cocos.compile.config.json` 的 `startScene` 是 `db://assets/ActorMotionReview.scene`，`scenes` 也只包含该场景。该目录的运行设置 `src/settings.json` 同样以动作预览场景启动，因此该构建只进入角色动作评审。

主游戏入口是 `assets/TheEnd.scene`，其 UUID 为 `86d36187-47fe-4fe2-8e38-2e48b58dcf9e`。主游戏页面、战斗和探索由该场景中的原生节点、Prefab 与脚本接入。

## 在 Pink 中重新构建

1. 点击顶部 `Build & Publish`。
2. 选择 Web Desktop。
3. 在参与构建的场景列表中包含 `assets/TheEnd.scene`。
4. 将启动场景设为 `TheEnd.scene`，核对输出目录后构建。

`ActorMotionReview.scene` 用于角色动作评审。主游戏导出无需将全部独立 UI/动作评审场景都加入场景列表。

项目原有的 `build-config.json` 已包含正确主游戏入口。在项目根目录运行：

```powershell
npm run build:web
```

该命令输出到 `build/web-desktop`。本次为保留原有导出，复制该配置到 `temp/web-game-export-build-config.json`，仅将 `outputName` 改为 `web-desktop-game`，实际执行：

```powershell
node tools/pink.cjs build --project . --platform web-desktop --build-config temp/web-game-export-build-config.json
```

## 本次交付与预览

- 主游戏包：`build/web-desktop-game/`。
- 可分享压缩包：`build/the-end-web-game.zip`。
- 包内启动说明：`build/web-desktop-game/README.txt`，归档为 `viking://~/resources/projects/the-end/docs/web-game-export-readme.txt`。
- 本地临时预览：`http://127.0.0.1:7477/`，由本次独立预览进程提供。
- 构建日志：`temp/web-game-export-build.log`。
- 验证记录：`docs/web-game-export-verification.json`。
- 浏览器证据：`output/playwright/web-game-export-20261117/`。

## 分享给其他人

将主游戏包整个文件夹打包，保留 `index.html`、`assets`、`src`、`cocos-js` 等全部内容。接收者解压到本地后，通过 HTTP 静态文件服务访问。

已安装 Python 3 的接收者，可在包含 `index.html` 的文件夹打开终端并执行：

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

保持终端运行，用浏览器访问 `http://127.0.0.1:8080/`。也可以将目录全部内容部署至静态网站服务器，再分享网站地址。

## 验证范围

本次处理的是当前仓库主游戏场景的导出入口。原生构建最终退出码为 0。以独立 QA 浏览器直接打开本次导出包，已有 `browser-stamina-system` 场景完成 55 次真实界面操作，覆盖开场出发、进入档位、地图、战斗、奖励、休整、关键日志、返回避难所、再次出发准备、存档恢复及较小视口；运行时错误和控制台错误均为空。

已查看 `stamina-battle.png` 与 `stamina-shelter.png`。这些图片证明当前导出包含主游戏界面和交互结果，同时也明确暴露角色周围的黑底矩形问题。该画面问题尚未定位或修复，不能以技术交互通过代替画面验收。

角色原画、手调 Spine 工程与游戏规则未由本次导出流程重写。构建期间观察到其他来源对角色脚本和贴图的并发修改，具体路径见验证记录；因此不宣称整个工作区资源哈希不变，验证结论限定于这次实际构建并运行的导出包。没有替用户批准角色美术，也没有完成线上发布。

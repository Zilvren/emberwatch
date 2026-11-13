# 卡牌 Web 编辑器设计与接入

- 项目：The end，C:/Users/Knock/Desktop/The end
- 日期：2026-11-14（Asia/Shanghai）；初稿日期：2026-11-13
- 状态：已实现并验证。用户明确要求本地网页增删改，并在游戏中生效。
- 代码：assets/CardCatalog.ts、assets/resources/data/cards.json、assets/SurvivalRules.ts、assets/SurvivalView.ts、assets/CardPresentation.ts、assets/InventoryRowPresentation.ts、tools/card-editor-server.cjs、tools/card-editor/
- OpenViking：viking://~/resources/projects/the-end/designs/card-editor.md

## 已实现的界面

左侧卡牌列表支持搜索、筛选、新增；中间显示实时卡面和卡组统计；右侧编辑属性、已有插画、颜色、效果和投放，支持复制及删除。状态栏显示未保存和保存结果，支持 Ctrl+S、离开提醒和手机宽度。

点击试玩后打开真实 COCOS 游戏弹窗。首次构建后，保存卡牌数据并重开试玩即可生效，当前对局保持原配置。测试验证了新增扣费 2 / 伤害 3，修改后扣费 1 / 伤害 4，删除后新对局无该 ID。

## 数据来源与规则

原有八种 ID、数值、初始卡组、奖励池和装备生成关系曾写在规则代码里，卡面另有一份效果说明。本次将它们统一到 assets/resources/data/cards.json，避免只改文案而不改变效果。

根节点保存 version、fixedReward、cards。每张牌保存 id、name、tag、cost、weight、text、color、art、role、initialCount、reward、effect。effect 支持 damage、block、heal、equip、none；装备引用已有临时牌的 ID。

CardCatalog.ts 是游戏、保存服务和网页共用的纯 TypeScript 模块，负责校验、效果说明、引用查询和配置安装。初始卡组由 initialCount 展开，奖励池由 reward 标志生成。SurvivalRules 按效果类型与参数执行；展示和交互按配置选名称、费用、重量、插画、目标与反馈。固定奖励提示和现金重量说明也绑定数据。现有卡牌 Prefab 与原生角色动画继续使用。

基础攻击、基础躲避、现金和系统挥砍保留系统身份与必要约束。基础能力免费、零重量并至少初始一张，现金初始一张。临时牌重量为 0，不进入初始卡组或奖励池。初始负重包含 10 点物资且不超过 30，奖励池至少保留一张普通牌。已保存 ID 保持稳定，避免引用失效。

普通牌删除时连同初始和奖励池投放一起移除；固定奖励、装备生成关系仍引用的卡牌需先更换引用。中毒、召唤等新机制需要先扩展规则，不通过自由文本自动生成。默认八张牌与原有教学规则保持一致。

## 本地服务与生效方式

npm run cards 启动 tools/card-editor-server.cjs，只监听 127.0.0.1，默认端口 7460。GET /api/cards 返回配置和内容修订号；PUT /api/cards 验证全部配置、检查冲突、备份上一版后原子替换 JSON。错误或并发冲突不覆盖文件，备份在 temp/card-editor-backups/。

服务提供编辑页面、现有插画、共享模块的浏览器转译版本和 /play/ 游戏入口。编辑器试玩以 cards=live 参数从同源接口读取最新保存的配置。普通游戏启动通过 resources.load 读取构建打包的 JsonAsset。初始化完成后才接受操作，读取失败明确报错。首次或游戏代码变更需要构建，单纯卡牌数据调整的本地试玩无需再次构建。

## 验证与资料

40 条规则与接口测试、网页 CRUD、实时游戏效果、删除保护、并发冲突、备份、手机布局及 A/B 路线回归通过。测试牌已清理，原始定义恢复。详见 docs/card-editor-verification.md、output/card-editor-verification.json；使用说明见 docs/card-editor-usage.md。本次更新复用初稿的 OpenViking URI。

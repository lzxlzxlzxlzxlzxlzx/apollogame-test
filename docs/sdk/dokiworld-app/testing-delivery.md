# DokiWorld App 测试与交付验收规范

## 1. 合同测试

每个 App 必须自动覆盖：

- 最小合法输入与每个合法枚举/数值边界；
- 缺字段、额外字段、错类型、null、数组、类实例；
- 错 contract、错 version、超长文本、越界整数、重复 ID；
- 输出 contract/version、字段值和键集合闭合；
- `complete()` 最多成功一次；
- requestExit、dispose、刷新不伪造业务结果；
- 文档中的每个 JSON 示例能被真实 parser 接受。

## 2. Manifest 与文档测试

- 目录名、manifest.id、SDK appId 一致。
- entry、protocol、input、outputs 与代码常量一致。
- schemaVersion 3，双语 locales、context、runtime、documentation 完整。
- manifest 声明的 entry 和文档在源码、dist 中真实存在。
- `node scripts/dokiworld-docs-guard.mjs <app-id>` 退出码为 0。
- 文档字段表、示例与 parser fixture 同源或由测试逐项对齐。

## 3. 资产与构建测试

- AssetIndex 每个 filled 条目有文件且有消费槽。
- `ASSET-CLOSURE.json` 与 dist 实物集合一致。
- bundle 不含开发绝对路径、远程必需资源或旧资产引用。
- dist 不含旧 manifest 名、秘密、源码、测试和依赖目录。
- `SHA256SUMS.txt` 文件集合和每项哈希完全匹配。
- 源码比 dist 新时验证必须失败，提示重新构建。

## 4. 真实运行矩阵

| 场景 | 必验内容 |
|---|---|
| dist 静态打开 | 不白屏；资源路径相对；断网仍可用 |
| APPS preview | 空 data 不崩溃、不 complete、不产生可结算结果 |
| 假宿主合法输入 | 游戏开始并返回匹配合同的唯一 output |
| 假宿主非法输入 | 明确拒绝并退出，不伪造结果 |
| 关闭/返回 | 宿主收到 cancelled，不是 failure |
| DokiWorld 子路径 | `/apps/<app-id>/` 下资源、文档、SDK 通信正常 |
| complete rejected/timeout | 保留终局并可诊断，不提交另一结果 |

只在 Vite 开发服务器运行不算交付验收；必须测真正 dist。

## 5. 建议命令面

各 App package scripts 应提供稳定入口：`test`、`typecheck`、`build`、`verify:dist`。仓库级门禁使用 `node scripts/scoped-gate.mjs --run`，文档闭包使用 `node scripts/dokiworld-docs-guard.mjs <app-id>`。若命令会启动常驻前后端服务，应按 owner 本机禁令只把完整命令交给 owner；短生命周期测试、类型检查和构建可直接执行。

## 6. 独立复查

施工人完成后由不同人员复查：

1. 不采信施工自述，独立复跑全部适用命令并核对退出码。
2. 对关键 parser、唯一 complete、防 preview 结算等保护做撤修验红；破坏必须命中明确锚点。
3. 用假宿主实证成功、失败、取消、非法输入和超时。
4. 阅读 stderr 与警告；退出码 0 不等于没有问题。

## 7. 交付清单

- [ ] 身份、四类版本、manifest 全部一致。
- [ ] 输入输出严格校验，合同与文档一致。
- [ ] preview、completed、failure、cancelled、error 语义分离。
- [ ] App 不越权写宿主状态，随机权威边界明确。
- [ ] 调用说明十二章完整并进入 dist。
- [ ] 必需资产闭包、相对路径、断网可运行。
- [ ] SHA、卫生、新鲜度检查全部通过。
- [ ] 真 dist、假宿主、DokiWorld 子路径验证通过。
- [ ] zip 根直接为 dist 内容。

任一项未满足，只能标记“开发预览”，不得宣称可上传或可交付。

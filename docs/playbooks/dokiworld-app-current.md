# DokiWorld App 当前规范总入口

> 本页是 ZeroCraft 游戏接入 DokiWorld 的当前入口。适用版本：`dokiworlds-app-sdk@0.2.0`、`dokiworld.app/2`、`manifest.json` schemaVersion 3。旧 `@dokiworld/app-sdk`、schemaVersion 2、`app.manifest.json` 仅作历史资料，不得用于新包。

## 事实优先级

发生冲突时依次以这些内容为准：

1. vendored SDK 的 [GUIDE](../../vendor/dokiworlds-app-sdk/GUIDE.md) 与 [类型声明](../../vendor/dokiworlds-app-sdk/src/index.d.ts)；
2. 本规范的五本专题册；
3. 各 App 自己的调用说明；
4. 历史手册与旧示例。

## 分册索引

| 分册 | 解决的问题 |
|---|---|
| [身份与 Manifest](../sdk/dokiworld-app/identity-manifest.md) | App 放哪里、叫什么、四种版本如何升级、manifest 每个字段怎么写 |
| [合同与生命周期](../sdk/dokiworld-app/contracts-lifecycle.md) | 宿主如何传输入、App 如何返回结果、preview/取消/失败如何区分 |
| [调用说明文档](../sdk/dokiworld-app/integration-documentation.md) | 中文调用说明必须写哪些章节、字段和示例如何描述 |
| [资产、构建与发布](../sdk/dokiworld-app/assets-build-release.md) | 资产怎样闭包、dist 应有什么、zip 和 DokiWorld 安装目录怎样组织 |
| [测试与交付验收](../sdk/dokiworld-app/testing-delivery.md) | 合同、文档、资产、SHA、假宿主和真实子路径要怎样验证 |

新建调用说明时，复制 [中文调用说明模板](templates/dokiworld-integration.zh-CN.template.md)，不得从空白自由发挥。

## 标准流水线

```text
games/<slug> 玩法
  → dokiworld/<app-id> 薄 adapter
  → 严格 input parser
  → SDK whenReady()
  → 游戏终局
  → complete(versionedOutput) 或 requestExit()
  → build 复制 manifest + 文档 + 资产闭包
  → dist 完整性与假宿主验收
  → release/<app-id>/<app-id>-dokiworld.zip
  → DokiWorld frontend/public/apps/<app-id>/
```

## 全局硬规则

- 目录名、`manifest.id`、`createAppClient({appId})` 必须逐字一致。
- SDK adapter 只做合同投影；玩法规则不写在 adapter。
- 输入、输出均为 `{contract, version, data}`，并做运行时严格校验；默认拒绝额外键。
- App 不读取宿主 Cookie、token、数据库、内部 HTTP 或未通过合同传入的状态。
- `completed`、`cancelled`、游戏内失败和技术错误是四种不同语义。
- APPS 面板的空 `data` 是目录预览，不是宿主真实输入，不得产生可结算结果。
- 规则随机禁止 `Math.random`；权威随机必须可由宿主重演或核验。
- 必需资源必须随包闭包，断网、子路径部署和脱离开发目录仍能运行。
- manifest 必须登记调用说明，构建必须把同一份源码文档复制进 dist。
- dist 是构建产物，不得直接手改；DokiWorld 安装内容来自完整 dist。

## 新 App 最短执行顺序

1. 建立 `dokiworld/<app-id>/`，先定 ID、输入合同、输出合同和权威边界。
2. 写完整 schema 3 `manifest.json`。
3. 实现严格 parser、SDK 生命周期和唯一终局提交。
4. 用模板写 App 包内的中文调用说明，并在 manifest 的 `documentation` 登记。
5. 接入统一文档闭包、资产闭包、portable path rewrite 与 SHA 清单。
6. 补齐专题册要求的自动测试。
7. 对真实 dist 做假宿主和 DokiWorld 子路径验收。

任何一步缺失，都只能称开发预览，不能称 DokiWorld 可交付包。

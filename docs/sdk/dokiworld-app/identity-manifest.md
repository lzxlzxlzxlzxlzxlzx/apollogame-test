# DokiWorld App 身份与 Manifest 规范

## 1. 工程身份

源码目录固定为 `dokiworld/<app-id>/`。App ID 使用 `^[a-z0-9]+(?:-[a-z0-9]+)*$`，且以下三处必须逐字一致：目录名、`manifest.json` 的 `id`、`createAppClient({appId})`。禁止同时维护 `manifest.json` 与 `app.manifest.json`；当前包只认前者。

最低源码结构：

```text
dokiworld/<app-id>/
├─ package.json
├─ manifest.json
├─ docs/integration.zh-CN.md
├─ src/index.html
├─ src/main.ts
├─ src/contract.ts
├─ scripts/build.mjs
└─ tests/
```

游戏本体在 `games/<slug>/`，DokiWorld 目录只放薄 adapter 与独立交付资源。`dist/` 是可重建产物，禁止手改。

## 2. 四类版本

| 版本 | 位置 | 升级条件 |
|---|---|---|
| App 版本 | `manifest.version` | 任一正式发布内容变化 |
| Manifest schema | `schemaVersion` | 平台 manifest 格式变化；当前固定 `3` |
| Runtime protocol | `runtime.protocolVersion` | SDK wire protocol 变化；当前固定 `2` |
| 业务合同 | input/output 的 `version` | 字段、值域或语义不兼容变化 |

纯 UI、美术、动画修改不升级业务合同。新增必填字段、改变含义或缩小合法值域必须升级；新增可选字段也要考虑严格 extra-key 校验，默认按新合同版本处理。

## 3. 完整 Manifest

```json
{
  "schemaVersion": 3,
  "id": "game-example",
  "version": "1.0.0",
  "entry": "index.html",
  "context": { "requiredScopes": [], "optionalScopes": [] },
  "locales": {
    "en": { "name": "Example Game", "description": "A one-sentence action summary." },
    "zh-cn": { "name": "示例游戏", "description": "用一句话说明玩家做什么。" }
  },
  "documentation": {
    "zh-cn": { "title": "示例游戏调用说明", "path": "docs/integration.zh-CN.md" }
  },
  "runtime": {
    "protocol": "dokiworld.app",
    "protocolVersion": 2,
    "input": { "contract": "doki.game.example-input", "version": 1 },
    "outputs": [{ "contract": "doki.game.example-result", "version": 1 }],
    "modules": []
  }
}
```

## 4. 字段规则

| 字段 | 规则 |
|---|---|
| `schemaVersion` | 必填整数，当前为 `3` |
| `id` | 必填；符合 ID 闭集且与目录、SDK appId 一致 |
| `version` | 必填 SemVer 字符串 |
| `entry` | 必填包内安全相对 HTML 路径；通常为 `index.html` |
| `context.requiredScopes` | 必填数组；没有需求也写 `[]` |
| `context.optionalScopes` | 必填数组；没有需求也写 `[]` |
| `locales.en` / `locales.zh-cn` | 必填名称和说明；locale 键小写 |
| `documentation` | 必填；至少登记一份包内 Markdown 调用说明 |
| `runtime.protocol` | 固定 `dokiworld.app` |
| `runtime.protocolVersion` | 当前固定整数 `2` |
| `runtime.input` | 唯一允许输入的 contract 与正整数 version |
| `runtime.outputs` | 至少一个允许输出；运行时不得返回表外合同 |
| `runtime.modules` | 必填数组；普通小游戏通常为 `[]` |

`entry` 与 `documentation.*.path` 必须位于 App 根内，不得绝对路径、`..` 逃逸或反斜杠；文档路径以 `.md` 结尾。源码 manifest 与 dist manifest 必须一致。平台 loader 也许能加载更小 manifest，但本仓发布包不得省略上述字段。


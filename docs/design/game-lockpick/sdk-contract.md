# `game-lockpick` DokiWorld SDK 合同 v1

## 1. Manifest 身份

```json
{
  "schemaVersion": 3,
  "id": "game-lockpick",
  "version": "1.0.0",
  "entry": "index.html",
  "context": { "requiredScopes": [], "optionalScopes": [] },
  "locales": {
    "en": {
      "name": "Mechanism Lock",
      "description": "Align three-position tumblers using light and sound feedback."
    },
    "zh-cn": {
      "name": "机关锁",
      "description": "根据光色与声音反馈，将三档机关滑钮调至正确位置。"
    }
  },
  "documentation": {
    "zh-cn": {
      "title": "机关锁调用文档",
      "path": "docs/integration.zh-CN.md"
    }
  },
  "runtime": {
    "protocol": "dokiworld.app",
    "protocolVersion": 2,
    "input": { "contract": "doki.game.lockpick-input", "version": 1 },
    "outputs": [{ "contract": "doki.game.lockpick-result", "version": 1 }],
    "modules": []
  }
}
```

发布包使用 `manifest.json`，并提供中英文 `locales` 名称与说明。调用说明文档随包生成并被 manifest / 文档闭包检查覆盖。

## 2. 输入

```ts
type LockpickInput = Readonly<{
  difficulty: 'easy' | 'normal' | 'hard'
}>

type LockpickInputContract = Readonly<{
  contract: 'doki.game.lockpick-input'
  version: 1
  data: LockpickInput
}>
```

严格合同：`data` 必须是普通对象，必须且只能有 `difficulty`；缺字段、额外字段、未知枚举、数组或 `null` 均拒绝启动正式会话。难度映射固定为 easy=3、normal=4、hard=5。

`runId` 与 `instanceId` 是 SDK 协议会话元数据，不属于业务输入。适配层将二者以冒号连接，再使用引擎 `fnv1a32` 派生内部 run seed；宿主无需也不能指定答案。

## 3. 输出

```ts
type LockpickResultContract = Readonly<{
  contract: 'doki.game.lockpick-result'
  version: 1
  data: Readonly<{ outcome: 'success' | 'failure' }>
}>
```

- `success`：全部滑钮位置正确。
- `failure`：玩家主动点击“放弃”并二次确认。
- 不得输出移动次数、目标组合、当前组合、正确数量、随机种子、计时或奖励。
- 每个 run 最多调用一次 `complete()`；只接受首次终局。

## 4. 取消与异常

- 页面关闭、刷新、iframe 卸载、SDK 断线、宿主请求退出均不等于主动放弃，不得输出 `failure`。
- 配置非法：显示明确配置错误，拒绝开始规则会话，不伪造结果。
- App 面板以空数据直接预览时可进入本地演示配置，但必须清楚标识为 preview，且不得把预览结果提交给宿主。
- `requestExit()` 是取消会话，不是游戏失败。

## 5. 宿主职责边界

DokiWorld 负责把世界条件归一为三档难度，并在收到 outcome 后处理开锁、物品、经验、剧情、消耗和后果。小游戏不读取角色属性，不修改宿主数据库，不生成奖励。

## 6. 独立包约束

- 构建产物内闭包 JS、CSS、字体、图片、音频、manifest 与调用说明。
- 禁止运行时依赖 Apollo 开发目录或绝对磁盘路径。
- 禁止远程图片作为必需资产；宿主不传图片 URL。
- 相对路径在 DokiWorld `/apps/game-lockpick/` 子路径部署下可用。

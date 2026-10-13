# 机关锁调用说明

| 项目 | 固定值 |
| --- | --- |
| App ID | `game-lockpick` |
| 协议 | `dokiworld.app/2` |
| 输入 | `doki.game.lockpick-input` v1 |
| 输出 | `doki.game.lockpick-result` v1 |

宿主只提供难度，不提供答案、种子、奖励或角色属性：

```json
{ "contract": "doki.game.lockpick-input", "version": 1, "data": { "difficulty": "normal" } }
```

`difficulty` 必须且只能为 `easy`、`normal`、`hard`。它们分别产生 3、4、5 个三档滑钮。SDK 会话元数据 `instanceId:runId` 仅用于内部确定性 seed，不是业务输入。

成功或玩家在二次确认后放弃时，App 最多回传一次：

```json
{ "contract": "doki.game.lockpick-result", "version": 1, "data": { "outcome": "success" } }
```

`outcome` 只会是 `success` 或 `failure`。关闭、刷新、卸载、断线和 `requestExit()` 都不会产生 `failure`。空数据仅进入本地预览，绝不提交结果。

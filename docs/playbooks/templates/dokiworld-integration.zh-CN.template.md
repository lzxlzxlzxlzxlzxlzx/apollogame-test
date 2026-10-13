# {{APP_NAME_ZH}}调用说明

> 使用方法：复制到目标 App 的调用说明文件，替换全部 `{{...}}` 占位符，删除不适用说明；示例必须由真实合同 parser 测试覆盖。完整写作规则见上一级 DokiWorld App 当前规范。

本文面向在 DokiWorld 中调用 `{{APP_ID}}` 的程序员。用一段话说明玩家做什么、App 负责什么、明确不负责什么。

## 1. 应用身份

| 项目 | 固定值 |
|---|---|
| App ID | `{{APP_ID}}` |
| 协议 | `dokiworld.app/2` |
| 输入合同 | `{{INPUT_CONTRACT}}` v{{INPUT_VERSION}} |
| 输出合同 | `{{OUTPUT_CONTRACT}}` v{{OUTPUT_VERSION}} |
| requiredScopes | {{REQUIRED_SCOPES_OR_NONE}} |
| optionalScopes | {{OPTIONAL_SCOPES_OR_NONE}} |
| modules | {{MODULES_OR_NONE}} |

## 2. 宿主调用

```ts
const launched = await client.apps.launch({
  appId: '{{APP_ID}}',
  input: {
    contract: '{{INPUT_CONTRACT}}',
    version: {{INPUT_VERSION}},
    data: {{VALID_INPUT_OBJECT}},
  },
})

if (launched.status === 'completed') {
  const output = launched.output
  // 校验 contract、version 和 data 后，再执行宿主权威处理。
} else {
  // cancelled：不结算，不当作游戏失败。
}
```

说明调用前置条件、允许调用的宿主位置、错误捕获和幂等 request/session ID 方案。

## 3. APPS 调试面板

明确写清楚：面板的合同、版本分别填什么；数据框是只粘贴 `data` 内部对象，还是由当前工具要求完整 envelope。说明空 data 只进入 preview，不产生正式结果。

调试面板可直接粘贴的数据：

```json
{{VALID_DATA_ONLY_JSON}}
```

## 4. 输入合同

完整 envelope：

```json
{
  "contract": "{{INPUT_CONTRACT}}",
  "version": {{INPUT_VERSION}},
  "data": {{VALID_INPUT_JSON}}
}
```

### 4.1 字段约束

| 路径 | 类型 | 必填 | 约束、默认值与语义 | 非法时行为 |
|---|---|---:|---|---|
| `data.{{FIELD}}` | {{TYPE}} | 是/否 | 写清枚举、范围、长度、默认值、顺序、重复规则，以及是否只影响展示 | 拒绝会话/使用默认值 |

必须列出所有字段和嵌套字段；所有枚举列全，所有区间说明是否包含端点。明确未知额外键是拒绝还是忽略。

### 4.2 规则与计算顺序

按顺序说明会改变结果的算法、优先级、覆盖关系、随机消费顺序和确定性要求。如果 App 只演出宿主既定结果，也要明确写“App 不重新判定”。

### 4.3 非法输入

说明缺字段、类型错误、越界、合同版本错误、payload 过大时 App 和宿主各自应如何处理；不得把配置错误伪造成业务失败。

## 5. 输出合同

为每一种合法终局提供完整示例：

```json
{
  "contract": "{{OUTPUT_CONTRACT}}",
  "version": {{OUTPUT_VERSION}},
  "data": {{VALID_OUTPUT_JSON}}
}
```

### 5.1 字段约束

| 路径 | 类型 | 存在条件 | 含义 | 宿主处理 |
|---|---|---|---|---|
| `data.{{OUTPUT_FIELD}}` | {{TYPE}} | 始终/条件 | 精确定义 | 校验/重算/展示/幂等处理 |

输出必须列出全部字段、条件字段和枚举，不得要求调用方阅读源码猜测。

## 6. 完成、失败与取消

| 场景 | SDK 结果 | 是否产生业务结果 |
|---|---|---:|
| {{SUCCESS_CONDITION}} | completed + {{SUCCESS_OUTPUT}} | 是 |
| {{GAME_FAILURE_CONDITION}} | completed + {{FAILURE_OUTPUT}} | 是 |
| 玩家关闭/返回 | cancelled | 否 |
| App requestExit | cancelled | 否 |
| 输入非法 | 错误/取消 | 否 |
| iframe 卸载、刷新、断线 | 取消或异常 | 否 |

如果游戏没有业务失败结果，删除对应行并明确说明。关闭不得默认等于 failure。

## 7. 权威结算与幂等

说明：

1. 哪一方保存待处理 session；
2. 哪一方生成或保存 seed；
3. output 是否可重算；
4. 宿主用哪个稳定 ID 去重；
5. 奖励、存档、剧情和消耗由谁写入；
6. cancelled、超时、校验失败时是否结算。

示例口径：App 只返回结果回执；宿主校验并在单个幂等事务中落业务状态。App 不直接发奖或修改数据库。

## 8. 随机、时间与可重演性

说明随机来源、seed 归属、相同输入是否保证相同输出，以及动画/物理结果能否作为权威结果。若不可服务器验证，必须显著写明。

## 9. 展示资源与降级

列出可选图片、文本、locale 或皮肤字段；说明它们是否 render-only、允许的 URL/格式、加载失败时的 fallback，以及为什么不会改变规则结果。

## 10. 错误处理

| 错误 | App 行为 | 调用方行为 |
|---|---|---|
| 输入合同不匹配 | 拒绝启动并 requestExit | 修正调用，不自动结算 |
| complete rejected/timeout | 保留终局并提示 | 查询原 session 状态，禁止重复发奖 |
| 资源加载失败 | 使用包内 fallback 或继续无图模式 | 不改变业务结果 |
| apps.launch 错误 | 不启动目标 App | 按错误码提示或降级 |

补充本 App 特有的错误与恢复方式。

## 11. 安全与隐私边界

- App 不读取宿主 Cookie、token、背包或内部 HTTP。
- 必需资源全部包内闭包；外部展示资源必须由合同明确允许。
- App 不直接写数据库、奖励、关系、任务或剧情状态。
- 说明本 App 使用的 scope/module；无则明确写“无”。

## 12. 上线前核对清单

1. App ID、合同名和版本与 manifest 完全一致。
2. 调试面板 data 示例可直接通过真实 parser。
3. completed、cancelled、failure 分支均有宿主处理。
4. 输出经过运行时校验和幂等处理。
5. 权威奖励/存档只由宿主写入。
6. 文档示例、字段表和当前代码没有漂移。


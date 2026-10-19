# 坩埚炼药调用说明

本文面向 DokiWorld 宿主程序员。宿主指定唯一配方，App 让玩家投料并按方向搅拌，只返回成功或失败；背包扣减、奖励和剧情由宿主处理。`recipe.name` 即目标和炼成药剂的名称，不需要另传“生成产物名称”字段。

## 1. 应用身份

| 项目 | 固定值 |
|---|---|
| App ID | `game-potion-brewing` |
| 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.potion-brewing-input` v1 |
| 输出合同 | `doki.game.potion-brewing-result` v1 |
| requiredScopes / optionalScopes / modules | 均无 |

## 2. 宿主调用

```ts
const launched = await client.apps.launch({
  appId: 'game-potion-brewing',
  input: {
    contract: 'doki.game.potion-brewing-input', version: 1,
    data: {
      brewingId: 'brew-001',
      recipe: {
        recipeId: 'moon-dew', name: '月露安神剂',
        resultImageUrl: 'https://assets.example.invalid/moon-bottle.png',
        ingredients: [
          { ingredientId: 'moon-herb', name: '月露草', imageUrl: 'https://assets.example.invalid/moon-herb.png' },
          { ingredientId: 'silver-leaf', name: '银叶', imageUrl: 'https://assets.example.invalid/silver-leaf.png' },
        ],
        steps: [{ kind: 'add', ingredientId: 'moon-herb', liquidColor: '#69adb1' }, { kind: 'stir', direction: 'clockwise', turns: 2, liquidColor: '#398f93' }],
      },
    },
  },
});
if (launched.status === 'completed') {
  // 先严格校验 launched.output，再按 brewingId 幂等结算。
} else {
  // cancelled 不结算，也不视为炼药失败。
}
```

`brewingId` 由宿主产生并保存，用于同一次炼药的幂等对账；调用失败由宿主捕获并提示。宿主不要在重复回执下重复扣材料或发奖。示例 `.invalid` 地址只展示字段位置，正式调用须换成可公开访问的真实 HTTPS 图片 URL；不传图片 URL 时使用包内素材或占位。

## 3. APPS 调试面板

合同填 `doki.game.potion-brewing-input`、版本填 `1`；数据框只粘贴 `data` 对象。空 `{}` 进入本地预览，不产生正式 `complete`。

```json
{"brewingId":"brew-001","recipe":{"recipeId":"moon-dew","name":"月露安神剂","ingredients":[{"ingredientId":"moon-herb","name":"月露草"},{"ingredientId":"silver-leaf","name":"银叶"}],"steps":[{"kind":"add","ingredientId":"moon-herb","liquidColor":"#69adb1"},{"kind":"stir","direction":"clockwise","turns":2,"liquidColor":"#398f93"}]}}
```

## 4. 输入合同

完整 envelope 是 `{ "contract":"doki.game.potion-brewing-input", "version":1, "data": <上节数据> }`。输入上限 32 KiB，未知键一律拒绝。

### 4.1 字段约束

| 路径 | 类型 | 必填 | 约束、默认值与语义 | 非法行为 |
|---|---|---:|---|---|
| `data.brewingId` | string | 是 | ASCII ID，`[A-Za-z0-9][A-Za-z0-9._:-]{0,63}`；宿主幂等键 | 拒绝启动 |
| `data.recipe.recipeId` | string | 是 | 同上；结果对账 | 拒绝启动 |
| `data.recipe.name` | string | 是 | NFC、无首尾空白/控制字符，1–40 Unicode 字符；目标及炼成药剂的显示名称，无独立产物名称字段 | 拒绝启动 |
| `data.recipe.resultImageUrl` | string | 否 | HTTPS 绝对 URL，最多 2048 字符，无凭据/片段；成功结算药剂瓶图，仅展示；省略或加载失败回退适配的包内图/无图 | 非法 URL 拒绝启动；加载失败不影响结果 |
| `data.recipe.ingredients` | array | 是 | 2–5 项，ID 唯一；可含未使用材料作为错误干扰项 | 拒绝启动 |
| `ingredients[].ingredientId` | string | 是 | 同 ID 格式；可在步骤中反复使用，架上无限取用 | 拒绝启动 |
| `ingredients[].name` | string | 是 | NFC、1–24 Unicode 字符 | 拒绝启动 |
| `ingredients[].imageUrl` | string | 否 | 同图片 URL 约束；每种材料独立的材料架/拖动图，仅展示；省略或加载失败回退对应包内图/占位 | 非法 URL 拒绝启动；加载失败不影响结果 |
| `data.recipe.steps` | array | 是 | 2–5 项，至少含 add、stir 各一项，顺序即权威顺序 | 拒绝启动 |
| `steps[].kind` | enum | 是 | `add` 或 `stir`；两类字段不得混填 | 拒绝启动 |
| `add.ingredientId` | string | add 时 | 引用已登记的材料 ID | 拒绝启动 |
| `stir.direction` | enum | stir 时 | `clockwise` 或 `counterclockwise` | 拒绝启动 |
| `stir.turns` | integer | stir 时 | 1–3，含两端 | 拒绝启动 |
| `steps[].liquidColor` | string | 是 | 六位十六进制 `#RRGGBB`；仅展示 | 拒绝启动 |

### 4.2 规则与计算顺序

玩家必须依次完成步骤。错误材料、错误阶段或有效反向搅拌立即失败；短弧不提交。初始清水为 `#a9dce7`，失败紫汤为 `#615366`。材料无限取用，App 不扣宿主库存。无随机结果；同一玩家动作序列可确定性复现。

### 4.3 非法输入

缺失字段、错误类型/版本、未知键、重复 ID、越界或超过 32 KiB 均拒绝启动并 `requestExit`，不得产生业务失败回执。

## 5. 输出合同

```json
{"contract":"doki.game.potion-brewing-result","version":1,"data":{"brewingId":"brew-001","recipeId":"moon-dew","outcome":"success"}}
```

失败仅将 `outcome` 改为 `failure`。`data` 恰含三个键：`brewingId`、`recipeId` 原样回显；`outcome` 仅 `success|failure`。宿主应严格校验三字段及 envelope，不从展示图、动画或文本推断结果。

## 6. 完成、失败与取消

| 场景 | SDK 结果 | 业务结果 |
|---|---|---|
| 全部步骤正确 | completed + success | 有 |
| 明确错误动作 | completed + failure | 有 |
| 玩家关闭/返回或 App requestExit | cancelled | 无 |
| 输入非法、iframe 卸载/断线 | 取消或异常 | 无 |

终局弹窗没有重玩按钮；终局形成后只交付该结果。`complete` 拒收/超时不改为 `cancelled` 或第二种 outcome，画面保持锁定，宿主应查询会话状态。

## 7. 权威结算与幂等

宿主保存待处理 `brewingId` 和配方；App 不创建 seed、不改库存。输出仅为结果回执，不含材料消耗或奖励。宿主以 `brewingId` 做单事务幂等结算；cancelled、超时和合同校验失败均不结算。

## 8. 随机、时间与可重演性

规则不消费随机数。动画和实际操作耗时仅供展示，不是权威数据。宿主若需要服务器验证，应保存输入与操作证据；不能仅根据一张截图确认结果。

## 9. 展示资源与降级

可选 `ingredients[].imageUrl` 与 `recipe.resultImageUrl` 均接收真实 HTTPS 图片 URL，只作展示，不进入规则状态或输出。前者按材料 ID 分别显示在材料架与拖动图，后者显示在成功结算；未传或加载失败时分别回退包内材料图/占位、适配的本地瓶图/无图，不改变规则结果。`recipe.name` 提供药剂名称，`recipeId` 供宿主对账。游戏包内含坩埚、搅拌棒、样例药剂瓶及字体资源。远程图片可能受跨域访问策略或宿主 CSP 限制；调用方应在实际 DokiWorld 部署环境验证图片域名可访问。

## 10. 错误处理

| 错误 | App 行为 | 宿主行为 |
|---|---|---|
| 合同不匹配/无效 | 拒绝启动并 requestExit | 修正调用，不结算 |
| complete rejected/timeout | 保留原终局 | 查询原会话，禁止重复发奖 |
| 展示资源失败 | 回退包内素材或无图 | 不改变结果 |
| apps.launch 错误 | 未启动 | 按错误提示或降级 |

## 11. 安全与隐私边界

无 scope/module。App 不读取宿主 Cookie、token、背包或内部 HTTP，不直接写数据库、奖励、剧情或存档。远程展示图片可能向图片域暴露访问 IP；宿主应只提供允许公开访问的 URL。

## 12. 上线前核对清单

1. App ID、合同和版本与 manifest 一致。
2. 调试面板示例通过真实 parser。
3. completed、cancelled、failure 均有宿主分支。
4. 输出严格验证并按 `brewingId` 幂等结算。
5. 奖励/存档仅由宿主写入。
6. 文档、代码、构建包与宿主调用一致。

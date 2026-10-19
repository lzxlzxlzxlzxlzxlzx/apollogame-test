# 《坩埚炼药》DokiWorld 合同 v1（S2 Owner 人门已通过）

> 协议事实以 vendored `dokiworlds-app-sdk@0.2.0` 的 `GUIDE.md` 和 `src/index.d.ts` 为准；本文件仅定义本 App 的业务数据，不是发布调用说明，也不创建 manifest/dist。S1-P-06 单配方直入，没有玩家选方。

## Envelope 与输入

App ID 暂定 `game-potion-brewing`。输入合同 `doki.game.potion-brewing-input`、版本 `1`，输出合同 `doki.game.potion-brewing-result`、版本 `1`。SDK `AppContract<T>={contract,version,data}`，协议版本为 2；manifest 将用 schemaVersion 3。输入/输出均严格拒绝未知键、非普通 JSON 对象、重复 ID、非整数、非法枚举和超界值；单条序列化 payload 小于 64 KiB。本 App 另设输入上限 32 KiB，给宿主协议保留余量。对象键闭集：`data={brewingId,recipe}`；`recipe={recipeId,name,resultImageUrl?,ingredients,steps}`；每个 ingredient `={ingredientId,name,imageUrl?}`；add 步骤恰为 `{kind,ingredientId,liquidColor}`，stir 步骤恰为 `{kind,direction,turns,liquidColor}`；`kind` 只能是 `add|stir`，不得混填两种步骤的字段。

```json
{
  "contract": "doki.game.potion-brewing-input",
  "version": 1,
  "data": {
    "brewingId": "brew-001",
    "recipe": {
      "recipeId": "moon-dew",
      "name": "月露安神剂",
      "resultImageUrl": "https://assets.example.invalid/moon-bottle.png",
      "ingredients": [
        { "ingredientId": "moon-herb", "name": "月露草", "imageUrl": "https://assets.example.invalid/moon-herb.png" },
        { "ingredientId": "silver-leaf", "name": "银叶" }
      ],
      "steps": [
        { "kind": "add", "ingredientId": "moon-herb", "liquidColor": "#69adb1" },
        { "kind": "stir", "direction": "clockwise", "turns": 2, "liquidColor": "#398f93" },
        { "kind": "add", "ingredientId": "silver-leaf", "liquidColor": "#478c9e" },
        { "kind": "stir", "direction": "counterclockwise", "turns": 1, "liquidColor": "#277f83" }
      ]
    }
  }
}
```

示例 URL 使用 `.invalid` 占位，不能当可用资产。`recipe.name` 就是本局目标药剂及成功结算显示的名称，不另传 `productName`、`resultName` 或独立“生成产物”字段；输出仍只回传 `recipeId` 与成败，由宿主按原配方 ID 处理产物。`ingredients[].imageUrl` 是每种材料各自的真实展示图 URL：传入且加载成功时覆盖材料架/拖动图；省略或加载失败则回退该材料的包内图，未知材料回退占位。`recipe.resultImageUrl` 是成功结算的药剂瓶图 URL，加载失败回退适配的本地图或无图展示。两类 URL 均不进入 World、规则判定或输出。

| 字段 | 必填、类型和值域 | 规则影响 / 非法行为 |
|---|---|---|
| `brewingId` | 必填稳定 ID；ASCII `[A-Za-z0-9][A-Za-z0-9._:-]{0,63}` | 只作宿主幂等对账，不能由 App 生成；非法拒绝启动 |
| `recipe.recipeId` | 同上 | 只作结果对账；不是选方键 |
| `recipe.name` | 必填 Unicode 文本，NFC 规范化、去首尾空格后按 Unicode code point 计 1–40 个；拒绝孤立代理项和控制字符，不解释 HTML | 目标及炼成药剂的显示名称，纯展示；非法拒绝 |
| `recipe.resultImageUrl` | 可选，HTTPS 绝对 URL，最多 2048 字符；禁凭据、`data:`、`blob:`、`javascript:` 与片段 | render-only；加载失败回适配的本地图或无图，不改变成败 |
| `recipe.ingredients` | 2–5 项；每项仅 `ingredientId,name,imageUrl?`，`ingredientId` 与 `recipeId` 同一 ASCII ID 正则且唯一；name 按上述 Unicode code point 口径 1–24 个；URL 同上 | 每项图片 URL 对应自身材料的展示；未出现在步骤里的材料可作为错误干扰项 |
| `ingredients[].imageUrl` | 可选，每个材料独立的 HTTPS 绝对 URL；约束同 `resultImageUrl` | render-only；图片加载失败回该材料包内图或占位，不改变投料 ID 和成败 |
| `recipe.steps` | 2–5 项；`kind` 闭集 `add|stir`，至少一项各类；顺序即权威顺序 | 不允许空配方或跨类字段；非法拒绝 |
| `add.ingredientId` | 必填，必须引用已列材料 ID；同一 ID 可多次出现 | 只有投进锅口才提交；错误 ID/错误阶段立即失败 |
| `stir.direction` | `clockwise` 或 `counterclockwise` | 完整有效反向圈立即失败；短弧不提交 |
| `stir.turns` | 必填整数 `1..3` | 每个有效圈累计，达标即锁步骤 |
| `step.liquidColor` | 必填 `#[0-9A-Fa-f]{6}` | 纯展示，逐步变色；多圈搅拌逐圈朝目标色插值。初始清水固定 `#a9dce7`，失败固定 `#615366` |

Owner 2026-10-14 确认材料无限取用：输入材料架不显示或扣减份数，也不因使用次数禁用；配方外展示材料仍可投入以检验明确错误。宿主物品库存不在 App 内扣除。图片域名白名单/CSP 及加载超时在 S7 的部署环境再定，但不得因此改变规则或向 URL 泄漏宿主凭据。所有显示文本使用文本节点/闭集控件，不解释 HTML。

## 输出与终局

```json
{
  "contract": "doki.game.potion-brewing-result",
  "version": 1,
  "data": { "brewingId": "brew-001", "recipeId": "moon-dew", "outcome": "success" }
}
```

输出 `data` **仅**有 `brewingId`、`recipeId`、`outcome`；两个 ID 原样回显，`outcome` 仅 `success|failure`。不返回分数、品质、耗时、材料消耗、手势路径、错误原因或图片 URL。`completed+success` 是全部步骤正确；`completed+failure` 仅是明确错误动作。关闭/返回/主动退出及开局前不可恢复的非法输入或初始化错误走 `requestExit()` / `cancelled`，不得伪装为业务失败。**已经形成的玩法终局遭遇 `complete` 拒绝/超时不转成 cancelled**：保持原 outcome 与未确认交付状态，提示同一结果重试或等待宿主处理；只有玩家随后明确退出才走取消。宿主负责据 `brewingId` 去重、库存与奖励结算；App 不写宿主状态或远程数据库。

被调用 App 顺序 `createAppClient({appId}) → connect → whenReady → 严格 parse → start`。本地 APPS 面板的空 `data:{}` 进入显著 preview/配置错误状态，**不调用 complete**。玩法终局冻结后只构造一次不变结果；`complete` 返回 `accepted` 才视为交付，`rejected`/超时则保留同一终局供诊断或重试，不变造第二结果。主动取消走 `requestExit()`。页面离开清理 client、输入、渲染与音频。后续正式调用说明必须用 `docs/playbooks/templates/dokiworld-integration.zh-CN.template.md`，且宿主也严格 parse 输出。

## 已审定边界与后续核验

- 32 KiB App 输入上限、2–5 步/材料和每步必填的展示色已随 S2 Owner 人门通过，作为 v1 上限。若要容纳更多步骤，必须先重验 1440×900 卷轴的全步骤可读性并修订原型。
- 远程图片仅 render-only；生产 CSP/代理由 S7 依据真实宿主环境核对，不在 S2 假定可访问域名。

# 星辉启封调用说明

本文面向调用 `game-card-reveal` 的 DokiWorld 程序员。App 只演出宿主已确定顺序的 1–5 张卡；不抽卡、不重排、不计算奖励。正式包装、逐卡 HTTPS 图片加载和包内 fallback 已接入。可移植 dist 仍须通过本 App 的 `verify:dist`、假宿主及目标 DokiWorld 子路径验收；源码预览不等于已安装或发布。

## 1. 应用身份

| 项目 | 固定值 |
|---|---|
| App ID | `game-card-reveal` |
| 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.card-reveal-input` v1 |
| 输出合同 | `doki.game.card-reveal-result` v1 |
| requiredScopes / optionalScopes / modules | 均无 |

## 2. 宿主调用

```ts
const presentationId = 'pack-2026-001' // 宿主生成并持久保存的幂等 ID
try {
  const launched = await client.apps.launch({
    appId: 'game-card-reveal',
    input: { contract: 'doki.game.card-reveal-input', version: 1, data: {
      presentationId,
      cards: [{ id: 'star-001', faceImageUrl: 'https://example.com/card/star-001.webp', alt: '星辰骑士' }],
    } },
  })
  if (launched.status === 'completed') {
    // 用本页第 5 章闭集重新校验 contract/version/data/presentationId，
    // 再按 presentationId 幂等记账；不要仅凭 completed 发奖。
  } else {
    // cancelled：不结算，不视作业务失败。
  }
} catch (error) {
  // SDK/网络/宿主异常：查询原 session 并提示重试；不自动结算。
}
```

调用前宿主应已确定卡牌与可访问的 HTTPS 展示图，并保存 `presentationId` 对应的待演出 session。展示图服务须允许 App 所在 origin 跨域加载（CORS）；URL 可被接受不代表图片一定能加载。只在玩家需要观看结果的宿主位置调用；`apps.launch` 异常按调用失败处理，不自动发奖。

## 3. APPS 调试面板

合同填 `doki.game.card-reveal-input`，版本填 `1`。面板的数据框只粘贴下面的 `data` 对象，不粘贴合同 envelope。空 `{}` 只进入内部 preview，不产生正式结果。

本地页面审阅可用 `?preview=1&cards=1` 至 `?preview=1&cards=5` 切换内部预览数量；无效数量回退为 1。这不放宽正式宿主合同，preview 永不发送 complete，且不会请求示例图片 URL。

运行时是纯透明演出层，不显示底部对话框、阶段文字、暂停、跳过、重试或退出按钮。宿主应提供自身的关闭方式；App 仍保留键盘兜底：`Esc` 请求退出，`Space` / `Enter` 在演出中直接跳到稳定结果，在完成回执被拒后则重试同一冻结回执。页面失焦会暂停，重新可见后自动续播。

```json
{"presentationId":"pack-2026-001","cards":[{"id":"star-001","faceImageUrl":"https://example.com/card/star-001.webp","alt":"星辰骑士"}]}
```

## 4. 输入合同

完整 envelope：

```json
{"contract":"doki.game.card-reveal-input","version":1,"data":{"presentationId":"pack-2026-001","cards":[{"id":"star-001","faceImageUrl":"https://example.com/card/star-001.webp","alt":"星辰骑士"}]}}
```

### 4.1 字段约束

| 路径 | 类型 | 必填 | 约束、默认值与语义 | 非法时行为 |
|---|---|---:|---|---|
| `data.presentationId` | string | 是 | 长度 1–128；宿主稳定幂等 ID | 拒绝会话 |
| `data.cards` | array | 是 | 长度 1–5；数组顺序就是展示顺序 | 拒绝会话 |
| `data.cards[i].id` | string | 是 | 长度 1–128；同一数组内唯一 | 拒绝会话 |
| `data.cards[i].faceImageUrl` | string | 是 | 绝对 HTTPS URL、有效主机、无 URL 用户名/密码；仅展示 | 拒绝会话 |
| `data.cards[i].alt` | string | 否 | 最多 80 字符；仅无障碍展示，允许空串 | 拒绝会话 |

顶层和每张卡的未知额外键一律拒绝。`data` 必须为普通对象，不接受数组、类实例或 null。输入 UTF-8 JSON payload 上限为 64 KiB。

### 4.2 规则与计算顺序

先验证合同与版本，再检验 payload 大小、字段、卡牌数量、ID 唯一性及 URL；按 `cards[0]` 至 `cards[N-1]` 建立连续前缀实体。App 不重新判定抽卡、稀有度或奖励。相同合法输入的装配顺序相同；P2–P5 结构与时序由正式轨道数据驱动。

### 4.3 非法输入

缺字段、错误类型、越界、重复 ID、非 HTTPS、未知字段、合同版本错误与过大 payload 均拒绝加载，调用方应修正数据。不可将配置错误伪造成“未获得卡牌”或 viewed。`{}` 仅限宿主调试/内部预览，不是正式业务输入。

## 5. 输出合同

自然完成示例：

```json
{"contract":"doki.game.card-reveal-result","version":1,"data":{"presentationId":"pack-2026-001","outcome":"viewed","completion":"natural"}}
```

跳过演出示例：

```json
{"contract":"doki.game.card-reveal-result","version":1,"data":{"presentationId":"pack-2026-001","outcome":"viewed","completion":"skipped"}}
```

### 5.1 字段约束

| 路径 | 类型 | 存在条件 | 含义 | 宿主处理 |
|---|---|---|---|---|
| `data.presentationId` | string | 始终 | 原输入幂等 ID | 与待处理 session 比对 |
| `data.outcome` | `viewed` | 始终 | 已到真实 P5 终态 | 校验枚举；不作为抽卡判定 |
| `data.completion` | `natural` / `skipped` | 始终 | 自然演完或合法跳过 | 仅记录观看方式 |

## 6. 完成、失败与取消

| 场景 | SDK 结果 | 是否产生业务结果 |
|---|---|---:|
| 真实 P5 自然终态 | completed + `viewed/natural` | 是 |
| 真实 P5 跳过终态 | completed + `viewed/skipped` | 是 |
| 玩家关闭、返回、App requestExit | cancelled | 否 |
| 输入非法、资源导致无法进入终态、刷新、断线 | 错误/取消 | 否 |
| 内部空数据 preview | 无 complete | 否 |

本游戏没有业务失败 outcome。正式播放到 P5 稳定终态后，App 以 `CompletionGate` 向宿主发出一次完成请求；被拒或超时后保留同一结果，`Space` / `Enter` 可重试。预览不发送完成请求。

## 7. 权威结算与幂等

宿主保存待处理 session、生成 `presentationId`、决定卡牌并负责奖励、存档、剧情与消耗。App 只回传观看回执，不写业务数据库。宿主按 `presentationId` 校验原 session 并在单个幂等事务中处理；重复 output 不重复发奖。取消、超时、输入无效不结算。输出不可代替宿主权威卡牌数据。

## 8. 随机、时间与可重演性

App 不消费随机数；卡牌顺序由宿主输入确定。蓝图 tickRate 为 60 Hz；标准 P2/P3/P4 分别为 120/63/每卡 57 tick，P5 为 `round((1200+(N-1)×120)×0.06)` tick。reduced 为 48/17/每卡 18 tick，P5 为 `round((760+(N-1)×70)×0.06)` tick。N=1/3/5 标准合计 312/440/569 tick（5200/7333/9483ms），reduced 合计 129/173/217 tick（2150/2883/3617ms）。动画表现不是权威结果；同输入保证相同装配顺序，不保证图像网络可用性。

真实 P5 终态一旦确定，`natural` / `skipped` 结果固定。`complete` 遇到 rejected、超时或异常时仍保留该终态与同一输出，允许用户或应用重试；宿主继续按 `presentationId` 幂等处理。

## 9. 展示资源与降级

`faceImageUrl` 与 `alt` 仅影响展示。正式输入 URL 必须 HTTPS、无用户名/密码，并由图片服务器允许跨域读取。`pack.front`、`pack.back`、`pack.tearTop`、`pack.tearBody`、五张本地 preview 与 `card.fallback` 已随包内 AssetIndex 闭包；宿主远程卡面不打进包。包内关键图（`pack.front`、`pack.tearTop`、`pack.tearBody`、`card.fallback`）与 SDK 初始化并行预取；正式局不预载 `pack.back` 或 preview 图，preview 只加载本次会用到的 N 张。正式局在稳定卡面 key 的 fallback 可绘制后即开始 P2，宿主卡面作为候选并行加载；进入 P3 第一帧或玩家跳过之前，同步冻结每张已成功的真图，其余逐张保留 fallback。冻结后晚到的图片不热替换；单张图片网络、跨域或加载失败不阻塞演出。包内关键图或 fallback 加载失败则停止演出，不伪造 `viewed`。预览始终只用包内卡面。

## 10. 错误处理

| 错误 | App 行为 | 调用方行为 |
|---|---|---|
| 输入合同、版本或数据不匹配 | 拒绝启动并 requestExit | 修正调用，不自动结算 |
| complete rejected/timeout | 保留终局和同一输出；不显示 App 对话框，`Space` / `Enter` 重试；在途请求不并发重发 | 查询原 session 状态，按 `presentationId` 幂等，禁止重复发奖 |
| 单张 HTTPS 卡面加载失败 | 仅该卡显示包内 fallback，保序继续 | 检查 URL/CORS；不改变抽卡结果 |
| 包内包装或 fallback 缺失 | 停止演出、requestExit，不显示错误对话框、不发送 viewed | 修复包闭包；不自动结算 |
| apps.launch 错误 | 不启动目标 App | 按错误码提示或降级 |

## 11. 安全与隐私边界

App 不读取宿主 Cookie、token、背包或内部 HTTP，不直接写数据库、奖励、关系、任务或剧情状态。无 scope/module。外部展示图仅限合同内显式 HTTPS 地址；不从 URL 读取规则事实。必需本地资源由 AssetIndex 闭包随包提供。

## 12. 上线前核对清单

1. App ID、合同名、版本与 manifest 一致。
2. 第 3 章 JSON 数据由真实 parser 接受。
3. 独立复验 P5 终态、natural、skipped、cancelled 与完成失败重试；空 `{}`/`?preview=1` 不得 complete。
4. 宿主运行时校验输出并按 `presentationId` 幂等处理。
5. 权威奖励/存档只由宿主写入。
6. `build`、`verify:dist`、SHA 与文档/资产闭包均通过；在真实子路径核资源与 SDK 通信，未完成宿主见证前不安装/发布。

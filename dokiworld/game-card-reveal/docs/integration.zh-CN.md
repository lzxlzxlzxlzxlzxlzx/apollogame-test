# 星辉启封调用说明

本文面向调用 `game-card-reveal` 的 DokiWorlds 程序员。App 只演出宿主已结算的 1–5 张有序卡牌，不抽卡、不发奖、不修改卡牌。v2 仅对齐当前 `CardPackOpening` 的封包及其中 `<CardFace card={card} showWorld={false} />` 的卡牌，不覆盖收藏/交易页。当前 DokiWorlds 调用代码仍发送 v1；双方同步前不得将 v2 包直接替换线上旧包。

## 1. 应用身份

| 项目 | 固定值 |
|---|---|
| App ID | `game-card-reveal` |
| 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.card-reveal-input` v2 |
| 输出合同 | `doki.game.card-reveal-result` v1 |
| requiredScopes / optionalScopes / modules | 均无 |

## 2. 宿主调用

```ts
const presentationId = cards[0].id // 与已提交的奖励批次稳定关联
const launched = await client.apps.launch({
  appId: 'game-card-reveal',
  input: { contract: 'doki.game.card-reveal-input', version: 2, data: {
    presentationId, locale: 'zh-CN',
    pack: { packId: batch.packId, title: look.title,
      coverImageUrl: resolveHttps(look.cover) ?? null,
      titleLogoUrl: resolveHttps(look.titleLogo) ?? null },
    cards: cards.map((card) => ({ id: card.id, kind: card.kind, name: card.name,
      description: card.description, rarity: card.rarity,
      imageUrl: resolveHttps(card.imageUrl) ?? null, worldTitle: card.worldTitle })),
  } },
})
if (launched.status === 'completed') {
  // 校验输出 contract/version/data/presentationId，再按 presentationId 幂等处理。
} else {
  // cancelled：不当作已经观看，也不修改奖励。
}
```

`look` 必须沿用 `CardPackOpening.packLook` 的同一份解析结果，避免动画与原生结算画面取不同封面/Logo。`resolveHttps` 表示宿主将相对路径或 OSS 引用解析为可访问的绝对 HTTPS URL，不是 SDK API。宿主调用前已完成权威掉落，保留 batch 和 `presentationId` 用于重试；捕获 `apps.launch` 异常，查询原会话，不自动发奖。

## 3. APPS 调试面板

合同填 `doki.game.card-reveal-input`，版本填 `2`，数据框只粘贴 `data` 对象。空 `{}` 只进入内部 preview，绝不 `complete`。`?preview=1&settlement=1&cards=1..5` 是不访问线上数据的本地合成预览。

```json
{"presentationId":"preview-clear","locale":"zh-CN","pack":{"packId":"preview","title":"哈利·波特","coverImageUrl":"https://assets.example.test/covers/neon-harbor-preview.webp","titleLogoUrl":null},"cards":[{"id":"preview-clear","kind":"event","name":"哈利·波特 · 通关纪念","description":"完成全部主线","rarity":"epic","imageUrl":"https://assets.example.test/covers/neon-harbor-preview.webp","worldTitle":"哈利·波特"}]}
```

文字和图片文件名取自 DokiWorlds `frontend/tests/browser/layout/settlement.tsx`；`assets.example.test` 是结构示意域名，不是生产图片地址。真实测试必须替换为宿主可访问的 HTTPS URL。

## 4. 输入合同

完整 envelope：

```json
{"contract":"doki.game.card-reveal-input","version":2,"data":{"presentationId":"preview-clear","locale":"zh-CN","pack":{"packId":"preview","title":"哈利·波特","coverImageUrl":"https://assets.example.test/covers/neon-harbor-preview.webp","titleLogoUrl":null},"cards":[{"id":"preview-clear","kind":"event","name":"哈利·波特 · 通关纪念","description":"完成全部主线","rarity":"epic","imageUrl":"https://assets.example.test/covers/neon-harbor-preview.webp","worldTitle":"哈利·波特"}]}}
```

### 4.1 字段约束

| 路径 | 类型 | 必填 | 约束、语义 | 非法时行为 |
|---|---|---:|---|---|
| `data.presentationId` | string | 是 | 长度 1–128，稳定幂等关联 | 拒绝会话 |
| `data.locale` | `zh-CN` / `en` | 否 | 默认 `zh-CN`，仅展示标签 | 拒绝未知值 |
| `data.pack` | object | 是 | 结算封包外观事实 | 拒绝会话 |
| `data.pack.packId` | string | 是 | 长度 1–128，不用于发奖 | 拒绝会话 |
| `data.pack.title` | string | 是 | 长度 1–255，Logo 缺失时显示 | 拒绝会话 |
| `data.pack.coverImageUrl` | HTTPS URL / null | 是 | URL 最长 2048、无账号密码；null/失败时无图包装 | 拒绝非 HTTPS |
| `data.pack.titleLogoUrl` | HTTPS URL / null | 是 | 同上；null/失败时显示标题 | 拒绝非 HTTPS |
| `data.cards` | array | 是 | 长度 1–5，原顺序即演出顺序 | 拒绝会话 |
| `data.cards[i].id` | string | 是 | 长度 1–128，批内唯一 | 拒绝会话 |
| `data.cards[i].kind` | `event` / `skill` / `item` | 是 | 按结算 CardFace 决定构图 | 拒绝未知值 |
| `data.cards[i].name` | string | 是 | 长度 1–255 | 拒绝会话 |
| `data.cards[i].description` | string | 是 | 长度 0–2000 | 拒绝会话 |
| `data.cards[i].rarity` | string | 是 | 长度 1–40；未知值按普通外观降级 | 拒绝会话 |
| `data.cards[i].imageUrl` | HTTPS URL / null | 是 | URL 规则同封面；null/失败时无图卡 | 拒绝非 HTTPS |
| `data.cards[i].worldTitle` | string | 是 | 长度 1–255；description 空时显示兜底 | 拒绝会话 |

每级对象均为闭集普通对象，未知字段拒收；UTF-8 `data` JSON 不超过 64 KiB。URL 只在表现层使用，不进入世界快照、随机判定或输出。`frame/layout/artFit` 不由宿主传，避免与当前结算组件双重决定样式。

### 4.2 规则与计算顺序

先验合同/版本与字节上限，再验字段、数量、唯一 ID 和 URL；按宿主顺序装配。App 不重新判定卡牌、稀有度或奖励。v2 将内容合成完整可运动的视觉纹理，再交给原 P2–P5 轨道。自然/跳过均落同一个真实 P5 终态。

### 4.3 非法输入

缺字段、类型/枚举错误、重复 ID、过长文本、非 HTTPS、账号密码 URL、未知字段和过大 payload 均拒绝加载并请求退出，不能伪造 `viewed`。旧 v1 解析器只供本地兼容测试；manifest 对外声明 v2，不能用旧 v1 正式联调。

## 5. 输出合同

自然完成：

```json
{"contract":"doki.game.card-reveal-result","version":1,"data":{"presentationId":"preview-clear","outcome":"viewed","completion":"natural"}}
```

主动跳过并落真实 P5 后：

```json
{"contract":"doki.game.card-reveal-result","version":1,"data":{"presentationId":"preview-clear","outcome":"viewed","completion":"skipped"}}
```

### 5.1 字段约束

| 路径 | 类型 | 存在条件 | 含义 | 宿主处理 |
|---|---|---|---|---|
| `data.presentationId` | string | 始终 | 原输入幂等 ID | 与待处理批次比对 |
| `data.outcome` | `viewed` | 始终 | 已到真实 P5 | 校验，不作为掉落判定 |
| `data.completion` | `natural` / `skipped` | 始终 | 观看方式 | 记录，不能重复发奖 |

## 6. 完成、失败与取消

| 场景 | SDK 结果 | 是否产生业务结果 |
|---|---|---:|
| 真实 P5 自然终态 | completed + `viewed/natural` | 是 |
| 跳过并落真实 P5 | completed + `viewed/skipped` | 是 |
| 玩家关闭/App requestExit | cancelled | 否 |
| 输入非法、关键包内资产缺失、刷新、断线 | 错误或取消 | 否 |
| 空数据/本地 preview | 不调用 complete | 否 |

本 App 没有业务失败 outcome。`accepted` 后永久锁定；rejected/异常/timeout 只能重发同一份冻结输出。`Space` / `Enter` 跳过或重试，`Esc` 请求退出；App 不显示可见控制条。

## 7. 权威结算与幂等

宿主保存已提交的奖励批次与待演出 session，以 `presentationId` 去重，在自己的幂等事务中处理奖励、存档、剧情和消耗。App 无随机 seed，不写数据库，只交观看回执。取消、超时或校验失败不凭 App 回执新增奖励。

## 8. 随机、时间与可重演性

App 不抽卡、不重排。P2–P5 沿用 60 Hz 正式轨道；网络图片到达时刻只影响外观候选，进入 P3 第一帧或跳过前冻结，晚到的不热替换。动画不是权威业务结果。同输入保持实例顺序和完成语义，但远程图像未必成功加载。

## 9. 展示资源与降级

`coverImageUrl/titleLogoUrl/imageUrl` 均 render-only。封面/Logo 失败时分别退为暗色包装/标题文字；卡图失败或缺失时显示有文字和框的无图卡，单卡降级不改顺序。包内 `pack.front/pack.tearTop/pack.tearBody/card.fallback` 缺失则请求退出。远程图片只绘入显示用画布，不作像素读回；跨源画布可能 tainted，不能依赖 App canvas 导出图像。长期复查的签名图应保存经授权的固定 QA 字节，不能只存过期 URL。

## 10. 错误处理

| 错误 | App 行为 | 调用方行为 |
|---|---|---|
| 输入/版本/字段不匹配 | 拒绝启动并 requestExit | 按 v2 修正，不自动结算 |
| complete rejected/timeout | 保留终局、键盘可重试同结果 | 查询原 session，避免重复处理 |
| 单个外部图片失败 | 使用对应无图外观，继续播放 | 核 URL/防盗链，不改掉落 |
| 包内关键图/2D 合成能力缺失 | requestExit，不发送 viewed | 修复 App 包 |
| apps.launch 异常 | 无有效 App 结果 | 查询或重试原 session |

## 11. 安全与隐私边界

App 不读取 Cookie、token、背包或宿主内部 HTTP，不直接写奖励、关系、任务或存档。无 scope/module。外部请求仅限 v2 输入显式提供的 HTTPS 展示图；视觉 URL 不作为业务事实。

## 12. 上线前核对清单

1. DokiWorlds `CardPackOpening` 组装 v2，并与本 manifest/文档版本一致；不得用旧 v1 调用新包。
2. 调试面板 data 通过真实 parser；实际 HTTPS 图片可显示且签名未过期。
3. 封包与拆包后卡牌同画布截图对照当前结算组件，记录未裁决偏差。
4. 独立复验 natural、skipped、cancelled、失败重试、1–5 张与缺图；preview 不 complete。
5. `build`、`verify:dist`、资产闭包、假宿主及目标 DokiWorld 子路径通过，再由 owner 决定安装/发布。

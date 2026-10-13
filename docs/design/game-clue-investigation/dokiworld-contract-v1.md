# 《现场搜证》DokiWorld 调用合同 v1（S2 冻结稿）

> 本文按 DokiWorld 标准中文调用说明模板编写。宿主动态视觉桥 `REQ-ENG-HOST-VISUAL-HIT-MASK` 已完成施工自检和非施工者独立复查，本文字段、预算、权威与终局语义据此冻结为 S2 设计合同。它仍不是 S7 发布调用说明；正式 parser、schema 3 manifest、SDK 宿主测试与 dist 副本必须在后续阶段逐字实现并复验。

本文面向调用 `game-clue-investigation` 的 DokiWorld 程序员。玩家调查宿主给出的静态现场并收录线索；App 只返回本局发现结果，不读取或修改宿主的知识、任务、奖励、背包、剧情或数据库。

## 1. 应用身份

| 项目 | 固定值 |
|---|---|
| App ID | `game-clue-investigation` |
| 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.clue-investigation-input` v1 |
| 输出合同 | `doki.game.clue-investigation-result` v1 |
| requiredScopes | 无，`[]` |
| optionalScopes | 无，`[]` |
| modules | 无，`[]` |

## 2. 宿主调用

```ts
const launched = await client.apps.launch({
  appId: 'game-clue-investigation',
  input: {
    contract: 'doki.game.clue-investigation-input',
    version: 1,
    data: investigationData,
  },
})

if (launched.status === 'completed') {
  const output = parseClueInvestigationOutput(launched.output)
  await settleInvestigationOnce(output.data.requestId, output.data)
} else {
  // cancelled：不结算，也不当作调查失败。
}
```

调用方须先保存待处理的 `requestId`，在自身 ready 后调用，捕获 SDK 异常，并在 `completed` 后再次严格校验输出。相同 `requestId` 只允许结算一次；不能仅凭 iframe 关闭、客户端文字或动画状态写业务结果。

## 3. APPS 调试面板

合同填 `doki.game.clue-investigation-input`，版本填 `1`。数据框只粘贴 `data` 内部对象，不再包 `contract/version/data`。空 `{}` 只进入包内 preview：不请求宿主 URL、不调用 `complete()`、不产生可结算结果。

调试面板数据示例与下一节 `data` 完全相同。

## 4. 输入合同

```json
{
  "contract": "doki.game.clue-investigation-input",
  "version": 1,
  "data": {
    "requestId": "req-archive-007",
    "investigationId": "archive-room-007",
    "title": "雨夜档案室",
    "objective": "找出入侵者留下的一项必要证物。",
    "background": {
      "imageUrl": "https://assets.example.test/archive-room.png",
      "alt": "雨夜中的旧档案室",
      "pixelWidth": 1440,
      "pixelHeight": 900
    },
    "objects": [
      {
        "objectId": "broken-latch",
        "kind": "clue",
        "required": true,
        "name": "破损窗锁",
        "description": "窗锁被从内侧撬动。",
        "sceneImage": {
          "imageUrl": "https://assets.example.test/broken-latch.png",
          "alt": "破损的窗锁",
          "pixelWidth": 320,
          "pixelHeight": 240
        },
        "evidenceImage": {
          "imageUrl": "https://assets.example.test/broken-latch-evidence.png",
          "alt": "破损窗锁的证物特写",
          "pixelWidth": 1024,
          "pixelHeight": 768
        },
        "placement": {
          "x": 0.135,
          "y": 0.411,
          "width": 0.072,
          "height": 0.14,
          "zIndex": 20,
          "fit": "contain",
          "anchorX": 0.5,
          "anchorY": 0.5,
          "rotation": 0
        },
        "hitMask": {
          "encoding": "bitset-hex-msb",
          "width": 8,
          "height": 6,
          "rows": ["3c", "7e", "ff", "ff", "7e", "3c"]
        }
      }
    ]
  }
}
```

### 4.1 字段约束

未知额外键一律拒绝。所有 string 按 JavaScript 字符串长度计，均禁止空串；三个 ID 字段只接受 ASCII `[A-Za-z0-9_-]`，不做 Unicode 归一化，调用方必须发送稳定、逐字一致的值。该限制保证 `requestId` 可直接作为会话 key、`objectId` 可直接进入临时 texture/mask key，不需要游戏层另写映射器。

| 路径 | 类型 | 必填 | 约束、默认值与语义 | 非法时行为 |
|---|---|---:|---|---|
| `data.requestId` | string | 是 | 1–128；只允许 `[A-Za-z0-9_-]+`；本次调用与宿主幂等键及桥 session id | 拒绝会话 |
| `data.investigationId` | string | 是 | 1–128；只允许 `[A-Za-z0-9_-]+`；宿主调查定义的稳定 ID | 拒绝会话 |
| `data.title` | string | 是 | 1–80；仅展示 | 拒绝会话 |
| `data.objective` | string | 是 | 1–240；仅展示 | 拒绝会话 |
| `data.background` | closed object | 是 | 只允许表列字段；render-only | 拒绝会话 |
| `data.background.imageUrl` | HTTPS PNG URL | 是 | 无用户名/密码；pathname 以 `.png` 结尾；最长 2048 | 拒绝会话 |
| `data.background.alt` | string | 是 | 1–120 | 拒绝会话 |
| `data.background.pixelWidth` | integer | 是 | 1–8192；必须与解码结果一致 | 拒绝/资源失败退出 |
| `data.background.pixelHeight` | integer | 是 | 1–8192；必须与解码结果一致 | 拒绝/资源失败退出 |
| `data.objects` | array | 是 | 1–12；顺序用于同 zIndex 的稳定 tie-break；`objectId` 唯一 | 拒绝会话 |
| `data.objects[].objectId` | string | 是 | 1–128；只允许 `[A-Za-z0-9_-]+`；局内唯一并直接进入临时资产 key | 拒绝会话 |
| `data.objects[].kind` | enum | 是 | `flavor` 或 `clue` | 拒绝会话 |
| `data.objects[].required` | boolean | 是 | `flavor` 必须为 false；至少一个 `clue` 为 true | 拒绝会话 |
| `data.objects[].name` | string | 是 | 1–80；仅展示 | 拒绝会话 |
| `data.objects[].description` | string | 是 | 1–400；仅展示 | 拒绝会话 |
| `data.objects[].sceneImage` | closed object | 是 | 动态场景 PNG；字段同 background image | 拒绝会话 |
| `data.objects[].sceneImage.imageUrl` | HTTPS PNG URL | 是 | 无用户名/密码；pathname 以 `.png` 结尾；最长 2048；render-only | 拒绝会话 |
| `data.objects[].sceneImage.alt` | string | 是 | 1–120 | 拒绝会话 |
| `data.objects[].sceneImage.pixelWidth` | integer | 是 | 1–4096；必须与解码结果一致 | 拒绝/资源失败退出 |
| `data.objects[].sceneImage.pixelHeight` | integer | 是 | 1–4096；必须与解码结果一致 | 拒绝/资源失败退出 |
| `data.objects[].evidenceImage` | closed object | clue 是；flavor 禁止 | 仅 `imageUrl`、`alt`、`pixelWidth`、`pixelHeight`；render-only | 拒绝会话 |
| `data.objects[].evidenceImage.imageUrl` | HTTPS PNG URL | clue 是 | 无用户名/密码；pathname 以 `.png` 结尾；最长 2048 | 拒绝会话 |
| `data.objects[].evidenceImage.alt` | string | clue 是 | 1–120 | 拒绝会话 |
| `data.objects[].evidenceImage.pixelWidth` | integer | clue 是 | 1–4096；必须与解码结果一致 | 拒绝/资源失败退出 |
| `data.objects[].evidenceImage.pixelHeight` | integer | clue 是 | 1–4096；必须与解码结果一致 | 拒绝/资源失败退出 |
| `data.objects[].placement.x/y` | finite number | 是 | 各为 0–1；表示锚点的归一化画布坐标 | 拒绝会话 |
| `data.objects[].placement.width/height` | finite number | 是 | 各为 `(0,1]`；投影后必须与画布有交集 | 拒绝会话 |
| `data.objects[].placement.zIndex` | integer | 是 | 0–255；高值优先；相同按输入顺序稳定裁决 | 拒绝会话 |
| `data.objects[].placement.fit` | enum | 是 | `contain` 或 `cover` | 拒绝会话 |
| `data.objects[].placement.anchorX/Y` | finite number | 是 | 各为 0–1 | 拒绝会话 |
| `data.objects[].placement.rotation` | number literal | 是 | v1 只能为 `0` | 非零严格拒绝 |
| `data.objects[].hitMask.encoding` | literal | 是 | 只能为 `bitset-hex-msb`；每行自左向右高位优先 | 拒绝会话 |
| `data.objects[].hitMask.width/height` | integer | 是 | 各 1–256；宽高比须与 sceneImage 原生尺寸相同 | 拒绝会话 |
| `data.objects[].hitMask.rows` | hex string array | 是 | 长度必须等于 height；每行恰为 `ceil(width/4)` 个小写十六进制字符；末尾未使用 bit 必须为 0 | 拒绝会话 |

附加总预算：全部 mask 的 `width × height` 总和不超过 131072；整个输入 envelope 经 UTF-8 JSON 序列化不得超过 SDK 的 64 KiB。URL、mask、图片字节均不进入 World、snapshot、hash 或输出。

### 4.2 规则与计算顺序

1. 严格校验 envelope、闭集字段、交叉约束、64 KiB 与 mask 总预算。
2. 在创建 World 前并行加载背景、场景物件和证物图；结果按输入顺序提交，加载完成先后不改变对象顺序。
3. 校验声明像素尺寸；为每个物件生成局内临时 texture/mask key。任何必需资源失败都不创建可玩的 World。
4. 点击统一投影到 1440×900 逻辑画布；按 `zIndex` 与输入顺序选候选，再用与 Sprite 相同的 contain/cover/anchor 逆映射采样 mask。透明位拒收，实心位发具名调查 Signal。
5. `flavor` 只写 viewed；未收录 clue 首次写 collected，`required:true` 才把必需进度加一；重复 clue 只回看。
6. 全部必需 clue 首次收录后锁定唯一成功结果。App 不重新解释宿主任务、奖励或剧情。

没有随机消费；相同合法输入与相同玩家动作序列得到相同收录顺序和输出。网络加载时序、动画帧率和图片字节不参与规则裁决。

### 4.3 非法输入

合同/版本不匹配、缺字段、额外键、类型/范围/交叉约束错误、重复 ID、payload 超限均显示配置错误并 `requestExit()`，不调用 `complete()`。图片 CORS、解码、尺寸或 mask 校验失败属于技术/资源错误，同样不产生业务结果；不得退化为扩大矩形热点。

## 5. 输出合同

唯一合法业务终局：

```json
{
  "contract": "doki.game.clue-investigation-result",
  "version": 1,
  "data": {
    "requestId": "req-archive-007",
    "investigationId": "archive-room-007",
    "outcome": "completed",
    "collectedObjectIds": ["broken-latch"]
  }
}
```

### 5.1 字段约束

| 路径 | 类型 | 存在条件 | 含义 | 宿主处理 |
|---|---|---|---|---|
| `data.requestId` | string 1–128 | 始终 | 原样回显输入幂等键 | 核对待处理请求并去重 |
| `data.investigationId` | string 1–128 | 始终 | 原样回显调查 ID | 核对调用上下文 |
| `data.outcome` | literal `completed` | 始终 | 全部必需线索已首次收录 | 允许进入成功结算 |
| `data.collectedObjectIds` | unique string array | 始终 | 所有已收录 clue 的 objectId，按首次收录顺序；至少包含全部 required clue | 校验为输入 clue 子集后映射宿主效果 |

输出拒绝未知键、重复 ID、非 clue ID、缺失必需 clue、错合同或错版本。

## 6. 完成、失败与取消

| 场景 | SDK 结果 | 是否产生业务结果 |
|---|---|---:|
| 全部必需 clue 首次收录且 complete 被接受 | completed + `outcome:"completed"` | 是 |
| 玩家关闭/返回 | cancelled | 否 |
| App 主动退出 | cancelled | 否 |
| 输入非法、资源失败 | 配置错误后 requestExit / cancelled | 否 |
| iframe 卸载、刷新、断线、SDK 异常 | cancelled 或异常 | 否 |

本合同没有业务失败结果。主动退出、技术错误和资源失败都不能扣除失败代价。

## 7. 权威结算与幂等

宿主在 launch 前保存待处理 `requestId`，并拥有调查定义、知识、任务、奖励、存档和剧情的唯一权威。App 无 seed、无随机、无数据库写入，只返回最终发现回执。宿主必须校验 output、确认 `requestId/investigationId` 匹配，并在单个幂等事务中结算；cancelled、超时、资源失败和输出校验失败均不结算。

## 8. 随机、时间与可重演性

本 App 不使用随机。规则只由严格输入、具名 Signal 和确定性状态转移决定；固定 tick 演出、网络完成顺序与实际帧时间不改变输出。相同输入与相同按序玩家动作可重演为相同结果；宿主仍是业务最终权威。

## 9. 展示资源与降级

`background`、`sceneImage`、`evidenceImage`、名称、描述与 alt 均为展示输入；图片只允许 HTTPS 无凭据 URL，并需服务器允许跨域加载。正式局任何合同图片、尺寸或 mask 失败都 fail-closed 并取消，不以包内图替代后继续结算，因为 fallback 无法证明与宿主 mask 对应。空 data preview 只使用包内演示素材且永不 complete。

## 10. 错误处理

| 错误 | App 行为 | 调用方行为 |
|---|---|---|
| 输入合同/字段不匹配 | 显示配置错误并 requestExit | 修正调用，不结算 |
| URL/CORS/解码/尺寸/mask 失败 | 显示资源错误并 requestExit | 修复资源，不结算 |
| complete rejected/timeout | 保留锁定终局并提示 | 查询原 `requestId` 状态，禁止重复发奖 |
| apps.launch 抛错 | App 未形成业务终局 | 记录错误并允许安全重试同一待处理请求 |

## 11. 安全与隐私边界

- App 不读取宿主 Cookie、token、角色、背包或内部 HTTP，也不直接写数据库。
- 动态 URL 和图片只进入渲染侧临时资产管理；World、snapshot、hash、Signal 和 output 不含 URL、图片字节或密钥。
- mask 是有界纯数据，不允许可执行压缩、data URL 或运行期 Canvas alpha 读取。
- requiredScopes、optionalScopes、modules 均为空。

## 12. 上线前核对清单

1. App ID、合同名和版本与 schema 3 manifest 完全一致。
2. 本文示例通过真实严格 parser；额外键、越界和 64 KiB 有拒绝测试。
3. 动态视觉桥施工自检与非施工者独立复查 PASS。
4. preview 零远程请求且永不 complete；completed/cancelled/error 分支均有宿主测试。
5. 输出再次严格校验，并以 `requestId` 幂等结算。
6. World/snapshot/hash/output 无 URL、图片字节或 mask payload。
7. 文档、manifest、源码常量、测试 fixture 与 dist 副本逐字一致。

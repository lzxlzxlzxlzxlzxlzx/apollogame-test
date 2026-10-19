# 现场搜证调用说明

本文面向在 DokiWorld 中调用 `game-clue-investigation` 的程序员。宿主提供一张现场背景、1–12 个带位置和预烘焙像素蒙版的场景物件，以及调查文案；App 使用实际 PNG 轮廓接受点击，收录全部必要线索后只回传一次结果。App 不解释宿主知识、任务、奖励或剧情，也不访问宿主数据库。

## 1. 应用身份

| 项目 | 固定值 |
|---|---|
| App ID | `game-clue-investigation` |
| App 版本 | `0.2.1` |
| 协议 | `dokiworld.app/2` |
| Manifest schema | `3` |
| 输入合同 | `doki.game.clue-investigation-input` v1 |
| 输出合同 | `doki.game.clue-investigation-result` v1 |
| requiredScopes / optionalScopes / modules | 均为空数组 |

## 2. 宿主调用

调用方先创建并保存本次唯一 `requestId` 与稳定 `investigationId`，再从已就绪的 DokiWorld SDK 启动 App。App 完成后宿主必须再次严格校验 output，并以 `requestId` 幂等结算；同一 request 不能重复发奖。

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
  if (output.data.requestId !== investigationData.requestId) throw new Error('requestId mismatch')
  await settleInvestigationOnce(output.data.requestId, output.data)
} else {
  // cancelled：不结算，也不视为游戏失败。
}
```

`launch()` 抛错、超时或返回 `cancelled` 都不产生业务结果。宿主负责保存待处理 request，并由自己拥有的事务/幂等表决定是否已结算。

## 3. APPS 调试面板

面板合同填 `doki.game.clue-investigation-input`，版本填 `1`。如果调试面板的数据框只收 data 内部对象，就粘贴第 4 节示例的 `data`；不要再包 `contract/version/data`。空对象 `{}` 只显示 Preview 握手说明：不请求图片、不启动可结算调查、不调用 `complete()`。请用完整非空示例测试正式图片与输入。

## 4. 输入合同

SDK envelope 与 APPS 面板 data 示例：

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

未知字段一律拒绝。所有字符串禁止空串；长度按 JavaScript UTF-16 code units 计算。ID 字段只允许 ASCII `[A-Za-z0-9_-]`，不做 Unicode 归一化。数字必须是有限数；整数必须为安全整数。

| 路径 | 类型 | 必填 | 约束、默认值与语义 | 非法时行为 |
|---|---|---:|---|---|
| envelope `contract` | string | 是 | 固定 `doki.game.clue-investigation-input` | 拒绝并退出 |
| envelope `version` | integer | 是 | 固定 `1` | 拒绝并退出 |
| `data.requestId` | ID | 是 | 1–128；单次调用幂等键 | 拒绝并退出 |
| `data.investigationId` | ID | 是 | 1–128；宿主定义的稳定调查 ID | 拒绝并退出 |
| `data.title` | string | 是 | 1–80；case 玩家可见名称，只展示 | 拒绝并退出 |
| `data.objective` | string | 是 | 1–240；调查目标，只展示，不参与完成判定 | 拒绝并退出 |
| `data.background` | image | 是 | 见下方 image 字段；PNG 1–8192 px/边，只作背景 | 拒绝并退出 |
| `data.objects` | array | 是 | 1–12 项；objectId 唯一；至少一项为 `kind=clue && required=true`；数组顺序为同 zIndex 稳定顺序 | 拒绝并退出 |
| `objects[].objectId` | ID | 是 | 1–128；局内唯一 | 拒绝并退出 |
| `objects[].kind` | enum | 是 | `clue` 可收录线索；`flavor` 普通调查物 | 拒绝并退出 |
| `objects[].required` | boolean | 是 | `flavor` 必须为 false；required clue 才计入完成目标 | 拒绝并退出 |
| `objects[].name` | string | 是 | 1–80；物件名称及线索清单文本 | 拒绝并退出 |
| `objects[].description` | string | 是 | 1–400；点击后显示；clue 收录后再次展示 | 拒绝并退出 |
| `objects[].sceneImage` | image | 是 | 物件场景 PNG，1–4096 px/边；作为可见精灵 | 拒绝并退出 |
| `objects[].evidenceImage` | image | clue 必填；flavor 禁止 | 线索特写 PNG，1–4096 px/边；不作为热点 | 拒绝并退出 |
| `objects[].placement.x/y` | number | 是 | `[0,1]`；逻辑画布 1440×900 上的锚点归一化位置 | 拒绝并退出 |
| `objects[].placement.width/height` | number | 是 | `(0,1]`；逻辑画布上的归一化显示尺寸，必须与画布有交集 | 拒绝并退出 |
| `objects[].placement.zIndex` | integer | 是 | 0–255；越大越靠前；同层按输入顺序稳定排序 | 拒绝并退出 |
| `objects[].placement.fit` | enum | 是 | `contain` 保留完整图片；`cover` 裁切填满显示框 | 拒绝并退出 |
| `objects[].placement.anchorX/anchorY` | number | 是 | `[0,1]`；精灵锚点归一化位置 | 拒绝并退出 |
| `objects[].placement.rotation` | number | 是 | v1 固定为 `0`；非零旋转拒绝，不退化为方框 | 拒绝并退出 |
| `objects[].hitMask.encoding` | literal | 是 | 固定 `bitset-hex-msb`；每行从左至右，高位在前 | 拒绝并退出 |
| `objects[].hitMask.width/height` | integer | 是 | 各 1–256；宽高比须与 sceneImage 像素尺寸一致 | 拒绝并退出 |
| `objects[].hitMask.rows` | string[] | 是 | 长度等于 height；每行恰为 `ceil(width/4)` 个小写 hex 字符；未使用末尾 bit 必须为 0 | 拒绝并退出 |

所有 image 对象恰含 `imageUrl/alt/pixelWidth/pixelHeight`：URL 长度 1–2048；正式环境只允许无用户名/密码、无 fragment 的 HTTPS `.png`。本机调试时，如果 App 页面自身正运行于 `http://127.0.0.1`，也允许图片 URL 使用 `http://127.0.0.1:<port>/...png`；不接受 `localhost`、其它 IP、凭据、fragment 或非 PNG。`alt` 长度 1–120；声明尺寸必须与解码 PNG 相同。图片服务器须允许跨域读取，重定向后仍须留在 `127.0.0.1` 且为 PNG。

本机 DokiWorld 测试可以把 `imageUrl` 写成实际本地静态服务器地址，例如 `http://127.0.0.1:4173/art/scene.png`。请将 `4173` 和路径替换为你本机真实提供 PNG 的端口与路径；图片服务必须对 `http://127.0.0.1:5173` 返回 CORS 许可（例如 `Access-Control-Allow-Origin: http://127.0.0.1:5173`）。若 App 是从 HTTPS、`localhost` 或其他主机打开，则不会启用此调试例外。不要把 loopback HTTP 地址用于正式环境或上传配置。

线索数量不单独传递：必要线索总数由 `kind=clue && required=true` 自动计算，避免和 objects 数组互相矛盾。全部 hitMask 位数总和最多 131072；完整序列化 envelope 的 UTF-8 大小最多 64 KiB。

### 4.2 规则与计算顺序

1. 严格校验 envelope、字段闭集、范围、交叉约束、mask 与 64 KiB 预算。
2. 创建可玩 World 前加载背景、每个 sceneImage 和每个 evidenceImage，校验 PNG/CORS/解码尺寸；任何失败都不开始调查。
3. sceneImage 与 hitMask 通过通用 `HostVisualSession` 同源绑定；热点按精灵实际 cover/contain 与 anchor 逆映射采样蒙版。透明像素不命中，不能扩大为矩形。
4. 按点击物件类型显示调查文本。flavor 不增加线索进度；clue 首次收录才记录，required clue 首次收录增加必要进度，重复收录不重复增加。
5. 全部必要线索首次收录后锁定唯一成功终态。输出中列出所有已收录 clue（包括可选线索），顺序为玩家首次收录顺序。

不使用随机。图片加载时序与动画帧率不改变玩法判定或线索顺序。

### 4.3 非法输入

合同/版本错误、缺字段、额外字段、类型或范围错误、重复 ID、mask 错误及 payload 超限均显示配置错误并 `requestExit()`；图片 CORS、解码或尺寸失败同样拒绝启动。上述情况均不得调用 `complete()`，不得伪造成“调查失败”。

## 5. 输出合同

唯一业务终局是所有必要线索首次收录后的 `completed`：

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
| envelope `contract` | string | 始终 | 固定 `doki.game.clue-investigation-result` | 必须核对 |
| envelope `version` | integer | 始终 | 固定 `1` | 必须核对 |
| `data.requestId` | ID | 始终 | 原样回显本次输入 requestId | 校验待处理请求并去重 |
| `data.investigationId` | ID | 始终 | 原样回显本次调查 ID | 校验调用上下文 |
| `data.outcome` | literal | 始终 | 固定 `completed`；无其他业务 outcome | 允许进入成功结算 |
| `data.collectedObjectIds` | unique ID[] | 始终 | 已收录 clue 的 objectId，按首次收录顺序；必须包含全部 required clue，可包含已收录 optional clue；不得包含 flavor | 校验为输入 clue 子集，并以 requestId 幂等结算 |

输出拒绝未知字段、重复 ID、非 clue ID、缺少必要 clue、错误合同/版本或与当前请求不匹配的 ID。

## 6. 完成、失败与取消

| 场景 | SDK 结果 | 是否产生业务结果 |
|---|---|---:|
| 全部必要 clue 首次收录且 `complete()` 被接受 | `completed` + 合法结果合同 | 是 |
| App 内没有业务失败终局 | 不适用；合同没有 failure outcome | 否 |
| 玩家关闭/返回或 App `requestExit()` | `cancelled` | 否 |
| 输入非法或资源加载失败 | 显示配置错误并 `requestExit()` | 否 |
| iframe 卸载、刷新、断线、SDK 异常 | `cancelled` 或异常 | 否 |
| `complete()` rejected/未确认 | 保持终态，不重复提交 | 未确认；宿主不得重复发奖 |

## 7. 权威结算与幂等

1. 宿主在 launch 前生成并保存待处理 `requestId`，并拥有调查定义与业务状态。
2. 本游戏无随机种子，也不读取宿主存档或内部 API。
3. App 只提交完成回执；不是知识、奖励或剧情裁决者。
4. 宿主必须校验 requestId、investigationId、clue ID 集合与必需线索，并以 requestId 在单个幂等事务中最多结算一次。
5. 奖励、消耗、存档、任务和剧情均由宿主写入。
6. cancelled、超时、资源错误、output 校验失败与未确认的 complete 均不结算。

## 8. 随机、时间与可重演性

本 App 不使用随机。给定相同合法输入与相同玩家操作顺序，线索首次收录顺序一致；宿主可以根据操作记录重演，但动画时序不作为业务权威。图片内容只影响显示与蒙版命中，不进入业务 output。

## 9. 展示资源与降级

`background`、`sceneImage`、`evidenceImage`、名称、描述与 alt 都来自本次宿主调用。正式环境图像只允许无凭据 HTTPS PNG；仅本机 DokiWorld loopback 调试允许 `127.0.0.1` HTTP PNG。所有图片必须启用 CORS 并与声明像素尺寸一致。背景和特写不设热点；只有 sceneImage 配套 hitMask 能接收点击。正式局资源缺失或不匹配时 fail-closed 并退出，不用包内预览图代替后继续结算。空 data Preview 不访问宿主图片。

## 10. 错误处理

| 错误 | App 行为 | 调用方行为 |
|---|---|---|
| 输入 contract/version 不符 | 显示配置错误并 `requestExit()` | 修正调用，不结算 |
| 未知字段、越界、mask/payload 错误 | 拒绝建立可玩局并退出 | 修正输入，不结算 |
| URL 不符合 HTTPS/loopback 规则、CORS、解码或尺寸错误 | 显示资源错误并退出 | 修复资源，不结算 |
| SDK handshake 失败 | 显示连接错误并退出 | 按原 requestId 安全重试 |
| `complete()` rejected 或 Promise 异常 | 锁定唯一终态，不再次 `complete()` | 按 requestId 查询结算状态，禁止重复发奖 |
| 玩家关闭或刷新 | cancelled / 异常 | 不结算 |

## 11. 安全与隐私边界

- App 不读取宿主 Cookie、token、角色、背包、业务 API 或数据库。
- App 不直接写宿主状态、不发奖励、不推进剧情。
- 动态图像只用于临时渲染与 alpha hit-mask；URL、图像字节和 mask 行不进入 World、snapshot、hash 或 output。
- App 不使用随机，也不要求任何 scope/module。
- 正式环境只允许 HTTPS PNG；调试例外仅在 App 页面来自 `http://127.0.0.1` 时允许图片来自同一 loopback IP 的 HTTP PNG，且重定向不得离开 loopback。额外字段一律拒绝。

## 12. 上线前核对清单

1. App ID、schema 3、协议 `dokiworld.app/2`、输入输出合同和版本与 manifest 一致。
2. 本文完整输入示例由真实 parser 测试覆盖；边界、额外字段、重复 ID、预算与 mask 错误均有拒绝测试。
3. 空 data Preview 不请求远程图片、不启动可结算局、不调用 complete。
4. 正式局开始前所有图像均已校验；alpha 实形热点不允许矩形回退。
5. 必需线索完成、输出唯一性、首次收录顺序与 output 字段均经测试。
6. 宿主严格校验结果，并以 requestId 幂等结算；取消和技术错误不结算。
7. 包内调用文档、manifest、dist 副本及 SHA-256 清单一致；上传前还须完成真 dist、假宿主和子路径验收。

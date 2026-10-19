# OPT-CARD-REVEAL-LOAD-01 · 首帧与卡面装载优化

> 状态：complete（owner 2026-10-13 裁决 A；非施工人独立复查 PASS）  
> 施工主体：卡牌动画程序（本聊天 01a11f55-7618-7e22-926a-2e03e194369b）  
> 性质：现有 DokiWorld adapter / 资产装载能力的性能整改；不改变玩法、合同或冻结原型  
> 复查：施工完成后必须由非施工人独立复查
> 当前施工证据：[`../review/OPT-CARD-REVEAL-LOAD-01.md`](../review/OPT-CARD-REVEAL-LOAD-01.md)
> 独立复查：[`../review/OPT-CARD-REVEAL-LOAD-01-independent.md`](../review/OPT-CARD-REVEAL-LOAD-01-independent.md)

## 1. 事实与裁决

### 1.1 已证事实

- 当前 `main.ts` 在 `prepareCardArt()` 完整结束后才 `engine.start()`。
- `prepareCardArt()` 先通过 `loadGameArtInto()` 全量加载本地 AssetIndex，再等待 1–5 张宿主 HTTPS 卡面全部 settled，形成串行首帧门。
- 正式演出不消费 `pack.back`，也不消费 preview 卡，但现有 `loadAll()` 仍把它们纳入首帧加载。
- App 包总体积小于 `game-physics-dice`；因此“动画包太大”不是当前主要根因。
- SDK 使用 `whenReady({ timeoutMs: 10_000 })`，这只是初始化上限，不是固定等待。

### 1.2 架构裁决

- **接受**：把本地关键资产预取、宿主卡面加载和 P2 演出并行，减少首帧前空白等待。
- **接受**：为现有通用 `loadGameArtInto()` 增加可选的“只加载指定 key”能力；必须保持省略该选项时的旧行为完全不变，并补通用测试。这属于已有资产能力的窄扩写，不得在 App 内手写第二套 AssetIndex fetch/parser。
- **接受**：宿主卡面设定表现层截止点；截止前成功的用真图，未成功的逐张 fallback。截止后结果冻结，禁止在玩家已看见卡牌后突然换图。
- **回驳**：本单不压缩/重画包装 PNG。资源重编码涉及视觉质量复核，且现有证据不能证明它是主要瓶颈；如优化后真实瀑布图仍表明 PNG 是主因，再另立美术优化单。
- **回驳**：不增加可见 Loading UI。游戏是透明合成演出，Loading UI 只掩盖等待、不减少等待，并会改变冻结画面。
- **W3.8 owner 裁决（2026-10-13）**：选择 A——在共享 `AssetManager` 下沉通用的原子资产采用/替换能力；不得保留首帧阻塞方案，也不得用游戏层私有字段或第二套缓存绕过。

## 2. 冻结边界

### 2.1 必须保持不变

- `doki.game.card-reveal-input` v1 与 `doki.game.card-reveal-result` v1 的字段、版本和语义。
- 1–5 张输入顺序、P2–P5 画面、轨迹、时长和 natural / skipped 共同 P5 终态。
- preview 不 `complete()`；`Esc` 为 cancelled；完成结果最多成功提交一次。
- 卡面 URL 只属 render-only，不进入 World、snapshot、hash、Signal 或 output。
- 透明舞台、无可见 chrome、无底部对话框。

### 2.2 本单允许改动

- `dokiworld/game-card-reveal/src/` 的启动与资产协调代码及对应测试。
- `src/assets/game-art-load.ts` 的可选 key 过滤扩写及点名测试；不得修改 AssetIndex schema。
- App 源码调用说明、App/package patch 版本、可重建 `dist/`。

### 2.3 禁止

- 不改 `prototype.dc.html`、游戏蓝图/轨迹/时序、合同 parser、输出结构。
- 不新增自由 DOM/CSS、专属 canvas loader、手写 `fetch('/games/.../index.json')`、裸 `Image()` 分支或第二套图片缓存。
- 不改远程 Git、不复制到 DokiWorld 安装目录、不启动或重启整套 ZeroCraft。
- 不用真实外网图片做自动测试；网络时序必须用可控 deferred/fake loader 证明。

## 3. 目标启动模型

```text
页面模块执行
  ├─ SDK connect / whenReady
  └─ 立即预取包内关键资产（与 SDK 握手并行）

收到并严格校验正式输入
  ├─ 包内关键资产 ready → 可以开始 P2
  └─ 1–5 张宿主卡面并行加载（render-only）

P2 播放期间
  ├─ 已成功卡面可进入待采用集合
  └─ 失败或未完成卡面继续保留 fallback

进入 P3 前 / 玩家触发 skip 前
  └─ freeze：逐槽锁定真图或 fallback；之后永不热替换
```

首帧只依赖包内关键资产，不再依赖最慢的一张宿主图片。远程图片慢或永久不返回时，演出仍能以逐张 fallback 完整结束。

## 4. 施工分解

### W1 · 通用本地资产选择性装载

1. 给 `GameArtLoadOptions` 增加可选闭集字段（建议名 `onlyKeys?: readonly string[]`）。
2. 仍通过既有 `fetchArtIndex → parseAssetIndex → registerAssetIndex` 注册索引；只改变随后等待加载的 key 集合。
3. 省略 `onlyKeys` 时继续 `loadAll()`，保证所有旧调用方零变化。
4. 指定 key 时：
   - 去重且保持调用方顺序；
   - 任一 key 未注册或加载失败，返回 `false`；
   - 不把过滤写进 parser，不删除/改写 Index 条目；
   - 只加载指定 key，不暗带其他资产。
5. 通用点名测试至少覆盖：旧行为、选择性加载、重复 key、未知 key、单项失败。

### W2 · 卡牌 App 启动预取

1. App 创建唯一 `AssetManager` 后立即开始包内关键资产 promise，不等待 `whenReady()`。
2. 正式模式关键集合固定为：
   - `pack.front`
   - `pack.tearTop`
   - `pack.tearBody`
   - `card.fallback`
3. preview 在上述集合上只追加本次 `previewCount` 实际会用到的 `card.preview.0..N-1`。
4. `pack.back` 继续留在 Index、闭包和包内库存，但不得进入运行时关键加载集合；正式模式不得预载任何 preview 卡。
5. 本地关键资产失败仍按现有合同退出，不伪造 `viewed`。

### W3 · P2 期间并行卡面加载与冻结

实现一个仅属于 adapter 表现层的资产协调器（可以是 `card-assets.ts` 内的类/纯函数组合），职责必须收敛为 `start / freeze / dispose`，不得驱动游戏规则或 P2–P5 轨迹。

1. Engine 启动前，每个稳定 `host-card:<index>` 必须已有可绘制 fallback，因此 P2 后立即 skip 也不能出现空白卡。
2. 正式卡面使用临时候选 key 并行加载；不得把 URL 放入 World。
3. 成功候选只能在卡牌仍不可见的 P2 内采用；采用过程不能让稳定 key 出现玩家可见的空窗。
4. 冻结时机：
   - natural：必须在 P3 第一张卡出现前完成；
   - skipped：先完成/强制冻结，再发送既有 `reveal.skip`；
   - 建议以 `STAGE_MS[mode].p2` 派生截止时间并预留安全窗，禁止复制一份会与 `timing.ts` 漂移的 P2 魔法数。
5. 截止点仍未成功的单卡锁定 fallback；其他成功卡不受影响。
6. `freeze()` 幂等；并发 skip 合并为同一 promise；冻结后晚到的 onload/onerror 不得再改稳定 key，也不得产生 unhandled rejection。
7. `pagehide` / dispose 后，任何晚到异步结果不得重填 AssetManager 或触发完成。
8. 如现有 `AssetManager.register/load/unregister` 无法无闪烁地完成稳定 key 切换，**停止扩大实现**：在本工单报告实查证据，并按缺口协议给出 A“补通用原子资产替换能力”/B“保持首帧阻塞”的代价，交 owner 裁决；不得在 App 内注入私有 handle 或访问 AssetManager 私有字段。

### W4 · 可观测性、文档与版本

1. 增加不含 URL/卡牌身份的 Performance Timeline marks/measures，至少覆盖：`sdk-ready`、`local-critical-ready`、`engine-start`、`card-art-frozen`。不得刷屏 console。
2. 源调用说明补充：卡面在 P2 内加载、进入 P3/skip 前冻结、截止未完成逐张 fallback、冻结后不热替换。
3. 业务合同版本保持 v1；`manifest.version` 与 `package.json.version` 同步升 patch（当前应从 `0.1.0` 到 `0.1.1`）。
4. 重新构建本仓 `dist/` 并运行 `verify:dist`；不把产物复制到外部 DokiWorld 目录。

## 5. 点名验收

### 5.1 自动测试

- 本地关键预取在 SDK ready 之前已经启动；SDK ready 与本地加载互不串行等待。
- 正式模式只请求四个本地关键 key；preview N=1/3/5 只追加对应 N 张 preview；`pack.back` 始终不在运行时请求清单。
- 远程 1/3/5 张全部成功且乱序完成时，最终稳定 key 仍按输入顺序对应。
- 一张失败、两张超时、其余成功时，只对应槽 fallback。
- 永不 resolve 的图片不能无限阻止 P2 首帧或整个演出。
- 卡面在 freeze 前成功则采用；freeze 后才成功则保持 fallback，且没有晚到热替换。
- P2 中立即 skip、freeze 同时触发两次、pagehide 时仍有 pending 三种竞态均有测试。
- preview 不接触宿主 URL；URL 不进入 blueprint、snapshot、output。
- 原有 parser、CompletionGate、N=1/3/5、natural/skipped 测试全部继续通过。

### 5.2 浏览器验收

使用短生命周期隔离探针或 owner 已运行的 5173，只做只读测试；不得自行启动整套系统。

- 1440×900 透明舞台下录取 P2、P3 首卡、P5 三个关键帧；和冻结原型/现有基线相比不得有视觉或时序偏差。
- 用受控慢图 fixture 验证：P2 会准时出现；进入 P3 时所有卡已是稳定真图或 fallback；P3–P5 不再换图。
- P2 期间立即按 Space/Enter：先冻结再到真实 P5，无空白卡、无双提交。
- 控制台 error 和 unhandled rejection 为 0；探针与临时服务结束后全部关闭。

### 5.3 门禁与证据

- App `test`、`typecheck`、`build`、`verify:dist` 退出码均为 0。
- 受影响的 `src/assets` 点名测试、游戏测试、`dokiworld-docs-guard`、`game-skill-audit` 与 `node scripts/context-budget-guard.mjs` 通过。
- 施工回执写入 `review/OPT-CARD-REVEAL-LOAD-01.md`，只记录命令、退出码、性能顺序/实数、竞态测试、截图路径及已知警告；`requests.md` 不追加测试流水。
- 由非施工人独立复跑，并对“去掉 freeze 后晚图不得热替换”与“恢复全量 loadAll 后 pack.back 不应被请求”的关键保护做带锚点撤修验红。

## 6. 出口

只有以下全部成立才进入 `review`：

1. 首帧不再等待全部宿主卡面；
2. 正式本地关键集合不含 `pack.back` 和 preview；
3. P3 前卡面选择已冻结，P3–P5 无热替换；
4. 合同与冻结演出无变化；
5. dist、文档、版本与 SHA 全部新鲜；
6. 自动测试、真浏览器竞态验收和适用门禁均有真实证据。


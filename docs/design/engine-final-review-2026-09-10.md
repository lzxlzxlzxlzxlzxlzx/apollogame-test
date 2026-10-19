# 引擎底层 · 收尾评审（2026-09-10 · owner「做最后一次收尾·看看还有什么可以改进」）

> 定位：三轮评审（`engine-architecture-review-2026-09-02` P0–P2e 全落地 · `engine-base-tier-review-2026-09-06` 四波补齐）之后的**剩余清单**。
> 口径：只列**跑出来的证据**（门禁日志 / 棘轮基线 / 注册表数字），不凭印象。每项给「值不值得做」判词，owner 按序取用。
> 现状快照：540 测试文件 · 5103 用例 · 111 能力 · 162 组件 · 33 核心原子 · 门禁全绿（4227be4dc）。

## 0. 一句话结论

底层**库的面已经够宽**（数学 / 查询 / 事件 / 随机 / 持久 / i18n / 回合 / 冷却 / 背包 / 克制 / 队列 / 2D 粒子），再加库就是 YAGNI。
剩下的价值排序是：**① 让已有件被用起来（消费迁移 + 采用率）→ ② 收拢三处结构债（输入层 / 宿主 / 超大 skill）→ ③ 两条已立项的长线（流场 M2–M4 · keyframe resync）**。下面每项都标了「不做会怎样」。

## 1. 现在还红黄着的东西（门禁跑出来的·按严重度）

| # | 证据 | 判词 | 建议 |
|---|---|---|---|
| 1 | `skill-shape-guard`：**24 件能力内联重造 `@engine/logic`**（resolveFlag/State/Resource · applyWrite · countByTag），只有 5 件真接了 | 沉淀了没人用 = 白沉淀。本轮 turn-order / conveyor-queue 已接，证明每件改 1–3 行 | **值得做·派 low/medium 子代理批量收编**：每文件独立提交、黄金 hash 零变。目标 24→0，棘轮同步降 |
| 2 | 4 件超大 skill 在案：`matrix-duel.ts` 652 行/22 字段 · `match3-board.ts` 644/26 · `poker-hand.ts` 269 · `slot-payout.ts` 26 字段 | 壳里藏算法 = 不可复用 + 测试贵。已有 `flow-field-core` 拆法样板 | **值得做·high**：算法搬进 `*-core.ts` 纯函数核，壳只剩申报 + 调用。matrix-duel 优先（最大·且 game-108 主战场） |
| 3 | `engineTwin` 红旗：game-e 2 · game-g 8 · 102:1 · 103:7 · 108:9 · 211:8（存量灌入·只降不升） | 引擎有 persist/event-log/random，游戏侧仍手写同形 | owner 已令「老游戏不重写」→ **不主动做**；只在动到该游戏时顺手降。新游戏零容忍（已由棘轮兜住） |
| 4 | `SCC_BASELINE` p0 大环 **48 个 system 经 23 种组件互锁**（本轮 turn-order 也进了） | 软环 = 定序靠 tiebreak 不靠语义；今天没炸是因为 Signal 生命周期恰好兼容 | **不急但要盯**：真正解法是「Signal 产出者统一 Commit 相位」（cooldown/effect-apply/conveyor 已这么做）。可开一张 REQ 把 Update 相位的 Signal 写者逐个下移；每移一个 SCC 缩一个 |
| 5 | `[slg/scale]` 2000 单位 19ms/tick · 4000 单位 58ms/tick「掉帧」 | flow-field M1 的软分离是 O(单位×9 格) | 属 REQ-FLOWFIELD M2–M4（主程锁）。不在库治理范围 |
| 6 | `ART-LEDGER-GUARD: WARN` · build chunk >500KB 提示 | 资产台账 / 打包体积 | 与底层无关；P3D / 发布线各自的事 |

## 2. 三处结构债（上轮评审 P3 未做·仍成立）

| 项 | 现状（`engine-architecture-review-2026-09-02` 已实证） | 值不值 |
|---|---|---|
| **输入层三套真相** | `RawInput` 零读零写（死契约）· `Action` 只有 commands.ts 一处硬写 · 真契约是 `InputQueue`；网络格式只传 dx/dy/jump，指针/UI 命令不上网 | **值·但 🔴 只归主程**（碰 lockstep）。先删死契约 RawInput（零风险·可派工），再把 `Command.actions` 上网（改 NetMsg·需 golden 重锚） |
| **宿主每家手拼** | `manifest-game.ts` 是最小宿主；Engine+renderer+input+run-loop+overlay 各游戏接一遍 | **值·可派工**：抽 `mountStandardHost(manifest, opts)`，新游戏起手少 60 行。做之前先数一遍现有 6 个游戏的接线差异 |
| **keyframe resync / Replay** | 存储结构决定不能回滚预测；唯一可走的是权威 keyframe | 长线；只有真做联机对战时才拉动 |

## 3. 本轮新件自己的已知边（写在这里·免得下一位重新踩）

- **cooldown 槽时长糖不折**：manifest 的 `"2s"` 糖只折顶层字段，`Cooldowns.slots[].duration` 得写拍数。要糖 → `manifest-core` 时长折算加一条「数组内对象」路径（小·可派工）。
- **conveyor-queue 载体实体**：每份上带造一个 `<带>:req:<seq>` 实体挂 SpawnRequest + Timer，靠 t1-lifetime 回收。确定性没问题，但世界里会短暂多出 N 个实体；若 prefab-spawn 未装则载体永不落地、`inFlight` 只靠 3 拍寿命自纠。世界装配漏件时应该报错而不是静默——可在 `validate-manifest` 加「ConveyorQueue 需 t3-prefab」的装配校验。
- **Vfx2D 帧间隔用墙钟**（渲染面·封顶 0.1s）；headless 测试用固定 dt。粒子池按实体 id 播种 → 同一局两端画面一致，但**不是**跨端同步承诺（本来就不该是）。
- **damage-table 只接了 hitbox**：`effect-apply` 的 resource 效果、`over-time` 的 DoT 没乘倍率。要全接 → 抽 `applyDamage(world, target, amount, damageType)` 一处，三个消费者改调（medium）。
- **turn-order 跳过用 Flag**（`skipFlag` 挂在座位实体）；淘汰改用 `Group` 成员摘除也说得通，两条路都能表达，先不统一。
- **i18n 只做了 value 通道**：list/flag 通道里的串不经 `@t/`。真用到时扩 `withStrings`（小）。

## 4. 建议的下一位接手顺序（每项可独立回退）

1. **收编 24 件内联 `@engine/logic`**（low/medium 子代理·按文件提交）——纯还债，零行为变化，棘轮护航。
2. **matrix-duel / match3-board 拆核**（high）——照 flow-field-core 样板。
3. **删死契约 RawInput + 抽标准宿主**（可派工·先数差异再抽）。
4. **Signal 写者下移 Commit**（🔴 主程）——p0 大环逐个缩。
5. 流场 M2–M4 / keyframe resync 按各自 REQ 走。

**不建议再做的**：再加通用库（本轮已把「标准工具箱」补满；有意不做的定点数 / 颜色数学进 sim / 时间缩放理由见 `engine-base-tier-review §3.4`）；把老游戏迁到新件（owner 令）。

## 5. 本 session 全部产出（索引·细节看各文档施工记录）

| 提交 | 内容 |
|---|---|
| P0–P2e（`engine-architecture-review-2026-09-02` 施工记录） | 确定性/定序/快照/严格视图/增量 hash/事件总线等基础修缮 |
| f68e473 · efb8a5a | 底层库一二波：`engine/math`（scalar/vec2/grid/geom2/ease/hash/tick）· byId 索引 · sortedIds · 牌码 · deriveSeed · Tag 糖 · provider 守卫 · engineTwin 红旗 · base-lib 手册 |
| 86f71ab | Owner / Group 原子 + t1-group-gc |
| 4227be4 | 第四波预建高频件（vfx2d · i18n · turn-order · cooldown · dice mods · inventory · damage-table · rate-limit · achievements · conveyor-queue） |

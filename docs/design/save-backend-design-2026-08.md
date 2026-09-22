# 引擎存档后台设计 · 数据库本地存盘 + 云端存盘（owner 2026-08-26 令·Lead 图纸）

> 服务收集+养成收敛方向（`genre-focus-2026-08.md` §四⑤点名「云侧仅 Steam」）。本设计=现状实查 + 缺口定位 +
> 分期方案；**云后端选型与认证方案两处摆 A/B 给 owner**。全程守端口哲学：副作用 IO 在 sim 之外·契约不变后端可换。

## 一、现状实查（三层已在架·各管一摊）

| 层 | 契约 | 现有实现 | 管什么 |
|---|---|---|---|
| `services/storage` StoragePort | save/load/list/delete(slot)·SaveGame{meta+snapshot+order} | Memory / LocalStorage / **SteamCloud(桥)** ·工厂 select-storage 按优先级择端 | 引擎快照存档·hashWithOrder fail-closed |
| `services/save` SavePort | 版本化信封 SaveEnvelope{schema,gameId,savedAt,checksum,data}+迁移链 | memory / local / bridge | 游戏自有 blob·schema 迁移·checksum |
| `services/persist` local-store | localStore(key,fallback,codec) | localStorage+内存降级 | 局外 meta 便利壳（红线：不进 world/hash） |

**关键重组发现**：`SteamCloudBridge`（cloud-bridge.ts）= `{available, readFile, writeFile, deleteFile, listFiles}`——
这就是**通用云文件 KV 契约**，无一字 Steam 专属；`SteamCloudStoragePort` 只消费 bridge。
⇒ **云端存盘的引擎半已存在**：换云=再写一个 bridge 实现，Port/工厂/测试全复用。

## 二、缺口定位（按owner两点拆）

**① 数据库本地存盘**：现浏览器本地=localStorage——~5MB 配额·同步阻塞·易被清。收集养成的长档
（图鉴数百条+养成历史+多存档位）会顶配额。真缺口=**IndexedDB 端**（异步·配额以百 MB 计·结构化存储）。
桌面壳已有 Steam 云兜底，electron 本地 fs 档可后置（YAGNI·真需要再立）。

**② 云端存盘**：现仅 Steam 云。收集养成主战场=Web/移动（无 Steam）⇒ 真缺口=**自有云通道**（bridge 第二实现 + 后端服务）。

**③ 隐含第三缺口（多设备带出）**：两台设备各自离线玩后同云→冲突。收集养成的数据形状恰好给了便宜解法：
图鉴/收藏=**单调增长集合（并集合并天然安全）**、养成等级=取 max、标量设置=last-write。
⇒ 合并策略可做成**声明式 merge 表（纯数据·合宪法）**，与收集养成壳同批设计。

## 三、方案（守端口哲学·最大化重组）

```
                    ┌ IndexedDbKV（新·浏览器本地 DB·idb 薄封装·两栈共用）
  StoragePort ──────┤
  SavePort    ──────┤ CloudFileBridge = 现 SteamCloudBridge 契约正名（typedef 别名·零行为变）
                    ├── SteamCloudBridge（既有）
                    └── HttpCloudBridge（新·fetch 实现四函数·token 头·超时+重试+离线降级 available=false）
  SyncOrchestrator（新·M3）：本地先写 → 后台推云 → 拉取按 merge 表合并 → 冲突留痕不静默
```

1. **M1 本地 DB（先做·无裁决依赖）**（**owner 2026-08-28 发令开工·施工主体 = 主程（本 session）·status: done（独立复查 PASS-带尾巴·四处 sabotage 三咬一存活→缺口 T1 锚点测试已回填并复演验红）**。复查尾巴归属：**T2** 索引读改写跨两事务有并发丢更新（与 localStorage 版同级既有语义·现零生产调用方）→ M3 前置：收进单 readwrite 事务；**T3** `indexedDB` 在而 open 必败的环境（旧 FF 隐私模式形）不回落 localStorage、全操作响亮拒绝 → M2/backlog 加 open 探活回落；**T4** 保留槽名 `__migrated__`/`__index__` 撞键（后者 localStorage 版同款 wart）→ 记档不修。落地：`indexeddb-kv.ts`（单库单表 KV·putMany 单事务原子·⚠实证：put 同步异常不自动中止事务，须显式 abort 否则半批提交）+ `IndexedDbStoragePort`/`IndexedDbSavePort`（口径照抄 localStorage 版·字节原样迁入）+ 迁移助手（形状认领分流两线·索引从值重建不信共享 `__index__`·DB 已有键优先防旧砸新·失败不落旗标下次重试·原键转只读备份键）+ 工厂优先级③插 localStorage 前。测试 19 例含坏档/索引坏/事务回滚/配额满注入/迁移往返/DB-wins/失败重试/优先级契约；devDep +fake-indexeddb）：`IndexedDbKV` 薄封装（get/put/delete/list·单库单表·key=`{ns}:{slot}`）→
   `IndexedDbStoragePort` + `IndexedDbSavePort`（各自契约照抄既有 LocalStorage 版·序列化口径不变=旧档可一次性迁入）
   → select-storage 优先级插到 localStorage 前（有 IndexedDB 用它·无则回落·**迁移=首次启动把 localStorage 存档搬进 DB 后留只读备份键**）。
   测试口径照大扫除刚立的坏路标准：坏档/半写/配额满/事务失败回滚 + 迁移往返。
2. **M2 云通道**：`CloudFileBridge` 正名（别名导出·Steam 实现零改）→ `HttpCloudBridge`（端点 `GET/PUT/DELETE /api/cloud-save/<fileName>`+`GET …/list`·
   Authorization: Bearer <token>·断网/超时→available=false 工厂自动回落本地）→ 后端首实现=**main_entry 扩四个端点**（自托管·
   文件落 `<data>/cloud-saves/<userId>/`·台账式·与工坊同服务）→ mock bridge 照 createMockSteamCloudBridge 先例（无后端全链可测）。
3. **M3 同步与合并**：SyncOrchestrator（local-first：写完本地即成功·推云在后台·拉云在启动/手动）+ 声明式 merge 表
   `{path: 'union'|'max'|'lww'}`（游戏声明·引擎解释——消耗性货币这类真冲突项标 `lww` 并留冲突痕供 UI 提示，不做服务器权威）。
4. **不做（YAGNI·明说）**：反作弊/服务器权威（单机收集游戏·hash 指纹管防损坏不管认证·威胁模型同 SAVEORDER 记档）；
   实时同步/协作（收集养成无此需求）；electron 本地 SQLite（Steam 云已兜桌面）。

## 四、确定性红线核对

全部在 sim 之外（端口层）；savedAt 宿主注入不变；hashWithOrder fail-closed 原样继承（云端只是另一个搬运后端·
坏档/篡改在读回时照旧 CorruptSaveError）；SyncOrchestrator 不碰 world——merge 发生在存档 blob 层，读回仍走既有校验。

## 五、⚖ 摆给 owner 的两个 A/B（M2 前须裁·M1 不等）

1. **云后端**：**A 自托管**（main_entry 扩端点·跑在你自己服务器·零月费·数据自持·运维自担）/
   **B 托管 BaaS**（第三方 KV/对象存储·免运维·有月费+数据外置）/ **C 暂缓**（先 M1+Steam·移动壳复活时再裁）。
   Lead 推荐 **A**：契约极窄（四函数 KV），自托管实现量小，且 main_entry 服务已在跑；将来换 B 只换 bridge。
2. **用户标识**：**A 匿名设备号起步**（首启生成 UUID 存本地·跨设备靠「同步码」手动配对·零账号系统）/
   **B 账号体系**（邮箱/第三方登录·工程量大一级）。Lead 推荐 **A**：收集养成首发不需要社交图谱，B 真需要时再叠。

## 六、测试与验收口径（大扫除标准延续）

每期交付带：坏路测试（坏档/半写/回滚/断网/超时/配额满）·撤修验红锚点·mock 全链（无后端可测）·
迁移往返（localStorage→IndexedDB 一次性迁移的双向核对）·select-storage 优先级契约测试更新。
M2 后端端点进 GATESMOKE 面旗体系（platformStatic 先例）。

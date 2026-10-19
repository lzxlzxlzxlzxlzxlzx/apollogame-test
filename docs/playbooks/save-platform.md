# 存档与平台手册

> 存档 = 纯数据 + 迁移；平台服务（成就/云存档/排行/富状态）走 `PlatformPort` 适配器（sim 只持纯数据，端口把它变成真实调用）。
> **发布**（打包/Steam 上架/平台接线）用 `game-publisher` agent。
> 机读真相：`src/services/storage/index.ts`（`StoragePort`/`SaveSystem`/`SaveGame`）、`src/services/save/index.ts`（`SavePort`/信封）、`src/services/platform/index.ts`（`PlatformPort`）。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 引擎快照存档（WorldSnapshot） | `StoragePort` + `SaveSystem` | `createStoragePort()` 选实现；`SaveSystem` 读写 `SaveGame`（web=Local、原生壳=SteamCloud） |
| Life 独立宿主进展存档 | `LifeHostSaveAdapter` + `LifeHostAutosave` | 由 `life-host.v1` namespace 派生隔离槽；严格进展投影合入 fresh compiled baseline，校验 descriptor/package/hash/order 后一次性恢复；活动对话只存 `LifeDialogueSession + State` 游标，建设项目只存 `LifeConstructionProject.completed` 并与 fresh 静态项目定义合并，故读档后 renderer 首帧直接选完成皮肤；`t2-life-talk` 从静态 `LifeDialogueCatalog` 重建 `DialogueScript/Text`，坏游标或 `proximity` 策略下已越界的会话 fail-closed 清理，不由 host 私自隐藏 |
| 游戏自有数据 blob 存档（带 schema/迁移/校验） | `SavePort` + 信封 | `sealEnvelope(data,codec,savedAt)`→`port.write(slot,env)`；读 `port.read`→`openEnvelope(env,codec)`（自动校验+迁移） |
| GAL 跨槽已读/画廊解锁/偏好 | `GalProfile`（`src/services/gal-profile/`）+ `SavePort` | 每个 `GalPackage.id` 独立档案槽与 codec gameId；当前 V6 经 V1→V2→V3→V4→V5→V6 严格迁移，旧档只读升级：V4 补语音自动 true，V5 补对话框透明度/滚轮/选择后自动续播默认，V6 补已读快进开启默认，保留六项确认及主音量/失焦政策。确认、音量、自动语音、播放与 GAL UI 偏好均经各自 `persistGal*` 入口共用同包串行写入；`requiresGalConfirmation` 为单处纯政策。偏好不进 World 或启动器角色卡键 |
| GAL 既有三通道音量 | `persistGalAudioVolume` | 仅更新 `bgmVolume/voiceVolume/sfxVolume` 的有限 0–1 值；同包串行读改写，成功后才刷新 UI/音频，失败保留旧值。沿用 V2，不为既有字段造迁移；全设置重置的基础接口为 `persistGalPreferencesReset`，UI 全局重置仍须等所有纳管设置生效。 |
| GAL 手动槽的剧情快照 | `GalManualSaveController`（`src/services/gal-save/`）+ `StoragePort`/`SaveSystem` | 正整数槽号按 package 隔离；保存先复制 World 且清空待处理输入；读档在隔离 World 校验指纹、实体序、当前发布包、StoryRef 与历史，成功后才一次性恢复活动 World；`GalProfile` 不随槽回退 |
| GAL 非权威槽预览 | `GalSavePreviewController` + `GalSavePreviewPort`（可选 `IndexedDbGalSavePreviewPort`）+ `GalPreviewCapturePort`（浏览器可选 `BrowserGalPreviewCapturePort`） | 图片侧车独立于权威快照/hash；控制器先验权威档再读取预览、按当前 hash 复验，坏图/缺图/存储失败只降级。同一 JS 进程内按 package+slot 串行不同控制器的侧车写/删并重检权威 hash；排队的删除遇到新权威档时跳过。**GAL-ENG-06K Owner 选 B：产品不支持多窗口同时编辑同一槽，不保证跨标签页/进程 IndexedDB 原子定序、权威冲突解决或实时刷新；意外并发时预览按当前可见权威 hash 校验，不匹配只降级，不得冒充当前槽或阻断权威读档。**`GalSliceHost` 在权威保存成功后异步消费显式注入的采集端口，捕图不阻塞反馈。浏览器编码器只按已解析的 assetKey URL 离屏合成背景/立绘场景缩略图，**不是整屏截图**；无图不伪造占位，IndexedDB 也须应用宿主显式注入，静态宿主不暗开数据库。 |
| GAL 正式 Web/Electron webview 装配 | `mountGalBrowserGame`（`src/services/gal-ui/gal-browser-game-host.ts`） | 作品入口只交 `GalPackage`、受限初始 Manifest、固定数据库名、显式图像/音频 URL 和挂载容器；通用宿主组装 `createGalWorld`、权威槽/Profile/非权威侧车的 IndexedDB 端口、浏览器预览采集、自动播放时钟和独立音频通道。无 Audio 环境或 `audio:false` 不启用声音控件；每款作品在退出时 `close()` 停播并释放连接。不使用 demo 内容作默认、不写私有 UI/存档胶水。仅单窗口单活动写入者；桌面安装包另走发布线。 |
| GAL 未确认里程碑 | `NarrativeOutbox`（`t3-narrative-director`） | 随 World 快照和手动槽保存；历史回滚不回退 outbox。宿主只有在 04B Profile 持久化成功后才把 `narrative.ack` 具名动作（连续前缀序号）投到 `InputQueue`，由 Director 于 tick 内确认；256 条满载时剧情动作 fail-closed，不能因 512 句历史裁剪而丢失。 |
| GAL 里程碑持久化桥 | `GalNarrativeProfileBridge`（`src/services/gal-profile/`） | 宿主传已验证 package、活动 World/剧情实体、`SavePort` 与有效 `savedAt`；桥串行加载最新 Profile、按 outbox 事件幂等折叠、写成功后仅在输入队列空闲且 World/实体/前缀未变时排入 `narrative.ack`，绝不自 tick。返回 `empty`、`ack-queued`、`saved-pending-ack` 或分阶段 `failed`；忙/旧世界/失败路径留待重试，不能当已确认。 |
| 存档后端（内存/web/文件/云） | `MemorySavePort`/`LocalStorageSavePort`/`FileSavePort`/`CloudSavePort` | 同 `SavePort` 契约；File 经文件桥（真桥 electron preload·测试 `createMemoryFileBridge`），Cloud 经 `SteamCloudBridge` |
| 存档结构演进（数据 blob） | `SaveCodec.migrations` 链 | codec 声明 `schema` + `migrations[v]`（v→v+1 纯函数）；旧档 `openEnvelope` 自动链式升级，缺步/坏档报 `CorruptSaveError` |
| 引擎快照结构演进 | 版本键 + 迁移函数 | 快照存档带版本键（如 `gameG-save-v1`），旧版进来跑一次性迁移（纯函数） |
| 局外小态（偏好/进度/静音位/本地榜·非快照存档） | `localStore` + codec 闭集（`src/services/persist/`·REQ-SHELL ③） | `localStore(key, fallback, codec?)`——codec 四款 `jsonCodec`（blob+形状校验）/`textCodec`（原文枚举）/`intCodec`（整数+钳）/`flagCodec`（`'1'`\|`'0'` 位·与既有静音键字节兼容）；坏档回缺省、无存储/隐私模式静默降级、**绝不抛**。本地榜名次用 `insertRanked`（插入+排序+截断+1 基名次）。**别拿它替代下面两行**（快照/迁移链） |
| 解锁成就/统计/排行 | `PlatformPort` | `unlockAchievement`/`setStat`/`uploadLeaderboard`（幂等·fire-and-forget） |
| 富状态（好友列表显示） | `PlatformPort.setRichPresence` | sim 产纯数据 → 端口投递 |
| 无原生壳降级 | `NullPlatformPort` | `isAvailable()=false`，游戏据此静默降级不报错 |
| 宿主受控退出意图 | `HostExitPort` + `createHostExitController`（`src/services/platform/host-exit.ts`） | 仅显式注入；缺端口=unavailable，拒绝/异常=rejected，待决合并、接受后锁存；不进 World，桌面窗口适配另归 PS |
| 成就数据同步 | `AchievementSync`/`ACHIEVEMENTS` | 从 sim Flag/Resource 派生成就解锁 |
| 打包 / Steam 上架 | `game-publisher` agent | web/cartridge/electron + steam-publisher（AppID/Depot→VDF→上传→Set Live） |
| 生成的库卡带打成单文件·双击即玩（离线自包含 HTML） | `scripts/package-web.mjs` + 引擎内联钩子 `cartridge-inline-run` | `node scripts/package-web.mjs <slug> [out]` → manifest 内联进 `window.__APOLLO_INLINE_CART__`·VITE_SINGLEFILE 单文件·零外链；apollo 发布屏 web 平台对库卡带自动走此路（工程游戏 e/f/g/i/x 仍走 VITE_TARGET_GAME 静态 import） |

## ② 样例指针

- **正样例·平台接线**：`games/game-g/platform-hooks.ts`（`ggOnBattleWon`/`ggCloudSave`/`ggCloudLoad`）+ 测试 `platform-hooks.test.ts`（mock 端口断言调用）。
- **正样例·存档层**：`games/game-g/game-g-save.ts`（纯数据 Save 类型 + 迁移，除 localStorage 外纯函数·可无头测）。
- **创作台库版本化**：`src/studio/library-model.ts`（`LibraryMeta`/`GameEntry`·library/<slug>/meta.json）——用户游戏库前端数据模型（纯函数可单测）。
- 无真账号测试：`resetMockSteam`/`createMockSteamBridge`（`src/services/platform/index.ts`）。
- **离线单文件打包**：`scripts/package-web.mjs`（库卡带 manifest → 自包含 HTML）+ 引擎钩子 `src/cartridge-inline-run.ts`（读 `window.__APOLLO_INLINE_CART__` 走既有 parseManifest+load 跑·与在线 `DataCartridgeRunner` 共用 `cart-run-core.runBlueprintInto`）；端到端真构建冒烟 `scripts/package-web-smoke.mjs`（opt-in·不进默认门禁）。**注**：未解析的 `art:` 引用离线退化占位（art: 打包期解析 + 资产内联=后续件）。

## ③ 本线红线

- sim **只持纯数据**（Flag/Resource/State），成就/统计由端口从数据派生，不在 sim 里直连平台 SDK。
- 存档演进**必带版本键 + 迁移**，不破坏老玩家档；`SavePort` 走 `schema`+`migrations` 链，`checksum` 不符**报错不静默**（`CorruptSaveError`）。
- Life 宿主不得把整 World 当进展落盘：Camera/Velocity/连续输入/UI/请求、descriptor、prompt/provenance/assets 必须排除；package 静态定义来自 fresh baseline，`LifeConstructionProject` 只投影 `completed`，材料、placement、access 与皮肤仍来自 baseline；失败恢复不得污染活动 World。
- `savedAt` 时间戳**由宿主注入**（app 层 Date.now），**绝不由 sim 取墙钟**（确定性红线）。
- 平台不可用一律**静默降级**（游戏代码无环境分支）。

## ④ 正样例 / 反面教材

- ✅ game-g platform-hooks + game-g-save：数据 → 端口 → 平台，可 mock 测。
- ✖ 游戏层直连 Steamworks SDK / 存档无版本号导致升级即丢档。

## ⑤ 查不到怎么办

平台契约缺能力（新平台适配器 / 新存档需求） → `docs/workflow/requests.md` 提缺口；发布链问题交 `game-publisher` agent。**不在游戏层绕端口直连平台。**

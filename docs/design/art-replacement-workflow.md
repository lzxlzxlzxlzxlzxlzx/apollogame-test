# 美术替换工作流（Art Replacement Workflow · owner 2026-07-08 定形）

> owner 口径：先用现有方法做出游戏，placeholder 全用免费共用库；游戏输出一份**资产替换列表**（2D/3D/声音/启动画/粒子全类型，每条带尺寸、大小、表现描述）；再用一个工作流给列表配上美术设计风格，调万相（文生图）/Tripo/Meshy 把**整套风格统一的美术**一次性产出；ID 对位后把游戏里的 placeholder 全部替换掉。
> 本档=该工作流的正式设计（Lead 图纸）。落地载体：`docs/workflow/requests.md` REQ-DEMO-T1/T2。上层纲领：demo-sprint-2026-07-29（已随 2026-08-24 docs/design 清理删除·查 git 历史）。
> **owner 2026-07-09 重对齐**：①步②的输出=**当前游戏的「美术需求目录」**（JSON 描述的美术槽位需求表·游戏内目录）；②步③④**合并**为「逐游戏美术资产平台」——**由原数据透视器改造承载**（读步②需求表·一体化第三方生成+参考图配置·作数据中转器与重新产出器）；③步⑤照旧。**步②③已由 owner 直派两位程序员施工中（studio 侧+game-q 侧）——Lead 不另派新单，只按本档验收。**

## 一、为什么两段式（对比"边生成边补图"）

| | 边生成边补图（旧 T1 初稿） | **两段式（本档·owner 定形）** |
|---|---|---|
| 首次可玩 | 等全部美术生成完 | **秒可玩**（placeholder 即库内真图） |
| 风格一致性 | 零散单张各自生成·易散 | **整批同风格同供应商一次产出**·天然成套 |
| 成本 | 生成失败重试打断主流程 | 美术批处理独立异步·可断点重跑 |
| 换皮 | 另做一套机制 | **就是同列表换风格重跑**——同一段代码 |

## 二、五步流程

```
① 生成游戏（现有产线不动）
   LLM 出 manifest（art: 关键词引用）→ 校验回路 → art: 一律解析到免费库
   （resolveArtRefs 现行为·placeholder=库内真图·游戏立即可玩）
② 产出「美术需求目录」（机器推导·零 LLM 依赖·owner 07-09 定形）
   编排器扫 manifest：每个美术槽位 → 需求表一行（编号/类型/规格/表现描述）
   → 写进该游戏的美术需求目录（JSON 需求表 + 参考图落点 + 生成产物落点）
   规格从组件数据推导：显示尺寸=Shape/Transform、3D=Model3D.scale、
   音频=SfxSpec 时长、启动画=全屏位。表可人工补改描述。
③＋④ 逐游戏美术资产平台（原数据透视器改造·数据中转器＋重新产出器）
   **入口与配置位=资源控制台（owner 2026-07-09）**：风格包选择、参考图
   配置、第三方生成 API key 配置面，全部统一收在这里——不散落。
   平台读步②需求表，在同一工作面内一体化完成：
   - 配风格：选风格包（闭集·§四说法对齐表）＋配置定调图/参考图 → 绑定整表
   - 生成粒度：**一键全量** 或 **单行单个**——两种都必须有
   - 提示词拼装：**自动**把风格提示词拼进每行需求（人不手拼）→ 扔给文生图
   - 批量生成（异步·可断点续跑）：逐行 风格包方言化 prompt → 调对应
     provider（万相/Tripo/Meshy）→ 确定性后处理（palette-snap＋按规格缩放/
     栅格）→ 落游戏资产目录＋provenance＋内容寻址缓存
   - 无 key 行=探针输出＋mock 占位；单行改 prompt 重跑=单槽优化
⑤ 对位替换＋验收（照旧）
   **写回凭据=美术 ID 对应表**（owner 点题）：需求行编号 ↔ 槽位 ↔ 资产 id
   三元对应缺一不可——没有对应表就没法写回替换美术 ID
   按编号重钉 manifest 引用 → 台账更新状态 → 平台缩略图墙人扫
   → 不满意的行回③④单行重跑 → 评分卡抽检
```

**换皮** = 对同一张列表执行 ③④⑤ 换个风格包 → 存新卡带。**单槽优化** = 对列表里一行执行 ④⑤。三个场景一段代码。

## 三、美术需求目录与需求表 schema（每游戏一个需求目录·JSON 为真相）

> 目录建议形态（施工方细化）：需求表 JSON（下表 schema）＋ 参考图子目录（定调图/参考图）＋ 生成产物落点。**目录文件态=唯一真相**，平台只是它的视图与编排器（game-e 双真相教训）。

| 字段 | 说明 | 谁填 |
|---|---|---|
| `no` | 编号 art-01…（按槽位排序确定性分配·重跑不漂移·可念出口） | 机器 |
| `kind` | 闭集：`sprite\|texture\|bg\|splash\|model3d\|sfx\|music\|particle` | 机器（按组件类型推） |
| `slot` | `{entity, component, field}`——manifest 里的落点 | 机器 |
| `query` | 生成用关键词（=原 art: 查询串） | 机器（LLM 已产出） |
| `placeholder` | 现占位 `{assetId, source:'freelib'}` | 机器 |
| `spec` | 规格：`{w,h,displayW,displayH,transparent?}`（2D）/`{polyBudget,scale}`（3D）/`{durationS}`（音频）——**从组件数据推导** | 机器·人可改 |
| `context` | 表现描述（中文·人读）：用途/画面占比/动静态/视角 | 机器推导底稿·**人可补** |
| `desc` | **生成用详细描述**（英文·喂模型）：形体/主色 hex/行为角色（从 sim 组件推）/占比/视角/透明底 | 机器推导·人可改 |
| `prompt` | 人工精调提示词（有则整体替代 query+desc 作生成主体） | 人 |
| 头字段 `artStyle` | `{stylePrompt?, packId?}` 每游戏整体风格锚——自动拼进每行（风格包之后） | 人（平台头部编辑） |
| `status` | `placeholder→queued→pending→approved→replaced` | 真产物 pending 期不写最终 index；旧 `generated` 仅作兼容态 |
| `gen` | `{provider, model, prompt, cacheKey}`（生成后回填） | 工作流 |
| `provenance` | `{model, prompt, date, license}` 硬字段（同 M2.5 口径） | 工作流 |

- **v1 冲刺生成范围**：`sprite/texture/bg/splash`（万相文生图）＋ `model3d`（Tripo/Meshy·3D 游戏拉动时）。`sfx/music`：列表照登记（全景真相），但冲刺期声音走 SynthAudioPort 合成数据（`docs/playbooks/audio.md`），采样生成=冲刺后 B 件。`particle`：本引擎粒子=闭集配置数据（EffectKind/Vfx3D），列表登记为「配置槽」供人换预设，**不生成图**。
- 与美术台账（art-ledger）的关系：**同一份文件的两个视角**——替换列表=待办视角（status 流转），台账=资产真相视角（编号/来源/provenance）。实现上合一（art-ledger.json 即本表），避免双真相。

## 四、风格包·说法对齐表（style-packs·共享一份·工坊维护）

> owner 点题：「表格需要把美术风格、说法都对齐」——同一个风格，万相吃中文提示、Tripo/Meshy 吃英文提示、参数各不同。对齐表让**一个风格包 ID 翻译成各家方言**，弱 LLM/用户只碰 ID。

每个风格包一条（闭集·预调试·demo 前先调稳 3 包）：

| 字段 | 说明 |
|---|---|
| `packId` / `名称` | 如 `neon-synthwave`（霓虹合成波）/ `pixel-retro` / `cartoon-thick` |
| `promptZh` | 万相方言：中文风格模板（含质感/光照/构图词） |
| `promptEn` | Tripo/Meshy 方言：英文风格模板 |
| `palette[]` | 锚定调色板（palette-snap 后处理的靶） |
| `negative[]` | 负面词（两语） |
| `post` | `{paletteSnap:bool, pixelGrid?:64}` 后处理配置 |
| `params` | `{provider, model, seed?}` 默认钉死组（同款游戏全列表共用） |
| `refImage?` | 定调图（可选·生成一张人认可后，后续行走图生图参考——adapter 支持则用） |

## 五、代码落点（全在服务/脚本层·src/assembly 引擎不动）

| 件 | 落点 | 说明 |
|---|---|---|
| 需求目录推导器 | ✅ `scripts/art-replace.mjs` derive/deriveRequirements（编号 append-only·mergeLedger） | 扫 manifest/蓝图→台账 art-ledger.json（=需求表） |
| **逐游戏美术资产平台** | ✅ `src/studio/ArtLedgerPanel.tsx`（双数据源·唯一美术 UI·cockpit 已退役） | 风格包/mock 开关/一键全量/三式替换/换皮——**终态档 `docs/design/art-platform-2026-07-09.md`** |
| 风格包库 | assets 侧 style-packs 数据文件（PA 契约·PST 消费） | 纯数据·闭集·工坊维护 |
| 批量生成器 | zerocraft.py 批处理端点 + `scripts/ai-gen.mjs` adapters（已有 wanx/tripo/meshy） | 并发·缓存·断点续跑（status 就是断点） |
| 后处理 | `scripts/ai-gen.mjs` 后处理段（palette-snap/缩放） | 确定性·mock 也走 |
| 对位替换 | zerocraft.py：按 no 重钉 manifest 引用+落盘（PUT 前 parseManifest 零 error 铁律不变） | 留替换历史 |
| 浏览/点名 UI | ✅ 并入上行「美术资产平台」 | 缩略图+编号+status+三式替换（不再单列） |
| 内置游戏一键提交推送 | ✅ `main_entry/art_sync.py`（`GET /api/art/sync/status` + `POST /api/art/sync`）+ 面板「⤴ 提交推送」钮（builtin 限定） | owner 2026-08-06「替换老是冲突」止痛：add 限 `public/games/<slug>` → commit(带路径·不碰他人暂存) → fetch→rebase --autostash→push 自动重试；冲突自动 abort 保本地提交。冒烟 `scripts/art-sync-smoke.py`（临时仓自证）。library 卡带不适用（自带每卡带版本化）。根治项（覆盖层拆分·冲突面归零）另议 |

## 六、验收口径

1. 全链 smoke（mock）：生成游戏→列表推导（行数=manifest 美术槽数·spec 字段非空）→批量 mock 生成（落独立命名空间 gen/mock/·台账 generated+gen.mock 明标）→**生产端点 0 写回**（mock 永不重钉/不登皮肤别名/不可复核——owner 2026-07-10「Mock 数据不该这样做」，真图前游戏保持原始 placeholder 观感）→重钉机械路径由 CLI `--allow-mock` 冒烟专用腿单独自证（parseManifest 零 error 照旧）→游戏可玩且观感与替换前一字不变。
2. 断点续跑：批处理中途杀进程→重跑→只补 queued/失败行，replaced 行不重扣费（缓存命中）。
3. 真 key 一款端到端：placeholder 版可玩 → 批量换装后可玩且风格成套（缩略图墙人验）。
4. 编号稳定性断言：改一行重跑，其余行编号与资产不动。

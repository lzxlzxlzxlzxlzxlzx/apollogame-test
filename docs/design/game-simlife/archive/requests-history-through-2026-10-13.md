# 历史证据，不是当前施工依据｜game-simlife 施工单（归档于 2026-10-13）

## 当前活动工单

### SIMLIFE-WORLD-VISUAL-SEMANTICS-01｜世界视觉语义与素材覆盖硬门

- 状态：active
- 施工主体：BDM程序（2026-10-13 本地锁）
- 启动词：Owner 已裁决 A；共享 Life 合同下沉，禁止魔王城私补丁。
- 代码基线：`2acb7d93a2bacebf21723671a0ade4a65183306c`
- 目标：为 warp 可见地标与行动地表视觉状态建立严格、render-only、纯 JSON 的 World Visual Semantics v1，并接入 validator/compiler/Generation Bundle/asset-slot closure/review artifacts。
- 验收：无可见 landmark 的 warp、缺 surface visual 的互动地表、非等价状态静默共用 visual key 均路径级验红；Demon Castle 与 Little Valley 完成候选迁移；素材未获人审时只保留 placeholder/local-review/AI pending 候选，魔王城正式四文件不更新。
- 允许边界：共享 Life protocol/authoring/compiler/renderer/资产槽位消费、点名测试、两试点候选与审阅物、SOP/技能/路线图事实同步。
- 禁止边界：游戏私有 TypeScript、自由 DOM/CSS、专属 renderer 分支、远程模型/API、素材批准或正式 AssetIndex 登记、远程 Git/数据库、整套服务、Owner 人门代签。
- 声明改动范围：`src/{engine/protocol,assembly,authoring,renderer,assets}/**`、必要的 `src/skills/tier3/life-world*`、`scripts/life-*`、`games/game-simlife/**`、`docs/design/{game-simlife,game-demon-castle}/**`、`docs/playbooks/{assets,art-pipeline,rendering-fx,events-logic}.md`、`.agents/skills/{simlife-generation,module-art,module-assets}/SKILL.md`、`docs/projects/simlife-engine/project-roadmap.json`；超出前须回到工单改边界。
- 完整规格：[work-orders/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md](work-orders/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md)
- 证据：待写入 `self-check/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md` 与 `review/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md`。

## SIMLIFE-POSE-ANCHOR-01｜统一玩家脚点、逻辑判定与高亮格

- 状态：✅ 非施工人独立复查通过，待 owner Playtest（2026-10-12）
- 施工主体：Codex/root（2026-10-12 本地锁；Owner 禁令下不执行 Git 抢锁/推送）
- owner 复现：真机截图中黄色当前格与玩家精灵分离；Little Valley 历史上存在同形问题。禁止通过单游戏 `render.offset` 掩盖。
- 架构判断：接受为共享 Life render projection 的既有能力扩写。实查 `t2-life-continuous-motion` 已明确 `Transform` 是唯一连续位置权威、`LifePosition` 是按 `Math.floor` 派生的逻辑格缓存；`life-scene-render` 却让玩家脚点读 `Transform`、高亮读可能陈旧的 `LifePosition`，形成双源投影。现有 `@engine/math/grid` 已提供 `cellFloor/cellCenter`，AssetSlot `render.anchor/offset/fit/display` 已是纯 render-only 图片框合同，因此无需新增 schema/system 或游戏私有逻辑。
- 边界：只改共享 Life pose/grid 投影、Canvas renderer 的既有 Life descriptor 消费、点名测试与两游戏验收文档/路线图；不改移动积分、碰撞/交互/相机权威语义，不让 render-only 值进入 World/snapshot/hash，不修改单游戏 offset，不启动服务，不执行 Git/远程数据库，不代签 owner 真机 Playtest。
- 验收：静止、连续移动中、正/负格边界、不同 display/anchor/offset、相机跟随、interaction/proximity 均从同一 `Transform` 脚点与 floor 分格导出；player/NPC/placement 贴图脚点遵守 bottom-center 语义；Little Valley 与 Demon Castle 同时覆盖；施工自检、唯一锚点撤修验红与非施工人独立复查在档。
- 施工实证：新增共享 `life-pose` 纯投影，continuous collision/position-sync、renderer/highlight、host view/WorldUI 共用同一 floor/脚点合同；placement descriptor 固定 bottom-center，AssetSlot draw-plan 证明 display/fit/anchor/offset 只改变图片框。两正式包、host、movement/activity/navigation/NPC/art/playtest 扩展回归 **14 files / 130 tests passed**，相关 ESLint PASS；撤掉 highlight pose 锚点后精确 **1 failed / 14 skipped**，恢复后转绿。`align-count` 为 **✅4 / ⚠2（均报 owner Playtest）/ ❌0**。独立复查重跑 **14/130**、ESLint、DOCS-REF、路线图 unittest、Vite build 全部通过；full tsc 仅既有无关红且本单零命中，Blocker/Major/未解决 Minor 均为 0。自检：`self-check/SIMLIFE-POSE-ANCHOR-01.md`；独立复查：`review/SIMLIFE-POSE-ANCHOR-01.md`。

## SIMLIFE-VIEWPORT-01｜Life 统一格子与镜头规范

- 状态：✅ engine/candidate/正式四文件更新与独立复查通过，待 owner Playtest（2026-10-12）
- 施工主体：Codex/root（2026-10-12 本地锁；Owner 禁令下未作 Git 抢锁/推送）
- owner 决策：以 Little Valley 的实际格子、可视格数、HUD 与镜头安全区为所有 Life/sim-management 游戏统一规范；游戏不得自由改变宿主基础格尺度。
- 架构判断：接受为共享 authoring/host/render 合同缺口。标准必须由 engine-owned profile id 唯一选择并被 descriptor、Life package validator、生成链与共享 Host 共同校验；不得把 Little Valley 的自由数值复制到每个新游戏，也不得开放游戏私有 profile。
- 禁区：不启动服务，不执行 Git/远程数据库，不代签 Playtest、路线图 owner gate 或素材审批。依据 `AGENTS.md §2.2`，本工单已获明确授权后允许 agent 使用严格双 hash materializer 更新本地正式工程 JSON，并必须完成写后复验。
- 施工实证：新增 engine-owned `life-standard-v1` 单一真相并接入 Host descriptor、Life package validator/compiler、Generation Bundle、materializer 与共享 Host；Little Valley 已改为 profile selector。descriptor/package 自由数值与未知 profile 均 fail-closed；生成包/共享 Host 强制 profile，legacy 省略仅保留底层 parser 兼容。响应式仍为 render-local，三尺寸 snapshot/hash 不变；素材比例继续走 `render.display/anchor`。魔王城 World/Host candidate 与 canonical Bundle 已重建，`life-gen-check` 通过。agent 以 confirmation `sha256:9553b62593fa5b0dc910226cea40d7a6f9b15513cbfd5ab9766971e519a770d3` 和旧组 hash `sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b` 完成正式 `--update`；新组 hash 为 `sha256:8a639e81aa9d828077628b924d65ee85f1592f93f5738b6492b18540795e6529`，写后 `--plan-update` 返回 `conflicts:[]` 且 `currentFilesHash` 与新组一致。为避免正式四文件目录被测试污染，Playtest 合同测试已迁至 `src/authoring/demon-castle-playtest-contract.test.ts`；materializer 增加仅用于受控 update 的 pre-profile 严格迁移桥，并有 exact-shape 正负回归。正式目录恰含四个 canonical JSON；施工回归 **12 files / 134 tests passed**，非施工人最终复查 **13 files / 138 tests passed**、撤修精确验红并恢复、Critical/Major/Minor 均为 0。全库 tsc 仅余既有无关错误，本单零命中。

## SIMLIFE-BUNDLE-05｜阶段切片 → 已签名 Bundle 候选编译器

- 状态：✅ 独立复查通过且 owner 已完成正式四文件提升，待 Playtest（2026-10-12）
- 施工主体：Codex/root（2026-10-12 本地锁；Owner 禁令下未作 Git 抢锁/推送）
- owner 裁决：**A**——将 World 与按序批准的 Actors / Construction / Plot patch、素材槽位编译成通用、可落盘、可复验的 `LifeGenerationBundle v1` 候选；拒绝本次由 owner 手工拼 JSON 或为魔王城保留一次性脚本。
- 架构判断：接受为已有 Generation Bundle authoring 控制面的通用缺口。现有 `checkLifeGenerationBundle()` 只校验已存在的完整 Bundle；`life-materialize --promote` 也只消费完整 Bundle。`docs/design/game-demon-castle/bundle-review.md` 证实当前试点只能在内存中合成，无法作为正式提升 CLI 的稳定输入。不存在能读取 `zerocraft.life-generation-patch.v1`、执行严格 JSON Pointer patch、复算 provenance 并持久化候选的共享组件；不能以手工复制或游戏私有 Node 脚本等价重组。
- 边界：只新增共享 authoring composer/CLI、严格 schema、纯数据 fixture、点名测试、SOP/生成工作流/本工单自检与 Review；为当前已审游戏新增一个仅声明源文件顺序与 Bundle session 元数据的 source manifest，并由新 CLI 产生 `bundle.candidate.json`。禁止改 Life runtime、renderer/UI、素材审批/AssetIndex、`public/`、正式 `games/`、launcher 代码、pipeline、存档、数据库、服务、Git 或网络；不得为具体游戏写合成分支。
- 数据合同：引入闭集 `zerocraft.life-generation-slice-manifest.v1`。manifest 只声明 bundle session（id/round/createdBy/prompt contract）、slug、一个 world JSON 文件名、按稳定 order 的 slice 文件名及 asset-slot 文件名；所有路径必须是 source-root 同目录的安全 `.json` basename，拒绝 URL/绝对路径/`..`/symlink/额外字段。slice 固定解析 `zerocraft.life-generation-patch.v1` 的 `baseWorld`、`requiresSlices` 与 `operations`，要求 base world 名完全一致、依赖与前序 manifest slice 精确闭合；operation 仅允许 `add|replace`、受限 JSON Pointer 与普通 JSON 值，拒绝原型污染、越根、缺 parent、越界数组及重复/错误顺序。每次输出都由当前最终 life package + asset slot draft 重算 canonical source hashes/base hash，绝不信任作者提供的 hash。
- 行为：默认 `life-bundle-compose <slice-manifest.json> --source-root <absolute-design-root> --plan` 零写入，返回 canonical bundle hash、输入 hash、输出 `bundle.candidate.json` 的字节/hash 与严格 Bundle/compile/two-tick snapshot-restore/slot closure diagnostics。仅显式 `--write-candidate` 才能原子写固定同目录 `bundle.candidate.json`：目标不存在或逐字节相同才成功；partial/different/file/dir symlink、竞态、写/rename/复验失败均 fail-closed 并清理本事务 staging，不能覆盖。输出 Bundle 必须可直接作为现有 `life-materialize --plan/--promote` 的输入；host/launcher 继续由既有独立候选文件传入。
- 验收：至少两个纯临时 source-root fixture（不同 slug/slice 顺序）证明 canonical bytes 与 hash 稳定；world、slice schema/base、requires、JSON Pointer/array、非法 path、未知字段、stale source/hash、asset/compile/slot closure错误全有稳定诊断且零写；候选首次写、重复幂等、different/extra/symlink/rename/复验竞态均零覆盖。魔王城 source manifest 重建出的 Bundle hash 必须等于已审 `bundle-review.md` 的 `sha256:ab2510b87787a77c74e3416fd00064bc396dbb7f18d6be980b803f91e8b37890`，并能喂给 M0 产出同一四文件 plan。施工者须有唯一锚点撤修验红；非施工人独立复跑、破坏性验证、读 warning；不得执行正式 promote。
- 施工实证（2026-10-12）：共享 composer/CLI、strict manifest/patch、魔王城 source manifest 与 canonical candidate 已落地；真实候选重建 exact base hash，M0 confirmation/four-file hashes 未漂移。最终 Composer/CLI **2 files / 24 tests passed**，连带 Bundle/Host/Materializer/Launcher **7 files / 100 tests passed**，ESLint、DOCS-REF、路线图 unittest 与 Vite build（761 modules）通过。独立复查首轮发现发布后 source 竞态 Major，已补最终 `sourcesUnchanged` 复验与永久回归并关闭；独立撤修精确转红、恢复后全绿。全库 tsc 与 context-budget 仅余既有无关红；未执行正式 promote、Git、数据库、服务或网络。自检：`self-check/SIMLIFE-BUNDLE-05.md`；独立复查：`review/SIMLIFE-BUNDLE-05.md`。
- CLI 返修（2026-10-12）：策划以 `docs/design/game-demon-castle/bundle.sources.json` 作为 positional manifest 的首个试点命令复现 basename-only 拒绝。现 CLI 允许无 `..`、解析后父目录精确等于 source-root 的相对路径并归一为 basename，仍拒绝绝对路径、URL、穿越与其他目录；该原样 npm 命令已返回 `ok:true` 与 exact base hash，M0 原样命令返回原 confirmation hash，已补永久正/负回归并再次送非施工人复查。
- 竞态返修（2026-10-12）：再次独立复查首次全量捕获一次 post-publication 外部替换文件被误删的间歇 Major；随后重复虽全绿仍按真实失败处理。事务身份已从可能丢精度的 number `Stats.dev/ino` 全面改为 bigint stats，外部替换永久回归提升为单次 32 轮压力；施工方点名 32/32、Composer/CLI 24/24 全绿并送非施工人压力复验。
- 最终复查（2026-10-12）：非施工人 bigint 压力 **8×32=256/256**，随后两次全量各再覆盖 32 轮；原样首个 npm plan、四类 unsafe manifest、M0 confirmation、source_changed、24/24、100/100、lint/docs/roadmap 与 warning 裁决全部通过。累计发现 3 个 Major 均关闭；Blocker 0 / Major 0 未解决 / Minor 0。
- 正式提升（2026-10-12）：owner 亲自在本机以 confirmation `sha256:441ab550e45b61362cb9e7bdc1b022ac0721714bc24b137f56b0b70a14fd09ee` 执行 `--promote`，返回 `writesPerformed:true / writtenFiles:4`。agent 随后逐文件核对 byte/hash，重跑只读 M0 得 `conflicts:[]` 与同一确认哈希；Materializer/launcher/CLI **4 files / 40 tests passed**，独立 Vite build **765 modules PASS**。正式目录已可被固定 discovery 消费；仍不得把物化成功冒充 Playtest 人门通过。

## SIMLIFE-ASSET-04｜GPT 图像生成适配器进入既有待审素材链

- 状态：✅ 独立复查通过，待策划收束（2026-10-11）
- 施工主体：Codex/root（Owner 禁令下未作 Git 抢锁/推送）
- owner 授权：可使用 GPT 图像生成；本工单仍明确限制为适配器实现与 mock/HTTP 合同测试，不调用真实 API、不生成真实游戏图片、不批准正式资产。
- 架构判断：接受为既有资产 authoring 旁路的通用 provider 扩写。默认 qwen 保持兼容，调用方可显式选择闭集 `qwen|gpt-image`；GPT 走官方 Image HTTP API，Codex 内置 imagegen 仅能作为独立手工导入来源，不能冒充 Node 自动接口。
- 边界：只改共享 Life generation batch、Node `ai-gen`/Life CLI、点名测试和本设计目录文档/自证/Review；不碰 gameplay、Life runtime、renderer、UI、正式 game-simlife 图片/index/pending。测试写盘仅限 OS 临时根。
- 验收：provider 选择、real/key 双门、GPT base64 PNG 与错误处理、槽位尺寸/alpha 规范化、pending 零 index 写、原 key approve/reject、qwen 回归、JSON 泄漏审计、CLI 显式 provider 与坏值拒绝全部点名；相关门禁、锚点撤修验红及非施工人独立复查在档。
- 施工自检：相关 11 files / 167 tests、ESLint、reconcile、ledger strict、DOCS-REF 与 audit ratchet PASS；真实 21 槽 GPT plan 为零写入，正式 index hash 与 pending 状态不变。撤修 provider approval 唯一锚点后 GPT approve 守卫精确 1 failed，恢复后全绿。未调用真实 API/网络、未生成或批准正式图片；导航：`self-check/asset04.md`、`review/SIMLIFE-ASSET-04.md`。
- 独立验收：首轮实证发现远端错误码可能回显完整 OpenAI key；返修为只输出类型约束的 HTTP status 后，恶意回显探针 `LEAK=false`。最终 11 files / 167 tests、ESLint、reconcile、ledger strict（21/21/0）、DOCS-REF 与 audit ratchet 通过；独立撤掉 GPT approval provider 后点名用例精确 1 failed / 41 skipped，恢复后 1 passed / 41 skipped，锚点 1、marker 0。21 槽只读 plan 保持正式 index hash 与 pending 不变；context/tsc/build 仅既有无关红。Blocker 0 / Major 0 / Minor 0；复查导航：`review/SIMLIFE-ASSET-04.md`。

## SIMLIFE-ASSET-03｜Codex 素材候选生成 → 人审 → 游戏应用链

- 状态：✅ R1 独立复查通过，待策划收束（2026-10-11）
- 施工主体：Codex/root（本地锁；Owner 禁令下未作 Git 抢锁/推送）
- owner 裁决：**A**——生成时先查本地素材库，未命中再准备 AI 2D 候选；无论来源，每个候选都必须经 owner 人审，只有批准后才以原槽 `assetKey` 登记到游戏本地 AssetIndex。
- 架构判断：接受为现有素材作者态管线扩写。复用严格 `AssetSlotBrief`、候选计划器、审阅包与 `ai-gen` pending/approve 门，只新增闭集批次执行计划、默认 mock 的 Codex CLI 和审批时的 manifest 绑定复验；不新增 gameplay capability/system/phase，不改 runtime/world/UI/renderer/正式游戏内容。
- 边界：共享纯数据计划器、Node CLI、`ai-gen` pending/approve 最小接缝、点名测试和本设计目录文档/自证/Review。禁止真实供应商/API/付费模型、自动批准、本地候选直接 vendor、真实仓库索引或正式图片写入；测试写盘仅限 OS 临时根，Little Valley 现有 index/key/正式文件须保持不变。
- 验收：合法 2–3 槽批次区分 `local-review|ai-generate`，invalid 稳定；AI 仅落 pending 并携 slot/key/fingerprint/规格/anchor；批准后同一 `art:` key 进入临时游戏本地索引且带 provenance/binding/spec；fingerprint/assetKey/slotId/尺寸/alpha/cross-game 篡改逐项 fail-closed，索引与旧正式文件不变；local 不 vendor/不写 index；JSON 往返与输入换序逐字节稳定，无 secret/path/url/bytes/approval 泄漏；相关资产/Life/ai-gen 回归、ESLint、唯一锚点撤修验红与非施工人 Review 在档。PASS 只证明资产候选/审批管线，不代表真实视觉质量或新游戏试玩完成。
- R1 施工自检：默认 plan 零写入；显式 generate/approve/reject 闭环已接通。批准会重读 current manifest + trusted `assets/index.json` + 源 PNG，核验 metadata/content fingerprints、规格、像素/alpha、license/style 与越根防线，再 copy 到 game-local `vendor/project/` 并以原 key upsert，文件名带原始 slotId 稳定哈希防 slug 碰撞；artlib、非 PNG、伪造/漂移/缺失/穿越/cross-game 均拒绝。最终相关 **11 files / 156 tests passed**，ESLint、reconcile、ledger strict、DOCS-REF、audit ratchet PASS；唯一 R1 对账锚点反转后精确 2 failed，恢复双绿。正式 game-simlife index/图片/pending 未改。导航：`self-check/asset03.md`。
- R1 独立验收：非施工人首轮发现合法 `hero.one` / `hero-one` 被纯 slug 映射到同一文件，第二次批准会覆盖第一份已批准字节；返修为可读 slug + 原始 slotId SHA-256 短后缀后，两 key 路径及 PNG 字节均独立。最终 **11 files / 156 tests passed**，相关 ESLint、asset reconcile、ledger strict（21/21/0）、DOCS-REF 与 audit ratchet PASS；独立撤掉哈希后缀后碰撞守卫精确 **1 failed / 37 skipped**，恢复后 **1 passed / 37 skipped**，最终全绿，锚点 1、marker 0、临时 probe 0。只读 21 槽 CLI 保持正式 index/文件集合不变；context/tsc/build 仅既有无关红。Blocker 0 / Major 0 / Minor 0，待策划收束；复查导航：`review/SIMLIFE-ASSET-03.md`。

## SIMLIFE-ENG-24｜多方向键真实状态收敛 / 防松键后幽灵左移

- 状态：✅ 已完成（2026-10-10，独立验收）
- 施工主体：BDM程序（锁）
- 架构判断：接受。该问题属于既有共享 `life-input → queued Signal → t2-life-continuous-motion` 链的状态收敛缺陷；方向输出必须成为当前物理方向键集合的完整、确定性投影，不能依赖同 tick 多条 start/stop signal 都被逐条消费，也不得在 Little Valley、host UI 或对话层添加私补丁。不新增玩法 capability/system/phase；如实查证明现有 queued input 合同无法表达完整投影，才按缺口协议报 owner A/B。
- 边界：只改共享 Life 输入桥、必要的 continuous-motion 既有解释接缝、Little Valley/host 点名测试及本设计目录自证/Review；不得改 `src/ui/**`、资产、数据库、服务、Git/GitHub或无关文件。
- 验收：先复现左+上 held、连续右键（repeat/别名混用）、任意与同 tick 全 keyup 后残留左移；覆盖相反轴中间 Velocity、同方向 alias、duplicate/repeat、E/Tab、blur/visibility、同 tick queued input；终态四 flags false、Velocity 归零且后续多 tick Transform 稳定。真实 Little Valley World + DOM adapter 必须覆盖；ENG-23 的 E 不停移动、对话中移动与 proximity 自动关闭不退；DebugTrace 若触及 sim 判定则遵守 bounded opt-in；定向门禁、锚点撤修验红与非施工人独立复查在档。
- 施工结论：根因是同一个 `KeyBinding` 实体每 tick 只能挂一份 `Signal`；`releaseAll` 同拍排入多条同名 `life.move.stop(arg)` 时，keybind 只保留首个匹配参数，未被表示的方向永久残留。修复后浏览器 reducer 每次真实方向变化发完整 `life.move.state` 位掩码，`t2-life-continuous-motion@1.1.0` 按 actor/source 取同 tick 最后一份快照，原子覆盖四个 held flag；旧 `life.move.start/stop` Signal 兼容不变。施工方终态定向 **27 files / 224 tests passed**，相关 ESLint、DOCS-REF、component manifest **205/205**、7-system 子图、audit ratchet、S4 **60/0/0** 均 PASS；tsc/build 仅命中既有无关红。撤掉唯一 InputQueue state 消费锚点后，sim trace 与真实 Little Valley World 两个守卫精确双红，恢复后双绿且 marker 0。复查导航：`review/SIMLIFE-ENG-24.md`。
- 独立验收（2026-10-10）：非施工人确认 keybind 首命中 `break` 的真实根因，并核验完整 mask reducer、aliases/opposed/repeat、E/Tab、blur/visibility/releaseAll、同 tick last-wins、多 actor/source、非法 mask fail-closed、ENG23 对话语义、legacy/collision/navigation/save/snapshot/hash 与 bounded opt-in trace。最终定向 **27 files / 224 tests passed**，扩展 keybind/queued-input **2 files / 17 tests passed**；相关 ESLint 零 warning，`DOCS-REF`、component manifest **205/205**、5-capability/7-system 子图、audit ratchet 与 S4 **60/0/0** 均 PASS。已读取薄宿主既有“零能力接入”黄项，未发现本单红旗。唯一 state 消费锚点计数 1，临时恒假后关键 sim trace + 真实 Little Valley 守卫精确 **2 failed / 27 skipped**，恢复后点名与最终全绿；marker 0、无临时改动残留。复查导航：`review/SIMLIFE-ENG-24.md`。

## SIMLIFE-ENG-23｜连续移动与非阻塞邻近对话会话策略

- 状态：✅ 已独立验收（2026-10-10）
- 施工主体：BDM程序（锁）
- owner 裁决：**A**——在 Life package 的严格 JSON `interaction` 合同增加闭集对话会话策略；由既有 `t2-life-talk` 在确定性运行链中按 `LifeActivityContext.nearbyPlacementIds` 结束越界会话。旧 package 兼容默认显式保持 `persistent`，Little Valley 显式选择 `proximity`。
- 架构判断：接受。实查 capability registry、Life validator/compiler、`t2-life-activity` 与 `t2-life-talk` 后确认，包级/placement 级 `interactionRange` 已统一投影为同 tick 的 nearby 集；本单只扩写既有数据合同和 `life-talk` 解释，不新增 capability/system/phase，不在 host/UI 私自隐藏权威会话。共享输入 reducer 保留真实 held keys，E/Tab/Enter/Escape 不再生成 move.stop；对话期间允许自由移动，越界关闭后 held state 与 Velocity 继续由物理 key 生命周期决定。
- 边界：只改 Life package 协议/严格校验/compiler、共享 `life-talk`、Life host input/interaction/game-host、Little Valley JSON、必要 capability plan/authoring 文档和点名测试/自证/Review。不得改 `src/ui/**`、`src/renderer/canvas-renderer.ts`、资产、数据库、服务、Git/GitHub或其他无关面。
- 验收：纯 reducer 覆盖 Up+Left→E/repeat→keyup 且 held/stop/start 顺序不漂；真实世界覆盖对角移动中开对话、持续移动、按 package/placement range 越界自动关闭、held directions 不丢、回到范围后可重开、choice/terminal、alias/blur/visibility；旧包 persistent 兼容与 Little Valley proximity 显式策略；旧存档活动会话在新策略下近处重建、远处 fail-safe 关闭；snapshot/hash/save 无 UI/host 私写；DebugTrace 可重建自然关闭且关闭时真 no-op；定向测试、ESLint、DOCS-REF、system graph、能力审计、自证、带锚点撤修验红与非施工人 Review 在档。
- 独立验收（2026-10-10）：非施工人独立复现闭集 schema/compiler、旧包 persistent、Little Valley proximity、Up+Left→E/repeat→keyup、对话中连续移动、越界清权威 session、held/Velocity 延续、回范围重开、choice/terminal、package/placement range、近远 restore、坏 cursor、determinism/hash/save 与 bounded opt-in trace。当前定向 **27 files / 218 tests passed**，相关 ESLint 零 warning，`DOCS-REF`、component manifest **205/205**、5-capability/8-system 真实子图、audit ratchet 与 S4 **60/0/0** 均 PASS；已读取全局超集 5 个信息性环和薄宿主既有 audit 黄项，均非本单回归。唯一 proximity 分支锚点计数 1，临时恒假后精确 **2 failed / 6 skipped**，恢复后 2 绿及最终全绿，marker 0、无临时改动残留。全库 tsc/build 只命中已知 game-dice/game-theft/launcher 与 ENG22 art 测试，零命中 ENG23。复查导航：`review/SIMLIFE-ENG-23.md`。

## SIMLIFE-ENG-22｜小山谷登记素材真实消费竖切 / 资产槽位闭环证明

- 状态：✅ 已独立验收（2026-10-10）
- 施工主体：BDM程序（锁）
- 架构判断：接受，但先证后改。唯一合法消费链为 `AssetSlot/skinKey → loadLifeDemoArtInto → loadGameArtInto → skinMap → Life renderer`；不得新造 loader，不得修改 `public/games/game-simlife/art/**`、资产索引或台账。若玩家、草地、镇长、成熟萝卜四类登记素材已真实消费，则以渲染证据、映射降级负例和测试证明交付，不为工单制造冗余代码；只有实证发现消费端缺口时才做最小修复。
- 边界：只核对/修正必要的 Life 资产消费端、renderer 点名测试与本设计目录 self-check/Review。禁止新增/生成/导入/登记资产，禁止修改游戏本地 art 目录、AssetIndex、art-ledger、`src/ui/**`、数据库、服务、Git/GitHub；现有 `loadLifeDemoArtInto → loadGameArtInto` 是唯一加载入口。
- 验收：四个已登记 key（玩家、草地、镇长、成熟萝卜）必须从 `skinMap[skinKey]` 解析为实际 URL 并在 tile/player/placement/crop 四类渲染投影可见；anchor/depth/连续坐标、碰撞及 snapshot/hash 不变；临时撤掉一个 slot mapping 后画面确定性降级并由测试捕获，恢复后全绿；`asset-reconcile`、`ledger-audit --strict`、renderer/asset/Life 回归、ESLint、DOCS-REF、game audit、自证、带锚点撤修验红与非施工人 Review 在档。
- 独立验收（2026-10-10）：非施工人核对 slots/index/ledger **21=21=21**、零重复且 key 差集为空，四个点名 key 均解析到真实本地 SVG；确认唯一 `loadLifeDemoArtInto → loadGameArtInto → AssetManager.resolve → CanvasRenderer` 消费链、真实 Life action 成熟作物、anchor/depth/图层、内存缺登记 fallback 与 snapshot/order hash 不变。独立定向回归按当前工作树 **11 files / 110 tests passed**，相关 ESLint 零 warning，asset reconcile、ledger strict（21/21/0）、`DOCS-REF` 与 audit ratchet 均 PASS；完整读取到薄宿主静态扫描的既有“零能力接入”黄项，未发现本单红旗。唯一活动玩家贴图锚点计数 1，临时恒假后精确 **1 failed / 1 passed**，恢复后全绿，锚点 1 / sabotage marker 0，无临时改动残留。复查导航：`review/SIMLIFE-ENG-22.md`。

## SIMLIFE-ENG-21｜通用 2D 相机安全区跟随 + 地图边界钳制

- 状态：✅ 已独立验收（2026-10-10）
- 施工主体：BDM程序（锁）
- owner 裁决：**A**——扩写共享 `t2-camera-follow`，增加闭集、数据驱动的屏幕安全区；越界时只移动超出的轴并把焦点落回对应边，之后再执行地图 `Bounds` 钳制。地图边缘允许玩家靠近屏幕边，但绝不显示地图外、绝不回拉玩家。
- 架构判断：接受。现有 `Camera.followMargin` 仅控制 fit zoom，`camera-follow` 每 tick 强制居中，无法由现有数据重组出“安全区内相机保持”；本单扩写既有 capability，不新增 system/phase，不在 Little Valley、renderer 或 host 写私有相机逻辑。多目标继续以 AABB 中点加 `followOffset` 为焦点，先沿用既有 fit zoom，再逐轴应用安全区，最后钳制 Bounds；省略新字段逐位保持旧居中语义。
- 边界：只改 `Camera` 数据合同/原子定义、共享 `camera-follow`、Life package 严格 schema/compiler、Little Valley authoring 数据、对应手册与点名测试/自证/Review。不得改 `src/ui/**`、数据库、服务、Git/GitHub，不启动应用，不让 renderer-private responsive cover 回写 World/Camera。
- 验收：纯能力四边/对角/Bounds/角落/省略兼容；followOffset、fit zoom、多目标显式回归；Life 严格 unknown/range/schema/compile；Little Valley 连续移动覆盖中心→安全区→地图边；玩家/高亮/WorldUI 投影一致，snapshot/hash/save/warp/zoom/responsive cover 不退；DebugTrace opt-in 可重建 hold/越界/钳制且关闭时零副作用；定向测试、ESLint、文档/system/audit、带锚点撤修验红与非施工人 Review 在档。
- 独立验收（2026-10-10）：非施工人扩展复跑 schema/manifest、Camera、Life compiler、Little Valley、renderer/WorldUI、host/save/warp/navigation/determinism **20 files / 208 tests passed**；13 文件 ESLint 零 warning，component manifest **205/205**，`DOCS-REF`、5-system 相关子图与 audit ratchet 均 PASS。首轮实证发现的 DebugTrace 静止心跳、双 Camera 去重、关闭态专用闭包分配及 0.3 速度后的旧 save 路径均已返修复跑；独立撤掉唯一 dead-zone 读取锚点后精确 **1 failed / 20 skipped**，恢复后点名与最终全绿，无临时改动残留。复查导航：`review/SIMLIFE-ENG-21.md`。

## SIMLIFE-ENG-20｜Little Valley 移动速度与交互输入稳定性

- 状态：✅ 已独立验收（2026-10-10）
- 施工主体：BDM程序（锁）
- 架构判断：接受。Little Valley 速度是既有 `movement.speed` authoring 数据；连续输入异常属于共享 `life-input` 纯 reducer 对浏览器 repeat/held-key 生命周期的缺陷。复用 `t2-life-continuous-motion` 的具名 `life.move.start/stop`，不新增 capability/system/phase，不写游戏私有积分或 DOM 世界写入。
- 边界：只改 Little Valley `movement.speed` 数据及点名回归、共享 `src/engine/host/life-input.ts` 与 host/Little Valley 输入回归、必要 capability plan/自证/Review。不得实现或绕过相机 safety-zone/dead-zone（owner 已裁 A，排下一单）；不得改 `src/ui/**`、资产、数据库、服务、Git/GitHub或其他无关面。
- 验收：N tick 连续位移严格大于旧 0.18/tick 基线且碰撞/对角归一化保持；方向 repeat 不关闭交互，交互键初次按下先唯一释放 held movement，交互键 repeat 零副作用，keyup/blur/visibility 与 WASD/Arrow 别名交错后 flags/Velocity 收敛，fresh direction 只产生唯一 start；定向 Vitest、ESLint、DOCS-REF、system graph、技能审计、带锚点撤修验红与非施工人 Review 在档。
- 独立验收（2026-10-10）：非施工人复跑运动/host/共享装配/Little Valley/世界交互/raw JSON **6 files / 74 tests passed**；相关 ESLint 零 warning，`DOCS-REF`、5-system 相关子图与全局 119-system 审计均 PASS，能力审计未覆盖红旗 0 且 `RATCHET: PASS`（薄宿主“零能力接入”为既有静态扫描黄项）。独立撤掉唯一 direction-repeat guard 后点名精确 **1 failed / 21 skipped**，恢复后点名与最终 74 测全绿；速度、归一化/碰撞、六键 release/repeat、alias/blur/visibility、真实 flags/Velocity 交错、菜单/对话与 DOM 薄适配均接受。复查导航：`review/SIMLIFE-ENG-20.md`。

## SIMLIFE-ENG-19｜恢复中的 Life 对话会话重建 / 防永久移动锁

- 状态：✅ 已独立验收（2026-10-10）
- 施工主体：BDM程序（锁）
- owner 裁决：**A**——在既有 `t2-life-talk` 确定性运行链中，从持久化 `LifeDialogueSession.dialogueId + State.current` 与静态 `LifeDialogueCatalog` 重建不入存档的 `DialogueScript` 运行态；非法旧快照确定性清理孤儿会话与残余对话组件并恢复移动，不在 host 私自强制解锁。
- 架构判断：接受。`LifeDialogueSession` 与 `State` 是进度权威，`DialogueScript` 是可由 package catalog 重建的静态运行态，不应复制进存档；本单扩写既有能力的恢复契约，不新增 capability/system/phase，不写 `game-simlife` 私有解释器。
- 边界：只改共享 `life-talk`、必要的 Life save 契约注释/投影保证、点名测试与本工单 Review/自证。不得改 `src/ui/**`、游戏 JSON、素材/资产索引、数据库、服务、Git/GitHub、`narrative-director` 或其他无关面。
- 验收：真实持久会话在 line/choice 两态 save→restore 后下一 tick 重建正确面板并可用 Tab/Enter/pointer 继续；缺目录项、缺 State、未知节点等旧快照 fail-closed 清理并允许方向产生 `life.move.start`；存档/快照/hash 不含 `DialogueScript` 或 host/render 数据；terminal close、脱离 proximity 推进、held release 回归不退；DebugTrace 可重建 rehydrate/recovery 且关闭时真 no-op；定向测试、文档/system graph、带锚点撤修验红与非施工人 Review 在档。
- 施工与独立验收（2026-10-10）：`t2-life-talk@1.3.0` 在 `dialogue` 前从 `LifeDialogueSession + State + LifeDialogueCatalog` 重建 `DialogueScript/Text`；非法目录/游标销毁保留实体并记录 reject→transition。通用 host 在恢复成功后补一次确定性派生 tick，save transient reset 同步 `LifeContinuousMotion.sceneId` 到持久 `LifePosition.sceneId`，避免首 tick 把跨场景存档拉回出生场景。非施工人独立复跑 Life/host/save/Little Valley 定向 **10 files / 106 tests passed**，ESLint、`DOCS-REF` / `SYSTEM-GRAPH` PASS，能力审计无红旗且 RATCHET PASS。撤掉 rehydrate 调用锚点后点名精确 **4 failed / 9 skipped**，恢复后点名 4 项全绿。复查导航：`review/SIMLIFE-ENG-19.md`。

## SIMLIFE-ENG-18｜LifeHost 会话锁、世界坐标与响应式相机一致性返修

- 状态：✅ 已独立验收（2026-10-09）
- 施工主体：BDM程序（锁）
- 架构判断：接受；owner 裁决 **A**。实查发现现有 `t3-dialogue` 能推进图但终端没有确定性关闭动作，若只在 host 隐藏面板会遗留权威 `LifeDialogueSession` 并永久锁输入。A 为扩写既有 `t2-life-talk`：增加 queued `life.dialogue.close`，只允许当前节点为 `line + next:null` 时销毁专用会话；B 为游戏/host 私有强关（代价是权威分叉与存档残留），已被 owner 否决。其余均为既有会话优先级、连续坐标、renderer-only 高亮与 responsive-cover effective camera 修正；不新增 system/定序/存档或游戏内容特例。
- 边界：只改共享 Life host presenter/interaction/input/game-host、Life/Canvas/WorldUI2D render-local 投影及点名测试；必要时更新协议/导出、game-simlife 回归、自证与 Review。不得改 `src/ui/**`、真实素材、AssetIndex/public，不启动服务/数据库，不执行 Git/GitHub，不修无关 tsc 红。
- 验收：活动会话自动显示且离开 NPC 仍可用 Tab/Enter/鼠标推进；会话期间 release held direction 并拒绝 move.start，完成后立即恢复；玩家/高亮/交互/WorldUI2D 同一格坐标真相且无半格偏移；responsive cover 在 640/1060/1440 与四边位置共享 effective camera，玩家/高亮/锚点均在视口且 snapshot/hash 不变；LayoutNode/UI audit、Little Valley/host/save/renderer 回归、trace、截图对齐、撤修验红与独立 Review 全部在档。
- 施工与独立验收（2026-10-09）：既有 `life-talk` system 增加 terminal-only queued close；LifeHost 自动接管活动会话、释放/拒绝移动并在关闭后恢复，render collector 消除连续 `Transform` 的重复半格偏移，Canvas 以 actual visible cells 计算 renderer-private clamp 并让 Canvas/WorldUI2D 共用，同层增加只读当前格高亮。非施工人独立复跑 Life/host/save/renderer/game-simlife **12 files / 109 tests passed**，UI components **62 files / 493 tests passed**；以临时隔离 Edge 审计三尺寸均 overlap/contrast/border-image 0；半格公式撤修后点名精确转红，恢复后全绿。`DOCS-REF` / `SYSTEM-GRAPH` PASS，能力审计无红旗且 RATCHET PASS。独立复查导航：`review/SIMLIFE-ENG-18.md`。

## SIMLIFE-ENG-17F｜受限 Life authoring materializer M0/M1

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 架构判断：接受。17A/16A 已提供 bundle、host 与 canonical 校验，17E 已冻结四 JSON 的 launcher 发现约定；本单只补 Node authoring 控制面的 plan、containment、幂等与原子落盘事务，不新增 gameplay capability/system，不改变 bundle v1，不自动上架。
- 边界：新增 Node-only materializer library/CLI、严格测试和文档；M0 永远只读，M1 只在隔离临时根测试。agent 绝不对本仓 `games/`/`public/` 执行 apply，不修改 launcher/UI/AssetIndex，不创建真实游戏，不调用模型/网络/Git/数据库/服务。
- 验收：bundle/host/entry/package/slots 六路 identity 与 placeholder 治理全链校验；plan hash/键序确定；owner-confirm 与绝对 scratch root 双门；realpath containment、symlink/partial/extra/different fail-closed；四文件 staging + atomic directory rename + failure rollback；相同内容幂等零写；落盘后 read/parse/hash/discovery 复核；CLI/负例/17A-E 回归、lint/docs/system、撤修验红与独立 Review。
- 施工实证（2026-10-09）：Node-only M0/M1 library 与 CLI 已完成；17E catalog 已拆成 browser-safe fixed-glob wrapper + 可供 Node 复验的纯 core，生产发现语义不变。最终 17A–17F/Life/launcher/UI 定向 **82 files / 659 tests passed**，本单 ESLint 零问题，Vite build **752 modules**，`DOCS-REF` / `SYSTEM-GRAPH` 均 PASS。M1 只在 OS 临时目录写入并当场清理，本仓未执行 apply；owner-confirm 守卫撤修后点名 **2 failed / 14 skipped**，恢复后点名 2 项全绿。全库 tsc 仍只报既有 game-dice/game-theft/game-runner 三组类型错误，本单文件零命中。独立复查导航：`review/SIMLIFE-ENG-17F.md`。

## SIMLIFE-ENG-17E｜启动器 Life descriptor runner 与零手工 loader 注册

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 架构判断：接受。现有 `mountLifeGame` 已提供唯一受控宿主，但 Life 游戏仍需同时手改 launcher 卡片与 loader map；本单以 build-time 固定 glob、严格闭集 catalog parser 和同目录固定三文件关联消除这条手工路径，不新增 gameplay system、自由模块加载器或运行时路径解释。
- 边界：只改 launcher catalog/runner 接线、点名测试与本设计目录自证/Review；现有 built-in/library 路径保持不变，不改 `src/ui/**`、Life 内容、AssetIndex、materializer、数据库/服务/Git。无效条目必须隔离为可诊断不可运行状态，任何 host/package/slots 校验失败均不得部分 mount。
- 验收：第二个异名 fixture 无 TS gameplay/loader 分支即可发现、展示、选择并走 `mountLifeGame`；unknown/unsafe/duplicate/id-slug mismatch/invalid host/package/slots fail-closed；零条目零回归；选择/返回/连续切换无泄漏；存档 identity 仍仅由 descriptor 派生；定向测试、UI/check-ui、三尺寸无头浏览器、lint/build/docs/system、带锚点撤修验红与独立 Review。
- 施工实证（2026-10-09）：新增严格 `zerocraft.life-launcher.v1`、四个 build-time fixed eager glob、catalog 隔离诊断与 `LifeGameRunner`；当前零 entry 时 launcher 零回归，第二个 `game-seaside-market` 内存 fixture 无 TS gameplay/loader 分支即可发现并实际 mount。最终 launcher/Life/UI 定向 **78 files / 633 tests passed**，ESLint 零问题，Vite build **751 modules**，`DOCS-REF` / `SYSTEM-GRAPH` / audit ratchet 均 PASS。三尺寸实际 launcher bridge UI audit 阻断项归零并产出截图，浏览器已关闭、临时目录已清理；撤掉 `entry.id === directory` 守卫后点名用例精确 1 红，恢复后全绿。全库 tsc 仅余既有 game-dice/game-theft/game-runner 三组类型错误，本单新增文件零命中。独立复查导航：`review/SIMLIFE-ENG-17E.md`。

## SIMLIFE-ENG-17D｜mountLifeGame 通用宿主装配与 Little Valley 薄入口迁移

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 架构判断：接受。17A descriptor、17B presenter/controller/input/HUD 与 17C save adapter 已把宿主语义拆成共享、可验证零件；本单只新增确定性生命周期装配，不新增 Life gameplay capability/system。共享函数只接收已提供的 descriptor/package/asset-slot 数据对象及受控 art loader，严格校验后组合 mountHost/run loop/renderer/input/UI/save；不读取 descriptor 路径、不接 launcher/materializer/网络。
- 边界：新增 `src/engine/host/life-game-host.ts` 与点名测试；Little Valley 的 `game-simlife.ts` 收敛为 descriptor/package/slots/art loader 的薄调用入口。不得改 Life JSON、`src/ui/**`、launcher、materializer、AssetIndex、数据库/服务/Git。所有世界写只经 QueuedInputSource；dispose 必须释放 loop/keyboard/UI/renderer/host 与 held input。
- 验收：Little Valley 全回归；第二异名 descriptor/package/slots 走同一 mount；invalid descriptor/package/slots fail-before-mount；storage missing/incompatible/fresh 行为；重复 mount/dispose 无 listener/timer/action 泄漏；approved/placeholder fallback；LayoutNode/check-ui/三尺寸只读浏览器；lint/build/docs/system；带锚点撤修验红与独立 Review。
- 施工实证（2026-10-09）：通用 `mountLifeGame`、浏览器安全 descriptor core 与 Little Valley 薄入口已落地；定向 **9 files / 98 tests passed**，check-ui **62 files / 493 tests passed**，本单 ESLint 零问题，Vite build 749 modules，`DOCS-REF` / `SYSTEM-GRAPH` / audit ratchet 均 PASS。三尺寸真实共享宿主 screenshot 与 UI audit 均通过且无头浏览器已关闭；撤掉 `shell.teardown()` 后 lifecycle 用例精确 1 红，恢复后全绿。全库 tsc 只余既有 game-dice/game-theft/launcher 红，本单零命中。独立复查导航：`review/SIMLIFE-ENG-17D.md`。

## SIMLIFE-ENG-17C｜通用 Life 存档策略与隔离恢复

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 架构判断：接受为既有 `SaveSystem` / `StoragePort` 的共享 host-side 严格投影与恢复策略，不新增 gameplay capability/system。现有 Little Valley adapter 已证明 snapshot/order/hash、隔离 load、瞬态清理和 commit signature 的基本路径，但 slot/version/allowlist/compatibility 均为游戏私有，且保存了 Camera/Velocity/连续输入等不应持久化状态；本单下沉通用 policy，复用现有 SaveSystem 校验，不另造 codec/后端。
- 边界：新增 `src/engine/host/life-save.ts` 与点名测试；Little Valley 仅保留 descriptor 数据和薄兼容 wrapper。不得改 Life JSON、World protocol、`src/ui/**`、launcher/materializer/AssetIndex，不直连 localStorage/IndexedDB，不启动服务。slot 只由 17A descriptor namespace 派生；恢复先在隔离 World 验证，再一次性替换；失败保持活动世界逐值不变。
- 验收：双 descriptor/双游戏共用 MemoryStoragePort 隔离；slot/namespace/cross-slug/descriptor/package/hash/order/version/player/calendar 负例；权威进展 roundtrip + 瞬态排除/清零；autosave 只响应持久 commit；DebugTrace opt-in/no-op/hash；Little Valley 迁移回归、lint/build/docs/system、纯 host 恢复后 HUD/互动可用、撤修验红与独立 Review。
- 施工实证（2026-10-09）：共享 `LifeHostSaveAdapter/LifeHostAutosave` 已落地，Little Valley 只保留 descriptor 与薄 wrapper；严格字段投影排除 Camera/Velocity/input/request/UI/trace/prompt/provenance/assets，并从 fresh compiled baseline 恢复 package 静态字段。最终 **8 files / 94 tests passed**，本单 ESLint 零问题，Vite build 749 modules，`DOCS-REF: PASS`，`SYSTEM-GRAPH: PASS`。全库 tsc 仅余既有 game-dice/game-theft/launcher 红，本单零命中。descriptor fingerprint 撤修后负例精确转红，恢复后全绿。独立复查导航：`review/SIMLIFE-ENG-17C.md`。

## SIMLIFE-ENG-17B｜通用 Life 视图投影、互动状态机与 LayoutNode HUD

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 架构判断：接受为既有宿主能力的通用化迁移，不新增 sim capability/system。现有 Little Valley 的只读 World 投影、递归交互控制器、键盘适配器与 LayoutNode HUD 已覆盖所需语义，但混有内容 ID 与中文文案特例；本单将其下沉为只消费公开 Life components、`LifeActivityContext.affordances` 与 `life-host.v1.hud` 的通用 host presenter/controller/input/HUD，并以异名 package 证明零内容 ID 分支。
- 边界：新增 `src/engine/host` 通用纯模块及点名测试；Little Valley 仅作迁移见证并保留薄兼容导出。不改 Life World/schema/compiler/system/snapshot，不改 `src/ui/**`，不接 launcher/materializer/资产，不启动服务，不写游戏层规则判断。交互只发既有语义 action；可选 DebugTrace 仅记录宿主交互 decision/transition/reject/commit，关闭时零开销且不进入权威 hash。
- 验收：第二个任意 ID package；E/Tab/Enter/Escape、递归 item 选择、鼠标/键盘等价、离开/上下文变化关闭；输入 reducer 与 DOM 安装分离、keyup/blur/visibility 全释放且阻止页面滚动；descriptor HUD title/labels 消费；LayoutNode 校验/UI audit/check-ui；snapshot/hash 零污染；撤修验红、门禁与独立 Review。
- 施工实证（2026-10-09）：Life host + descriptor + Little Valley 回归 **7 files / 87 tests passed**；本单 ESLint 零问题；全库 Vite build 成功（747 modules）；`DOCS-REF: PASS`；`SYSTEM-GRAPH: PASS`。640×720 / 1060×760 / 1440×900 headless UI audit 均重叠 0、硬对比失败 0、警告 0、华丽件 4，浏览器已关闭、临时目录已清理。撤掉 scene/x/y context fingerprint 后点名用例精确转红，恢复后通过。全库 tsc 仍仅有既有 game-dice/game-theft/launcher 红，本单文件零命中。独立复查导航：`review/SIMLIFE-ENG-17B.md`。

## SIMLIFE-ENG-17A｜life-host.v1 严格运行描述符与 validator

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- owner 裁决：**A**——补 sim 外、authoring-only、严格闭集的 `life-host.v1` 运行描述符及 fail-closed validator；不新增 Life system，不改 World/snapshot/runtime hash，不接 launcher，不做 materialize。
- 架构判断：接受。ENG-17 已证现有 Life compiler、host、renderer、LayoutNode、assets 与 save 零件足够，缺口只是统一读取这些宿主参数的纯 POD 合同。描述符必须固定本游戏 package/slot 路径、`artSlug===slug`、闭集 HUD/input/theme、由 slug 派生 save namespace，并提供复用 ENG-16 canonicalization 的稳定 hash；禁止函数、自由 module path、URL、资产批准、任意 LayoutNode/CSS/action 字段。
- 边界：新增 authoring descriptor/validator/fixture/测试与文档；保持 `LifeGenerationBundle v1` envelope/hash/CLI 逐位兼容。不得读写 `games/` / `public/` / AssetIndex，不改 launcher/UI/renderer/game-simlife 运行代码，不调用 Git/DB/服务/网络/模型。因无 tick/world decision，不接 DebugTrace。
- 验收：Little Valley 等价 descriptor 与第二个异名 fixture；strict unknown/prototype/path/slug/art/save/viewport/HUD/input/theme/autosave 负例；稳定 path+code diagnostics；canonical hash 键序不变且值变必变；无写入/launcher/AssetIndex side effect；ENG-16/Life/AssetSlot 回归、lint/docs/system read-only 检查、带锚点撤修验红；交 Review 单待非施工人独立复查。
- 施工实证（2026-10-09）：descriptor 定向 **28 tests passed**；连带 ENG-16/Life/AssetSlot 回归 6 files / **63 tests passed**；本单 ESLint 零问题；`DOCS-REF: PASS`；全局 system graph `PASS`（116 systems、零重复 id、零悬空显式边）；副作用关键词扫描零命中。撤掉 `artSlug===slug` 锚点后点名用例精确转红，恢复后最终 63 全绿。全库 tsc 仍仅被既有 `game-dice`、`game-theft`、`launcher/game-runner` 类型错阻断，本单文件无新增类型错误。独立复查导航：`review/SIMLIFE-ENG-17A.md`。

## SIMLIFE-ENG-16A｜LifeGenerationBundle v1 生成收件与只读诊断

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- owner 裁决：**A**——补 authoring-only、严格闭集、确定性的 `LifeGenerationBundle v1` 收件/诊断/修复约束与 dry-run 物化计划；本单不接模型、不创建新游戏、不写正式 `games/` / `public/` 产物、不改资产索引。
- 架构判断：接受。现有 `LifeGamePackage` validator/compiler、Quest/Relationship 审计、AssetSlotBrief 和 Engine 探针能组成执行链，但缺少可信边界上的统一 bundle envelope、分阶段稳定 diagnostics、机器 prompt packets、受限 repair 与无副作用 dry-run plan；`manifest-check` 面向已编译 Manifest，`asset-slot-guard` 面向已落盘游戏，均不能替代生成收件层。该缺口属于 authoring control plane，不新增 sim capability/system。
- 边界：严格校验 `schemaVersion/session/game/assetSlots/provenance`，拒绝未知字段、秘密/供应商 key、绝对或穿越路径、字节与 approved 声称；依次执行 Life 严格校验、compile、隔离 Engine 两 tick、snapshot/hash/restore、AssetSlot schema/fingerprint/无索引闭包、registry/system graph 可用性；只输出稳定 diagnostics、五段 prompt packets 和带内容哈希的 dry-run plan。repair 只能命中本轮诊断路径且 baseHash/round fail-closed。
- 验收：Little Valley 转换 fixture；world/actors/plot/assets 坏例稳定分阶段转红；严格 schema/path/bounds、quest/relationship/slot/pending、canonical/hash/snapshot、provenance 不泄漏、dry-run 零写入、repair baseHash/路径/轮数、撤修验红、定向测试/lint/registry/system graph/docs guard 及独立复查全部通过。
- 施工实证（2026-10-09）：最终定向 8 files / **55 tests passed**；新增文件 ESLint 零问题；`DOCS-REF: PASS`；全局 system graph `PASS`（116 systems、零重复 id、零悬空显式边）；真实 CLI 子进程 dry-run 零物化；撤掉 `approved_forbidden` 锚点后点名用例精确转红，恢复后全绿。全库 tsc 仍仅被既有 `game-dice` / `game-theft` / `launcher` 类型错阻断；pipeline registry 既有红仍为三游戏缺 board，本单按冻结边界不改 `pipeline.json`。独立复查导航：`review/SIMLIFE-ENG-16A.md`。

## SIMLIFE-ENG-15A｜通用确定性 NPC Relationship

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 领工声明（2026-10-09）：代码基线为当前共享工作树；边界限于通用 Life relationship 严格 authoring/schema/validator/compiler/capability/registry/component map、复用真实 outcome 的确定性结算与 gift 最小通用接缝、Quest/Dialogue 条件效果、只读 projection、Little Valley JSON 竖切/最小 LayoutNode 展示、测试/文档/Review/自证。不改 `src/ui/**`、不写游戏层关系判断、不用魔法 Resource id 冒充关系、不引入随机/墙钟、不导入实际资产，不碰 Git/DB/服务。
- 架构判断：接受 owner 裁决 **A**。实查已证 `Resource` 只能存单值，`Flag` 只能存布尔；现有 Life 没有 npc 绑定、关系等级、每日预算、gift 原子扣物、统一 outcome 规则或关系投影。`Stats`/`ModifierStack`/`Memory` 也无 Life authoring/结算闭环。故下沉一个通用、闭集、确定性的 Life relationship 解释器；底层库存 helper 与权威 outcome 可复用，但关系状态及等级解释只归该能力。
- 验收：严格 unknown/reference/level/cap/trigger/effect reject；Mayor/Merchant 独立；talk +2/day cap2；turnip gift 原子扣1并 +5/day gift cap5；friendly=5 解锁 dialogue/quest condition；priority→npcId→ruleId→sourceId 稳定序；同 NPC 同拍冲突 fail-closed/显式互斥；跨日预算 reset；Quest/Dialogue 统一关系核；projection 只读；snapshot/hash/save/restore/trace；system graph/registry/component map/capability plan/AI contract；撤修验红、UI audit、file:// 真渲染及独立复查。

## SIMLIFE-ENG-14A｜通用 AssetSlotBrief + Life visual contract

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 领工声明（2026-10-09）：代码基线为当前共享工作树；边界仅限通用 authoring-only `AssetSlotBrief` 严格数据契约、只读校验/闭包守卫、Life render-only visual contract、AI pending 统一审门、Little Valley 对现有 placeholder key 的 slot 声明与点名测试/文档。不改 `assets/index.json` 或游戏 local AssetIndex，不创建/生成/导入/复制/登记真实资产，不核验具体许可；这些严格归 `asset-manager` 负责。不将 prompt/path/license/provider/model/bytes 写入 Life package / World / snapshot / hash / save，不复制 world placement/collision/depth 为第二权威，不改 `src/ui/**`。
- 架构判断：接受 owner 裁决 **A**。现有 AssetIndex/AssetManager 只足以按 key 装载资产，无法机器保证“生成前固定尺寸/锚点/消费位，生成后经唯一人审门进入正确 key”；且 Life renderer 当前将 tile/crop/player/placement 的 scale/anchor/fit 写死。因此补通用、闭集、版本化的 authoring/validation + render-only 能力，而不是新增 sim system 或游戏私有解释器。
- 验收：严格 schema/unknown-field reject；slot/key/pointer 唯一与 Life JSON↔slot↔local index 闭包；尺寸/usage/colorSpace/alpha/anchor/fit/frame 规则；pending/未批准/art-replace 旁路 fail-closed；fingerprint/content hash 只由工具派生；Life JSON/snapshot 无 prompt/path/license；tile/crop/player/NPC/building/resource 六类渲染消费与 fallback；legacy 零漂移/确定性无 runtime 影响；Little Valley 只引现有 placeholder key 并显式标为待 asset-manager 后续处理；点名测试、撤修验红、门禁与独立复查通过。
- 施工实证（2026-10-09）：定向 5 文件 **105 tests passed**；只读闭包守卫 `21 slots / 23 consumers / 0 approved / 21 placeholders`；撤修验红探针精确命中 `consumer_mismatch + missing_slot + approval_bypass`；仓内未出现 generated/pending 资产。全库 `tsc/build` 仍被既有 `game-dice`、`game-theft`、`launcher/game-runner` 类型错误阻断，且全量 vitest 的 22 个失败均在本单范围外；本单改动文件未出现在类型错误中。独立复查导航见 `review/SIMLIFE-ENG-14A.md`。

## SIMLIFE-DEMO-19｜响应式世界画布与相机满幅修复

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 领工声明（2026-10-09）：代码基线为当前共享工作树；边界仅限通用 2D renderer/host 的响应式尺寸接缝、Little Valley 宿主接线与点名测试、本设计目录自证/Review。保留既有 Life 格单位相机、连续移动与世界 UI 投影语义；不改 `src/ui/**`、不新增游戏 system/专属 canvas/专属相机、不改数据库/服务/Git。
- owner 已确认体验目标：页面核心是可视、可玩、近似全幅的方格世界；不能在宽屏只渲染左上角一小块地图、其余成为无用深色空区。
- 架构结论：先实查现有 CanvasRenderer / shell / camera-follow / logical viewport 的尺寸与 DPR/resize 链；若现有能力可组合，仅修 render-host 约束与数据消费，不新增 Little Valley 专属 canvas 或相机系统。若通用 renderer 尺寸能力真缺口，停止给 A/B，不在游戏层绕过。
- 缺口实查（2026-10-09；owner 已裁 A）：registry 的 `l5-camera` 只有世界观察参数，`t2-camera-follow` 只按作者态 `viewportW/H` 计算跟随，`l8-world-ui2d` 只投影；`CanvasRenderer` 仅在 `init()` 读取固定 `opts.width/height` 与 DPR，未观察容器 resize；`mountHost` 明确是“定尺场景盒等比缩进、信箱化”。隔离 file:// 探针依次执行 640×720→1060×760→1440×900 并显式 `fit()`：bitmap/CSS 始终 900×620，实际 scene 分别为 640×440.89（上下共约 279px 空区）、1060×730.22（上下约 29.78px）、1306.45×900（左右约 133.55px），页面错误 0。另已证实 ENG-13A 截图中的 320×240 左上小地图来自当时自证 harness 直接挂 `createLifeDemoSession()` 的测试 renderer，不是正式宿主；正式 900×620 画布在其定尺 scene 内能铺满。
- A（推荐）：给通用 `CanvasRenderer` / host 增加 opt-in 响应式 viewport：ResizeObserver 统一更新 CSS 逻辑尺寸、DPR bitmap、Life/普通 camera 投影和 WorldUI2D overlay；相机作者数据/世界逻辑分辨率不变，渲染端按本地 viewport 受控 cover/fill。代价是改共享 renderer/host 与跨游戏回归；通用性高，后续所有 2D 世界受益；选错的风险是 resize 语义设计不严会波及旧定尺游戏，因此必须 opt-in、默认零回归。
- B：只在 `game-simlife` 宿主写 ResizeObserver、重建/拉伸 canvas 与专属投影补偿。代价较小但会制造游戏层 renderer/camera 逻辑债，WorldUI2D、DPR、指针与 camera clamp 容易分叉；不可复用，且与本单“不得专属 canvas/相机”的边界冲突。选错后仍需迁回 A 并清债。
- owner 裁决：**A**。施工冻结为通用、显式 opt-in 的响应式 host + Canvas viewport；默认 fixed/letterbox 逐位保留。响应式 scene 把 play-field/WorldUI overlay 限在 HUD 条之间；Canvas 以容器 CSS px 为逻辑尺寸、以 CSS×DPR 为 backing store；camera 不回写 World，render-local `cover=max(cssW/refW,cssH/refH)` 同时用于普通/Life 投影与 WorldUI，图片保持 nearest-neighbor，禁止 CSS 非等比拉伸。
- 验收：640×720、1060×760、1440×900 的真实运行中，世界画布占主交互区且相机连续跟随；地图不缩在左上角；HUD 不遮挡主世界；移动、世界交互、浮层边界、T/N 不回归；截图、UI audit、撤修验红与独立复查通过。

## SIMLIFE-ENG-13A｜通用确定性 Life Quest / Story Graph

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- owner 裁决：A——新增通用、确定性、严格 JSON、可快照的 Life 剧情 / 任务图能力；禁止在 Little Valley 游戏层解释条件或硬编码任务状态。
- 架构结论：接受为共享引擎缺口。现有 `t2-life-milestone + t2-life-talk + t3-dialogue + flag/resource access gate` 只能表达收获触发的窄线性旗标链，不能提供显式 chapter/quest/node 状态、Life 原生条件/触发、原子复合效果、并发冲突与图审计。新能力必须复用既有 outcome、库存 helper、Flag/Resource 写入接缝与 DebugTrace，不另造游戏私有规则层。
- 冻结范围：闭集 condition / trigger / effect；`locked|active|completed|failed`；`priority` / `exclusiveGroup`；稳定定序、写冲突 fail-closed、one-shot receipt；严格 validator/compiler 与图审计；snapshot/hash/save/trace；只读 `LifeQuestProjection`；Little Valley 三节点数据示例与 AI authoring contract。
- 验收：严格 JSON reject、引用/可达/循环/死节点/自锁/写集冲突、原子 rollback、插入序确定性、重复 tick 幂等、snapshot/hash/restore/autosave、trace 重建、三节点端到端、LayoutNode 只读投影、撤修验红及独立复查全部通过。

## SIMLIFE-DEMO-18｜世界对话 / 交互可靠性

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- owner 反馈：修复四边安全区内的世界提示/对话/递归菜单；消除交互、鼠标、失焦与多键别名后的偶发移动残留；HUD 固定显示且可点 T/N；递归菜单父项/子项/叶项鼠标与 Tab+Enter 等价。
- 架构结论：接受为既有 `WorldUi2D presentation + LayoutNode handlers + ActionSink + life keyboard/controller` 链的可靠性扩写；不新增游戏 system，不写自由 DOM/Canvas 玩法旁路，不修改 `src/ui/**`。
- 验收：四边/1060×760/1440×900/窄屏真渲染零裁剪；visibility/blur/keyup/alias/repeat/pointer-click 后移动可恢复；N/T 键盘与鼠标同语义；农务/跨天/递归鼠标/边缘对话端到端证据、UI audit、撤修验红、独立复查全部通过。

## SIMLIFE-ENG-12A｜通用确定性 NPC 日程 + 小山谷可见竖切

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- owner 裁决：A——下沉通用、确定性、可快照的 Life NPC 日程 capability；首版在 slot 边界瞬时 relocation，不伪装路线动画，不写 Little Valley 私有解释器。
- 范围：Life protocol/schema/compiler/validator/capability/registry/component map，动态 NPC 的 activity/talk/renderer 消费端，game-simlife JSON/HUD/输入/存档签名/测试/文档与自证；不改 `src/ui/**`，不改 `pipeline.json`。
- 数据契约：`calendar` 严格声明稳定 slot 与 `initialSlot`；NPC placement 可选严格 `schedule`，每个 slot 完整声明 scene/x/y/visible/interactive；无 slots/schedule 的旧 package 保持兼容。
- 确定性：仅用整数 tick/slot 与稳定 id 排序，无墙钟/随机；clock/cursor/position/visibility/interactive 入 snapshot/hash/save；trace 按 decision/transition/reject/commit 且每 system 每 tick ≤3。
- 验收：2 NPC × 2 位置 × 2 slot；`life.advance-time` 推进，wrap 进日并回 initial slot，`life.advance-day` 保留语义且回 initial slot；dynamic render/activity/talk 闭环；visible/interactive 分离；T/N 键盘与鼠标只入队语义输入；快照/恢复/hash/autosave/trace/严格校验/零回归/撤修验红/真渲染/独立复查全部通过。

## SIMLIFE-DEMO-17｜交互可用性返修

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- owner 裁决：A——补通用、显式 opt-in 的 interactive WorldUi2D 桥；禁止小山谷专属 DOM click handler。
- 架构结论：对话安全区、输入恢复与下一天提示接受为既有能力修复；鼠标递归菜单无法由当前能力完整重组，需扩写既有 `l8-world-ui2d` 的通用点击接缝，不新增 gameplay system。
- 实查证据：`WorldUi2DLayerOptions` 已持有 `ActionSink`，但 `world-ui2d.ts` 将每个锚点 host 固定为 `pointer-events:none`，测试也锁死不可点击；`WorldUI2D` / render-local presentation 无交互 opt-in。LayoutNode 单次 action 只能发一条语义输入，而当前叶节点可能需要 `life.select-target → life.action` 两步，父节点还需推进 render-local 递归层级，故不能用现有单 action 数据静默拼出等价行为。
- 边界：通用桥只改 renderer / render-only component 的交互 opt-in、宿主 ActionSink/handler 接线与点名测试；默认仍穿透且不进 snapshot/hash。游戏层只改 LayoutNode 数据、既有 render-local controller 与键盘宿主 adapter，不写 DOM/React/Canvas handler，不改 Life JSON 或 gameplay capability。
- 验收：四边/多行/多层安全区；键盘交互键 auto-repeat、keyup、blur 后四向移动无残留；常驻 `N：休息至明日` 且复用 `life.advance-day`；父/叶鼠标行为与键盘等价且走离失效；相关门禁、撤修验红、自证与独立复查通过。

## SIMLIFE-DEMO-16｜矿洞区域纵切

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 架构结论：接受为既有数据能力重组，不新增 capability/system。`LifeGamePackage` 已能以每场景独立 RLE 描述地形/碰撞，以 mining zone + resource placement 描述矿脉，并由既有 navigation/activity/action/resource-gather/warp/dialogue/milestone 链解释完整故事顺序。
- 实查证据：validator 已校验每层 RLE 面积、terrain tag、blocked actionable zone、resourceNode action/item/quantity、warp 起点与目标 spawn；compiler 会把 zone/resource/warp 编译为 `LifeZone` / `LifeResourceNode` / `LifeWarp`。当前缺口仅是 `mine-interior` 仍复制 36×26 山谷 layers 且 zones/placements 为空，而矿石节点误放在山谷入口。
- 边界：只改 raw JSON、必要的 game 测试及本设计目录；复用现有 `mine-ground` / `blocked-ground` / `clear` / `solid` 与 ore consumer key，不改引擎、`src/ui/**`、美术，不新增游戏 system，不直写 Flag/Inventory 伪造故事流程。
- 验收：新档门锁；真实农务→镇长分支→入矿；独立矿图路径/相机/世界提示同步；真实 mine action 增 ore、耗尽后不可再执行；出口回山谷安全 spawn；严格校验、撤修验红、门禁与独立复查通过。

## SIMLIFE-DEMO-15｜小山谷快照存档接线

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 架构结论：接受为既有服务重组，不新增 capability/system。`createStoragePort()` 已提供持久化后端选择与无后端内存降级，`SaveSystem` 已唯一封装 `World.snapshot()` / `snapshotOrder()`、指纹校验与 `restore()`；游戏只需宿主侧 slot/version、失败降级、恢复安全态和低频提交观察器。
- 实查证据：`src/services/storage/save-system.ts` 的 save 同时保存 snapshot/order/hash、load 在 restore 前验 hash；`select-storage.ts` 已按 SteamCloud→IndexedDB→localStorage→Memory 选择后端。Little Valley 当前无存档接线，且连续运动状态 `LifeContinuousMotion` / `Velocity` 会进入 snapshot，恢复边界必须清空 held intent 与速度；世界旁菜单/controller 本就在 World 外，不应另造格式。
- 边界：只改 `games/game-simlife` 的 game-side adapter / host 接线 / 测试和本设计目录；只消费 `StoragePort` / `SaveSystem`，不改 storage 服务/协议、`src/ui/**`、美术，不新增 game system，不把存档字段写入 Life JSON。
- 验收：稳定 versioned slot；缺档/坏档/版本错/save reject 安全降级；真实 farm/dialogue/warp 等离散提交低频保存，movement tick 不保存；fresh runtime 从同 port 恢复 snapshot order 与关键状态且无 held motion / render-local UI；门禁、撤修验红与独立复查通过。

## SIMLIFE-DEMO-14｜JSON 卡带迁移与 AI 创作入口

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 架构结论：接受为既有能力重组，不新增 capability。`LifeGamePackage`、`validateLifeGamePackage` 与 `compileAndParseLifeGamePackage` 已提供严格、确定、可复用的数据解释链；缺口只在样例仍由 `life-demo-package.ts` 的 `grid/rect/rle` 自由代码生成静态地图。
- 实查证据：当前 `life-demo-package.ts` 含 `Grid`、`grid`、`rect`、`rle` 与 36×26 地图塑形语句，最弱 LLM 无法只填数据复现；仓内 `game101/config/*.json` 使用原生 JSON import，证明现有构建链可直接消费 JSON。迁移后 TS 只保留 `LifeGamePackage` 类型边界，所有世界内容以一个严格 JSON 为唯一来源。
- 边界：主改 `games/game-simlife` 数据入口 / 测试与 `docs/design/game-simlife` authoring、capability plan、Review；独立复查实证发现既有 validator 只关闭 camera、会吞掉 root / scene / access gate 等未知字段，因此补齐 `src/assembly/life-package-validate.ts` 的既有 v1 闭集校验与点名测试（不是新增 capability/system）。不改 `src/ui/**`、美术，不新增生成器、AI 服务或任意自由代码 DSL。
- 验收：raw JSON 走既有严格 validate/compile；未知字段、非法 action fail-closed；36×26/RLE/场景/目录/相机/运动/里程碑/对话/warp/视觉 key 语义无漂移；相关门禁、撤修验红与独立复查通过。

## SIMLIFE-DEMO-13｜状态驱动世界交互消费

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 依赖：`SIMLIFE-ENG-11` 已由策划独立验收。
- 实查证据：旧 `world-interaction.ts` 以 `allowedActions` 决定农务/谈话/采集，以 `LifeGamePackage.scenes[].placements/warps` 猜目标及动作，并从 `view.inventory` 自行筛 `seed.*` 生成播种子菜单；`view-model.ts` 的 `canInteract` / `interactionSummary` 同样只看静态 permission 与 nearby 列表。这些动态判断现已由 `LifeActivityContext.affordances` 覆盖，游戏层必须只做闭集标签、表现排序与语义输入映射。
- 边界：只改 `games/game-simlife` 的只读 presentation / view-model / 测试及本台账、Review；不改 `src/ui/**`、不新增游戏 system、不写 World、不从 package / inventory / crop/resource/dialogue/warp 状态重复判定。
- 验收：E 提示、单选直达、多选菜单、递归播种、禁用状态说明、对话沿用、动态刷新关闭、语义动作顺序、LayoutNode 与 UI audit、ENG-11 连带回归、撤修验红及独立 review 全部通过。

## SIMLIFE-ENG-11｜状态驱动交互可供性

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 裁决：A——下沉通用 Life 引擎能力；交互由对象与当前 World State 共同决定，不在 Little Valley UI 手写判断。
- 实查证据：`t2-life-activity` 只投影 zone `allowedActions` 与通过 access gate 的 nearby placement，不读 `LifeFarmPlot` / `LifeCrop` / `Inventory` / `LifeResourceNode` / `LifeDialogueSession`；`t2-life-farming` / `planting` / `harvest` / `resource-gather` / `talk` / `navigation` 各自在执行时才校验土壤、作物、种子持有、资源余量、对话会话与 warp access。所以仅重组现有 `LifeActivityContext.allowedActions` 无法得到实时可执行集，且若偷换该字段语义会破坏既有静态 authored permission 契约。
- 数据契约：保留 `allowedActions` / nearby placements / nearby warps 原语义；为 `LifeActivityContext` 增加严格闭集、稳定排序、可快照的 `affordances`，只含 action、target、available、闭集 reason 与必要的播种候选 item ids，不含文案或布局。
- 派生语义：农田覆盖未翻土→till、已翻土无作物→water、已浇水无作物→plant（携带稳定排序的种子候选，无种子则闭集原因）、未成熟干燥作物→water、成熟作物→harvest；资源节点反映 available/depleted；NPC talk 同时尊重近邻、zone permission 与会话状态；warp 反映 unlocked/locked。
- 确定性：affordance id、列表与候选 item ids 全部以字典序固定，不依赖 entity 插入顺序；既有 action systems 仍是最终合法性门。
- 日志：新派生系统接 `DebugTrace` opt-in，汇总记录 decision / reject / commit，每 tick 最多 3 条，无墙钟。
- 验收：协议 schema fail-closed；compiler/registry 保持接线；农田、资源、NPC、warp 状态转换端到端覆盖；snapshot hash 与实体插入顺序无关；`allowedActions` 兼容；trace 可重建未提供/不可用的原因；撤修验红、相关门禁与独立 review 通过。
- 边界：本单不改交互 UI 消费端，不改 `src/ui/**`，不改美术。

## SIMLIFE-DEMO-12｜交互体验返修

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 边界：修输入残留、镇长语义链、顶栏可读性与 WorldUI2D viewport-safe 布局；不含农田状态 capability 裁决，不改 `src/ui/**`、不新增游戏 system、不直写 World。
- 验收：交互键 release-all；依赖选择的语义动作跨 tick 有序入队；HUD 不透明且 ≤52px；世界菜单左右/顶边不裁；无 Modal、snapshot 只读、相关门禁及撤修验红通过。

## SIMLIFE-DEMO-11｜小山谷世界内键盘交互

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 依赖：`SIMLIFE-ENG-10` 已独立复查通过。
- 边界：只用已验收 `WorldUI2D` / LayoutNode / semantic queued inputs；允许扩 render-local presentation source，不新增玩法 system、不直写 World、不改 `src/ui/**`。
- 验收：单选 E 直达；多选 E→Tab→Enter；播种种子递归；Escape 返回/关闭；移动与离开范围自动关闭；树零 issue、无 Modal、snapshot 不变、player anchor 真投影；相关门禁与撤修验红通过。

## SIMLIFE-ENG-10｜通用 2D 世界空间 LayoutNode 桥接

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 裁决：A——补通用 2D 世界交互 UI 能力；禁止小山谷 Canvas 手绘特例。
- 边界：本单只下沉 `WorldUI2D` render-only 组件、Canvas 世界坐标投影与 LayoutNode overlay 宿主；不改 `src/ui/**`，不实现小山谷菜单或键盘状态机。
- 验收：
  1. `WorldUI2D` 支持富 `LayoutNode` 或 text 回退与锚点偏移，并从 hash 排除；
  2. Canvas 相机投影覆盖通用世界单位与 Life 格单位且只转换一次；
  3. overlay 按实体池化，更新/消失/出屏隐藏正确且不阻挡 Canvas 指针；
  4. 产出 `data-entity-anchor`，使既有 `Float anchorTo:{kind:'entity'}` 契约有真实生产者；
  5. 组件清单、能力注册、系统图与相关测试通过，交独立 Review 单。

## SIMLIFE-ENG-09｜格子世界相机投影

- 状态：✅ 已独立验收
- 施工主体：BDM程序（锁）
- 裁决：A——下沉通用引擎能力；`LifeGamePackage.camera` 用严格 JSON 声明格单位逻辑视口，禁止游戏层相机特例。
- 边界：通用 `Camera` / `t2-camera-follow` 的像素世界默认语义保持不变；Life compiler 只把格单位声明投影到同一相机能力，renderer 只做一次格坐标→像素转换。
- 验收：
  1. camera schema fail-closed，旧 Life package 无声明仍兼容；
  2. 通用 camera-follow 默认 margin=80、zoom=[0.25,1] 保持不变；
  3. Little Valley 显式 28×19、margin=0、zoom=1；
  4. 900×620 / 32px 下非边界玩家投影到 (450,310)，边缘钳制不露场景外；
  5. compiler、纯投影、游戏测试与指定审计全绿，并完成撤修验红。

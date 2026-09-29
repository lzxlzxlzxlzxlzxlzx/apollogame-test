# 资产手册

> 美术/3D 资产走**统一 Asset 数据路线**：AI 只写查询字符串，选材/登记发生在引擎这台固定解释器里，可审计、同输入同结果。
> **主力工具**：`asset-manager` agent（导入/接线/spec 元数据）· `resource-manager` 技能（vendor + 材质数据 + spec 闭集）。机读真相：单一真相 `assets/index.json`；检索器 `src/assets/library.ts`（`rankRecords`）。

## ① 做 X → 用什么

| 任务 | 能力/机制实名 | 怎么接（一句） |
|---|---|---|
| AI 合理选材（贴图字段） | `art:` 引用 → `resolveArtRefs` | manifest 里写 `"art:skeleton warrior"`；加载前 `src/assembly/resolve-art-refs.ts` 用 `rankRecords` 确定性解析成真实 id（同库同排序器） |
| 算「这局差哪些资产」 | `deriveAssetIndex` | `src/assembly/derive-asset-index.ts` 扫蓝图所有 `assetKey` 字段 → 生成购物单（与逻辑同源，根除 key 漂移） |
| 对账「引用↔登记↔磁盘」是否一致 | `scripts/asset-reconcile.mjs` | 三方对账：登记有文件但磁盘没(dangling-file)/磁盘有文件但没登记(orphan-file)/spec 贴图键悬空(dangling-key)。`node scripts/asset-reconcile.mjs [<game>\|--all\|--shared\|--json]`·判词 `RECONCILE: PASS\|WARNINGS\|FAIL`+退出码 |
| emoji 当图标→换美术图（盘点/映射/vendor） | `scripts/emoji-{audit,resolve,vendor}.mjs` | audit=扫 UI emoji 清单(file:line)·resolve=码点→Twemoji 图(`assets/emoji/<cp>.png`·alias·`coverage`)·vendor=按游戏 copy 进本地(码点键·hermetic)。喂 REQ-UI-emoji图渲（PUI 自动图渲） |
| 抠图/去背 → 真 alpha PNG | `scripts/asset-matte.mjs` + `POST /api/assets/matte` | 二档：`flood`=确定性边缘 flood-fill（主体内同色不误删·可测）+ despill/多种子；`rembg`=AI 兜底（无 rembg→mock）。`node scripts/asset-matte.mjs <in> <out> [--mode flood\|rembg] [--tol N] [--despill]`。产物走 M2.5 pending 人审·provenance 记方式 |
| 透明底精灵 → 不透明 3D albedo（压底） | `scripts/asset-flatten.mjs` | `asset-matte` 的**反操作**：透明底字形/精灵直贴 `Material3D.map` 会渲黑（不透明材质无 alpha 路）→ 压纯色/base 底成不透明 albedo。纯 Node 确定性。单张 `<in> [--base b.png] [--bg #hex]`；批目录 `--batch-dir <d> --base <b> [--keep a,b] [--reindex assets/index.json]`（幂等·只压透明图·回填 provenance.flattened） |
| 从共享库导入一个资源 | `resource-manager` 技能 | vendor（copy）进游戏本地美术目录 + 登记本地索引 |
| DokiWorld App 独立资产闭包 | `scripts/app-asset-closure.mjs` | 以游戏本地 AssetIndex 为真相复制 filled 文件、生成 portable index、清本机路径并产 `ASSET-CLOSURE.json`；额外字体等必须显式列 `extraTrees` |
| 运行期装载本游戏美术索引（真图就绪即换装） | `loadGameArtInto` / `loadGameArtOverrides`（`src/assets/game-art-load.ts`·REQ-SHELL ②） | 两形态同一条链：注册进 AssetManager（渲染器按 **key** 取图）或取 `{skinKey:url}` 覆盖表（DOM/UI 按 **URL** 取）；**失败静默回退**（无索引/非 200/headless=观感零变化·美术是增量非依赖）。**别在游戏层再写 fetch `/games/<g>/art/index.json`** |
| 逐游戏美术需求/生成/替换/换皮 | **美术平台**（ArtLedgerPanel·主屏 🎨 / 卡带「美术台账」入口）+ 大脑 `scripts/art-replace.mjs` + 风格包 `scripts/style-packs.json` | 台账 art-NN 编号 append-only·写回=manifest 重钉或 skinKey 别名·**全员必读终态档 `docs/design/art-platform-2026-07-09.md`** |
| 加贴图/模型/图集/精灵表 | `asset-manager` agent | 维护 `assets/index.json` 单一真相 + 按类型填 spec |
| 批量灌入共享货架（图标/emoji 系列） | `scripts/import-art-pack.mjs` · `import-emoji.mjs` | 整包从 GitHub 拉取→sniff→盖 style/license/source/provenance→并入 `assets/index.json`（加一个包=加一条 PACKS 配置，纯数据）；细节见 `docs/workflow/art-library-handoff.md` |
| 贴图/网格 spec 元数据 | spec 闭集 | usage/colorSpace/wrap/genCollision（贴图）· scale（模型）——闭集，非自由字段 |
| 3D 材质数据资产 | `Material3D`（type:'material'） | 引 texture key（走上面 art:/index），非硬编码预设 |
| 消费端接线 | `Sprite`/`Frame`/`Material3D` | 渲染组件的 key 指向已登记资产（见 rendering-fx.md / 3d.md） |

## ② 样例指针

- 机制说明：`src/assembly/resolve-art-refs.ts`（`art:` 解析 + `ArtResolution` 留痕）、`derive-asset-index.ts`。
- 真实用法：`games/game-e/assets.ts`+`cards-atlas.ts`（牌面图集）、`games/game-g/art-textures.ts`。
- **2D UI 贴图皮入库范例**：`games/game-i/ui-assets.ts` + `public/games/game-i/art/index.json`（贴图皮=`type:'texture'`·`usage:'sprite'` 正规资产·按 key `uiTextureUrl` 解析成 URL 喂 `Button.skin`·`ui-assets.test.ts` 自检）——2D DOM UI 侧「资产 key→已解析 URL」样板，**替代内联 data-URI 硬编码**。两条素材路径都在此示范：**自产程序化 SVG**（零外部文件·"游戏=数据"）+ **vendor 真美术**（Kenney UI Pack·CC0·`node scripts/vendor-asset.mjs kenney-ui/blue-button05 game-i --as tex/btn-blue`·带 `vendoredFrom` 溯源）。
- 索引/类型：`src/assets/index.ts`（`ASSET_TYPES`/`AssetIndex`）、`assets/index.json`、`assets/FreeArtLib/index.json`。

## ③ 本线红线

- 资产**只走统一路线**（art: 引用 / assetKey / index.json），不在游戏层硬编码路径或手写 loader。
- spec 元数据填**闭集**值（usage/colorSpace…），不自由造字段。
- 解析失败的 `art:` 引用原样保留 → 渲染层退化占位，**不炸加载**（fail-soft）。

## ④ 正样例 / 反面教材

- ✅ `resolveArtRefs`：LLM 只产查询串，选材在引擎（与库浏览器同排序器·所见即所选·可审计）。
- ✖ 游戏层写死贴图路径 / 逻辑 key 与资产 id 不同源导致漂移（hero_idle vs hero_idel）。

## ⑤ 查不到怎么办

共享库没有需要的素材 / spec 闭集缺字段 → `docs/workflow/requests.md` 提缺口，或让 `asset-manager` agent 评估导入。**不在游戏层绕开 index.json 自管资产。**

## ⑥ 本地美术目录标准 · vendoring 落点（owner 2026-07-04）

Free Library（共享 `assets/index.json` + `FreeArtLib/`）= **货架·只被 copy**；游戏运行时**只引自己的本地索引**，要用共享资源就 vendor 进本地、**不直引货架、也不直引全局散落目录**。
- 本地根：`public/games/<game>/art/`；本地索引：`public/games/<game>/art/index.json`（站点绝对路径 `/games/<game>/art/...` + `baseUrl ''`，游戏侧 `registerAssetIndex(parseAssetIndex(local))` 直接消费）。
- 分类子目录（约定）：`textures/`（贴图）· `models/`（mesh glb）· `materials/`（`type:'material'` 数据资产·无文件可省目录）· `env/`（天空盒 hdr）。3D 别混进 2D 平铺目录。
- 工具：`node scripts/vendor-asset.mjs <shared-id> <game> [--as <local-id>] [--json]`（2D/3D 同一条·携 spec/license/`provenance.vendoredFrom`·幂等；材质等数据型无文件也支持；`--json` 机读）。
- **软件内直达**：Studio 资源库网格里**右键**任一「项目资产」→ 弹游戏列表 → 点某游戏即 copy 进它本地库（`POST /api/assets/vendor`·薄胶水 shell 调本脚本；`GET /api/games` 枚举 games/game-*）。FreeArtLib/游戏清单来源暂不支持右键 vendor（脚本源限共享 `assets/index.json`）。
- 🚫 反例：游戏直引 `public/textures/` 等全局散落目录（绕过货架+本地索引）——正被 `REQ-PA-3D公用货架` ④b 消解。

## ⑦ 公用 3D 基础素材货架（可 vendor·`scripts/gen-shelf-3d.mjs` 备料）

共享货架已备公用 3D 基础素材，游戏按需 `vendor-asset` 进本地再引（**别直引货架、别自造重复**）：
- **材质**（数据型·无文件·引 pbr 预设）：`mat/matte|plastic|steel|iron|gold|copper|glass|rock|dirt|wood|emissive`。vendor 后 `Material3D.materialRef` 引它。
- **基础 mesh**（程序化 glb）：`mesh/plane`（地块）·`mesh/cube`（箱体）·`mesh/sphere`（星体/占位），spec `scale/genCollision`。
- **程序化贴图**：`tex/plank_albedo`·`tex/plank_normal`（线性）·`tex/rune_emissive`。
- **天空盒**：`env/sky-gradient`（equirect 渐变）。
- **程序化 PBR 材质库**（成套·各品类·每套 albedo+normal+roughness 贴图 + 引它们的材质 `mat/<品类>`）：`brick`·`cobblestone`·`grass`·`sand`·`concrete`·`metal`(金属度1·拉丝)·`fabric`·`tile`·`gravel`。贴图在 `tex/pbr/<品类>_{albedo,normal,rough}`。vendor 材质会连带其贴图 key（游戏侧一并 vendor 那几张贴图）。
- 备料/扩充：`node scripts/gen-shelf-3d.mjs [materials|meshes|textures|env|pbr|all]`（确定性·幂等·零网络·CC0 自产）。缺某类基础素材/品类 → 扩这个脚本（加一条 `CATS` 品类），不在游戏层自造。

## ⑧ AI 文本生成资产（外部服务·框架 `scripts/ai-gen.mjs`）

文本→资产，**先落待审区、人审入库**（带 provenance）。哲学同 `src/services/aigp`：外部**非确定性** AI 走旁路，产物=固定数据，不碰 sim/hash。
- 用法：`node scripts/ai-gen.mjs <tripo|meshy|qwen> "<prompt>" [--game <g>] [--id <id>] [--mock]`；`node scripts/ai-gen.mjs providers` 看设置视图。
- **想先看 mock 流程长啥样**：`node scripts/ai-gen.mjs demo`——两适配器各 mock 生成一个到临时目录、打印落库条目 shape + 设置视图、跑完自动清理（零仓库污染·零网络），用来一眼确认框架跑通。
- 适配器（可扩·加一条进 `ADAPTERS`·zerocraft.py `GEN_ADAPTERS` 白名单同改）：**tripo**·**meshy** 文本→3D glb（`TRIPO_API_KEY`／`MESHY_API_KEY`·meshy 走 v2 openapi text-to-3d preview）· **qwen** 文本→2D png（DashScope 万相·`DASHSCOPE_API_KEY`）。
- 密钥走 env、**绝不入库**；缺 key 或 `--mock` → mock（产合法占位·prompt 播种）。**本环境 GitHub-only·真调 API 被挡 → 用 `--mock`**；真调等放宽网络的 session。
- **人审门（M2.5·宪法「无自动入库」）**：生成产物落**待审区**——`--game` 给了=游戏本地 `art/ai/pending/`；否则共享货架 `assets/ai/pending/`（各 + 独立 `pending.json`·**绝不进 index.json**）。人审 approve 才移出待审 + 登记 index，**provenance 硬校验**（model/prompt/date/license 缺一拒登记）；reject 删待审文件+清项。命令：`node scripts/ai-gen.mjs review <id> <approve|reject> [--game <g>]`·`pending [--game <g>]`。**登记面契约（字段/必填/校验/示例）单一真相**：`docs/design/m2.5-registration-contract.md`。
- **软件内直达入口**：Studio 资源库（launcher→🗃 资源库）工具栏 **✨ AI 生成** 按钮 → `AssetGenPanel`（选适配器 + prompt + 落点 → 生成 → **预览 + 「✓ 入库 / ✕ 弃置」**）；工具栏 **🕒 待审区** 入口 + 待审计数 badge（`AssetPendingReview`·列待审·provenance·双按钮）。后端 `POST /api/assets/generate`（落待审）+ `POST /api/assets/review`（审核·唯一入 index 的门）+ `GET /api/assets/pending`（聚合共享+各游戏待审）+ `GET /api/assets/generate/providers`（key 状态·打码），zerocraft.py 薄胶水·shell 调本脚本，生成/审核大脑全在脚本，UI/后端零逻辑重复。
- 全链自证：单测 `scripts/ai-gen.test.mjs` + 冒烟 `scripts/art-review-smoke.py`（17 断言）+ 真浏览器 `scripts/studio-m25-review-e2e.mjs`（16 断言）。

## ⑨ 风格库（house-style 共享库·styleset·多游戏共享一种美术风格）

`node scripts/styleset-ledger.mjs build` 静态枚举首批清单→走 art-replace `mergeLedger` 保号写库级台账 `style-ledger.json`（mode:library·落 `assets/styleset/<id>/`）+ mock 占位登记共享 index（gen/mock 分域防覆盖真图·真 key 后逐行换真图=M1）；风格锚单一真相=风格包条目（`scripts/style-packs.json` 的 `stylePrompt`）；游戏消费仍 vendor 不直引。图纸 `docs/design/styleset-artlib-plan-2026-07-16.md`。

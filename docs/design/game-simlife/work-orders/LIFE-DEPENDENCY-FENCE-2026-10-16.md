# Life 依赖围栏 33 条审计与分批收敛（2026-10-16）

2026-10-16 Owner 裁决 **A**（BDM 策划聊天原文“好的，选择A”）：将 Life Host 编排迁至上层 assembly/host，逐批迁移消费者与 authoring 类型入口，设计公开兼容入口，不采用 `engine/host` 围栏例外。施工主体：引擎程序 Codex/root；本轮锁见 `../requests.md` 的 `LIFE-DEPENDENCY-FENCE-A`。不变合同：World 规则、存档格式及旧档、持久 hash、正式 JSON/资产、月夜城堡在途 HUD/日历行为。PUI icon feedback 另单施工，不交叉踩文件。

施工/审计主体：引擎程序 Codex/root。本页是当前工作树的只读映射与分批计划；第一批的游戏侧锁见 `../requests.md` 的 `LIFE-IMPORT-BOUNDARY-01`。不重启已归档的 `REQ-P3TAIL`，不放宽 `.dependency-cruiser.cjs`。复现入口：仓库根执行 `npx depcruise --config .dependency-cruiser.cjs src games --output-type err-long`，退出码 1，**33 errors / 0 warnings，1726 modules / 6702 dependencies**；并非全库门禁通过。

## 逐条映射（来源 → 目标 → 所属层 → 候选）

| # | 来源 → 目标 | 所属层 / 迁移候选 |
|---:|---|---|
| 1 | `src/skills/tier2/life-relationship.test.ts` → `games/game-simlife/little-valley.life.json` | skills 测试→游戏数据；把产品集成例移到游戏侧测试，skills 保留自有最小 fixture。 |
| 2 | `src/engine/host/life-game-host.test.ts` → `games/game-simlife/little-valley.asset-slots.json` | Host 测试→游戏数据；拆通用 Host fixture 与 Little Valley 集成测试。 |
| 3 | `src/authoring/life-generation-bundle.fixture.ts` → `games/game-simlife/little-valley.life.json` | authoring fixture→游戏数据；以 authoring 自有冻结 fixture 代替产品 import，保留产品合同另测。 |
| 4 | 同 #3 → `games/game-simlife/little-valley.asset-slots.json` | 同批迁移，不用动态读文件绕过围栏。 |
| 5 | `src/authoring/demon-castle-playtest-contract.test.ts` → `games/game-demon-castle/life.json` | 产品 Playtest 集成测试应归魔王城游戏侧；禁止为迁移改正式 JSON。 |
| 6 | 同 #5 → `games/game-demon-castle/life-host.json` | 同批；Host 正在施工，暂不移动。 |
| 7 | 同 #5 → `games/game-demon-castle/asset-slots.json` | 同批；素材审批/索引不随测试迁移而更改。 |
| 8 | `src/assets/life-asset-review-packet.test.ts` → `games/game-simlife/little-valley.asset-slots.json` | assets 单测→游戏数据；抽自有最小 slot fixture，产品集成断言迁游戏侧。 |
| 9 | `src/assets/life-asset-candidate-plan.test.ts` →同 #8 | 同批；两处测试共用受控 fixture，勿复制两份漂移。 |
| 10 | `games/game-simlife/world-interaction.ts` → `src/engine/host/life-interaction.ts` | 游戏→engine；仅改已导出的 `@zerocraft/engine/engine/host/life-interaction.js`。 |
| 11 | `games/game-simlife/view-model.ts` → `src/engine/host/life-presenter.ts` | 游戏→engine；仅改包名导入/导出 specifier。 |
| 12 | `games/game-simlife/ui.ts` → `src/ui/components/index.ts` | 游戏→UI；仅改 `@zerocraft/engine/ui/components/index.js`。 |
| 13 | 同 #12 → `src/engine/host/life-hud.ts` | 游戏→engine；仅改包名 specifier。 |
| 14 | `games/game-simlife/save.ts` → `src/engine/host/life-save.ts` | 游戏→engine；仅改包名 specifier，不碰 save API/codec。 |
| 15 | `games/game-simlife/keyboard.ts` → `src/engine/host/life-input.ts` | 游戏→engine；仅改两处同目标 specifier，不碰按键路由。 |
| 16 | `games/game-simlife/host-descriptor.ts` → `src/engine/protocol/life-viewport-profile.ts` | 游戏→engine；仅改包名 specifier。 |
| 17 | 同 #16 → `src/authoring/life-host-descriptor.ts` | 游戏→authoring 类型；包目前**不导出** authoring，不能擅加公开路径。后续决定是 A 增受控公开 authoring 类型入口，或 B 将共享类型移至既有低层协议；两者均涉及合同，暂留红。 |
| 18 | `games/game-simlife/game-simlife.ts` → `src/engine/host/life-save.ts` | 游戏→engine；仅改包名 specifier。 |
| 19 | 同 #18 → `src/engine/host/life-game-host.ts` | 游戏→engine；仅改包名 specifier，不改 Host。 |
| 20 | `games/game-simlife/art-consumption.test.ts` → `src/renderer/canvas-renderer.ts` | 游戏测试→renderer；仅改已导出的包名 specifier。 |
| 21 | `src/engine/host/life-save.ts` → `src/skills/debug-trace.ts` | engine host→skills；需拆 Host orchestration/底层接口，不能靠 alias 消红。 |
| 22 | 同 #21 → `src/services/storage/index.ts` | engine host→services；存档端口受旧档兼容约束，合同批。 |
| 23 | 同 #21 → `src/net/index.ts` | engine host→net；序列化/存档合同批。 |
| 24 | `src/engine/host/life-presenter.ts` → `src/skills/tier3/dialogue.ts` | engine host→skills；展示投影应迁到上层/下沉纯类型，须先锁定输出兼容。 |
| 25 | 同 #24 → `src/skills/tier2/inventory.ts` | 同批；不得变 HUD 冻结输出。 |
| 26 | `src/engine/host/life-interaction.ts` → `src/skills/tier2/life-talk.ts` | engine host→skills；交互编排层重新归属须守 World/确定性。 |
| 27 | 同 #26 → `src/skills/debug-trace.ts` | 同批；拒收 trace 不可因迁移消失。 |
| 28 | `src/engine/host/life-game-host.ts` → `src/ui/starters/index.ts` | engine host→UI；宿主装配层迁移候选，当前月夜城堡 HUD 冻结，先不碰。 |
| 29 | 同 #28 → `src/ui/components/index.ts` | 同批；Button/PUI 与 Host 在途，先不碰。 |
| 30 | 同 #28 → `src/runtime/engine.ts` | engine host→runtime；公开 Host 路径迁移需消费者清单与兼容方案。 |
| 31 | 同 #28 → `src/renderer/index.ts` | engine host→renderer；同批。 |
| 32 | 同 #28 → `src/net/host/index.ts` | engine host→net；同批。 |
| 33 | 同 #28 → `src/assembly/life-package-compile.ts` | engine host→assembly；同批。 |

## 现役 Host 冻结面与分批顺序

`docs/projects/simlife-engine/project-roadmap.json` 的 `demon-castle-ui-runtime-01` 当前仍 active：2026-10-16 修订02已把日历中文名加在只读 Host 显示映射，公共 adapter 仅排除新增 render-only `calendarLabels` 以保持历史无字段指纹与旧档兼容；正式四文件受控更新已完成。HUD 六视口/深浅/真浏览器自证已做，独立复查与精确按钮演出、两属性图仍有未决差异。`src/engine/host/{life-game-host,life-hud,life-presenter,life-save,life-input}.ts` 均存在并行未提交变更，本审计不覆盖、不移动、不重命名。

1. **批 A（本轮安全游戏侧）**：#10–16、#18–20 共 10 条仅换既有包名路径；独立锁 `LIFE-IMPORT-BOUNDARY-01`，不动 #17。验收为定向回归、唯一锚点撤修令围栏从 23 返红到 24、恢复 23、非施工者复查；逐文件 diff 只见 specifier。可独立回退这些行，不影响正式数据。
2. **批 B（测试/fixture 去产品反向依赖）**：#1–9 按 skills、Host、authoring、assets 四小批分别领锁；先冻结用例语义与样本 hash，移测试归属或提自有 fixture，每小批撤修验红并异人复查。#5–7 需等月夜城堡 Host/HUD 当前视觉批收束；禁止把文件读取改成动态路径来骗过 depcruise。
3. **批 C（共享合同待 Owner A/B）**：#17 的 authoring 类型入口，以及 #21–33 的 `engine/host` 分层。A：迁宿主编排到上层并规划公开入口/旧消费者迁移，保真旧档/World/hash/HUD；代价是高影响面、多项目导入路径与发布兼容验证。B：保留 `engine/host` 作为明确的 application-host 子层，围栏只对该窄目录作经审例外；代价是底层规则需正式重新定义、长期允许逆层依赖，选错会掩盖新债。未经 Owner 裁决不改规则或公开路径。

精确影响面核对：当前 `package.json` 公开 `./engine/*`，但**无** `./authoring/*`；`tsconfig.json` 亦无 authoring 包名映射，因此 #17 不能只改拼写。仓内按 `engine/host/life-(game-host|save|presenter|interaction|hud|input)` 查得 20 个直接引用文件，涉及 Little Valley 兼容面、launcher、skills 用例、月夜城堡/皮肤审计与日历/存档反事实脚本；按 `authoring/life-host-descriptor` 查得 19 个直接引用文件，横跨游戏、Host、launcher、技能测试、物化和视觉验收脚本。迁入口必须逐个对账这些消费者，不能只凭 13→0 的围栏数字判安全。A 若保留旧路径运行时 re-export，会让 `engine-core-is-bottom` 继续报逆层，故兼容方案须显式设计；B 只允许精确 host 子层例外，绝不全局关闭 bottom 围栏。两路都需 Owner 判词与存档/日历/HUD 冻结重验。

本页只陈列候选，不把局部围栏减少等同全库绿色。远程 Git/数据库、整套系统启动与 Owner 人门均未操作。

第一安全批现已获非施工者[独立局部 PASS](../review/LIFE-IMPORT-BOUNDARY-01-independent.md)，自检见[同名单](../self-check/LIFE-IMPORT-BOUNDARY-01.md)。复查人独立核实 9 个新 alias 都解析到原物理目标、围栏现态 23 错/0 警告、唯一锚点隔离撤修真红并清理；Life 旧 HUD 断言与 GAL 类型错误仍红。#17/#21–33 尚未实施，批 C 必须 Owner A/B 后才能动。

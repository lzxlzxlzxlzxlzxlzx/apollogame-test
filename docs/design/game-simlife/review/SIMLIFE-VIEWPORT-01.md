# SIMLIFE-VIEWPORT-01 独立复查导航

状态：PASS（2026-10-12）  
施工人：Codex/root  
复查人：Codex/review_eng11（非施工人）

## 必查合同

1. `life-standard-v1` 是否唯一冻结 900×620、top 52、bottom 0、cell 32、28×19、zoom 1、margin 0、dead-zone 0.3 与 responsive cover。
2. Host descriptor 与 Life package 是否只允许 profile selector；自由数值、未知 profile、Generation Bundle 缺 profile、Host/package 不一致是否 fail-closed。
3. Little Valley 与 Demon Castle candidate 是否选择同一 profile；相同 browser viewport 是否得到相同格屏幕比例、可视格数与 HUD 安全区。
4. responsive resize 是否只在 renderer 本地生效，World/Camera/snapshot/hash/save 不漂移。
5. AssetSlot `render.display/anchor` 是否仍独立控制实体视觉比例，未通过改格子迁就素材。
6. pre-profile formal update bridge 是否仅限 current target inspection、要求旧闭集 exact-shape，并在规范化后复用当前严格 launcher discovery；新 input/runtime 不得经过桥。
7. `games/game-demon-castle/` 是否只含四个 canonical JSON；Playtest 测试是否位于 `src/authoring/`。

## 独立执行

- 复跑 profile/descriptor/package/compiler/Generation/Host/renderer/materializer/Demon Playtest contract 定向测试。
- 复跑 ESLint、docs reference、roadmap validator 与允许的构建；全库 tsc 只记录真实命中。
- 撤修验红至少命中：descriptor 自由数字拒收、Generation Bundle profile required、profile compiler 28×19、legacy bridge extra-key 拒收之一；确认锚点确实改到目标文件并恢复。
- 读出 `life-gen-check`、composer、M0、plan-update warnings；不得以退出码 0 代替裁决。
- 受控正式更新后确认 formal 四文件逐项等于 materializer canonical plan、写后 `currentFilesHash` 等于新组 hash、catalog diagnostics 为空及新 profile 实际进入 production。

## 判词

**PASS**。Critical / Major / Minor = **0 / 0 / 0**。

- 正式目录恰含四个 canonical JSON；package 与 Host profile 均为 `life-standard-v1`。
- 独立 `--plan-update` 返回 `writesPerformed:false`、`conflicts:[]`，`filesHash` 与 `currentFilesHash` 均为 `sha256:8a639e81aa9d828077628b924d65ee85f1592f93f5738b6492b18540795e6529`；四个文件 hash 与 materializer 计划逐项一致。
- production catalog 对 `life:game-demon-castle` 为 playable、`diagnostics:[]`；真实 launcher → shared Host 挂载、素材 slug 加载、dispose 与三建设 action pipeline 均通过。
- 最终独立回归 **13 files / 138 tests passed**；ESLint、DOCS-REF（46 Markdown / 396 paths）、roadmap unittest（11/11）、Vite build（768 modules）通过。
- 撤掉 descriptor 未知 profile 拒收锚点后，点名用例精确 `1 failed / 21 skipped`；精确恢复后 `1 passed / 21 skipped`，最终完整套件 138/138，临时标记归零。
- `life-gen-check` 的 10 条 warning 均为既有 Flag/provider、npcDialogueId schema 提示与裁剪子图 dangling edge，未命中 viewport、物化或共享宿主行为；Vite 只保留既有大 chunk warning。
- `AGENTS.md §2.2`、Life SOP 与 generation workflow 的受控本地工程文件授权一致，未放宽 Git/GitHub、远程数据库、服务、素材审批、Playtest、S1--S8 或路线图 owner gate。

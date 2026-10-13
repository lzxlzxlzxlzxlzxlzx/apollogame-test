# SIMLIFE-VIEWPORT-01 施工自检

日期：2026-10-12  
施工人：Codex/root  
状态：机器施工、候选预检、正式四文件更新与非施工人最终复查通过；待 owner Playtest

## 架构结论

接受为共享合同缺口。旧 `life-host.v1` 与 `LifeGamePackage.camera` 允许每个游戏自由填写宿主、格子、HUD 和镜头数字，无法保证相同浏览器尺寸下单格屏幕比例、可视格数与安全区一致。修复采用 engine-owned profile selector：当前唯一 `life-standard-v1` 冻结 Little Valley 已验证比例；游戏内容不复制数值、不新增私有 renderer/camera 逻辑。

## 固定规格

- Host：`900×620`、top `52`、bottom `0`、cell `32`、responsive `cover`。
- Camera：`28×19` 格、margin `0`、zoom `1..1`、dead-zone 四边 `0.3`。
- Host descriptor：只接受 `viewport.profile`。
- Life package：只接受 `camera.profile`；Generation Bundle 与共享 Host 必须显式选择且彼此一致。
- responsive 只改变 render-local CSS/DPR/effective projection，不回写 World/Camera/snapshot/save。
- 素材仍由 AssetSlot `render.display` / `render.anchor` 控制尺寸与脚点。

## 实现与永久回归

- 单一真相：`src/engine/protocol/life-viewport-profile.ts`。
- 严格边界：Host descriptor、Life package validator/compiler、Generation Bundle、materializer、shared Host。
- Little Valley：descriptor 与 package 改为 profile selector。
- Demon Castle：`world.life.json`、Host candidate、canonical Bundle candidate 与正式四文件均已迁移；正式目录恰含四个 canonical JSON。
- formal update：测试文件移出必须精确四文件的正式目录；只在 `plan-update/update` 当前目标检查内提供 pre-profile exact-shape 一次性桥，先规范化旧 viewport/camera 后用当前严格 discovery 校验其余内容；新输入、runtime 与 authoring 不经过该桥。
- 负例：自由 descriptor 数字、未知 profile、自由 package camera、生成包缺 profile、迁移桥额外字段全部拒收。
- render 回归：640×668、1060×708、1440×900 三尺寸 resize 后 snapshot/hash 逐位不变；边缘玩家、格高亮与 WorldUI 锚点继续同投影在屏内。

## 执行证据

- profile/descriptor/package/compiler/Little Valley/Host/renderer/materializer/catalog/integration：**12 files / 134 tests passed**。
- 非施工人最终扩展回归：**13 files / 138 tests passed**；正式 catalog 可玩、共享 Host 挂载与三建设语义链均通过，撤修未知 profile 拒收后精确 **1 failed / 21 skipped**，恢复后点名与完整套件全绿；Critical / Major / Minor = **0 / 0 / 0**。
- `life-gen-check docs/design/game-demon-castle/bundle.candidate.json`：`ok:true`，canonical `sha256:37ef26f31cca73fedc75e679bb9fe76189c653c85c3b4a68bcce7d789047f7b4`，runtime `78396adb`；既有 compile/system warnings 无新增阻断项。
- `life-bundle-compose --plan`：`ok:true`、`writesPerformed:false`；重建 candidate 后 hash `sha256:20e503d886d49b94c2ecc091e8cff38f53ff20a9163fe10dee90e724988eedf5`。
- M0：`conflicts:[]`、`writesPerformed:false`、files hash `sha256:8a639e81aa9d828077628b924d65ee85f1592f93f5738b6492b18540795e6529`、confirmation `sha256:9553b62593fa5b0dc910226cea40d7a6f9b15513cbfd5ab9766971e519a770d3`。
- 正式 `--update`：`writesPerformed:true`、`writtenFiles:4`、previous files hash `sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b`、new files hash `sha256:8a639e81aa9d828077628b924d65ee85f1592f93f5738b6492b18540795e6529`。
- 写后 `--plan-update`：`writesPerformed:false`、`conflicts:[]`、`currentFilesHash` 与新组 hash 同为 `sha256:8a639e81aa9d828077628b924d65ee85f1592f93f5738b6492b18540795e6529`；正式 package/descriptor 均选择 `life-standard-v1`。
- 本工单 18 个 TS/测试文件 ESLint：零 warning；`DOCS-REF: PASS`（46 Markdown / 396 paths）；roadmap unittest **11/11 PASS**。
- system graph：120 systems、227 显式边、零重复/零悬空，`SYSTEM-GRAPH: PASS`；列出的 5 个全局超集环为既有跨装配信息项，本单未新增 system/定序。
- 独立 `vite build`：768 modules transformed，PASS；只保留既有 chunk-size warning。
- 全库 `tsc --noEmit` 仍被既有 `game-card-reveal`、`game-dice`、`game-theft`、`launcher/game-runner` 错误阻断；本工单路径零命中。

## 尚未代签

- owner 真机同尺寸 Little Valley / Demon Castle 并排截图仍属于 Playtest 人门。

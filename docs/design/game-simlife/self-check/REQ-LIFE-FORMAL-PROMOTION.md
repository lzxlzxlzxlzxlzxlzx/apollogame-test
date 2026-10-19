# REQ-LIFE-FORMAL-PROMOTION 施工自检

## 结论与边界

施工自检：**PASS，待非施工人独立复查**。

本单只扩展共享 Life authoring materializer 与 CLI，增加 owner-only `--promote` 正式四文件提升。没有修改 Life runtime、UI、存档、资产批准、launcher 代码、pipeline 或任何 `games/game-demon-castle` 正式文件；没有执行正式 workspace 提升。

## 架构判断

接受 owner 已裁决的 A。现有 M0 已生成严格 plan，M1 的 `assertSafeRoot()` 则有意拒绝 workspace、其祖先和后代，无法重组为正式提升；手工复制会绕开 confirmation hash、canonical bytes、staging/rename、写后严格复验与 catalog discovery。正确落点是在同一 materializer 增加判别明确的正式模式，共享 M0 校验和四文件合同，同时保留 M1 scratch 语义。

## 文件面

- `src/authoring/life-materializer.ts`
- `src/authoring/life-materializer.test.ts`
- `scripts/life-materialize.ts`
- `scripts/life-materialize.test.ts`
- `docs/design/game-simlife/life-generation-sop.md`
- `docs/design/game-simlife/generation-workflow-v1.md`
- `docs/workflow/requests.md`
- 本自检、对应 review 导航与 SimLife 项目路线图证据

## 实现核对

1. `promoteLifeAuthoringMaterialization()` 先调用原 `validateInputs()`，完整重跑 Bundle、placeholder、identity 与 launcher discovery 四道 M0 gate；confirmation 不一致在任何文件系统检查前拒绝。
2. workspace 必须为绝对、已存在、真实非 symlink、非文件系统根的普通目录；`games/` 必须已存在、真实且保持在 workspace 内；已有 target 必须是 `games/` 内真实普通目录。
3. 唯一目标为 `<workspace>/games/<slug>`，写入闭集固定为四个 canonical JSON。不存在的 target 只在同一 `games/` 下建立 staging，四文件以 `wx` 写入，先复验，再单次 rename，发布后再次复验。
4. 已有 target 只有恰好四个 regular file 且逐字节等于当前 plan 才返回 `writtenFiles:0`；partial、extra、different、目录/file-entry symlink、路径式 slug、目标竞态全部 fail-closed。
5. write、rename、post-rename verification 故障会清理本事务 staging/新 target；清理前以 `dev+ino` 复核本事务目录身份。独立复查发现并复现了 post-rename 路径被外部目录替换时旧实现误删替换者的 Major，现已修复为身份不一致即保留，并新增永久竞态回归。
6. CLI 的 `plan|apply-authoring|promote` 互斥；`--workspace-root` 仅能配 `--promote`，`--target-root` 仅能配 `--apply-authoring`。结果明确 `mode:"promote"`。
7. 静态扫描未发现 public、AssetIndex、网络、子进程、Git、pipeline、存档或数据库写路径；唯一命中是说明禁区的注释。

## 定向回归

在允许 OS 临时目录 rename/junction 与 CLI 子进程的隔离环境运行：

```text
node -e "patch Node 24 sandbox realpath fallback; vitest run \
  src/authoring/life-generation-bundle.test.ts \
  src/authoring/life-host-descriptor.test.ts \
  src/authoring/life-materializer.test.ts \
  src/launcher/life-launcher-catalog.test.ts \
  scripts/life-materialize.test.ts"
```

结果：初版 **5 files / 75 tests passed**；独立复查 Major 修复后复跑为 **5 files / 76 tests passed**。其中 materializer **26/26**，包含既有 M0/M1 回归与正式提升的首次成功、重复幂等、确认陈旧、输入变化、相对/根/文件/symlink workspace、缺失/非法 games、partial/extra/different、games/target/file-entry symlink、路径式 slug、write/rename/reverify/target-race 清理，以及 post-rename 外部替换目录不被回滚误删；CLI **2/2** 覆盖互斥、参数、退出码、首次提升与幂等。

- ESLint：本单四个 TS 文件 exit 0。
- `docs-ref-guard`：PASS（46 个 Markdown、394 路径）。
- Vite build：PASS，759 modules；仅既有 chunk-size warning。
- 全库 `tsc --noEmit` / `npm run build` 的 tsc 阶段仍被既有 `game-card-reveal`、`game-dice`、`game-theft`、`game-runner` 类型错误阻断；竞态修复后复跑确认本单文件零命中。
- `context-budget-guard` 仍报既有 requests 主池字符数、GAL/card-reveal 工单与 UI playbook 超限；不是本单新增语义，未越界清理。
- `scoped-gate.mjs --run` 会调用 Git，受 Owner 禁令未执行。

普通沙箱会拦截 Node 24 `realpathSync.native`、OS 临时目录 rename 和 Windows junction；首次沙箱运行因此连既有 17F 测试也出现 EPERM。允许短生命周期临时目录测试后，完整 75 项通过；所有临时 workspace 都由测试 `finally` 清理。

## 撤修验红

唯一锚点：`REQ-LIFE-FORMAL-PROMOTION: stale or mismatched M0 approval must fail before filesystem inspection.`

1. 基线点名测试：1 passed / 24 skipped。
2. 临时把 promote 的 `ownerConfirm !== confirmationHash` 反转为 `===`。
3. 点名测试精确转红：**1 failed / 24 skipped**，实际诊断变为 `missing_root`，证明陈旧确认守卫确实先于 workspace 检查生效。
4. 精确恢复锚点后：1 passed / 24 skipped；无 sabotage 残留。

## 禁区与实际操作

测试只在 OS 临时目录创建并清理虚拟 workspace；未对当前仓库或任何正式项目运行 `--promote` / `--apply-authoring`。未执行 Git/GitHub、数据库写入、服务启动、模型或网络调用，也未创建无头浏览器。

## Owner A 通用返修扩展（2026-10-12）

### 施工结论

扩展施工自检：**PASS；非施工人独立复查 PASS**。本轮没有放宽 `promote`，而是在同一通用边界增加两项闭集能力：

1. strict Generation Bundle 在进入候选与 materializer 前，对每个固定 construction placement 枚举合法可走、位于 build-enabled zone、且在交互距离内的单元；用真实 Engine、真实 `LifeActivityContext` 和足量材料/兼容 access 条件证明目标 `build` affordance 为 available。缺 zone、不可达、真实 affordance 不可用分别稳定报 `construction_build_zone_missing`、`construction_build_zone_unreachable`、`construction_affordance_unavailable`。
2. owner-only materializer 增加 `plan-update/update`。更新同时绑定当前正式四文件 canonical bytes 的整组 hash 与新 M0 confirmation hash；新内容在同目录 staging 严格复验后，以受 bigint `dev+ino` 身份守卫的目录 swap 发布。普通故障恢复旧组，发布中外部替换不删除外部文件并保留旧恢复组；相同新内容为零写幂等。

### 新增验收实证

- construction fixture 覆盖合法、缺 zone、距离不可达、access 冲突导致真实 affordance 不可用，以及校验不改变非建设动作。
- 魔王城当前候选永久锚点：删除全部 `build` 后精确产生三个按项目有序的 `construction_build_zone_missing`；终态候选逐项断言 `courtyard-town=[build]`、`courtyard-garden=[till,water,plant,harvest]`、`moonshadow-forage=[forage]`、`undercrypt-vein=[mine,build]`。
- 三个独立真实 Engine session 分别为 `throne-hall`、`greenhouse-ruin`、`forge-core` 证明 `nearby:true`、`allowed:true`、`available:true`。
- safe update 覆盖旧 hash drift、新 confirmation mismatch、staging/rename/post-verify 普通故障回滚、发布中外部替换保留、同内容幂等、`promote` 对 different 目标继续拒绝、plan-update 零写。
- 独立复查发现初版目录身份用 JS `number` 承载 Windows NTFS inode 会丢精度；已改为 `lstatSync(...,{bigint:true})`，永久测试连续四次外部替换竞态均正确保留外部目录与旧恢复组。

终态命令结果：

- `vitest`：**3 files / 46 tests passed**（Bundle 13、materializer 30、CLI 3）。
- ESLint：6 个任务 TS 文件 exit 0。
- `life-gen-check`：新候选 `ok:true`，仅保留既有 3 compile + 7 dangling warnings。
- Vite build：765 modules，exit 0；仅既有 chunk-size warning。
- `tsc --noEmit`：exit 1，仅命中既有 `game-card-reveal`、`game-dice`、`game-theft`、`game-runner`，本轮文件零命中。
- `scoped-gate.mjs --run` 因内部执行 Git，受 Owner 禁令未运行。

魔王城零写更新预检得到：当前正式组 `sha256:801242eb0e9c2445c24241f51172fa0161202d39ee0fcec2742e85080bf9bfa6`；新组 `sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b`；新 confirmation `sha256:559fb88aa44660ac1d33c15331ad92ffa674a62a897f7669e409e2b5664173f7`。agent 未执行正式 `--update`。

### Owner 人门执行结果

owner 于 2026-10-12 亲自在本机执行正式 `--update`，返回 `mode:"update"`、`writesPerformed:true`、`writtenFiles:4`，previous/new group hash 与预检完全一致。agent 随后仅做只读复验：`--plan-update` 返回 `currentFilesHash` 等于新组、`conflicts:[]`；正式 `life.json` 与候选 canonical 内容相等，三个建设项目的真实 Engine session 均为 `nearby:true`、`allowed:true`、`available:true`。最终定向 **3 files / 46 tests PASS**、ESLint PASS。

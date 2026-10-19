# SIMLIFE-GEN-GATE-01 自证｜逐阶段生成 Gate 数据合同

日期：2026-10-11  
施工主体：BDM程序

## 架构结论

接受。该需求是已批准 `generation-workflow-v1.md` 的 authoring control-plane 编排，不是 Life gameplay capability。实现直接复用 `life-generation-bundle.ts` 的 `sha256Canonical()`，没有复制 canonical JSON 或 SHA-256；不新增 system，不进入 World、runtime、snapshot、save、renderer、UI、launcher 或 materializer。

`simlife-generation` 技能把本单限定为严格 JSON gate、机器诊断、可视化引用和 owner token；纯 JSON 不证明操作者身份，上层控制台/会话仍负责 owner 授权。本单没有模型、网络、文件/数据库写入、素材生成、AssetIndex/pending/ledger 或审批服务调用。

## 合同对照

| # | 固定合同 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | schema 与八阶段闭集 | ✅ | `zerocraft.life-generation-gate.v1`；固定 `brief→world→actors→plot→assets→host→bundle→playtest` |
| 2 | 创建 API 只能 pending | ✅ | `createLifeGenerationGate()` 创建输入根闭集，不接受 `ownerDecision`；输出强制 `pending` |
| 3 | canonical input hash | ✅ | 只调用 `sha256Canonical(raw.input)`；对象键乱序同 hash，非有限/循环/非 JSON 输入 fail-closed |
| 4 | 严格单 gate | ✅ | 根、selfCheck、diagnostic、artifact 全闭集；hash、枚举、稳定排序、stage artifact allowlist 均校验 |
| 5 | owner/selfCheck 约束 | ✅ | diagnostics 含 error 时 pass 非法；approved 必须 pass 且零 error；fail+approved 拒绝 |
| 6 | 严格序列 | ✅ | 只能从 brief 起形成连续前缀；跳关、重复、乱序、输入 stage 集不一致均拒绝，后续关要求紧邻前关 approved+pass |
| 7 | 只读推进 | ✅ | `evaluateLifeGenerationGateAdvance()` 仅对当前内容重算 exact hash；pending/fail/changes-requested/stale 全阻断，只解锁紧邻一关 |
| 8 | 可视化引用边界 | ✅ | 每 stage 至少一项；kind 使用阶段 allowlist，ref 只允许无路径/URL/scheme 的不透明安全 id |
| 9 | 稳定输出 | ✅ | diagnostics 与 artifacts 去重稳定排序；对象乱序输出逐字节一致，JSON round-trip 相等 |
| 10 | Bundle/运行时隔离 | ✅ | 与 `checkLifeGenerationBundle()` 前后结果逐字节相同；gate schema/hash 不进入引擎 snapshot |

## 验证

- gate 点名：**1 file / 10 tests passed**。
- gate + bundle：**2 files / 18 tests passed**。
- 完整 `src/authoring`：**5 files / 74 tests passed**。
- 相关 ESLint：exit 0，零 warning。
- 全库 `tsc --noEmit`：仅既有 `game-card-reveal`、`game-dice`、`game-simlife/art-consumption.test.ts`、`game-theft`、`launcher/game-runner.tsx` 类型红，零命中本单。
- `npm run build`：同一组既有类型红使 tsc 阶段退出 1，零命中本单，Vite 未开始。
- `docs-ref-guard`：PASS（46 个 Markdown、393 条路径）。
- `context-budget-guard`：本单共享池 **9/10、24189/25000**，失败仅来自既有 `docs/design/galgame/requests.md` 49238>45000 与 `docs/design/game-card-reveal/requests.md` 57152>45000；未修改两份无关需求单。
- 沙箱内 Vitest 首次在收集前因 `node_modules/vitest/dist/spy.js` realpath EPERM 失败；随后使用获准的短生命周期非服务进程真实复跑取得上述结果，未把环境失败计绿。
- 本模块是 World 外纯 authoring 函数，无 tick/system/副作用与“什么都没发生”的运行态分支；因此不接 `DebugTrace`，所有拒收原因均以稳定数据 diagnostics 返回，也不写 console。

## 撤修验红

唯一锚点为 `raw.inputHash !== hashed.hash` 的当前内容 exact-hash 守卫，撤修前锚点 **1**、marker **0**。临时移除守卫并放置 `GEN-GATE-SABOTAGE` 后，点名“内容变化令旧 gate stale”精确 **1 failed / 9 skipped**，错误为 `expected true to be false`；恢复同一守卫后 **1 passed / 9 skipped**。终态锚点 **1**、marker **0**。

## 文件与边界

- `src/authoring/life-generation-gate.ts`：schema、类型、创建/单 gate/序列校验与推进判定。
- `src/authoring/life-generation-gate.test.ts`：十组合同与隔离测试。
- `docs/design/game-simlife/generation-workflow-v1.md`：共享实现、hash、人审身份与 visual ref 边界。
- `docs/workflow/requests.md`：工单锁与状态。

未执行 Git/GitHub、未启动服务、未写数据库、未创建游戏、未物化或审批资产。`scoped-gate` 因内部执行 Git 检查而受 Owner 最高优先级禁令约束，不运行；其可合法组成项分别实跑并保留退出码。

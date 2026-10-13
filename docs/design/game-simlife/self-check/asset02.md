# SIMLIFE-ASSET-02 自证｜Life 素材候选审阅包

日期：2026-10-11  
施工主体：BDM程序

## 结论

新增共享 authoring-only 纯函数 `buildLifeAssetReviewPacket`。它只把 strict `AssetSlotBrief` 与已验收 `planLifeAssetCandidates()` 编排出的候选计划投影为 `zerocraft.life-asset-review-packet.v1`，供 owner/未来 UI 展示；不重写选材、不调用模型、不读写文件，不碰 AssetIndex、pending、ledger、Life World、snapshot 或审批状态。

## 对照单

| # | 固定合同 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 复用 strict brief + 既有 planner | ✅ | public 入口仅调用 `planLifeAssetCandidates`，验证缝复用 `validateAssetSlotManifest`；无第二份 rank/match 逻辑 |
| 2 | 闭集、可展示、稳定 | ✅ | schema/game/三类计数；按 slotId 排序；每项固定 `pending-human-review`，含 spec/render/consumer 与分支白名单 |
| 3 | 对账 fail-closed | ✅ | plan schema/game/handoff/slot set/order/assetKey/reasons/decision payload 任一不一致即整包 `valid:false`，全部条目降为 invalid |
| 4 | 审批与敏感字段隔离 | ✅ | local 仅 id/score；AI 仅 slot-owned request；输出无 path/license/provider/bytes/contentHash/approval/函数 |
| 5 | 非法输入无半包 | ✅ | manifest unknown field 稳定返回 invalid packet，不抛出、不留 local/AI 可审批项 |
| 6 | 字节稳定与 JSON round-trip | ✅ | slots/records 同时逆序后 `JSON.stringify` 相等；序列化往返相等 |
| 7 | Little Valley 可只读消费 | ✅ | 现有 21-slot brief 生成 21 条 pending 审阅项，零 invalid；未改游戏、素材或运行时 |
| 8 | 人审/物化边界 | ✅ | 文档链固定为 candidate-plan → review-packet → human decision → asset-manager materialization/registration；本单停在人审前 |

## 第一轮独立复查退回与修复

第一轮独立复查发现验证缝只校验 `reasons` 的闭集形状，未把内容与 accepted planner 的真实结果逐字节对账；合法 plan 的 reason 被替换成 `{code:"forged",detail:"forged"}` 时会误收。现已修复：验证缝接收同一组只读 library records，再调用唯一 `planLifeAssetCandidates()` 得到期望计划，逐 slot 对账 decision、reasons 与分支 payload；未复制 rank/match 或 reasons 生成逻辑。定向回归新增 `plan_reasons` 篡改项，伪造 reasons 时整包 fail-closed。

## 验证

- 新模块点名：**1 file / 8 tests passed**。
- 指定回归：review packet + candidate plan + library + asset-slot brief + Little Valley asset slots，**5 files / 46 tests passed**。
- 完整 `src/assets`：**19 files / 179 tests passed**；连同 Little Valley asset slots 为 **20 files / 182 tests passed**。
- 相关 ESLint：exit 0，零 warning；所有 Vitest 通过输出零 warning。
- 全库 `tsc --noEmit` 与 `npm run build` 均只命中既有 `game-card-reveal`、`game-dice`、`game-simlife/art-consumption.test.ts`、`game-theft` 与 `launcher/game-runner.tsx` 类型错误；零命中本单文件，build 在 tsc 阶段停止、Vite 未开始。
- `docs-ref-guard`：PASS（46 个 Markdown、393 条路径）。
- `context-budget-guard`：本单主池 **9/10、23813/25000**，失败仅来自既有 `docs/design/galgame/requests.md` 48268>45000 与 `docs/design/game-card-reveal/requests.md` 57152>45000；未修改两份无关需求单。
- `scoped-gate` 未运行：脚本会执行 Git 检查，受 Owner“agent 禁止任何 Git/GitHub 操作”最高优先级禁令约束；已分别运行可合法执行的测试、lint、tsc/build、文档与上下文守卫。
- 沙箱内首次 Vitest 因 Vite 对 `node_modules/vitest/dist/spy.js` 执行 realpath 时 EPERM、收集前失败；随后用获准的短生命周期非服务进程真实复跑取得上述结果，未把环境失败计绿。

## 撤修验红

唯一锚点为 `item.assetKey !== slot.assetKey` 对账，终态精确 1 处。临时移除该行并加入 `ASSET02-SABOTAGE` 后，点名“plan assetKey 不同必须 fail-closed”精确 **1 failed / 7 skipped**，错误表现为 `valid:true`；恢复锚点后 **1 passed / 7 skipped**。终态锚点 1、marker 0。

## 边界

未 vendor、下载、生成、移动或审批素材；未修改 AssetIndex、pending、ledger、游戏内容、UI、renderer 或 Life sim；未执行 Git/GitHub、未启动服务、未写数据库。`resource-manager` 技能把实现边界限定为闭集 JSON 与 asset-manager 人审交接。

# SIMLIFE-ASSET-01 自证｜共享素材候选计划器

日期：2026-10-10  
施工主体：BDM程序

## 结论

新增 authoring-only 纯函数 `planLifeAssetCandidates`：把严格 `AssetSlotBrief` 与只读 `LibraryRecord[]` 编排成稳定的 `local-candidate | ai-required | invalid` 计划。计划器只调用既有 `rankRecords`，query 逐字取自 slot 的 `generation.prompt`；不读写文件/网络/墙钟/随机，不碰 AssetIndex、pending、ledger、Life World、snapshot 或 hash。

## 对照单

| # | 固定合同 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 每 slot 一项、slotId 字典序 | ✅ | slot 先按稳定 canonical identity 排序；反转输入逐字节同计划 |
| 2 | 合格本地候选优先 | ✅ | texture + filled + outputPx 精确尺寸 + alpha 精确 + style 严格相等，沿用 rankRecords score/id 顺序 |
| 3 | 无合格项才 AI | ✅ | 只输出 slot 自带 prompt、negativePrompt 与闭集 spec；不调用 provider |
| 4 | 非法输入 fail-closed | ✅ | 闭集 validator 任一诊断使计划项为 invalid，稳定 code，不抛半计划 |
| 5 | 敏感元数据不外泄 | ✅ | candidate 仅 id/score；输出无 path/license/provider/bytes/contentHash/approval 字段 |
| 6 | 审核边界不弱化 | ✅ | handoff 明定 asset-manager；pending approval-bypass 守卫施工前后均转红 |
| 7 | Little Valley 可消费 | ✅ | 现有 21-slot brief 直接走同一纯函数，21 项均非 invalid；未改游戏/素材运行内容 |

## 验证

- 指定回归：`life-asset-candidate-plan` + `library` + `asset-slot-brief` + Little Valley `asset-slots`，**4 files / 38 tests passed**。
- 完整 `src/assets`：**18 files / 171 tests passed**。
- 相关 ESLint：exit 0，零 warning。
- 全库 `tsc --noEmit` 仅命中既有 `game-card-reveal`、`game-dice`、`game-simlife/art-consumption.test.ts`、`game-theft` 与 `launcher/game-runner.tsx` 类型错误；零命中本单文件。
- `npm run build` 同样停在上述既有 TypeScript 基线错误，Vite 未开始；完整读取输出后确认零命中本单文件、零新增 warning。
- `docs-ref-guard`：PASS（46 个 Markdown、392 条路径）；`context-budget-guard`：FAIL，仅因既有 `docs/design/game-card-reveal/requests.md` 为 57152 字符、超过 45000 上限，本单引擎池为 10/10 且总字符 24551/25000，未触碰该无关游戏需求单。
- `scoped-gate` 未运行：脚本会执行 Git 检查，受本会话 Owner“agent 禁止任何 Git/GitHub 操作”最高优先级禁令约束；以点名回归、完整资产回归、ESLint、tsc/build、文档与上下文守卫分别取证。

## 撤修验红

尺寸锚点 `candidate.width !== slot.asset.outputPx.width || candidate.height !== slot.asset.outputPx.height` 终态精确 1 处。临时移除 width 条件并加入 `ASSET01-SABOTAGE` 后，点名“width mismatch → ai-required”精确 **1 failed / 12 skipped**，实际错误决策变为 `local-candidate`；恢复后 **1 passed / 12 skipped**。终态 marker 0。

## 边界

未 vendor、下载、生成、移动或审批任何素材；未修改 AssetIndex、pending、ledger、游戏内容、UI、renderer 或 Life sim；未执行 Git/GitHub、未启动服务、未写数据库。

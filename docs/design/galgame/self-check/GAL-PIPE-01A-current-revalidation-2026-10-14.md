# GAL-PIPE-01A · P0–P4 草稿审核合同当前自检（2026-10-14）

范围：只复核 `draft-review-contract` 的 P0–P4 纯 authoring 合同。它不是完整创作产线验收，不代替独立复查或 Owner 人门。

## 验收逐项对照

| 里程碑验收 | 当前证据 | 自检结论 |
| --- | --- | --- |
| P0 Brief、P1 圣经、P2 路线、P3 图、P4 节拍各有闭集 schema | `src/authoring/gal-draft-types.ts`、`gal-draft-validate.ts` 与 [P1 窄规格](../creation-p1-spec-research.md)定义五阶段数据、稳定 ID、上下游引用与定位诊断。 | 覆盖。 |
| 拒稿和上游修改使受影响下游失效 | `gal-draft-review.ts` 以追加审核事件投影 `current/stale/blocked`；点名测试覆盖拒稿不毁旧批准链、上游换版的逐级 stale、撤销后的 blocked。 | 覆盖。 |
| 未获批准的草稿不能装配入 `GalPackage` | 当前 P0–P4 装配资格固定为 `not_ready`；正式包仍须 P5/P6/P7 的批准资产和详细剧本后再由另行的 P8 组装器处理。 | 覆盖，且没有绕过人审。 |

## 当前复验

- `npx vitest run src/authoring/gal-draft-review.test.ts --maxWorkers=1 --minWorkers=1`：1 文件、12/12 通过。
- `npx vitest run src/authoring --maxWorkers=1 --minWorkers=1`：9 文件、135/135 通过。
- 首次受限沙箱运行在 Vitest `realpath` 报 Windows `EPERM` 前未收集用例；随后只读、短生命周期的隔离本地复跑取得上述结果。未启动整套应用、未访问数据库或远程状态。
- 既有非施工者独立复查见 [GAL-PIPE-01A](../review/GAL-PIPE-01A.md)：其记录点名 12/12、authoring 64/64、稀疏数组恶形修复及隔离锚点撤修验红。该报告仍是 review 证据，本自检不重造独立判词。

## 明确未覆盖

- `WritingEnginePort` 的真实传输、鉴权、模型/提示审计；仓库尚无可依赖的外部写作项目合同。
- 可信持久化、审核者身份/权限、并发与数据库边界。
- P5/P6/P7 的资产与详细剧本审核，P8 `GalPackage` 组装/资源闭包，以及 P9 试玩、打包和发布。
- 任何游戏 S1–S8、人审批准或项目路线图 Owner gate。

结论：P0–P4 纯合同可保持 `review`，等待控制台的自检/独立复查记录和 Owner 人门；不得据此标为 `done` 或宣称完整 GAL 生成生产线已完成。

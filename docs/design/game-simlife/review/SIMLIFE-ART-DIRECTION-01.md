# SIMLIFE-ART-DIRECTION-01 独立复查单

状态：**PASS（2026-10-13，非施工人独立复查）**

## 范围

- Art Direction v1 closed contract / engine fixtures / prompt composition。
- AssetSlot、local candidate、formal index strict style/spec seam。
- shared Life Host catalog coverage hard gate 与 renderer no-legacy-fallback。
- authoring/runtime authority 隔离、snapshot/hash/save 不变。
- 文档、skill、当前需求单与项目路线图同步。

## 独立核证要求

1. 不采信施工自陈，独立复跑 `self-check/SIMLIFE-ART-DIRECTION-01.md` 的定向测试、tsc、ESLint、build、docs/context guards。
2. 独立检查 closed parser 的未知字段/unsafe text/插画冲突组合，并验证 legacy manifest 无 profile 时仍合法。
3. 撤掉 `parseHostInput` 的 `missingLifeVisualCatalogRules` hard gate，或让 catalog 缺一条实际 visual key；必须有锚点断言精确转红，恢复后全绿。
4. 读 stdout/stderr：区分本单结果与共享工作树既有 depcruise/全量测试红，发现本单新增红则不得 PASS。
5. 确认未生成、批准、登记或物化任何素材，未代签 owner 素材审美/许可门。

## Verdict

复查人：模拟经营策划（非施工人）  
结论：**PASS**。未发现 Blocker、Major 或未裁决 Minor。

### 独立实证

- 在隔离的无写入测试进程中复跑 13 个相关 Vitest 文件：**98/98 PASS**。首轮沙箱内 Vite 对 `node_modules/vitest/dist/spy.js` 的 `realpath` 返回 EPERM，改用同一只读命令的隔离执行后正常通过；该问题不属于本单代码。
- 独立运行 `tsc --noEmit`、点名 ESLint、`npm run build`、`docs-ref-guard` 与 `context-budget-guard`：退出码均为 0；build 仅有既有 chunk-size warning。
- 撤修验红：暂时删除 `parseHostInput` 中 `missingLifeVisualCatalogRules` 的 hard gate，`life-game-host.test.ts` 精确转为 **1 failed / 12 passed**，失败锚点为“formal Life visual key 必须有 catalog rule”；恢复同一段 guard 后 **13/13 PASS**。
- 逐项核查 `life-art-direction.ts`：illustrated profile 强制线性采样、高分辨率、tile 不透明/其余透明，稳定 prompt 含非像素约束；AssetSlot 在启用 profile 后必须精确匹配派生的 style/spec/prompt。profile 不进入闭集 `LifeGamePackage`，并由真实 snapshot/order/hash/persistent-save 回归证明隔离。
- 核对本单没有生成、审批、登记或物化任何图片，也没有改动 Demon Castle/Little Valley 的正式世界逻辑、格尺度或存档格式。

### 复查备注

施工自检中“13 files / 102 tests”与本次真实同类定向集合的 **13 files / 98 tests** 数量不一致；不影响通过的测试集合和行为结论，已以上述真实复跑数为准。

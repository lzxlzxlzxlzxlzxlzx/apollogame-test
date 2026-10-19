# SIMLIFE-ART-DIRECTION-01 施工自检

日期：2026-10-13  
施工人：BDM程序  
结论：**施工自检 PASS；等待非施工人独立复查。**

## 验收对账

- Life Art Direction v1 为严格 closed JSON：`pixel-art|illustrated-2d` 与七种 slot kind；拒绝 URL/路径/密钥/未知字段及插画 nearest、低分辨率和透明度冲突。
- 插画 prompt 稳定包含 `high-detail illustrated 2D, non-pixel-art, readable at gameplay scale`，negative 至少包含 pixel art、sprite sheet、UI、text、border。
- profile 只在 AssetSlot authoring 面；LifeGamePackage 顶层写入 `artDirection` 会被 closed validator 拒绝。
- candidate planner 和 formal AssetIndex closure 均要求 exact style/spec；不匹配保持 `ai-required`/诊断，不降级近似命中。
- formal Host 对实际 visual references 逐 key 要求 catalog rule；renderer 有 catalog 缺 rule 时只走 semantic fallback。256px linear tile 仍显示 1×1 个 32px 逻辑格，384×512 actor 与 512px building 按 authored display/anchor/fit 绘制。
- 只改 render metadata 时 World snapshot、snapshot order、network hash 与 `lifeHostPersistentHash` 不变。
- 未调用外部模型、未生成候选图、未批准/登记/物化素材，未修改 Demon Castle/Little Valley 正式内容或逻辑格。

## 机器实证

- 定向回归：13 files / 102 tests PASS（Art Direction、AssetSlot、candidate/review/batch、Bundle、world visual、renderer、Host、launcher、真实 art consumption、slot guard）。
- `tsc --noEmit`：PASS。
- 点名 ESLint：PASS。
- `npm.cmd run build`：PASS（784 modules；仅既有 chunk-size warning）。
- `docs-ref-guard`：PASS；`context-budget-guard`：PASS。
- `scoped-gate --run`：执行到 depcruise 后被仓库既有 32 条模块边界违规阻断；本单未新增其中任何一条。全量 Vitest 另跑得到 666 files PASS / 6417 tests PASS，剩余 15 files / 24 tests 与 2 个无 suite 文件失败，均来自当前共享工作树其他在途变化或既有环境/基线（depcruise、Python alias、art ledger、pipeline board、phase/SCC、capability companion tests、UI golden 等）；本单引出的 review-packet 数量与 launcher fixture 两项已修复并纳入上述 102 tests 全绿。

## 撤修验红

唯一锚点：临时从 `ILLUSTRATED_PROMPT` 删除 `non-pixel-art`。点名 `life-art-direction.test.ts` 精确转为 1 failed（mandatory medium phrase 断言）；恢复源码后同文件 7/7 PASS。锚点真实命中实现，不是空改。

## 复查重点

1. 独立复跑 102-test 定向集合、tsc、ESLint、build 与文档门。
2. 独立撤掉 formal catalog missing-rule guard，确认 Host/renderer 防 legacy fallback 断言转红。
3. 核验 `canvas-renderer.ts` 中本单只涉及 Life visual consumption；同文件的 pointer feedback 是共享工作树其他在途改动，不属于本单。
4. 核验没有任何 `games/game-demon-castle/**`、`games/game-simlife/**` 正式素材/内容变更由本单产生。

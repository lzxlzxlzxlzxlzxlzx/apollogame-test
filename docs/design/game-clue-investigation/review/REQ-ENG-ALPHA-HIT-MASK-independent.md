# REQ-ENG-ALPHA-HIT-MASK · 非施工者独立复查

复查人：当前会话（非施工者）  
复查日期：2026-10-12  
结论：**PASS（本引擎能力实现切片）**。

这不是 Owner 人门，也不把 `game-clue-investigation` 解锁到 S3；工单仍应保持 `in-progress`，直到既定 S2/Owner 门全部满足。

## 独立复跑

先在受限沙箱内执行 Vitest；Node 对 `node_modules/vitest/dist/spy.js` 的 `realpath` 返回 `EPERM`，因此该次为 **0 tests**，不采信。随后用短生命周期、非服务的受控测试进程复跑：

```text
npx vitest run src/skills/tier2/clickable.test.ts src/assets/import/hit-mask.test.ts src/assets/asset-index.test.ts src/assembly/validate-manifest.test.ts src/renderer/renderable.test.ts src/assembly/component-map.test.ts --reporter=dot
```

实际输出：**6 files passed / 93 tests passed / exit 0**。

覆盖的六项分别是：真实 World 命中、作者态 RGBA alpha 烘焙、索引类型与源贴图尺寸约束、manifest 到确定性蓝图的绑定、Sprite `cover`/`contain` 绘制投影，以及 ComponentDataMap 闭集同步。

另行运行：

```text
npx eslint src/assets/asset-index.ts src/assets/import/hit-mask.ts src/assembly/manifest-core.ts src/engine/protocol/hit-mask.ts src/engine/protocol/sprite-layout.ts src/renderer/renderable.ts src/skills/tier2/clickable.ts --max-warnings 0
npx vite-node scripts/system-graph-audit.mjs t2-clickable
npx vite-node scripts/gen-capability-registry.mjs --check
node scripts/build-component-map.mjs --check
node scripts/component-manifest-guard.mjs
node scripts/docs-ref-guard.mjs
```

结果：ESLint 零输出且 exit 0；系统图为 120 systems / 227 explicit edges、无重复 id、无悬空边，`t2-clickable` 子集 1 system 无环，`SYSTEM-GRAPH: PASS`；能力注册 140 条同步；组件 universe 229、共同零件 206 均与产物/基线一致；DOCS-REF PASS（46 文档、396 路径）。

## 撤修验红

先用下列唯一锚点确认像素判定仅命中一处：

```text
rg -n -F "mask.rows[my][mx] === '1'" src/skills/tier2/clickable.ts
```

输出为第 165 行。临时把该行从 `=== '1'` 改为 `!== '1'`，运行：

```text
npx vitest run src/skills/tier2/clickable.test.ts -t "实心接收" --reporter=dot
```

得到精确 **1 failed / 12 skipped**，失败断言为 `expected undefined to be 'mask'`（`clickable.test.ts:129`）；没有额外失败或告警。随后以补丁恢复 `=== '1'`，唯一锚点再次命中 1 处，同一测试为 **1 passed / 12 skipped**，再跑完整六文件集恢复 **93/93**。没有留下撤修修改。

## 代码审查要点

- `src/assets/import/hit-mask.ts` 仅在作者态解码 PNG 并将 alpha 按阈值烘焙为 `0/1` 行；`clickable.ts` 不导入 PNG、URL 或 Canvas 路径。
- `src/assets/asset-index.ts` 将 `hit-mask` 设为纯数据资产：filled mask 不允许 `path`，并要求其来源为已填充 texture 且逻辑尺寸一致；它也不会注册进渲染 AssetManager。
- `src/assembly/manifest-core.ts` 拒绝作者内联 `Clickable.hitMask`，仅从 `assetIndex` 按 key 绑定，二次核验 Sprite 贴图与 texture 原生尺寸；任一不符只保留 key 并给 warning，运行时严格 fail-closed。
- `src/engine/protocol/sprite-layout.ts` 是渲染/点击共用的纯投影；`renderable.test.ts` 已验证原生、`cover` 裁切、`contain` 留白、非中心锚点与 atlas 边界。
- `src/skills/tier2/clickable.ts` 对遮罩路径使用同一投影逆映射、缩放和 floor 像素取样；缺/坏 mask、贴图不符和非零旋转均拒收。严格 World 用例确认 `DebugTrace.reject`，重放用例确认两份相同 World snapshot 一致；无 mask 的旧 AABB 路径仍被回归集覆盖。

## 限制与问题

未发现本单新增的功能或系统图问题。v1 的非零旋转是有意的 fail-closed 限制，已经有定向用例，不应被表述为已支持旋转遮罩。

没有运行或宣称全库绿：已知全库 Vitest、`tsc`、`sim-dom-fence`、`depcruise` 存在本单外红项。本复查也未执行 Git/GitHub、服务启动、数据库写入或 Owner 审批。

# game-105 S4 重开记录

日期：2026-08-29  
原因：原 S4 签核版本 `e182544eefb77401` 的不可变结构基准已丢失，`s4-frozen.png`
现为后续 S5 图片，不能再用于证明 S5 未改变 S4 结构。

## 已完成

- 旧 S4/S5 标准照覆盖路径已封锁：`golden-shot capture --state s4-frozen` 现在拒绝覆盖
  已 `blessed` 状态，要求新候选使用新 state 名。
- 旧 `e182544eefb77401` 的 S4 门证、复查与 owner 签核仅保留为历史，不得复用为本次 S4 结论。
- 已保留旧基准丢失调查：`S5-remediation-evidence.md`。

## 重开边界

- 当前游戏源码和 S4 验收剧本是待重新验证的候选，不是被删除或判定不可用的实现。
- 不得把 `S5-*.png`、当前 `s4-frozen.png` 或旧 `S4-extension-*.png` 作为新的 S4 golden 原件。
- 新基准状态名必须为 `s4-structure-<本次 gameHash>`；capture 后由 owner bless，之后工具会拒绝覆盖。

## 本次结构候选

- 状态：`s4-structure-f35a3de036d6326e`
- 内容指纹：`f35a3de036d6326e`
- 截图：`public/games/game-105/golden/s4-structure-f35a3de036d6326e.png`
- SHA-256：`ba94dbf3a284d0b903456e06f32053990b94d4614e0039af95c243498bd8af6c`
- 视口：`1280x800`；双次采集稳定；状态：`candidate`。

该候选只冻结 S4 的组件、位置、尺寸、可见性规则和交互路径；配色、字体、纹样与贴图不作为
结构判据。独立复查通过前，任何人不得 bless。

## 剩余步骤

1. 在可持续运行的终端或 CI 执行 `node scripts/game-pipeline.mjs gate game-105 S4`，取得当前源码的完整机器门输出。
2. 用当前通过的源码重新生成 S4 对齐单和至少五张真浏览器截图，且只记录结构、交互与玩法事实。
3. capture 新命名的 S4 结构候选；独立复查通过后，由 owner bless 该结构照并执行新的 S4 signoff。
4. 新 S4 三门全绿前，不得恢复 S5 gate、复查或签核。

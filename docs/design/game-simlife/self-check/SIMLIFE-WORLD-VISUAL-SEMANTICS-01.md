# SIMLIFE-WORLD-VISUAL-SEMANTICS-01 施工自检

日期：2026-10-13
施工主体：BDM程序
结论：**完成；施工自检 PASS，非施工人独立复查 PASS。**

## 架构结论与边界

接受 Owner 的 A 裁决：把 warp 地标、行动地表视觉语义和严格生成门下沉为共享 Life 数据合同；不做魔王城私有 renderer/system。新增字段只供 authoring 与 renderer，行动合法性仍唯一来自 `LifeActivityContext`，编译出的 World、snapshot/hash/save 均不包含视觉语义。

本单未调用外部模型，未批准素材，未写 Little Valley 正式 AssetIndex，未执行魔王城 `--update`。魔王城只更新 authoring candidate 并运行零写入 `--plan-update`；正式四文件保持原样。

## 实现核对

1. `LifeTileVisual.surface`、`LifeWarp.landmarkPlacementId` 与 `LifeGamePackage.visualSemantics.farm` 均为闭集 JSON；基础 parser 保持 legacy optional，Generation Bundle 的严格门要求新候选完整声明。
2. 严格门逐路径拒绝：已使用 ground tile 缺 surface/skin、surface 与 tile tag 不匹配、plantable 缺干湿土 key、warp 缺 label/同 scene 可见 landmark、landmark 无 skin/类型非法/不相邻，以及行动集合不等价却共享 visual key。
3. renderer 编译只读 visual catalog；绑定且可见的 landmark 抑制 generic cyan marker，缺失/隐藏/legacy 才 fallback。农田先画干/湿土，再画作物阶段；catalog 不进入 World。
4. Generation Bundle 输出 `warp → landmark → destination` 与 `surface → actions → slot` 两张矩阵；prompt/SOP/authoring 与资产、事件、渲染手册同步硬门。
5. Little Valley 已迁移 ground/plantable、干湿土与双向入口地标；两个新增 surface 素材仍为 pending。Demon Castle candidate 已覆盖四个 warp、真实回程地标及 6×4 农务区三种 surface slot。
6. 泛化 host fixture 同步替换显式 scene title，避免“任意第二包”回归错误继承 `Harbor Town` 文案；不涉及生产逻辑。

## 机器实证

- Life 定向回归：最终覆盖 **15 files / 176 tests**。首次组合运行 **175 passed / 1 failed**，唯一失败为测试 fixture 未替换显式 `Harbor Town`；修正 fixture 后 `life-host.test.ts` **24/24 passed**，其余 14 文件保持 **152/152 passed**。
- Materializer：`scripts/life-materialize.test.ts` **3/3 passed**。
- 相关 ESLint：exit 0，零 warning。
- `npm.cmd run build`：PASS，772 modules；仅既有 chunk-size warning。
- `context-budget-guard`：PASS；`docs-ref-guard`：PASS（48 Markdown / 399 路径）。
- `scoped-gate --run`：正确判为 FULL，但在既有 depcruise 基线的 32 条跨层依赖违规处停止；输出包含既有 Life host/game 引用关系，未出现本单新增 `life-world-visual-semantics.ts`、visual catalog 或文档。其余本单所需 lint/typecheck/tests/build 已分别实跑通过，未把这次早停冒充绿灯。
- 项目路线图通过 `main_entry.project_roadmap.save` 合法保存并重读；`world-visual-semantics` 在 self-check/review 均 pass、owner=not-required 后由服务端自动收束为 `done`，未调用 Owner decision。

点名覆盖包含 schema/compiler/Generation Bundle/renderer/host/save/asset-slot/composer/materializer，且永久用例明确破坏：缺 warp landmark、landmark 跨距、缺 surface、非等价 action-state 共享 visual key。`visualSemantics` 单独变化编译为相同 blueprint，证明不进入 snapshot authority。

## 候选与零写入计划

- Demon candidate bundle hash：`sha256:e58f38ff0da5c706c5adac7013e82c809cffad5460cd882486136c625c78e6ba`
- candidate hash：`sha256:e167902905c09cf503cefec3b04524900a1f4f1184e16c5c9b55e1cd0bad1145`
- 当前正式 files hash：`sha256:14f23f978b556b2368466ec1ce012757449b7f103e962933283b2c8a49f1f44c`
- 提议 files hash：`sha256:c2a3982c72071aab8c290fc0a317a1ac0d4ac67805e9a9acd3a2e9199dfc3563`
- update confirmation：`sha256:160a8c6f06facab77e13d9352577d0d2db5a8a4a3b4909e1c87779cfeb057844`
- `writesPerformed:false`，`conflicts:[]`；素材人审前不执行 update。

`life-gen-check --packets --plan` 返回 `ok:true`。完整读取 warning：缺 provider Flag、`npcDialogueId` extra-field 提示与可选 system dangling edge 均为既有候选/图审计 warning，不改变本单严格 visual gate 的成功结果，也未据此放宽 validator。

## 撤修验红锚点

永久 sabotage 用例位于 `src/assembly/life-world-visual-semantics.test.ts`，逐项复制合法包后撤掉或破坏唯一合同字段，并断言精确 JSON path/code：

- 删除 `/warps/*/landmarkPlacementId` → `warp_landmark_required`；
- 把地标移出 overlap/Manhattan-adjacent → `warp_landmark_relation`；
- 删除 ground visual surface → `surface_required`；
- 让 plantable 与普通 ground 共 key → `visual_key_action_conflict`。

基线与 sabotage 同组 **3/3 passed**；断言同时核对被破坏的目标 path，避免测试未命中实现却假绿。独立复查仍须自行复跑并完成一次带唯一锚点命中证明的临时撤修验红。

## 证据入口

- 世界矩阵与候选边界：`docs/design/game-simlife/world-visual-semantics-review.md`
- 当前施工单：`docs/design/game-simlife/work-orders/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md`
- 独立复查：`docs/design/game-simlife/review/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md`


# SIMLIFE-WARP-FOOTPRINT-01｜多格建筑传送交互占地合同

施工主体：BDM程序
状态：**已完成（独立复查 PASS，2026-10-13）**

> Owner 已选择 A：把多格建筑入口的交互占地补成共享 Life authoring/compiler/runtime 能力，不在魔王城写私有判定。

## 范围

- authoring `LifeWarp` 新增可选 `interactionPlacementId`，只引用同场景 placement，并作为 E 交互占地唯一权威；`landmarkPlacementId` 继续仅供视觉语义审阅。
- 严格校验引用类型、存在性、同场景以及 `at` 位于 placement footprint 内；失败必须给出精确错误，不静默回退。
- compiler 将引用 placement 的 `x/y/width/height` 编译进 runtime `LifeWarp`；未声明时保留 `at` 的精确 `1×1` 兼容语义。
- activity 的附近提示与 navigation 的 `LifeWarpRequest` 位置校验共同消费 runtime footprint，保持显式 E/action，不自动传送。
- 魔王城森林拱门、地下矿井/楼梯及绑定建筑的返程入口使用匹配 placement 占地。
- 同步生成流程、严格 bundle schema/prompt 与素材文档，明确建筑 placement 尺寸、素材/display footprint 一致和多格 warp 显式引用要求。

## 验收

- `2×2` footprint 四格均可出现同一 E 提示并执行 warp，相邻外部格不可提示/执行。
- 未声明字段的 legacy warp 仍只在 `at` 精确单格提示/执行。
- 缺失 placement、跨场景引用、`at` 越界均由严格校验以精确错误拒绝。
- `landmarkPlacementId` 不获得模拟权威。
- 魔王城森林拱门、地下楼梯/矿井及适用返程入口的视觉与 runtime footprint 一致。
- 完成 activity 点判定撤修验红、目标测试、tsc、eslint、文档/context 门。

## 非目标

- 不修改 32px 格尺度、相机、脚点、碰撞、寻路或存档语义。
- 不调用图像模型，不生成、批准或登记新素材。
- 不启动整套 ZeroCraft，不写远程 Git/数据库，不处理共享工作树无关错误。

## 施工结果

- 共享 authoring/compiler/runtime/activity/navigation 合同与严格生成门已完成。
- 魔王城 candidate 已重建，并经零写入 plan 核对后使用受控 `--update` 正式物化；复验 `currentFilesHash == filesHash`、`conflicts:[]`。
- 定向回归 8 files / 84 tests、tsc、相关 eslint、build、context guard 均通过；activity 点判定撤修验红有效且已恢复。
- 施工自检见 [SIMLIFE-WARP-FOOTPRINT-01](../self-check/SIMLIFE-WARP-FOOTPRINT-01.md)，独立复查 [PASS](../review/SIMLIFE-WARP-FOOTPRINT-01.md)。

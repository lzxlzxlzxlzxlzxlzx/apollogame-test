# SIMLIFE-POSE-ANCHOR-01 · 施工自检

日期：2026-10-12  
施工主体：Codex/root  
结论：共享代码与机器证据通过；owner 真机视觉目击仍保留在 Playtest gate，不在本单代签。

## 架构判断

接受为既有 Life 空间投影能力的共享修复。`t2-life-continuous-motion` 已规定 `Transform` 为连续位置权威、`LifePosition` 为离散缓存；缺陷来自 renderer/host 分别读取两份坐标，导致同一帧中精灵脚点、高亮格和 WorldUI 可能分离。修复没有新增 schema、system、游戏私有代码或数据迁移，也没有更改移动积分。

统一合同落在 `src/engine/protocol/life-pose.ts`：

- `Transform.(x,y)` 是以 tile 为单位的连续脚点；没有 Transform 的 legacy actor 才回退到 LifePosition；
- `cellFloor(x,y,0,0,1)` 是唯一离散格边界，整数边界归正侧、负数向下取整；
- `life-position-sync`、连续碰撞、scene projection 与 host view 共用该合同；
- `LifePosition.sceneId` 仍是场景/进展权威，interaction/proximity 继续消费 sync 后的离散缓存；
- renderer 高亮按连续脚点派生格，玩家 WorldUI 使用连续脚点，player/placement descriptor 明确 `bottom-center`；
- AssetSlot `display/fit/anchor/offset` 只改变 draw destination，不回写 World、snapshot/hash、碰撞、互动或镜头。

## 施工文件

- `src/engine/protocol/life-pose.ts`
- `src/renderer/life-scene-render.ts`
- `src/skills/tier2/life-continuous-motion.ts`
- `src/engine/host/life-presenter.ts`
- `src/engine/host/life-interaction.ts`
- 对应 renderer/motion/host/Little Valley 测试
- `docs/design/game-simlife/generation-workflow-v1.md`
- `docs/design/game-demon-castle/playtest.md`
- `docs/projects/simlife-engine/project-roadmap.json`

正式 Little Valley/Demon Castle JSON、AssetSlot、图片、索引与 materializer 输入均未修改；本单不需要正式物化。

## 自检证据

扩展回归：

```text
14 test files passed
130 tests passed
```

覆盖：连续移动、正侧整数边界、负数 floor、collision、LifePosition sync、LifeActivityContext/proximity、NPC schedule、navigation warp、shared host、WorldUI、相机可视约束、AssetSlot contain/cover + pixel/cell display + anchor/offset、Little Valley 正式包、Demon Castle 正式包、正式魔王城首章 Playtest 合同、snapshot/hash 只读。

相关 ESLint：PASS，0 warning。  
全库 `tsc --noEmit`：FAIL，但输出只命中既有 `game-card-reveal`、`game-dice`、`game-theft`、`component-map` 与 launcher 错误；零命中本单文件。

`node scripts/docs-ref-guard.mjs`：PASS（46 markdown / 396 refs）。  
`python -m unittest main_entry.test_project_roadmap`：11 tests PASS。  
`npx.cmd vite build`：770 modules PASS；仅 Rollup chunk-size 信息性 warning，无本单错误。  
`scripts/scoped-gate.mjs --run` 未执行：该脚本内部固定调用 `git diff/ls-files`，而 Owner 禁令禁止 agent 以脚本包装间接执行任何 Git 命令；已用上述点名测试、静态检查、文档/路线图校验与 Vite build 替代其非 Git 部分。

## 撤修验红

唯一锚点：`SIMLIFE-POSE-ANCHOR-01-SABOTAGE`。

临时把 `playerHighlight` 恢复为读取 `LifePosition`，点名用例得到精确 **1 failed / 14 skipped**：期望 `cellX=1, center.x=30`，实际回退为 `cellX=0, center.x=10`。恢复共享 pose 后同一用例 **1 passed / 14 skipped**，随后扩展回归 130/130 全绿。临时撤修已恢复。

## 未代签的人门

Owner 附图已证明修复前黄色格与玩家脚点相差约一个右下格。依据 Owner 禁令，本 session 未启动 Vite；没有可用 owner 服务可做修复后浏览器截图，因此不能把机器投影测试冒充真机目击。视觉裁决去向固定为 `docs/design/game-demon-castle/playtest.md` 第 ② 步与 `POSE` 失败分类：owner 需确认黄色格包含玩家底部中心、跨格同帧切换、NPC footprint 底部中心落位。

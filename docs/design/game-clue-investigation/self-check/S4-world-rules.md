# S4 世界层阶段性自检（非 S4 整关通过）

日期：2026-10-13；施工者：本聊天。定稿原型 `prototype.dc.html` 已真机目击；本单只核世界规则和输入链。LayoutNode/浏览器进度另见 `S4-alignment.md`，本文件不单独把 S4 自检门标绿。

## 实测

- 严格装配：`Get-Content library/game-clue-investigation/manifest.json -Raw | npx vite-node scripts/manifest-check.mjs` → exit 0，`ok=true`、`inferredCapabilities=false`、`warnings=[]`。
- 五轴：同一 manifest 输入 `scripts/bench-manifest.mjs` → exit 0，95/100；Structure 15/20（缺相机），其余 Load 15/15、Determinism 20/20、Numeric 20/20、Visual 25/25。缺相机是该固定单场景不消费相机，不据此虚报 UI 已合格。
- GD 5 份独立编写的验收剧本：`npx vite-node scripts/acceptance-run.mjs --game game-clue-investigation` → exit 0，5/5 PASS，合计 67 检查点。普通调查、首次/重复收录、可选线索、2/2 完成、退出、完成/取消后的重开均有机读态断言。
- `npx vitest run games/game-clue-investigation/s3-skeleton.test.ts games/game-clue-investigation/s4-interaction.test.ts` → 最初 2 文件 8/8；补 LayoutNode 零 issue 断言后复跑 9/9 PASS。包含真实世界坐标 pointer→Clickable、弹层热点冻结、重复 collect 同拍/次拍防重与相同输入同 hash。
- `npx eslint games/game-clue-investigation/acceptance-adapter.ts games/game-clue-investigation/s3-skeleton.test.ts games/game-clue-investigation/s4-interaction.test.ts --max-warnings 0` → exit 0；`node scripts/docs-ref-guard.mjs` → `DOCS-REF: PASS`。
- `node scripts/game-skill-audit.mjs game-clue-investigation` → exit 0，零红旗、RATCHET PASS；黄警告为“无美术台账”，属于未开始的正式资产接入关，不能解释成 S4 UI 已完成。

## 真实红灯与修复

1. 首次把 `j1-state` 与 `t3-flow` 组合后，严格 World 在 `flow ↔ state-sync` 上报组件推断软环，S3 定向 3/4 红。将仅用于选中对象枚举的 `State` 重组为已有 `Resource selected-object`（0–7），原型语义不变，复跑 4/4 绿。未改共享定序。
2. GD 重开剧本首跑 exit 1：`GameFlow.current` 已从 `resetting` 切到 `scene-idle`，但 `interaction-enabled` 仍 false，下一拍才入场恢复。把恢复写入 `resetting.onEnter` 的同次提交，复跑 5/5 绿。

## 锚点撤修验红

先断言 `effect-lock-count` 完整 JSON 片段（值 `1`）唯一命中数=1；临时将该 Effect 的增量改为 `0`，复跑 GD 剧本 exit 1：第 02/03/05 本转红，报告窗锁首次收录仍为 0、完成无法到 2/2。用同一锚点恢复值 `1` 后原命令 exit 0、5/5 PASS。验证期间没有修改剧本或 runner；此条只为施工自检，非非施工者独立复查的替代。

## 未闭环

- `GCI-S4-UI-01` 通用桥、`GCI-S4-POINTER-02` 同源 alpha 反馈与 `REQ-CART-UIWALK-ADAPTER` 通用真手势走查均已由各自非施工者独立复查 PASS；本游戏 6 张原型/15 张正式截图、灰盒悬停/按下、触屏与重开见 `S4-alignment.md`。正式 PNG 实形场景仍须到 S6 才能实拍，不把共享能力 PASS 当作本作视觉 1:1 完成。
- `S4` 流程板机器门和项目路线图 `selfCheck` 已有真实证据；旧正式复查为 CONCERNS，现正由原非施工复查人按 42/42 新走查证据重审。Owner 人门仍为 Owner 独占，本记录不签人门。

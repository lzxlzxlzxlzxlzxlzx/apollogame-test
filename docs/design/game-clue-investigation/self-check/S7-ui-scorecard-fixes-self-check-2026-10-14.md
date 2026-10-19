# S7 UI 差异返修自检 · 2026-10-14

施工范围仅为本地正式卡带 `library/game-clue-investigation/manifest.json` 的 presentation UI 数据；没有修改共享 `src/ui/**`、玩法实体/信号/规则、原型、资产文件、Owner 人门或远程状态。

## 修复内容

1. `case-heading`、`case-progress`、`clue-ledger`、`case-utility` 使用原型棕色 `#8b7652` 1px 面板边框，不再声明 gold edge 或 glass 模糊。
2. `case-heading-brass-rule` 以纯 LayoutNode Panel 在标题卡左侧补入 5px `#d8ae62` 黄铜条。
3. `ledger-title` 改用透明 `quiet` 按钮皮，保留 `records.close` 动作及可见键盘焦点环；六个条件互斥的线索行各新增独立圆点 Label，原正文位置不变。

## 施工自检证据

- manifest JSON 语法解析：PASS。
- 严格引擎校验（`vite-node scripts/manifest-check.mjs --art-index library/game-clue-investigation/art/index.json`）：`ok=true`、`inferredCapabilities=false`、`warnings=[]`。
- `npx vitest run src/ui/components games/game-clue-investigation --maxWorkers=1 --minWorkers=1`：78 files / 591 tests PASS。
- `/check-ui` 深色 1440×900 reveal 审计：重叠0、硬对比0、AA警告0、border-image前提0，exit0。
- `/check-ui` 亮色 1440×900 idle 审计：重叠0、硬对比0、AA警告0、border-image前提0，exit0。零华丽件提示和 deep 审计中非本次HUD的1处 glass 仅作审计信息保留，不将其冒充阻断错误。
- `node scripts/game-skill-audit.mjs game-clue-investigation`：AUDIT PASS、RATCHET PASS。
- `node scripts/game-pipeline.mjs gate game-clue-investigation S5`：按当前 hash `7683030b1df8ad2c` exit0，输出“纯数据卡带免审计”及“无标准照基准·未比对”警告。未使用 `--out-of-order`。S2 刷新复查为 CONCERNS（8文件/125测试通过，保留 plan `j1-state` 与 manifest `f1-resource` 偏差）；S3/S4 当前 hash 的机器门与异人复查均 PASS（S3 14/14、S4 15/15）。

## 独立复查状态

非施工者正在按当前 hash 刷新 S5 review 与 S7 八维评分卡。本文不是独立复查结论，不宣称 S5/S6/S7 完成，也不代替 Owner 人门。

# REQ-SIMLIFE-PUI-ICON-BUTTON-01 · PUI 施工自检（非独立复查）

施工主体：PUI Codex/root；范围为共享 `Button` 闭集、校验、渲染、`mountUI` 图片生命周期、game-i 活例及 UI 手册。未改 Life Host、游戏数据、资产索引、存档或 Owner 人门。

## 合同与反例

- `iconOnly:{size:24..64}` 默认关闭；仍是原生 `button type=button`，非空 `label` 始终提供 `aria-label`。图 URL 只接受本地图片路径或栅格 data URL；无图、拒收、加载失败或 update 更换图时可见文字保留。图加载成功才隐藏文字，装饰图 `alt=""/aria-hidden`，不重复朗读。
- 原生 Tab、Enter、Space、disabled 及既有 ActionSink 不变；焦点环不可关闭。旧 Button 未填新字段的渲染分支未改。纯 `renderNode` 无加载生命周期，因此保守显示文字，消费者须用 `mountUI` 取得 icon-only 显示。
- `validateLayoutNode` 点名拒收非法 size/额外字段、空白名称、禁用焦点环与危险 URL；渲染器对危险 URL 仍做安全文字回退。game-i `t-btn` 有独立活例。

## 本地自证（2026-10-16）

| 检查 | 结果 |
|---|---|
| `npx vitest run src/ui/components/icon-only-button.test.ts games/game-i/game-i.test.ts` | 2 files / 15 tests PASS；钉死 catalog 示例唯一、game-i 原生图标钮唯一且无失效路径 |
| `npx vitest run src/ui/components` | 77 files / 577 tests PASS |
| `node src/ui/components/verify-icon-only-button.mjs` | dark/light 原生 Tab、Enter、Space、hover、pressed、禁用、缺图回退、48/32px 实测盒、卸载 PASS；短时浏览器与临时 bundle 均已关闭/清除 |
| `node tools/ui-audit.mjs src/ui/components/icon-only-button.audit.ts` | 暗主题 0 重叠、0 对比硬错、0 告警，exit 0 |
| 同命令改 `icon-only-button-light.audit.ts` | 亮主题 0 重叠、0 对比硬错、0 告警，exit 0 |
| `npx vite build` | 794 modules，exit 0；大 chunk 警告为非阻断 |
| `npx tsc --noEmit --pretty false` / `npm run build` | exit 1，仅 `src/authoring/gal-character-library.ts:89` 类型不匹配，未命中本单 |
| `node scripts/scoped-gate.mjs --run` | exit 1，33 条既有 depcruise 违规；未宣称全库绿 |
| `node scripts/context-budget-guard.mjs` | 本单 UI 手册已压至限额内；仍有 `playbooks/index.md` 字符与 `game-production.md` 行数两项外域既有红 |

## 锚点撤修验红

`SABOTAGE_ICON_ONLY=1 node src/ui/components/verify-icon-only-button.mjs` 在**隔离浏览器**删除唯一 CSS 规则锚点 `[data-apollo-icon-only][data-apollo-icon-loaded] [data-apollo-icon-label]{display:none!important}`，命中数严格为 1，`dark loaded label remained visible` 实红、exit 1。正常命令随后 dark/light 均 PASS、exit 0；共享源码未作破坏性改写。

UI audit 的“华丽件 0/非 house”告警是独立控件验收夹具而非新游戏屏，夹具仅量 Button 盒与回退字；game-i 活例仍使用既有展示台主题。本单不据此宣称魔王城 S5/S6 或 Host 正式视觉完成。

独立复查首轮指出 catalog 中重复登记图标按钮演示，以及 game-i 活例重复 id/后一条图片路径不存在。施工方移除重复条目，保留真实存在的 `/games/game-i/art/emoji/1f392.png`，补唯一性回归断言；最终独立判词以 `../review/REQ-SIMLIFE-PUI-ICON-BUTTON-01-independent.md` 为准。

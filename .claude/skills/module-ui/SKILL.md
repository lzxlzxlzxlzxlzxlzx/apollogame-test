---
name: module-ui
description: ZeroCraft UI / HUD / 菜单模块线。做任何游戏界面——主菜单、HUD、面板、弹窗、结算屏、VN chrome——之前调它。铁律：全部走 LayoutNode 闭集数据，禁手写 React/DOM；新游戏起手必须华丽（house 主题 + @ui/starters + 成熟件），朴素默认屏 = 缺陷。凡碰游戏 UI 屏 → 先用它。
when_to_use: 建或改任何游戏 UI/HUD/菜单/面板之前。防两件事：手写 DOM 逃生；以及从空白搭出一屏朴素默认 UI。
---

# UI / HUD / 菜单（module-ui）

**权威手册**：`docs/design/ui-playbook.md`（**先读这本**·黄金流程 + 四准则）+ `docs/playbooks/ui.md`（引擎接线图）。

## 0. 先搜（不必先知道控件叫什么）
```bash
node scripts/ui-find.mjs <大白话>     # 血条 / 货币 / 选关 / 弹窗 / 右键菜单
```
直接告诉你**哪个控件 + 全部 prop + 去 game-i 哪一段看活的 + 照抄哪个文件**。搜不到再考虑报 PUI 扩控件。

## 1. UI 铁律（碰即返工）
所有游戏 UI/HUD/菜单/面板/VN chrome **必须用 `LayoutNode` 纯数据**描述：
- 控件 = 闭集 `ComponentType`（读 `src/ui/components/catalog.ts` 取 whenToUse + schema + sample，**别凭记忆猜 prop**）
- 显示绑定 = `resourceId` / `StringVar` id；写世界 = `action` 信号名**入队**
- **handler 里绝不塞自由逻辑 / CSS / DOM**
- **禁**手写 React 屏 · 自由 DOM · 直用 `ui/shell` · `ui/vn`
- play-field（战场/棋盘）不走这条线 → `/module-fx`

## 2. 华丽起手三步（owner 2026-07·华丽度 = 第一要素·**朴素默认 UI = 缺陷**）
1. **传 house 主题**（别从零写 `UITheme`）：`STARTER_THEME`（apollo-toon 水墨玩趣·**起手默认**）/ `apolloOnyx`（硬核暗色）/ `apolloBrocade`（宫廷卡牌）。自写主题仅当有明确美术方向·记债·经审。
2. **常见屏 import `@ui/starters`**：`buildStarterHome` 富主菜单 · `buildStarterResult` 富结算（星级 + 纸屑 + 数字格式化）。传数据即得一屏华丽 UI。
3. **逛 game-i 展台挑成熟件**：卡牌→`faceArt` · 选关→`LevelPath` · 庆祝→`Particles`/`Float` · 主 CTA→`sheen-hover`+`Panel.skin` · 数值→`Label.format` · 异形→`shape` · 环进度→`ProgressBar.shape:'ring'`。货架全表见 `ui-playbook.md §0`。

> **归哪一关**：**选型**（主题/起手包/挑哪些件）归 **S4**（定信息层级）；**观感精修**（配色/纹样/艺术字/粒子密度）归 **S5**。别在 S3 调色，也别拖到 S5 才把关键数值写进键面（那是结构，S5 补 = 重排版）。
> **第三步的产物 = `ui-audit` 的「[华丽度] N 处命中」行**——零命中 = 疑似朴素默认屏，当场警告。

## 3. 闭集，别逃生
字体走 `Label.font` 槽（艺术字 18 款 + CJK 5 款，**禁自由 font-family**）· 颜色走 `Label.color` 11 令牌 + `Panel.bg` 三态色库（**禁裸 hex**）· 异形走 `shape` 8 款（**禁自由 clip-path**）· 竖排菜单用「框 Panel + `align:'stretch'`」统一等宽（**禁逐钮塞 width**）。
**缺件 → `docs/workflow/requests.md` 报 PUI 扩一个槽/枚举，绝不手搓逃生。**

## 4. 交付前（两个都跑·零 issue / 归零才算过）
```bash
npx vitest run src/ui/components                    # validateLayoutNode 零 issue
node tools/ui-audit.mjs tools/audits/<你的页面>.audit.ts   # 退出码 0
```
细则走 **`/check-ui`**（防重叠 / 对比度 / 透明度 / 布局卫生四关）。

## 查不到怎么办
`ui-find` 搜不到 + 手册没覆盖 → **绝不手写逃生**，走 **`/ask-owner`**（先实查留原文 → 摆 A/B → 攒批问 PUI/owner）。

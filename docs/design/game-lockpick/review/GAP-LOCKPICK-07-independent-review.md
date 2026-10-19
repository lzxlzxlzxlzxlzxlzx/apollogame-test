# GAP-LOCKPICK-07 独立复查 · 匿名继电棘轮与终局禁用

- 施工主体：`PUI / Codex-root`（见 `requests.md`）
- 复查主体：`Codex/root/relay_rotor_review`（与施工主体不同）
- 日期：2026-10-08
- 边界：未执行 Git / GitHub / 数据库操作，未启动或重启应用服务。布局审计仅使用隔离、短生命周期无头 Edge，结束后已关闭。

## 独立实证

| 项目 | 独立做法 | 结果 |
| --- | --- | --- |
| 通用连续 transform | 复读 `types.ts`、`render.ts`、`server.ts`、`validate.ts`、`catalog.ts`，独立复跑 `transform-motion.test.ts` 与 `update-patch.test.ts` | ✅ `layout.transformTransition` 只在同 id / 同 type / 相同 props / 仅 `x/y/rotate/scale` 改变时保留 DOM 并改写 style；首次渲染直接落在终态，任何 props 改变仍替换节点。时长、easing 与 reduced-motion 的边界均受验证和渲染器约束。 |
| 机关锁匿名传动 | 读取 `lockpick-screen.ts`，复跑真实 `mountUI.update()` 用例 | ✅ 继电棘轮唯一稳定 id 为 `lockpick-relay-rotor`；转角只由公开 aggregate `correctProgress × slotCount` 推导，不读取 target/current 单槽答案。`0 → 1/3` 更新保留同一 DOM 节点，并以 280ms `ease-out` 追赶下一齿位。 |
| 灯层与素材清退 | 对 `assets.ts`、屏幕树、`art/index.json`、`art-ledger.json`、纹理目录做独立全文与磁盘检查 | ✅ 屏幕与 assets 映射不再引用 signal lamp/lens/halo 或旧圆灯五件套；索引、台账与磁盘只保留锁体、锁梁、轨道/滑钮、棘轮等实际消费资产。`asset-reconcile game-lockpick` 为 PASS。 |
| 3 / 4 / 5 轨与终局 | 独立复跑 `lockpick-screen.test.ts`、`slider-skin.test.ts` | ✅ 三种底板仍各自挂载同数量的皮肤化 Slider。成功时保留 3/4/5 条轨道和当前值，同时 Slider 为 `disabled`：无 `data-action`、`aria-disabled=true`、`pointer-events:none`，键盘/鼠标/触控事件均不派发 action。 |
| 活范例与闭集 | 复跑 `catalog-validate.test.ts`、`game-i.test.ts`，检查 gallery | ✅ PUI catalog/validator 和 game-i 的可切换棘轮范例均存在，未增加游戏专属 DOM/CSS。 |
| 布局与可读性 | 无头 Edge 运行 `tools/ui-audit.mjs tools/audits/game-lockpick.audit.ts --w 1440 --h 900` 与 `--w 810 --h 506` | ✅ 两个视口均重叠 0、硬性低对比 0、border-image 问题 0。审计仅给出既有、非阻断的华丽度提示。 |
| 游戏与资产守卫 | `node scripts/game-skill-audit.mjs game-lockpick`、`asset-reconcile`、`art-ledger-guard` | ✅ 游戏审计及棘轮 PASS；三方资产对账 PASS。台账守卫仍报 10 条既有“缺 provenance”警告，但黑户/死账均为 0，且已从先前 15 条下降；不涉及本次棘轮的索引、文件或消费槽闭包。 |

## 锚点撤修验红

复查期间，临时移除 `games/game-lockpick/lockpick-screen.ts` 中继电棘轮唯一的：

```ts
transformTransition: { ms: 280, easing: 'ease-out' }
```

随后运行：

```text
npx vitest run games/game-lockpick/lockpick-screen.test.ts
```

结果按预期转红：6 项中 2 项失败。

1. 棘轮 HTML 锚点不再含 `transition:transform 280ms ease-out`。
2. aggregate stage `0 → 1` 后的棘轮不再保持同一 DOM 身份。

已立即恢复原声明，并独立复跑：

```text
npx vitest run src/ui/components/transform-motion.test.ts src/ui/components/update-patch.test.ts src/ui/components/catalog-validate.test.ts src/ui/components/slider-skin.test.ts games/game-lockpick/lockpick-screen.test.ts games/game-i/game-i.test.ts
6 files passed, 47 tests passed
```

## 判词

**✅ PASS。**

GAP-LOCKPICK-07 的连续变换仍是通用 PUI 数据能力；机关锁仅声明 aggregate 棘轮的终态，不保存前一渲染姿态，不操作 DOM，也不泄露单个滑轨答案。成功态维持可见的 3/4/5 轨道，但所有 Slider 输入路径均被禁用。

# GAP-LOCKPICK-05 独立复查 · 通用信号灯发光模式

- 施工主体：`PUI / Codex-root`（见 `requests.md`）
- 复查主体：`Codex/root/signal_emission_review`（与施工主体不同）
- 日期：2026-10-08
- 边界：未执行 Git / GitHub / 数据库操作，未启动或重启应用服务。布局审计只启动隔离、短生命周期的无头 Edge，已由审计工具关闭。

## 独立实证

| 项目 | 独立做法 | 结果 |
| --- | --- | --- |
| 闭集与兼容 | 复读 `types.ts`、`catalog.ts`、`validate.ts`、`render.ts`，独立复跑 `image-tint.test.ts` | ✅ `off / steady / once / loop` 均可声明；旧 `pulse:true` 仍映射为 `loop`；非法嵌套值被 `bad-signal-emission` 拒收。 |
| 非透明动画边界 | 读取 `apollo-signalPulse` 关键帧及渲染字符串锚点 | ✅ 关键帧只改 `filter/drop-shadow`，未含 `opacity`、`box-shadow` 或 `transform`；`prefers-reduced-motion` 将此动画归零。 |
| 机关锁消费 | 读取 `lockpick-screen.ts`，独立复跑屏幕测试 | ✅ 中央镜片 id 只从 aggregate stage 推导并以 `once` 重播；外圈为匿名环，仅依据 aggregate stage 生成二态暗红/亮绿刻度，不读取或显示具体槽位答案。 |
| 3 / 4 / 5 轨 | 复跑 `lockpick-screen.test.ts` | ✅ 三种轨道底板与完全相等数量的皮肤化 Slider 同时挂载。 |
| 活范例 | 复跑 `game-i.test.ts`，读取 `gallery.ts` | ✅ 同一中性灯芯展示四种 emission 状态，不借用机关锁正式资产。 |
| 视觉审计 | 无头 Edge 运行 `tools/ui-audit.mjs tools/audits/game-lockpick.audit.ts --w 1440 --h 900` 与 `--w 810 --h 506` | ✅ 两个视口均为阻断项 0、硬性低对比 0。锁的多层部件、轨道上的滑钮、确认模态均逐项标记为意图叠层，未关闭审计。 |

## 锚点撤修验红

复查期间临时将 `games/game-lockpick/lockpick-screen.ts` 内中央镜片唯一的：

```ts
emission: 'once'
```

替换为 `emission: 'off'`，随后运行：

```text
npx vitest run games/game-lockpick/lockpick-screen.test.ts
```

结果按预期有 1 例转红：镜片锚点断言要求 `animation:apollo-signalPulse 540ms ease-out 1 both`，撤修后的输出不存在该动画。已立即恢复 `emission: 'once'`，并独立复跑：

```text
npx vitest run src/ui/components/image-tint.test.ts games/game-i/game-i.test.ts games/game-lockpick/lockpick-screen.test.ts
3 files passed, 19 tests passed
```

## 判词

**✅ PASS。**

GAP-LOCKPICK-05 已作为通用 PUI 数据能力交付；机关锁只消费该能力，外部灯是二态反馈，中央灯只在 aggregate 状态变化时进行一次无透明度的颜色/轮廓光闪烁。

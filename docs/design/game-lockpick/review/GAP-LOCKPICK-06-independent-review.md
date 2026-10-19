# GAP-LOCKPICK-06 独立复查 · 单次色相点火过渡

- 施工主体：`PUI / Codex-root`（见 `requests.md`）
- 复查主体：`Codex/root/signal_ignition_review`（与施工主体不同）
- 日期：2026-10-08
- 边界：未执行 Git / GitHub / 数据库操作，未启动或重启应用服务。布局审计仅使用隔离、短生命周期无头 Edge，审计结束后已关闭。

## 独立实证

| 项目 | 独立做法 | 结果 |
| --- | --- | --- |
| 通用 `once` 语义 | 复读 `render.ts`、`server.ts`、`image-tint.test.ts` | ✅ 从固定暖金 `flashCore` 出发，过渡到按 `progress` 推导的目标色，最终稳定在目标轮廓光。 |
| 回归与安全边界 | 检查四态及旧 `pulse:true`，阅读关键帧 | ✅ `off`、`steady`、`loop` 与 `pulse:true` 旧语义保持；点火和循环关键帧仅有 `filter/drop-shadow`，不含 `opacity`、`box-shadow`、`transform`。 |
| reduced-motion | 读取 CSS 注入与点名断言 | ✅ `apollo-signalIgnition` 和 `apollo-signalPulse` 均在 reduced-motion 下归零。 |
| 局部更新重播 | 复跑 `lockpick-screen.test.ts` 的真实 `mountUI.update()` 用例 | ✅ aggregate stage `0 → 1` 实际替换 lens DOM 节点并重新挂载一次性动画。 |
| 匿名反馈与轨道档位 | 检查 `lockpick-screen.ts` 与 3/4/5 测试 | ✅ stage 仅由 aggregate ratio 推导；外圈不读取具体槽位答案；3、4、5 轨均通过。 |
| 视觉审计 | 无头 Edge 运行 1440×900、810×506 审计 | ✅ 重叠 0、硬性低对比 0、border-image 问题 0。仅保留与本次无关的非阻断华丽度提示。 |

## 锚点撤修验红

临时将 `src/ui/components/render.ts` 的：

```ts
flashCore: 'sepia(1) saturate(2.20) hue-rotate(24deg) brightness(1.75)'
```

替换为 `flashCore: 'sepia(1)'`，再运行 `npx vitest run src/ui/components/image-tint.test.ts`。

结果为预期红：6 项中 1 项失败，锚点为暖金滤镜字符串。随后已逐字恢复原值并复跑：6/6 通过。

## 判词

**✅ PASS。**

GAP-LOCKPICK-06 的通用点火色相过渡已交付。机关锁只声明既有 `emission:'once'`，不含游戏专属 CSS、DOM 监听或规则层动画逻辑。

# REQ-POTION-ANGULAR-GESTURE · G2 独立复查

复查主体：Codex `/root/g2_review`（非施工主体）。日期：2026-10-13。判词：**CONCERNS**——G2 引擎语义与修复后的点名测试通过；工单要求的真实鼠标/触控可见手势及全库门禁尚不能由本次复查证成，故不得把本单视为完整交付或释放。

## 范围与规格核对

- 依据：`work-orders/GAP-POTION-02.md`、当前 `requests.md` GAP-POTION-02、施工自检 `self-check/REQ-POTION-ANGULAR-GESTURE.md`；独立读了 `AGENTS.md`、onboarding、总线/需求/事件/运动/底库/随机/测试/复查手册。当前施工范围为 `src/skills/tier2/angular-gesture.ts`、`src/net/host/queued-input.ts` 及必要组件/登记/测试/手册；未发现游戏层自由回调或按墙钟计圈。
- `src/net/host/queued-input.ts` 的 `move:true` 显式开启连续采样、先逆投影再以 1/256 单位量化、带 pointerId、拒第二触点，并对 cancel/blur 生成退出输入；缺省模式保留原坐标与点拖互斥。`queued-input.test.ts` 通过 mock PointerEvent 验证缩放、取消、多指与缺省兼容，但它不是浏览器真手势目击。
- `src/skills/tier2/angular-gesture.ts` 使用整数毫度单角度和固定 CORDIC 投影；屏幕 y 向下正角作顺时针，跨 0° 取最短角差，反向累计抵消；死区/跳变/抖动/不足圈不发 Signal。状态置于组件并进入快照，DebugTrace 为 opt-in；G1 会话绑定在步骤推进后拒同次握持的额外采样。Q/E 等价路径复用现有 KeyBinding。

## 独立实跑与撤修验红

1. 正常树：`npx vitest run src/skills/tier2/angular-gesture.test.ts src/net/host/queued-input.test.ts --reporter=dot`，退出码 0，2 文件 **15/15**；包括内侧/外侧环带、跨零点、逆时针、折返、短弧、同握持三圈、G1 同拍接缝、键盘等价、快照/同轨及 legacy 输入。默认沙箱曾因 `node_modules/vitest/dist/spy.js` realpath EPERM 导致 no tests；改用获准的短生命周期提权测试后才取得上述有效结果，不能把 EPERM 当测试红或绿。
2. 独立系统图：`npx vite-node scripts/system-graph-audit.mjs t2-angular-gesture t2-ordered-action-session t2-keybind t2-clickable t2-drag-place t2-effect-apply`，退出码 0，7 系统子集 PASS，无重复 ID、悬空定序边或该子集成环告警。
3. 登记/组件：`gen-capability-registry.mjs --check` 142 条同步、`component-manifest-guard.mjs` 208/208 PASS、`build-component-map.mjs --check` 231 组件 PASS，三个命令退出码均 0。
4. 实证发现并修复：原 `angular-gesture.ts` 的 down 判定只限制半径 `r ≥ centerDeadZone`，未使用握持容差的内界。以 `grabTolerance=0.2`、`centerDeadZone=0.16`、`r=0.2` 且原条件字符串锚点命中 1 次的数值复现，得到 `accepted=true`，而锅口环带最小半径应为 `0.8`。施工主体随后在约第 165–166 行加 `minRadius=max(centerDeadZone,1-grabTolerance)`，并补内侧/外侧/环带点名断言。
5. 对修复做了**隔离内存撤修验红**：临时 Vite pre-transform 配置先断言 `first.radiusSquared < minRadius * minRadius` 锚点恰好命中 1 次，仅在测试模块加载时把它换回旧的 deadZone 条件，不写生产源。预告测试“握持只允许锅口椭圆环带”实红（G2 1 fail/9 pass，`heldSource` 实际为 `player`，应为 `undefined`）；删除临时配置后正常 G2 **10/10** 绿。临时配置已删除，生产文件未被复查者修改。

## 未关闭项与边界

- `work-orders/GAP-POTION-02.md` 写明“真鼠标和触控抓棒/锅口接棒”；当前正式游戏 play-field 还未接入，只有 mock PointerEvent 和 sim 证据，没有隔离浏览器真实玩家手势、棒的位置/入水遮挡及可见圈数反馈。本项必须在可玩切片验收中补实证；不得以本次 15/15 代替。
- 全库 TypeScript、完整 scoped gate 与上下文容量门禁不属于本次独立复跑结果；施工自检记有共享树其它项目阻断。G2 本体局部通过不意味着公共池可释放、`capability-gaps.json` 可标 delivered、S3/S4 可签核。
- 未修改项目路线图或人门状态；由项目施工主体依据此复查结论同步控制面。

# SIMLIFE-ENG-24 自证｜多方向键真实状态收敛

日期：2026-10-10  
施工主体：BDM程序

## 结论

本单修复共享 Life 键盘输入链的“同 tick 多条同名 stop 只落一份 Signal”问题。浏览器层不再用多条 start/stop delta 表示物理按键，而是把当前完整方向集合编码为 `life.move.state` 位掩码（up=1、down=2、left=4、right=8）；`t2-life-continuous-motion@1.1.0` 直接从确定性 `InputQueue` 按 actor/source 取同 tick 最后一份快照并原子覆盖四个 held flag。旧 `life.move.start/stop` Signal 仍兼容程序化/AI 输入。

## 根因实证

`t2-keybind` 的一个 `KeyBinding` 实体每 tick 只能挂一份 `Signal`，并在匹配 `InputQueue.actions` 时命中第一条即停止。同一 tick 若排入 `stop:right → stop:up → stop:left`，只有 `right` 能成为 `Signal.arg`，旧 held 中的 up/left 无从清除。修复前真实 Little Valley World 复现准确留下 `{up:true,left:true}`，与 owner 所述松键后幽灵左移一致。

## 对照单

| # | ENG24 承诺 | 结论 | 证据 / 说明 |
| --- | --- | --- | --- |
| 1 | 左+上后连续右键/repeat，全部松开必归零 | ✅ | 真实 `createLifeDemoSession + installLifeDemoKeyboard + EventTarget`：KeyA/KeyW/KeyD/ArrowRight、repeat、同 tick 全 keyup 后四 flags false、Velocity 0 |
| 2 | 后续 N tick 不再幽灵移动 | ✅ | 归零后继续 5 tick，Transform x/y 严格不变 |
| 3 | 相反轴中间态正确 | ✅ | left+right 抵消得到 `vx=0`，up 保持 `vy<0` |
| 4 | 同方向 alias 生命周期正确 | ✅ | KeyW+ArrowUp 的每次 down/up 都投完整 mask；最后一个 alias 松开才得到 mask 0 |
| 5 | 同 tick queued input 取最终物理真相 | ✅ | sim 用例同 tick 注入 `4→5→13→5→4→0`，只消费最终 0 并稳定静止 |
| 6 | duplicate/repeat/E/Tab/blur/visibility 不退 | ✅ | reducer、DOM adapter、generic host 与 Little Valley 回归覆盖；repeat 不发新快照，blur/visibility 发唯一 0 快照 |
| 7 | ENG23 不退 | ✅ | 27 文件 Life 全链含对话中移动、proximity 越界关闭、choice/terminal、存档恢复 |
| 8 | legacy 输入兼容 | ✅ | 既有 `life.move.start/stop` Signal 的移动、碰撞、确定性测试保持通过 |
| 9 | 确定性 / hash | ✅ | 完整状态 packet 序列双跑 snapshot/hash 相同 |
| 10 | DebugTrace | ✅ | 有 trace 时记录 held transition、Velocity decision、非法 mask reject，每 system/tick ≤3；无 trace 不创建组件且不构造日志字符串 |

## 验证实证

- 修复前点名复现：纯 reducer 与真实 World **2 failed / 43 skipped**；真实值留下 `left:true, up:true`。
- 终态 Life 全链定向回归：**27 files / 224 tests passed**。
- 相关 TypeScript ESLint：exit 0，零 warning。
- `DOCS-REF: PASS`；component manifest **205/205 PASS**。
- system graph：注册总图 **119 systems / 216 显式边**；相关 5 capability / 7 systems 子图无环，`SYSTEM-GRAPH: PASS`。
- `game-skill-audit game-simlife`：未覆盖红旗 0，`RATCHET: PASS`；薄宿主“零能力接入”为既有静态扫描黄项。
- `align-count --game game-simlife --stage S4`：**✅ 60 / ⚠ 0 / ❌ 0**，exit 0。本单无布局、主题、素材或 renderer 变化，不伪造新视觉截图。
- 全库 `tsc --noEmit` / `npm run build` 仍被既有 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher/game-runner.tsx` 与 ENG22 `art-consumption.test.ts` 类型错误阻断；输出未命中 ENG24 文件。

## 撤修验红

锚点 `if (action.key === LIFE_MOVE_STATE_ACTION && action.phase === 'action')` 在 `life-continuous-motion.ts` 精确命中 1 处。临时改成恒假并加入 `ENG24 sabotage` 后，sim trace 快照消费与真实 Little Valley 多键 World 复现精确 **2 failed / 26 skipped**；恢复后 **2 passed / 26 skipped**。终态锚点 1、`ENG24 sabotage` / `false && action.key` marker 0。

## 环境与边界

未启动或重启应用服务，未访问数据库，未执行 Git/GitHub。未修改 `src/ui/**`、renderer、资产或 package JSON；没有新增 component、system、phase 或玩法 capability。

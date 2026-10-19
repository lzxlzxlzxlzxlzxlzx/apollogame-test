# GAL-ART-01A 画廊 V2 信息栏增量独立复查（2026-10-14）

判词：**局部 PASS**。本报告只覆盖画廊顶栏位置、标题说明、页签行计数及旧树回退，不签完整 S5/S6、终图、素材授权或 Owner 人门。复查人与施工人不同；未修改实现、原型、素材、工单或路线图。

## 独立复跑与实证

- 定稿依据 `docs/design/galgame/gal-ui-complete-v2.dc.html:30` 的标题“场景重播 · CG 鉴赏”及页签行“已解锁 x / 6”；顶栏 `.system-bar` 由原型规定左右 31px、顶部 14px、高 42px。正式树 `src/services/gal-ui/gal-ui-structure.ts:233-269` 使用 LayoutNode，已加载 V2 路径包含 x31/y14/1378×42 顶栏、标题说明、页签行动态计数；旧树分支保留原计数所在标题行。
- `npx vitest run src/services/gal-ui/gal-ui-art.test.ts`：默认 Windows 沙箱在 `node_modules/vitest/dist/spy.js` realpath 处 EPERM，0 测试；受控重跑退出 0，19/19。测试 `src/services/gal-ui/gal-ui-art.test.ts:475-498` 点名 V2 顶栏、说明、计数位置、旧树无图回退和 `validateLayoutNode` 零 issue。
- `npx tsc --noEmit` 退出 0。`node tools/ui-audit.mjs src/services/gal-ui/gal-gallery-v2-{dark,light}.audit.ts` 两态分别退出 0：各 27 个绝对定位元素、重叠 0、硬对比失败 0、3–4.5 警告 0、border-image 前提错误 0；各有 4 处 skin 命中与 house 主题。审计画布为 1060×760，不代替原型同画布证据。
- 短时隔离静态浏览器运行 `GAL_ART_AUDIT_PAGES=gallery-memories,gallery-memories-art,gallery-cg node src/services/gal-ui/verify-gal-art-live.mjs`，退出 0。六个深/亮 1440×900 状态均实测顶栏 `(x31,y14,right1409)`，标题行 `(x84,y109,right1356)`，页签行 `(x84,y182,right1356)`；标题说明文本正确、计数在页签行右端。两类回想 3/6，CG 2/6，表明不是固定常量。探针使用本地静态构建，不占 Owner 5173；其 finally 清理临时浏览器与构建，未发现常驻子进程。

## 撤修、告警与边界

- 严格撤修验红：建立一次性临时 Vitest 配置，以 Vite `transform` 钩子只在**内存中的模块代码**把 `gal-ui-structure.ts` 唯一锚点 `v2Frame ? label('gal-gallery-heading-note', '场景重播 · CG 鉴赏', 14, 'sub') :` 替为“错误文案”；钩子断言该锚点命中恰好 1 次。实际 `npx vitest run ... --config <临时配置>` 退出 1，19 条中 1 失败、18 通过，失败精准位于 `gal-ui-art.test.ts:479` 的说明文字断言。移除临时配置后正常重跑退出 0、19/19。临时配置已删除，源码与测试未变；这证明目标点名测试确会抓到该标题文案漂移。
- 工具输出未见本增量 UI 警告；上面的 `realpath EPERM` 是沙箱前置错误，已保留原始记录并受控重跑。未独立复跑完整相邻 98 文件/789 测试、全库 scoped gate 或完整 S5/S6。原型演示素材与当前夹具内容不同，视觉终图、回想 01–06/锁态/CG 02–06 的审美、来源与许可仍待 Owner 独立审核。

控制台未由本复查者改写（任务边界只允许本报告）；`media-and-final-skin` 保持 active、gates pending/required，待项目负责人按真实局部 PASS 同步。

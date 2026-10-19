# GCI-S6-UI-03 · 共享闭集字段独立复查

2026-10-14 · 非施工者 `/root/gci_ui03_independent_review` · **局部 PASS**。本判词仅覆盖 UI-03 共享排版、透明框边、焦点标签和逐对象反馈色；不等于 GCI S6 游戏关、人门或全库推送门通过。

## 范围与合同

- 核对 `docs/design/game-clue-investigation/self-check/S6-visual-remaining-capabilities.md` 中 Owner A 裁决和公共池 `REQ-GCI-CART-UI-BRIDGE` 施工锁。仅对共享 `src/ui/components`、`src/assembly/cart-presentation.ts`、`src/studio/cart-{run-core,focus-placement,pointer-feedback}.ts` 及定向样例/测试做只读复查；未编辑实现、GCI manifest、原型、素材、游戏需求单、路线图或流程板。
- `Label.lineHeight/weight` 的合同与拒收在 `src/ui/components/validate.ts:75–79`，安全渲染在 `render.ts:430–431`；`Panel.border` 受限且透明中心避开 house `panelTexture` 在 `render.ts:529–554`。焦点字段严格解析在 `src/assembly/cart-presentation.ts:191–211`，同源 Shape/mask 上缘在 `src/studio/cart-focus-placement.ts:4`，逐对象色覆盖全局色在 `src/studio/cart-pointer-feedback.ts:8–9,47,60`，标签投影与大小/色在 `src/studio/cart-run-core.ts:250–293`。未发现游戏层自由 CSS/DOM 或 World 写入。

## 四步独立核证

1. **独立复跑**：`npx vitest run src/ui/components/gci-s6-ui03.test.ts src/studio/cart-focus-placement.test.ts src/assembly/cart-presentation.test.ts src/cartridge-inline-run.test.ts`：4 文件/41 测试，exit 0。`npx vitest run src/ui/components`：73 文件/556 测试，exit 0。`npx tsc --noEmit`：exit 0。`node tools/ui-audit.mjs tools/audits/gci-s6-ui03.audit.ts` 和 `.../gci-s6-ui03-light.audit.ts`：各 exit 0，重叠 0、硬/软低对比 0、border-image 前提 0。`validateLayoutNode` 点名测试覆盖非法行高/字重、border 任意 CSS/alpha/bare/skin、旧缺省 HTML 不变。普通沙箱先复现 `vitest/dist/spy.js realpath EPERM`（exit 1，零用例）；上述实际执行的 Vitest/审计使用获准的本地短时命令，不能把 EPERM 当产品测试红。
2. **唯一锚点撤修验红**：只在内存中将 `cart-focus-placement.ts` 的 `if (placement !== 'above') return ...` 替为恒走中心，锚点命中 **1**；未破坏时 Shape 顶边 `y=180`，破坏后 `y=200`，同一断言转红。另只在内存将 `cart-pointer-feedback.ts` 的 `target?.tone ?? fallback` 替为 `fallback`，锚点命中 **1**；未破坏时 gold 覆盖 cyan，破坏后该断言转红。两个内存变体均未写共享树。
3. **真浏览器实证**：隔离短时 Vite 页面 `http://localhost:5731/__ui03_independent__`，以同一 GCI manifest 的内存 presentation 先后挂旧/新字段，`object-clock` 标签旧 `top=184px/font=12px/color=rgb(126,140,155)`，新 `above+gap8` 为 `top=84px/font=14px/color=rgb(96,226,241)`；解析后的 blueprint JSON 完全相同，Canvas 的 `investigate.clock` 点位两次均 `x=1212.5,y=192`。第二隔离页 `http://localhost:5732/__ui03_hover__` 真实鼠标 move/down：标签状态 `hover→pressed`，两态 opacity=1、cyan 色 `rgb(96,226,241)`，console/page errors 均空；`ActionSink` 动作名仍为 `investigate.clock`。这证明本次 presentation 改动未改解析世界蓝图与现有命中投影；没有借此宣称实际游戏 S6 的世界 hash 全旅程已复验。两次浏览器在 finally 关闭，端口 5731/5732 经 `Get-NetTCPConnection` 核对均无监听；没有访问 5173 或启动整套 ZeroCraft。
4. **逐条读告警**：两套字段审计各报 `[华丽度] 0/house:false`，属于使用 `SHELL` 的隔离字段夹具，非正式 GCI 屏的品质结论。扩大至 `src/ui/components games/game-i` 加卡带测试时是 **712/713、exit 1**：唯一失败 `games/game-i/dialogue-world.test.ts:30` 既有好感 `expected 14, received 8`，该文件未在本单改动；不能称扩大范围全绿。施工导航另记全库 `scoped-gate` 被其他项目 32 条 depcruise 违规阻断，本次未将其伪报为 PASS。读到工作树 LF→CRLF 警告，未动文件换行或执行 Git 写入。

## 判词

**PASS（UI-03 共享字段局部）**：实渲染、闭集拒收、旧缺省、真实 hover/press、独立锚点验红成立。扩大 game-i 对话旧红和全库依赖门红继续独立列账；正式 GCI 九态对齐、世界旅程、S6 自证/复查与 Owner 人门须由游戏主线另核，不由本单代签。

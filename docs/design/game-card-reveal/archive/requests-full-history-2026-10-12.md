# `game-card-reveal` 施工单与需求池

> **已取消需求（Owner，2026-10-12）**：独立的 ScreenFx 彗星揭幕转场不再使用；撤销此前选择 A 的待施工路线，不再等待原型目击/冻结，也不申请 `ScreenFxSequence` 引擎能力。本次只取消该横向转场需求，不改变主 App 的 P1–P5 演出、既有 `t2-presentation-track` 或 S8 验收状态。`screen-fx-comet-prototype.dc.html` 与 `screen-fx-comet-prototype-notes.md` 仅作历史设计证据保留，不得作为当前施工依据；将来重启须重新立项和裁决。

## 当前阶段

- S1-P / FINAL 已于 2026-10-09 经 owner 明确判词“冻结，可以开始 S2 实现”，整体定稿。
- S2 能力计划、两个共享缺口、S3 骨架、S4 演出闭环与 **S5 UI/正式表现接线**均已独立复查通过。S6 两项视觉返修均已独立复查，并于 2026-10-10 获 owner 判词“可以开始下一步”，记为 **S6 owner 视觉人门 PASS**。S7 独立评分为 13/24、非 premium，owner 已明确接受当前演出并允许进入联调和打包。当前阶段为 **S8 真实宿主联调、可移植 dist 与交付终检**；S8 包内技术复查已 PASS，仍等待 owner 独立 4174 HTTP 与真实 DokiWorld 安装子路径见证，不得宣称已发布或覆盖 DokiWorld 安装目录。
- S2 实查识别出唯一 P1 缺口 `GAP-CARD-REVEAL-01`：现有 `t3-timeline + t1-tween` 无法声明式表达 P2–P5 多实体、多段并行动画与统一跳过终态。A/B 裁决全文见 `capability-plan.md §4.8`。
- owner 于 2026-10-09 选择 **A**：下沉通用 `t2-presentation-track`；禁止本游戏专属 presentation controller。
- `GAP-CARD-REVEAL-01` 已于 2026-10-10 独立复查 PASS，`capability-gaps.json` 为 `delivered`，S3 已解锁。

## S4 演出闭环 · 施工状态（2026-10-10）

- 施工主体：卡牌动画程序；独立复查主体须非施工人。受 Owner 本机禁令约束，未执行 Git/GitHub、未启动服务、未修改数据库。
- 实现边界：`games/game-card-reveal/**` 与 `dokiworld/game-card-reveal/**` 的正式轨道数据、会话薄壳、LayoutNode 控件、宿主回执及定向测试；不碰 `src/**`、`assets/**`、SDK、launcher、原型和打包流程。
- 已有机器证据：游戏 18/18、Doki 28/28、Doki scoped TypeScript、游戏 ESLint、根 Vite build 均 exit 0；`game-skill-audit` 无硬红旗，缺美术台账为 S5 范围的黄色提示。
- 真渲染补证：owner 确认已运行的 `http://127.0.0.1:5173/` 服务可用；使用同一 HTTP 服务访问原型和 Doki 页面，未启动第二服务、未绕过 `file://` 禁令。`self-check/shots/S4-*.png` 共 8 张均为 1440×900；P3 暂停 800ms 画面不动，继续/跳过到 P5，N1/N3/N5 终态已目击，console error 0。
- 真渲染发现并修正：顶片/包体终态可见性残留、底栏纵排裁切、P2 直线穿心转动；已改为退场后隐藏、LayoutNode bare Panel 横排、P2 椭圆弧声明式关键帧，并完成定向复测。
- 首次施工自证 `align-count` 曾为 0（7 ✅、3 ⚠、0 ❌），但非施工人独立真渲染复查发现正式入口用 `sceneBackground:#111225`、`wrapperBackground:#050611` 破坏冻结的透明舞台与 DokiWorld 合成语义，新增 1 条 ❌。**S4 独立复查 FAIL，退回只修透明舞台；S5/S6 继续锁定。** 详情见 `review/S4.md`。
- 透明舞台退回修复（2026-10-10）：正式 host 配置已移除不透明 scene/wrapper/背景皮肤槽，仅保留 1440×900 与 90px 底栏；CanvasRenderer 继续透明。新增配置与真实 `mountHost` 自动测试，Doki **29/29**、scoped TypeScript exit 0；5173 正式入口 html/body/app/wrapper/scene/canvas 六层 computed background 均为透明，审计底板 P2/P5 两张 1440×900 合成截图四角与未绘制区可见双色棋盘格，fresh-tab console error 0。`self-check/S4-alignment.md` 第 11 行已更新；本回执只送**再次独立复查**，不自评 PASS、不进入 S5/S6。
- 再次独立复查（2026-10-10）：复查人独立复跑游戏 **18/18**、Doki **29/29**、scoped TypeScript、ESLint、build、对齐计数与能力审计均 exit 0；撤修恢复不透明背景后新增测试准确转红，恢复后重新通过。5173 的 1440×900 P2/P5 正式页五层 computed background 均透明、console error 0，临时标签与视口已清理。**S4 独立复查 PASS，允许进入 S5；S6/S8/打包仍锁定。**

## S5 UI 与正式表现接线 · 完整施工单（2026-10-10）

- 施工主体：本 Codex 会话（S5）；独立复查主体须非施工人。领工基线：S4 再次独立复查 PASS，S5 尚无正式包装资产/远程卡面桥/最终 UI 自证。预计边界仅本节“施工边界”列出的游戏、DokiWorld adapter、本游戏本地资产和设计自证文件；受 Owner 本机禁令约束，不执行 Git/GitHub、不启动服务、不改数据库。

### 阶段目标与架构判定

- **接受施工**：S4 的规则、实体、轨道和交互结构保持不动；S5 负责把冻结原型的正式包装、撕顶外观、宿主卡面消费和 LayoutNode 控制 chrome 接到生产页面，并完成 1440×900 的 UI/视觉自证。
- **不接受另造能力**：远程卡面必须复用现有 AssetManager/runtime external 路线；包装和撕片走本地资产索引；控件走 LayoutNode；运动继续消费 `t2-presentation-track`。不得增加游戏专属图片加载器、自由 DOM/CSS、裸 canvas、运行时图片裁切器或第二套动画控制器。
- 若实查后现有能力确实无法表达，按缺口协议留下“查了什么、为什么重组不成”，提出 A 通用能力 / B 游戏独有逻辑及代价，停在 owner 裁决；不得先写逃生实现。

### 施工边界

- 允许：`games/game-card-reveal/**`、`dokiworld/game-card-reveal/**`、本游戏按资产流程建立的本地资产与索引/台账、`docs/design/game-card-reveal/self-check/**`、`review/S5.md` 和本文件。
- 资产新增、裁片、登记与消费键接线必须按 asset-manager/resource-manager 规范执行；`assets/index.json` 是单一真相，台账只列真实消费槽。
- 禁止：修改冻结原型来迁就实现、改变 P2–P5 时序/轨迹/并行关系、扩宿主合同、进入 S6 最终美术评分、生成 dist/zip、修改 SDK、启动/重启服务、数据库或任何 Git/GitHub 操作。

### W1 · 正式包装资产闭包

1. 将 `ui-refs/pack-unified-ai-v1.png` 作为 authoring source，按资产规范导入本游戏本地资产目录；禁止运行时直接引用 `docs/**`。
2. 提供稳定资产：`pack.front`、`pack.back`、`pack.tearTop`、`pack.tearBody`。其中本版 P2–P5 真实消费 `pack.front/tearTop/tearBody`；`pack.back` 经 owner 资产人审批准后仅作库存，不得伪造隐藏实体或虚假消费槽，因为冻结流程没有背面可见帧。top/body 必须从同一正面源图离线、确定性派生，沿冻结 P3-R2 浅弧互补，不能继续使用矩形色块或运行时 mask。
3. 保持透明边缘、正反朝向、3:2 逻辑外框以及原型已裁的热封口位置；不得为适配素材偷改 S4 坐标或包尺寸。
4. 建立 `game-card-reveal.asset-slots.json`（或仓库现行等价推导形式），让孤儿槽/无消费槽审计可运行；包内包装、撕片、fallback 与必要 UI 图形必须进入资产闭包。

### W2 · 宿主卡面运行时资产桥

1. 正式输入仍只接受合同中的 HTTPS `faceImageUrl`；按照输入顺序注册为稳定 key `host-card:0..4`，ECS/蓝图/快照只见 key，不保存 URL。
2. 使用现有 AssetManager 的受控远程注册/解析能力；不得在游戏层手写 `Image`、fetch、object URL、缓存器或 CORS 绕过。
3. 在进入会依赖卡面的可见阶段前完成受控加载；每张失败独立降级到包内 `card.fallback`，不能让一个坏 URL 阻断整段演出，也不能把加载失败误报为抽卡失败。
4. preview 使用明确的包内 1–5 张演示卡面，不访问 `example.invalid`；preview 例外不能放宽正式合同。
5. 测试至少覆盖：1/3/5 张成功映射、乱序加载仍保持输入顺序、单张/多张失败 fallback、重复 URL 不破坏稳定 id、销毁会话后清理 runtime external、URL 不进入输出与确定性状态。

### W3 · play-field 视觉替换

1. P2 八包、聚焦包、P3 顶片/余包全部由上述正式本地纹理渲染；P4/P5 卡牌由 `host-card:n` 或 fallback 渲染，保持 S4 的同一稳定实体，不允许阶段切换时重建或换 id。
2. 完成冻结原型的视觉接力：P2 终帧=P3 首帧、P3 终帧=P4 首帧、P4 终帧=P5 首帧；关键边界须做可重复姿态或截图比较。
3. 卡面不得拉伸；在既定卡框内按统一 cover/安全区策略呈现，透明/加载失败区域不得闪出旧纹理或黑块。
4. 不增加原型外粒子、彗星、稀有度爆发、音效或背景；透明主舞台和 S4 的时序是硬约束。

### W4 · LayoutNode 控制 chrome

1. `screen.ts` 按能力计划改用 `apolloOnyx`；只通过 LayoutNode 构建暂停/继续、跳过、退出、加载/降级提示、回执重试状态，主 CTA 使用成熟高对比/hover 皮肤。
2. 主舞台继续透明；底栏可以有自己的可读实底，但只能占 `bottomBarH=90`，不得给 wrapper/scene/canvas 铺背景。
3. 1440×900 是验收逻辑画布。所有文字、按钮、焦点态、hover/按下/禁用态完整可读；不得因 810×506 侧栏反向放大字号或重排逻辑布局。
4. 暂停、继续、跳过、退出和 P5 终态的可见性必须与状态一致；动画中禁用/隐藏的动作不能仍通过鼠标、键盘或快速连点重复提交。
5. 远程图片加载中与单卡 fallback 只给克制、明确的信息，不遮挡包装/卡牌；错误与 retry 文案不得泄露 URL。

### W5 · 自动测试与真渲染自证

1. 保持 S4 全部回归通过，并新增资产槽、remote→stable key、fallback、preview 本地卡面、透明宿主和 UI 状态测试。
2. 运行并逐项报告退出码：游戏 Vitest、Doki Vitest、Doki scoped TypeScript、游戏 ESLint、生产 build、`game-skill-audit`、资产闭包/孤儿槽审计、`validateLayoutNode`、`ui-audit` 与 `align-count --stage S5`。不得把人工观察冒充未运行成功的工具门。
3. `ui-audit` 必须使用现有 5173 或短生命周期隔离无头浏览器；不得让审计脚本间接启动服务。若工具只因浏览器路径失败，优先使用其受支持的本机 Edge/浏览器配置；不要在游戏单中私改 PUI 工具掩盖环境问题。
4. 使用 owner 已启动的 5173，在 1440×900 真机完整播放 N=1/3/5；至少留存 P2 圆环、P2 聚焦、P3 撕顶并行、P4 第一张飞出/第二张显现、P5 N1/N3/N5、fallback、暂停和按钮交互态截图，console error 必须为 0。
5. 新建 `self-check/S5-alignment.md`，逐条与冻结 `ui-refs/final`、P3/P4/P5 关键帧并排；❌ 必须归零，每条 ⚠ 必须明确进入 S6 或 S8 的去向。不得以“后续美术再做”解释未接正式包装、卡面槽或明显 UI 偏差。
6. 至少做一次带锚点撤修验红：撤掉正式包装消费、runtime fallback 或 UI 状态门中的关键修复，证明对应测试准确转红，随后恢复并复跑绿。

### S5 出口

- 交 `review/S5.md`，列实际修改边界、全部命令与退出码、真渲染地址、截图清单、浏览器清理情况、撤修证据、剩余告警和逐条去向。
- 施工人只能报告“送独立复查”，不得自评 PASS，不得进入 S6/S8/打包。S5 是否通过由非施工人复查；owner 仍负责最终视觉人门。

### S5 缺口待 owner A/B 裁决：任意宿主卡面等比 cover

- 实查（2026-10-10）：`src/skills/atoms/sprite/index.ts` 的 registry `l1-sprite` 只给 `textureKey/anchorX/anchorY/zOrder`；`src/engine/protocol/components/render.ts` 的 `Sprite` 同样无目标尺寸/fit；`src/renderer/canvas-renderer.ts` 的 `drawSprite` 对 source rect 使用 `drawImage(image,sx,sy,sw,sh,dx,dy,sw,sh)`，目标宽高固定等于源 rect；`AssetManager` 只注册/加载/解析，不做尺寸归一。`Frame`/atlas 只能裁源矩形，不能把任意大小图片送进固定 260×390 卡框；`docs/playbooks/rendering-fx.md`、`assets.md`、`pick-list.md` 也无泛用 Sprite cover 接线。受最高优先级本机禁令，未执行手册所说的 `git pull`。
- 因此 W3“任意 HTTPS 图片在既定卡框内等比 cover/安全区、不得拉伸”不能只靠现有 key、Transform 和 AssetManager 重组。S5 已完成的稳定 key/逐张失败回退不等于 cover；不得以真渲染恰巧使用 2:3 测试图冒充通用支持。
- **A：补通用 2D Sprite fit 能力（推荐）**。给 Sprite 闭集增加目标绘制尺寸与 `cover|contain` 策略，CanvasRenderer 只在 render-only 路径按原图比例计算源裁片/目标矩形，配 registry、测试及独立复查。代价是触及 `src/engine/protocol`、`src/renderer` 共享面，超出本 S5 授权，须另派有权施工者；影响所有 2D 贴图消费者，但 opt-in 可保持旧图零回归；通用性高。选错代价是为单作加宽引擎，增加 API/测试维护。
- **B：允许本 App 专属运行时图片归一化**。在 Doki 适配层把加载的图像裁进 260×390 临时纹理再注册稳定 key。代价是需要特批 W2/W3 当前禁止的游戏专属加载/运行时裁图，跨源图片会牵出 CORS/污染画布与内存生命周期；影响面局限本 App、通用性低。选错代价是下一款卡面 App 再造一遍，且可能在远程 CORS 不足时失败。
- 施工推荐 A，不自行裁决；W3 cover 及依赖它的 S5 完整视觉验收停在 owner 判词。资产导入、稳定 key/回退、独立底栏 UI 和不依赖 cover 的测试可继续。

### GAP-CARD-REVEAL-02 · 通用 2D Sprite 目标尺寸与 fit

- owner 判词（2026-10-10，原文）：`选择 A，四张资产全部通过`。已从「游戏策划」会话原始 user 消息核对。A 即通用 2D Sprite 目标绘制尺寸与 `cover|contain`，不得改走本游戏专属运行时裁图。
- 最小契约：新 Sprite 字段可选；旧消费者不填时保持源 rect 原生尺寸。renderer 对整图和 atlas Frame 根据源矩形/原图比例计算目标矩形；cover 裁源、contain 留目标空白，不生成临时纹理、不运行时 Canvas 重采样、不把 URL 写入 sim。非法尺寸/fit 在 schema、registry、装载门拒绝；render-only 非确定性边界须写清。
- 归属与阶段：此项触及跨游戏共享渲染面，已由独立引擎程序施工，并于 2026-10-10 经非施工人独立复查 **PASS / delivered**：37/37 定向测试、范围 ESLint、139 条 registry 守卫通过，独立 cover 撤修得到精确 1 failed / 20 skipped、恢复后全绿；整图/atlas、旧 native path、cover/contain 与最终目标框 anchor 均有精确断言。`game-card-reveal` S5 现可消费该能力，但不得自行再改 `src/**`。全库 TypeScript 仍被并行的 game-dice/game-simlife/game-theft/launcher 错误阻断，故此 delivered 不等于 S5 或最终交付门禁完成。复查证据：`review/GAP-CARD-REVEAL-02.md`。

### S5 资产人审与门禁实况（2026-10-10）

- `pack.front/back/tearTop/tearBody` 已从冻结的 ImageGen 统一包装源图离线确定性派生为 400×600 候选 PNG；按 `docs/design/m2.5-registration-contract.md`，它们仍在本游戏 `art/ai/pending.json`，**未经过 `reviewPending(approve)`，不得称正式登记或 W1 闭包完成**。原型 FINAL 冻结不是资产审核的替代判词。`card.fallback` 与 `card.preview.0..4` 为项目原创包内 SVG，已在本地 index 登记。
- owner 已于 2026-10-10 对展示的四张候选图给出原文判词 `选择 A，四张资产全部通过`；资产人审已通过，但正式登记仍以 M2.5 `reviewPending(approve)` 的真实执行与回执为准，不能手改索引追认。
- M2.5 四次正式 `review <id> approve --game game-card-reveal` 已由资产专员执行，四命令 exit 0；本地 index 现为 10 个唯一 key，pending 条目与待审图片均为 0。四 PNG 仍是批准前同字节 400×600，SHA-256 对上 provenance.contentHash，license/model/prompt/generatedAt/approvedAt/reviewedBy 齐全，`cards/` 与 `textures/` 无未登记图片孤儿。`pack.back` 只作本版批准库存，按策划裁决排除 art-ledger/asset-slots 真消费行；`loadGameArtInto` 预载不算 skin consumer。未来若需 P1 Flip，先改原型并重走 owner 人门。
- `art-ledger.json` 已落本地资产目录，9 行分别对应 front/top/body、fallback、preview 0..4；`node scripts/ledger-audit.mjs game-card-reveal --strict --json` exit 0，9/9 consumable、0 orphan。新增 `dokiworld/game-card-reveal/tests/art-closure.test.ts` 点名 index/ledger/实体文件与冻结可见 Sprite，Doki 37/37 exit 0。
- 用 owner 已启动的 5173 HTTP 正式页在 1440×900 只读目击：N=5 的 P2 已显示真实 `pack.front` 而非色块，console error 0；N=1 底栏操作链“暂停→仅继续/退出，继续→暂停/跳过/退出，跳过→P5 仅退出”与状态一致，console error 0。临时标签均已关闭、视口已恢复。此为阶段性浏览器目击，**尚非 W5 要求的完整关键帧落盘或任意尺寸远程 cover 验收**。
- 2026-10-10 13:29（本地）复跑 Doki scoped TypeScript exit 1：`src/renderer/canvas-renderer.ts:342` 的 `projection` 可为 null 且 `string | undefined` 不可当 string。经游戏策划复核，归因是并行活跃的 **BDM程序 shared-renderer 施工现场**（Life/模拟经营渲染路径），**不是 GAP-CARD-REVEAL-02 已开工**。本 S5 会话未改 `src/**`；共享 TypeScript 门须等 BDM 收口后复跑，先前的绿不代表当前工作树。GAP-02 仍未指派主程，且在 BDM 释放 `canvas-renderer.ts` 前不得并发开工。
- 原离线裁图留下的四份 `art/textures/` 同字节未登记副本存在 orphan 风险；清理尝试被自动审查拒绝，未绕过。`scripts/asset-reconcile.mjs` 的游戏名正则不识别第二个连字符，不能把其 PASS 当本作资产闭包证据。
- W2 定向测试含 1/3/5 稳定 key、乱序完成、独立 fallback、重复 URL、preview 本地源、销毁清理、URL 不进蓝图/快照/输出；游戏 19/19、Doki 35/35、Doki scoped TypeScript、游戏 ESLint exit 0。`ui-audit` 使用短生命周期隔离 Edge 审 1440×90 底栏，重叠/硬低对比/border-image 前提均 0，exit 0；2 个华丽件命中、house skin 判别为否，保留非阻断警告待真画面对照。`game-skill-audit` exit 0 但报美术台账黄色警告；`align-count --stage S5` 因 S5 对齐单尚未在档 exit 1，不得称通过。
- 生产 build 首次在调用前被自动审查拒绝，理由是 S5 当前锁定 dist/打包；未绕道。随后游戏策划明确裁决：W5 允许短生命周期的**根项目 Vite 验证构建**，禁止的是 DokiWorld 发布打包、app dist/zip 与上传目录。按此口径原命令 `node node_modules/vite/bin/vite.js build` 重试，exit 0（754 modules）；仅有既存大 chunk 警告，未运行 Doki 打包/发布脚本。根 `dist/` 是该验证构建产物，不作为 S5 交付包。
- S5 收口复核（2026-10-10）：M2.5 四项批准后有一次旧 `pending.json` 四行被写回；资产专员核对 index 中 approvedAt/reviewedBy/contentHash 与四个正式 PNG 后，只清除这四条无待审实体的过期元数据，未重复 approve 或改正式图。现 index 10 key、pending 0、ledger 9/9、orphan 0。GAP-CARD-REVEAL-02 已由独立引擎程序交付并非施工人复查 PASS；本游戏卡牌 Sprite opt-in 260×390 `cover`。S5 仅加本地 preview `fallbackCard=n` 故障夹具以真渲染验证逐卡回退，不改正式 HTTPS 合同。
- 最新门禁：游戏 19/19、Doki 42/42、Doki scoped TypeScript、游戏 ESLint、根验证 build、`game-skill-audit`、严格 ledger-audit、1440×90 `ui-audit`、`align-count --stage S5` 均 exit 0；LayoutNode validator 在 UI 状态测试中零 issue。build 仍有既存大 chunk 警告；`ui-audit` 的 house 识别/华丽件数量警告非阻断。带锚点撤掉 `cover` 后 Doki 定向测试精确 4 failed/6 passed，恢复后 10/10，最终全套 42/42。
- owner 已启动的 5173 HTTP 页面完成 N=1/3/5 自然完整播放、单卡 fallback 与暂停态；10 张 S5 关键帧均实测 1440×900，N=1/3/5 与 fallback 的浏览器 console error 0。自动化仍拒绝 `file://`（仅允许 HTTP(S)），冻结原型与既有 FINAL 帧作目标、真游戏由 HTTP 取证，不绕策略、不降验收标准。对齐单 `self-check/S5-alignment.md` 为 10✅/2⚠（去向 S6/S8）/0❌，Review 单 `review/S5.md` 送非施工人独立复查；施工人不自评 PASS，不进入 S6/S8/发布。
- S5 独立复查（2026-10-10）：非施工人独立复跑游戏 19/19、Doki 42/42、Doki scoped TypeScript、范围 ESLint、根验证 build、能力/台账/UI/对齐守卫均 exit 0；独立撤掉唯一 card cover 锚点后精确 4 failed / 7 passed，恢复后 19/19 与 42/42 全绿。另在 owner 既有 5173 的 1440×900 隔离标签真点暂停→继续→跳过，P5 五卡与只剩退出均可见，console warn/error 0；视口 reset、标签关闭。**S5 独立复查 PASS**，仅解锁 S6 owner 视觉人门；S8、Doki 打包和发布仍锁定。证据：`review/S5.md`。

### S6 owner 视觉返修：P4 飞出卡必须完整离开透明画布（2026-10-10）

- owner 真机截图发现：P4 已飞出的卡牌仍有一个旋转后的角残留在 1440×900 右边缘。透明嵌入时该残角悬浮在宿主画面上，视觉语义错误；S6 视觉人门暂不通过。
- 根因实查：冻结原型 `prototype.dc.html` 的 P4 画外队列为 `x=1620+20i`，且 `prototype-notes.md` 明确要求“画布右边界自然裁掉卡片”；正式 `tracks.ts` 却退化为 `x=1560+20i`。按标准终态 `260×390`、`scale=1.07`、`rotation=0.175rad` 计算，首卡水平旋转包围盒半宽约 173px，`1560-173<1440`，因此必然露角。现有 `t2-presentation-track` 足以修复，不新增引擎能力。
- 修复边界：只改游戏轨道数据和点名测试/自证，不改 `src/**`、冻结原型、时长、卡序、alpha、P4→P5 同实例接力、SDK 合同或宿主输入输出。正式队列至少恢复到冻结原型的 `x=1620+20i`；不得用提前隐藏、alpha 淡出或销毁掩盖越界错误。
- 机器判据：对标准与 reduced、N=1/3/5，在每张 `p4-fly-i` 完成后，按 Sprite 实际 `width/height`、Transform `scaleX/scaleY/rotation` 计算旋转后 AABB，断言 `left >= 1440`；同时证明 P5 `0ms` 复用同一离屏姿态并最终召回原实例。必须有能因回退到 `1560` 而准确转红的测试。
- 真渲染判据：owner 已运行的 5173、1440×900、透明舞台，至少截取第一张完成飞出而第二张仍在中心的 P4 帧；右边缘不得出现任何前一张卡像素，console warn/error 为 0。更新 S5/S6 差异证据并送非施工人复查；施工人不得自评 S6 PASS，不得进入 S8/打包。
- 施工回执（2026-10-10）：`tracks.ts` 唯一 `queuedX` 已恢复冻结的 `1620+20i`；未改 alpha、Visibility、时序或实例。六组 standard/reduced × N1/N3/N5 点名测试逐张按 Sprite/Transform 真实旋转 AABB 守 `left>=1440`，同时守 visible/alpha/P5 同姿态召回；暂退 1560 后精确 6 failed/9 passed，恢复后游戏 25/25。Doki 旧走查硬编码 1560 的期望改为 1620 后 42/42；scoped TypeScript、ESLint、能力审计、根验证 build、S6 align-count 均 exit 0。真渲染 `self-check/shots/S6-P4-first-offscreen.jpg` 为 1440×900，中心第二张在场、主舞台右侧 8100 像素非白残留 0、console warn/error 0；隔离临时标签已关、视口已复原。自证 `self-check/S6-alignment.md` 5✅/0⚠/0❌，送 `review/S6.md` 非施工人复查；不得自评 S6 PASS 或进入 S8/打包。
- 独立复查（2026-10-10）：非施工人复跑游戏 25/25、Doki 42/42、scoped TypeScript、ESLint、能力审计、根验证 build 与 S6 align-count 全部 exit 0；独立退回 1560 精确 6 failed/9 passed，恢复 1620 后定向 15/15。另开 1440×900 隔离标签重新捕捉 `预览 · P4`，首卡已完全离屏、第二张仍在中心，右边缘无残角，console warn/error 0；标签关闭、视口 reset。**技术复查 PASS，但 owner S6 视觉人门仍待判词**；S8、Doki 打包和发布继续锁定。证据：`review/S6.md`。

### S6 owner 视觉返修：P3 卡组必须从包体后方抽出（2026-10-10）

- owner 真机指出：包体下隐、卡组上升的交叉阶段，卡组当前绘制在包体上层，像贴在包装正面；正确视觉必须是卡组位于包体后方，只有越过包口的上半部分露出，由前景包体遮住卡牌下部，才能读成“从卡包中抽出”。S6 owner 视觉人门继续不通过。
- 冻结证据：`prototype.dc.html` 的 `p3Draw` 顺序固定为 `drawCardStack → drawRemainingPack → drawFlyingTop`，注释明确卡组“sits behind the fixed cut opening”；这不是新设计，不需修改或重签原型。
- 根因实查：正式 `blueprint.ts` 中 `tear-body.zOrder=24`，而卡牌为 `20+count-i`；N=5 时前卡达到 25、次卡为 24，分别高于/等于包体，遮挡关系随卡数变化。现有 Sprite `zOrder` 足以修复，不新增能力、不改 `src/**`。
- 修复边界：只调整本游戏静态视觉层级常量及点名测试/截图/Review。P3 应满足 `tear-top.zOrder > tear-body.zOrder > every card.zOrder`；卡牌内部仍保持 `card-0` 在最前、后续牌逐层向后，P4/P5 既有卡序与显示不变。不得以裁切卡图、降低 alpha、延迟卡牌出现、复制包体或新建遮罩实体绕过。
- 机器判据：standard/reduced、N=1/3/5，在 P3 包体和卡组同时可见的真实 tick，读取 World 中 Sprite/Visibility/Color，断言包体可见且 alpha>0、至少一张卡可见且 alpha>0、`tear-body.zOrder > max(card.zOrder)`、`tear-top.zOrder > tear-body.zOrder`；临时恢复旧层级 24 时必须准确转红。并证明 P4/P5 卡牌内部 zOrder/实体 id/终态未回归。
- 真渲染判据：owner 已运行的 5173、1440×900、透明舞台，截取包体尚未完全下隐、卡组已从包口上升的 P3 交叉帧；卡牌下半部必须被包体遮住、上半部从撕口后方露出，顶片仍在最前，console warn/error 为 0。与冻结 P3 关键帧并排更新 S6 对齐单，施工人送非施工人复查，不自评 S6 PASS，不进入 S8/打包。
- 施工回执（2026-10-10）：`blueprint.ts` 只将顶片/包体 zOrder 25/24 改为 30/29，卡牌内部 `20+count-i` 不变；`s6-layering.test.ts` 六组 standard/reduced × N1/N3/N5 在 P3 同时可见且 alpha>0 的真 tick 验 top>body>全部卡，并继续核 P4/P5 层级、实体 id 不变。撤修仅把包体退回 24，N5 两组精确转红（2 failed/4 passed），恢复后游戏 31/31、Doki 42/42、Doki scoped TypeScript、ESLint、能力审计、根验证 build 均 exit 0。owner 既有 5173 的 1440×900 P3 初露头与中段交叉帧见 `self-check/shots/S6-P3-*.jpg`，中段卡下半部确被包体遮住，console warn/error 0；临时标签已关、视口 reset。对齐与复查证据见 `self-check/S6-alignment.md`、`review/S6.md`。此为施工自证，P3 待非施工人独立复查，owner S6 人门未通过；S8/打包仍锁定。
- 独立复查（2026-10-10）：非施工人复跑游戏 31/31、Doki 42/42、scoped TypeScript、ESLint 与 S6 align-count 全绿；独立把包体 29 退回 24 后精确 2 failed/4 passed，恢复后定向 6/6。另开 1440×900 隔离标签重新目击 `预览 · P3`：卡组上部从包口后露出、下半部被包体遮住，console warn/error 0；标签关闭、视口 reset。**P3 层级技术复查 PASS，但 owner S6 视觉人门仍待判词**；S8、Doki 打包和发布继续锁定。证据：`review/S6.md`。
- owner 人门（2026-10-10）：owner 在复查结论后明确回复“可以开始下一步”。该判词只签署 **S6 最终视觉通过并允许进入 S7**，不代签 S7 评分卡或 S8 终检，也不授权打包、复制到 DokiWorld 安装目录或发布。

## S7 品质关 · 独立评分（2026-10-10）

- 评分卡：`review/S7-scorecard.md`。
- 判词：**VISUAL: 13/24 · PREMIUM: NO**；八维均非 0，因此没有 S7 机器红灯，但世界密度、整屏渲染层次与 VFX 三维各 1 分，未达到全维 ≥2 的 premium 线。
- 本游戏是透明宿主叠加演出；空白透明区域是产品约束，不得通过塞入不透明背景刷“世界密度”。独立彗星转场原型仍未获明确冻结，也未进入本游戏 FINAL 原型，不能在 S7 擅自并入正式流程。
- owner 人门（2026-10-10）：owner 明确回复“那就没问题，接受当前演出，进入联调和打包”，据此以非 premium 状态签署 S7 PASS 并解锁 S8；评分仍为 13/24，不伪装成 premium。

## S8 联调、可移植打包与终检 · 完整工程单（2026-10-10）

### 目标与边界

- 施工主体：卡牌动画程序；独立复查必须由非施工人完成。
- 目标：把已通过 S7 的 `game-card-reveal` 变成符合当前 DokiWorld SDK 的自包含 App 包，完成真实合同/生命周期联调夹具、源码到 dist 的确定性构建、调用说明与资产闭包、可移植路径、SHA 清单和交付证据。
- 允许改动：`dokiworld/game-card-reveal/**`、本 S8 工单/Review/自证文档；如只为可移植资产基址而必须调整通用构建胶水，先实查现有 `app-asset-closure.mjs` 能否重组，表达不了才走缺口协议。禁止改冻结原型、P2–P5 时序/轨迹、游戏规则、宿主合同语义、`src/**` 引擎实现和其他游戏。
- 严禁执行任何 Git/GitHub 命令、修改数据库、启动或重启前后端/静态服务器。构建、类型检查、单元测试可执行；真实 HTTP dist/宿主见证所需服务只能准备命令和脚本，由 owner 亲自启动。

### W1 · 构建入口与包身份

1. 为 `dokiworld/game-card-reveal/package.json` 补稳定脚本：`test`、`typecheck`、`build`、`verify:dist`。不得依赖全局 npm/vite；沿用仓库本地依赖。
2. 新建 `scripts/build.mjs`，开头读取并严格校验源码 `manifest.json`：schemaVersion=3、id/目录/createAppClient 三处一致、version、entry、context、locales、documentation、protocol=`dokiworld.app`、protocolVersion=2、输入/输出合同与 modules 闭集。
3. 构建顺序固定为：清空本 App `dist` → Vite `root=src`、`base='./'`、target es2022、无 sourcemap → 复制唯一 `manifest.json` → 调统一 `exportAppDocumentation` → 调统一 `exportAppAssetClosure` → 调 `rewritePortableRuntimeBases` → 核入口 → 生成排序稳定的 `SHA256SUMS.txt`。
4. SDK alias 必须指向 vendored `vendor/dokiworlds-app-sdk/src/index.js`；引擎 alias 复用 `scripts/engine-aliases.mjs`。不得引入旧 `@dokiworld/app-sdk`、schema 2 或 `app.manifest.json`。

### W2 · 调用说明更新

1. 以 `docs/playbooks/templates/dokiworld-integration.zh-CN.template.md` 的 12 章结构复核并更新现有 `docs/integration.zh-CN.md`；删除“S4/S5 尚未实现、placeholder、当前不可上架”等过期文字。
2. 文档必须准确覆盖：App 身份、宿主 launch 示例、APPS 调试数据框、严格 1–5 卡输入、HTTPS/CORS 图片要求、64KiB、输出 `viewed + natural|skipped`、preview 不 complete、退出=cancelled、rejected/timeout 同结果重试、资源逐卡 fallback、宿主幂等与权威结算、安全边界、上线核对清单。
3. 文档 JSON 必须由真实 parser 读取测试；manifest 登记路径与 dist 导出文件逐字一致。运行 `node scripts/dokiworld-docs-guard.mjs game-card-reveal` 并保留 exit code。

### W3 · 资产闭包与可移植路径

1. 闭包源固定为 `public/games/game-card-reveal/art/index.json` 与同目录实体文件；publicPrefix=`/games/game-card-reveal/art/`，dist 输出建议 `games/game-card-reveal/art/`，并把 bundle 内绝对运行时基址改成相对路径。不得手工复制零散资源或直接编辑 dist。
2. `dist` 必须包含全部本地正式包装、撕片、fallback、preview、portable `index.json`、`ASSET-CLOSURE.json`；宿主运行时 HTTPS 卡面不打进包，属于合同输入。
3. 验证 JS/CSS/HTML/JSON/Markdown 中不存在本机绝对路径、`file:`、源码 `/games/game-card-reveal/art/` 绝对根、远程字体/CDN、`docs/design` 引用或漏包资源；所有 `ASSET-CLOSURE.json.files` 均存在且 SHA 清单覆盖。

### W4 · 源码合同与 SDK 生命周期联调

1. 保持固定顺序：`createAppClient → connect → whenReady({timeoutMs:10000}) → 严格 parse → load → 真 P5 terminal → complete`；pagehide 清理 disconnect/dispose/engine/renderer/assets/UI/host。
2. preview：`?preview=1` 或宿主空 `{}` 可内部演示，但永不 complete；显式 preview 已开始后不得被晚到 host ready 替换成正式局。
3. 正式输入：覆盖 N=1/3/5、顺序稳定、额外键/错误版本/0/6/重复 ID/HTTP/凭证 URL/超长字段/超 64KiB 拒绝。
4. 正式输出：自然与跳过都必须先落相同真实 P5 终态；accepted 后永久锁一次；pending 禁并发；rejected、异常、timeout 后只允许重发同一冻结 output；退出/关闭绝不能伪造 viewed。
5. 图片：正式 HTTPS 卡面逐卡加载；单卡失败只替换该卡为本地 fallback，仍保序；本地包装或 fallback 关键资产不可用时不得伪造成功。
6. 建立 fake-host 单元/集成夹具，核 connect/ready/complete/requestExit/dispose 的顺序与次数。任何需要 HTTP 服务的“真 dist 宿主见证”脚本只能落盘，不得由 agent 启动；给 owner 明确命令、端口、预期日志与停止方法。

### W5 · `verify:dist` 与交付包判据

1. 新建只读 `scripts/verify-dist.mjs`，直接检查构建后的 `dist`：根层含 `index.html`、`manifest.json`、`docs/integration.zh-CN.md`、`ASSET-CLOSURE.json`、`SHA256SUMS.txt`；不允许多包一层目录。
2. 重新解析 dist manifest 和调用说明；逐项核 schema/身份/合同/文档路径/entry；逐行重算 SHA-256 并拒绝漏项、重复项、反斜杠与不存在文件。
3. 扫描 dist 文本资源，拒绝 `/src/`、本机盘符、`file:`、`localhost`/`127.0.0.1`、源码绝对资产根与 source map；检查 `index.html` 的脚本/样式均为相对引用且目标存在。
4. 验证 portable asset index 的每个 filled path 为包内相对 POSIX 路径、目标存在、无 `..`/绝对路径/远程 URL；闭包报告文件数与实际一致。
5. 可额外生成 zip，但若生成：zip 根直接是 dist 内容，打开即见 `index.html` 与 `manifest.json`，不得外包 `game-card-reveal/` 一层；zip 也必须由 build 流程生成，不手工改包。

### W6 · 自验、撤修验红与送审

1. 至少执行：游戏定向 Vitest、Doki 全套测试、Doki scoped TypeScript、游戏 ESLint、docs guard、build、verify:dist、资产/台账审计、`game-skill-audit`、S8 对齐计数；每项记录真实 exit code。
2. 撤修验红至少三类：移除 dist 文档或 manifest 字段；恢复 bundle 绝对资产根；破坏 accepted 一次锁或 rejected 同 output 重试。每次必须有锚点命中证明、预期转红、恢复后重新全绿。
3. 新建 `review/S8.md`：列文件边界、合同矩阵、构建树、闭包文件数、SHA 结果、所有门禁、撤修验红、已知限制和需 owner 执行的真 HTTP 联调命令。
4. 施工结束只报告“送独立复查”。不得自行复制到 `C:/Users/24652/Desktop/projects/dokiworlds/frontend/public/apps/game-card-reveal/`，不得称已发布。

### S8 出口

- 源码门禁、dist 静态验证、独立复查全部 PASS；owner 按交接命令完成真 HTTP fake-host/DokiWorld 子路径见证并贴回输出；随后才能决定是否复制安装目录和制作最终上传包。
- 流程板历史账仍缺 S1–S5 的机读 signoff/review。禁止伪造补签；S8 Review 须把“真实代码/包已通过”和“流程板旧账待整理”分开陈述。

施工回执（2026-10-10）：`dokiworld/game-card-reveal` 已补本地 `build`/`verify:dist`、身份闭集、模板 12 章调用说明更新、统一文档/资产闭包与 portable rewrite、16 行 SHA、只读 dist 验证、隔离假宿主见证页及测试。游戏 31/31、Doki 55/55、Doki scoped TypeScript、游戏 ESLint、docs guard、ledger 9/9、能力审计、build/verify、四类 dist 临时副本 sabotage、S8 对齐 8✅/3⚠/0❌ 均按 `review/S8.md` 记录；完成闸反转锚点后 12 条定向测试转红并已恢复。owner 既有 5173 上真 dist 测试副本八场景 PASS，见 `self-check/shots/S8-dist-fake-host-N3.jpg`；未启动独立静态服务、未安装 DokiWorld、未制作 zip。全局 `asset-reconcile` 正则不识别双连字符 slug，扫他游后 exit 1，见 S8 对齐单裁决去向。本回执仅送非施工人独立复查；owner 4174 静态子路径与真实 DokiWorld 见证仍待执行，S8 不自评 PASS、不宣称发布。

独立复查回执（2026-10-10）：非施工人独立复跑上述全部门禁与八场景假宿主见证；游戏 31/31、Doki 55/55，完成闸反转精确 12 failed / 20 passed、恢复后定向 32/32，dist 协议版本篡改被 `verify-dist` 精确拒绝，恢复源码后重新构建并最终验证 17 files / 10 art / 16 SHA。**S8 包内技术复查 PASS**；Vite 大 chunk 警告、共享 `asset-reconcile` 双连字符正则缺口与旧流程板历史已如实保留。owner 4174 独立 HTTP、真实 DokiWorld 安装子路径和是否复制/制作上传包仍未完成，因此尚未签署 S8 总出口或发布。

owner 独立 HTTP 回执（2026-10-10）：owner 确认已启动并验证 4174；非施工人随后重新访问独立静态根，八场景全部 PASS，非法输入仅产生预期 parser 拒绝，临时标签已关闭。**4174 人门 PASS，允许进入真实 DokiWorld 安装目录联调**。尚未执行外部目录复制，真实 DokiWorld manifest/调用说明/SDK/HTTPS 卡面见证和发布结论仍待完成。

DokiWorld 安装回执（2026-10-10）：owner 明确批准后，候选 dist 已复制到 `frontend/public/apps/game-card-reveal/`，安装副本由同一校验器复核为 17 files / 10 art / 16 SHA、exit 0。真实 DokiWorld APPS 目录发现 App、输入合同 v1 和调用文档入口；经真实 host 完成 N1/N3 natural 与 N5 skipped，完成后均正常返回调试目录，不可达 HTTPS 图按合同逐卡 fallback，宿主页 console warn/error 0。**S8 本地安装、真实 SDK 联调与可移植打包 PASS**；生产卡面域的 HTTPS/CORS 成功路径仍须由宿主在上线前使用真实 URL 核对，未执行线上发布。

## S3 骨架关 · 领工声明（2026-10-10）

- 施工主体：卡牌动画程序；复查主体须为非施工人。本轮受 Owner 本机禁令约束，不执行 Git 抢锁、提交或推送。
- 启动词：只建立正式游戏的可装载纯数据骨架、稳定实体槽、1–5 张有序前缀装配，以及 DokiWorld schema 3 的严格输入/输出合同壳；完整 P2–P5 轨道与正式美术留待后续阶段。
- 代码基线：S2 `t2-presentation-track` 已交付并独立 PASS；S1-P FINAL 原型已由 owner 冻结；全库 TypeScript 存在 game-dice/game-theft/launcher 并行红项，不能据此覆盖他人文件。
- 预定改动边界：`games/game-card-reveal/**`、`dokiworld/game-card-reveal/**`、本 `requests.md`、`review/S3.md`。若确需接 launcher，仅加最小挂载且先核并行现场；不改 `src/**`、`assets/**`、SDK、打包流程、正式游戏美术和 prototype。
- 机器证据出口：manifest parse + 真引擎 load/空跑两 tick；最小 presentation track 装载；1/3/5 合法与边界非法合同测试；preview 不 complete、P5 终态后唯一 complete 壳测试；文档示例由真实 parser 接受；定向测试、scoped TypeScript、ESLint、生产 build。非零项逐条保留退出码与归因。
- 待复查：施工结束写 Review 单并停在独立复查门，不自评 PASS、不进入 S4。
- 施工回执（2026-10-10）：已交 `games/game-card-reveal/**` 纯数据蓝图和 1/3/5 连续前缀、`dokiworld/game-card-reveal/**` schema 3 严格合同壳、12 章调用说明；验收详情与已知偏差见 `review/S3.md`。初次定向测试 4/4 + 19/19、Doki scoped TypeScript、游戏 ESLint 与根 Vite build 均为 exit 0；全库 TypeScript 因 game-dice/game-theft/launcher 既有并行红项 exit 1，未改无关文件。独立复查曾判 FAIL：CompletionGate 在 rejected/timeout 后锁死。
- 退回修复（2026-10-10）：已按 SDK 生命周期规范实现 pending 防重、accepted 永锁、rejected/异常后保留同一终局可重试；再次独立复跑 Doki **22/22**、scoped TypeScript、游戏骨架 **4/4**、ESLint 均通过，撤修复位逻辑后三组重试测试准确转红，证据见 `review/S3.md`。**S3 独立复查 PASS，允许进入 S4。**

## GAP-CARD-REVEAL-01 · `t2-presentation-track`

状态：**delivered；2026-10-10 由非施工人独立复查 PASS，S3/S4/S5/S8 锁已解除。全库 TypeScript 仍有 game-dice/game-theft/launcher 并行现场红项，但本能力 scoped TypeScript、Tier2 全层、注册/组件守卫、系统子图、ESLint 与生产构建均通过。**

施工主体：卡牌动画程序（按 owner 已裁 A 的共享能力施工；受最高禁令约束，未执行 Git 抢锁或推送）。施工自验与独立复查结论见 `review/GAP-CARD-REVEAL-01.md`。

### 施工边界

- 归属：共享引擎新 system，涉及表现定序，按项目规则只归主程施工；复查人不得与施工人相同。
- 目标文件建议：
  - `src/engine/protocol/components/render.ts`：增加闭集数据类型；
  - `src/skills/tier2/presentation-track.ts` 与测试；
  - `src/skills/tier2/index.ts`、能力注册表生成产物；
  - `src/net/determinism.ts`：若采用 render-only runtime 组件，必须明确 NON_DETERMINISTIC 归属；
  - `docs/playbooks/rendering-fx.md` 与 capability catalog：补消费方法。
- 禁止修改 `games/game-card-reveal/**` 来掩盖能力未交付。

### v1 闭集规格

1. `PresentationTrack` 挂在轨道拥有者实体上，包含：
   - `id`；
   - `targetEntity`；
   - `playOnSignal`；
   - 可选 `pauseOnSignal/resumeOnSignal/resetOnSignal/skipOnSignal`；
   - `channels[]`；
   - 明确 `finalPose`；
   - 可选 `doneSignal`，自然完成和 skip 都只发一次。
2. channel target 只允许：
   - `Transform.x/y/rotation/scaleX/scaleY`；
   - `Color.alpha`；
   - 离散 keyframe 可写 `Visibility.visible/active` 与 `Sprite.zOrder`。
3. 连续 keyframe 只接受 `{at,value,easing}`；easing 复用 `@engine/math/ease` 闭集，不复制缓动实现。
4. 多 channel 同拍并行；所有实体遍历使用 `sortedIds`。同一目标字段若被两条活动轨道同时写入，必须稳定拒收并写 `reject` trace，禁止后写覆盖的隐式竞态。
5. 轨道时间使用整数 tick；禁止 `Date.now/performance.now/Math.random`。暂停时游标不前进；恢复从原 tick 继续。
6. skip 在一个 tick 内把所有目标写成 `finalPose`，结束状态必须与自然播放终帧逐字段一致；重复 skip/complete 不得重复发 done。
7. reset 恢复作者态、清 cursor/done；随后同一个 play signal 可安全重播。快速连续 play 采用“从作者态重新开始”，不叠加第二份运行实例。
8. 缺目标实体、缺目标组件、非法 target、负 at、非有限 value、非单调 keyframe 等均稳定拒收、不中断世界，并写 opt-in debug trace。
9. capability 不加载图片、不解析 URL、不创建 DOM/Canvas、不决定卡牌数量，也不读写玩法 Resource/Flag。

### 必测

- 单通道插值的 0/中点/终点；每种 easing 至少一个点名断言。
- 同实体 x+y+scale+alpha 并行；多实体同拍全序稳定。
- 离散 visible/zOrder 只在指定 tick 切换。
- pause/resume 不跳帧；reset 后重播逐字段等于首次。
- 自然终帧与 skip 终帧深相等，done Signal 各恰一次。
- 连续 play/skip、缺组件、非法数据、字段冲突均有拒收与 trace 断言。
- snapshot/hash 边界符合 render-only 裁决；同输入双跑的可观察终态一致。
- 撤修验红必须用锚点断言证明 sabotage 确实命中。

### 出口

- `t2-presentation-track` 注册名在 capability registry 可查；文档和测试在档。
- targeted tests、TypeScript、生产 build、共享面 scoped gate 全部 exit 0。
- 另一 session 独立复跑、撤修验红并给 PASS。
- 上述证据齐全后才可把 `capability-gaps.json` 的状态改为 `delivered`。

- P1 已由 owner 于 2026-10-09 明确判定：**通过并冻结**。
- P2 已由 owner 于 2026-10-09 明确判定：**通过并冻结**。
- 原 P3“Seal 分段卷带 + 慢速包口开启”已被 owner 明确否决，不得继续沿用。
- P3-R1 的快速撕飞方向保留，但锯齿断口、Seal 和从右向左逐段消失已被 owner 明确否决。
- P3-R2 已于 2026-10-09 经 owner 目击通过并冻结：无 Seal、浅弧整体撕顶、完整顶片抛飞、包体下坠与五卡卡组接力均为后续基线。
- P4 已于 2026-10-09 经 owner 目击通过并冻结：稳定实例逐张停稳、轻摇、右飞、自然露出与画外队列均为后续基线。
- owner 同时确认正式产品须支持 `1–5` 张有序卡牌；P5 施工必须将 P3/P4/P5 的卡牌数量统一参数化，并保持 5 张模式不回归。
- P5 已于 2026-10-09 经 owner 目击通过并冻结：1–5 张单一数量源、画外召回和五种最终阵列均为后续基线。
- owner 最终整合判词：卡包改用一套 AI 生成的统一正反面包装；P2 压缩到约 2 秒；新增 P2→P5 一键完整演示。
- 原“当前只允许 FINAL、禁止 S2”的限制已由 owner 最新冻结判词取代；S2 已获准。
- 当前仍未允许：`games/game-card-reveal/**` 正式实现、正式资产导入、DokiWorld SDK 接线、dist 打包；这些属于 S3+，须先过 S2 缺口裁决与独立复查门。

## 已裁决但尚未获准施工的 S2 能力方向

### CARD-REVEAL-MATERIAL-SLOTS（已被产品方向替代）

- owner 判词（2026-10-09）：选择产品方案 **B，补通用 `Model3D.materialSlots`**。
- 缺口协议归类：**A·补引擎通用能力**；禁止用游戏专属贴图替换器规避。
- 目标：固定一个带 UV、褶皱与开包动画的软包装 GLB，通过具名槽（至少 `Cover`）替换 AI 生成的封面 texture key，而不重做模型。
- 后续裁决（2026-10-09）：owner 取消复杂 GLB 软包装，改用双面纸片卡包。因此本项目撤销该能力前置，不进入 S2 实现；正面、背面和封条直接使用独立图片槽。

---

## 已确认的 P4/P5 演出方向

owner 已明确指定 P3 之后的完整演出，不得在后续自由改成“逐卡凭空生成”或“每张从同一点重新创建”：

1. P3-R2 结束时，若干张卡牌已经作为一个真实叠放卡组从包中升起；最上层是第一张，第二张本来就在它下面。
2. P4 每轮：最上层卡片完整可见 → 克制地左右摇一下 → 向右飞走；它离开时，下一张因遮挡解除而自然显现，不得额外淡入或从空白生成。
3. 下一张继承同一展示位与叠放关系，再重复“摇一下 → 向右飞走”，直到所有卡片均被逐张展示。
4. 飞走的卡片进入画面右侧之外的已展示队列，不能销毁；P5 必须继续使用同一批卡片实例。
5. P5 在全部逐张展示结束后，把所有已展示卡片从右侧队列召回，并在画面中排列展示本次全部结果。
6. 卡片数量未来由宿主有序数组决定；原型建议先用 `5` 张明显不同的原创占位卡验证遮挡、节奏和最终排列。

P3-R2 已冻结在“叠放卡组已经升起、第一张位于最上层并准备摇动”的交接帧。P4 已冻结在“全部卡牌按顺序保留于右侧画外队列”的交接帧。owner 已于 2026-10-09 批准进入 P5，并补充要求整条卡牌链支持 `1–5` 张。

---

## S1-P/FINAL：统一包装、P2 两秒化与 P2→P5 总演示

### 1. Owner 覆盖性判词

本单是 owner 对已冻结局部阶段的明确整合变更，只允许改动以下三项：

1. 用一套新的 AI 包装取代 Front A/Front B 两套方案；同一包装仍保留正面与背面，以支持 Flip 和空间朝向。
2. P2 从 `5.8s` 压缩到约 `2.0s`，保持圆环→锁定→聚焦的语义和终帧不变。
3. 新增 P2→P3→P4→P5 的一键连续完整演示。

除以上覆盖点外，P3-R2 的整体撕顶结构、P4 单卡节奏、P5 1–5 张数量与最终布局保持冻结，不得借整合重做。

### 2. 统一 AI 包装资产

唯一资产页：

`docs/design/game-card-reveal/ui-refs/pack-unified-ai-v1.png`

- PNG 为 `1448×1086 / 32-bit ARGB`，四角 alpha 为 0；左侧是统一包装正面，右侧是同一包装背面。
- 美术方向：深靛蓝、青绿与暖金的星月纹样；无角色、无文字、无数字、无商标、无水印。
- 两面都具有相同轮廓、边封、底封与自然顶部热封口；它们是同一包装的正反面，不是两套封面皮肤。
- 程序须测量并在 notes 记录 front/back 的实际 source rect；不得把整张双联图压缩成一张卡包。
- 只保留 `显示正面`、`显示背面`、`Flip Preview`。删除 `正面 A`、`正面 B`、`state.front`、Front A/B 图片槽和相关活动说明。
- P1、P2、P3 中所有卡包都消费这一套纹理。P2 的多个包是同一个正面纹理实例，不生成视觉变体。
- 图片必须通过相对路径离线加载；不得依赖生成目录、临时目录、网络 URL 或 base64 复制多份。

### 3. P3 密封口与撕口重新对齐

- 新纹理顶部已经画出自然热封口。P3 的浅弧撕裂线必须移动到**该热封口下沿**，让飞走的完整顶片恰好包含密封帽，而不是从主画面中部随意切下约 15%。
- 先基于 front source rect 实测密封口下沿的归一化 y，再用 `5–7` 个平滑控制点沿其自然浅弧拟合；预计位于包装有效高度约 `9%–13%`，最终以纹理实际视觉为准并写入 notes。
- 顶片与余包仍使用同一互补曲线；attached→detached→gone 三态、完整顶片不横向消失、P3 `1.05s` 时间轴、包体下坠和卡组上升保持冻结。
- 撕口不得切到正面星月主体；断裂后一帧必须能看出“自然热封帽被整块撕走”。
- P2 聚焦终帧与 P3 `0ms` 仍须像素一致。

### 4. P2 加速到 2 秒

标准模式 P2 总时长改为 `2000ms`，不接受仅把状态读数改成 2 秒而动画仍按旧 5.8 秒推进。按以下时段重定时：

| 时间 | 阶段 | 要求 |
|---|---|---|
| `0–0.20s` | 圆环建立 | 8 个统一包装快速进入稳定环位 |
| `0.20–1.10s` | 快速旋转 | 保持原旋转方向、前后景遮挡和正视纸片逻辑，速度明显快于旧版 |
| `1.10–1.40s` | 减速锁定 | cubic ease-out，选择结果仍为原固定 `#3`，不得瞬停 |
| `1.40–2.00s` | 聚焦英雄位 | `#3` 从圆环平滑移动并放大到 P3 起点 `400×600 / center(720,410)`；其余包退场 |

- P2 `2000ms` 终帧必须像素等于 P3 `0ms`。
- reduced-motion P2 保持 `800ms`，只做可理解的建立、锁定与聚焦，不强制高速旋转。
- P2 仍无随机抽取；原型固定 #3 只是演出验证，不表达宿主抽卡规则。

### 5. P2→P5 一键完整演示

新增一个只由单一总游标驱动的连续演示，使用当前 `cardCount`：

1. P2：`0…2000ms`；
2. P3：紧接 `1050ms`；
3. P4：紧接标准 `N×950ms`；
4. P5：紧接 `1200+(N−1)×120ms`。

标准总时长公式：`4130 + 1070×N ms`，即 N=1 为 `5200ms`、N=5 为 `9480ms`。

reduced-motion 使用 P2 `800ms` + P3 `280ms` + P4 `N×300ms` + P5 `760+(N−1)×70ms`，总时长公式为 `1770 + 370×N ms`。

- 每个边界必须调用同一阶段纯姿态函数，禁止在切段时销毁/重建包或卡牌；P2→P3、P3→P4、P4→P5 三处都要像素连续。
- 总演示最终稳定保持 P5 阵列，不自动退出或清屏。
- 总演示与各阶段独立播放必须共用相同姿态计算；禁止维护第二套“总演示专用动画”。
- 切换 `cardCount` 会停止总演示并回到总演示 `0ms`；随后重播使用新数量和对应总时长。

### 6. 总演示控制与审阅接口

在控制区最前方新增：

- `完整演示起点`；
- `播放完整演示`；
- `暂停/继续完整演示`；
- `重播完整演示`；
- `完整演示终态`。

新增 `window.__fullDemoReview`：

- `state()` 返回 mode、elapsed、duration、cardCount、segment、segmentLocalTime；
- `poseAt(ms)` 返回当前 segment 与该阶段纯姿态；
- `setTime(ms)` 固定到总演示指定时刻。

点击任何单段控制必须停止并清理总演示；启动总演示必须清理 P2–P5 独立播放器。失焦/隐藏暂停、单 RAF、快速重播、无墙钟累积继续适用。

### 7. 文件范围

只允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/final/**`

允许读取并消费既有 `ui-refs/pack-unified-ai-v1.png`，不得覆盖它。禁止修改 `games/**`、`src/**`、`assets/**`、SDK、独立 ScreenFx 原型。

### 8. 自验与 S1-P 出口

1. 活动代码与控件中 `Front A/Front B/正面 A/正面 B/state.front` 全部清零；历史说明须明确为废弃。
2. 截图统一包装正面、背面、Flip 中段、P2 圆环、P2 锁定、P2 聚焦终帧、P3 顶片刚分离、P3 顶片飞离，证明 source rect、正反面与密封口撕裂匹配。
3. P2 实际播放 10 次均在 `2000ms` 结束；不得中心漂移或瞬停。
4. N=1、3、5 的完整演示各真实播放至少一次，时长分别 `5200/7340/9480ms`，最终卡数与布局正确。
5. 总演示三处边界与独立阶段首尾 Canvas 像素逐一相等；N=1…5 均核对 P4/P5 数量连续性。
6. 完整演示快速重播 20 次、失焦/隐藏暂停、单 RAF、数量切换清理、各单段控件回切通过。
7. reduced-motion 的 N=1、5 总时长与终态正确。
8. 控制台/pageerror 为 0；断网 `file://` 加载统一 PNG 成功。
9. notes 记录 AI 生成方式、最终 prompt 摘要、资产尺寸/alpha、source rect、密封口归一化曲线、P2 新时间轴、完整演示公式与已知偏差。
10. 完成后等待 owner 对 FINAL 给出“冻结 / 继续修改”；不得进入 S2。

---

## S1-P/P5：变长 1–5 张结果召回与最终阵列

### 1. 架构裁决与施工目标

接受 owner 的 `1–5` 张要求。它不需要新增引擎 capability：卡牌数量是有序输入数组长度，P3 叠放、P4 逐张展示和 P5 阵列均可由既有确定性时间轴与 tween 重组表达。

本单把原型中的卡牌数量抽成唯一 `cardCount`（闭区间 `1…5`），并从 P4 的画外队列终帧无跳帧接手：相同的 `card-0…card-(N-1)` 按抽取顺序从右侧画外依次召回，在画面中央排成最终结果阵列，稳定保持供 owner 检视。

不得创建第二套“结果卡”、不得复制图片生成阵列、不得改变抽取顺序。本单不接 SDK、不读取远程图片、不实现正式宿主输入。

### 2. 单一数量源与全链路约束

- 原型只允许一个 `cardCount` 状态，默认 `5`，可取整数 `1,2,3,4,5`；任何越界/非整数审阅输入必须拒绝或夹取并在接口中有明确结果，不能让时间轴进入非法状态。
- P3 只绘制 `card-0…card-(N-1)` 的真实叠放卡组；P4 总时长为标准 `N×950ms`、reduced-motion `N×300ms`，只展示这 N 张；P5 只召回和排列这 N 张。
- N 张模式的合法 id 永远是有序前缀 `card-0…card-(N-1)`，禁止从五张中任意抽洞或重排。
- `N=5` 时，P3/P4 的起点、姿态、每轮时长和终帧必须与已经冻结的当前实现像素/数值一致；参数化不能借机改动五张模式。
- `N=1` 时仍须完整经历 P3 单卡升起、P4 单卡轻摇右飞、P5 单卡召回居中；不得因为没有下层卡而跳过阶段。

### 3. 原型数量控件

在左下审阅控制区加入紧凑的 `1张 / 2张 / 3张 / 4张 / 5张` 选择，不遮挡卡牌，不加入自由数字输入。

- 切换数量立即停止并清理正在运行的 P3/P4/P5 RAF 和计时，回到所选阶段的确定性起点；不得保留上一个数量的画外卡。
- 当前数量必须在状态读数中明确显示。
- 暴露 `window.__cardCountReview.get()` 与 `set(count)` 供固定帧验收；`set` 后所有阶段接口必须立即读取同一数量。

### 4. P5 自适应最终阵列

固定逻辑画布仍为 `1440×900`，最终阵列在 y≈`410` 的同一水平线上居中，顺序从左至右为 `card-0→card-(N-1)`。采用以下确定性布局表：

| N | 卡宽×高 | 相邻净间距 | 卡牌中心 x | 中心 y |
|---:|---:|---:|---|---:|
| 1 | `300×450` | — | `720` | `410` |
| 2 | `270×405` | `70` | `550, 890` | `410` |
| 3 | `240×360` | `50` | `430, 720, 1010` | `410` |
| 4 | `220×330` | `40` | `330, 590, 850, 1110` | `410` |
| 5 | `200×300` | `30` | `260, 490, 720, 950, 1180` | `410` |

- 最终旋转均为 `0rad`、alpha 为 1，不互相遮挡，不压住左下控制区或右下状态读数。
- 不新增标题、按钮、稀有度文本或背景板；当前任务只裁决卡牌召回轨迹、顺序和阵列尺度。
- `N=1` 不是把五张布局隐藏四张，而是使用单卡专用 `300×450` 主视觉尺寸。

### 5. P5 召回时间轴

P5 总时长随 N 变化：`1200ms + (N-1)×120ms`，即 1 张 `1.20s`，5 张 `1.68s`。

每张 `card-i` 的入场起点为 `150ms + i×120ms`，单卡召回时长 `700ms`：

1. 从其 P4 queued 画外姿态原地起步，alpha 始终为 1；
2. 使用 cubic ease-out 沿向左的浅弧移动到布局表目标中心，弧高随目标距离确定但不超过 `55px`；
3. 尺寸从 P4 queued 的 `1.05×260×390` 平滑变为布局表尺寸，旋转从约 `+10°` 平滑归零；
4. 到达末段允许一次不超过 `1.04×` 的轻微落位 pop，并在单卡 `700ms` 终点准确回到目标尺寸；不得永续呼吸；
5. 后一张与前一张交叠入场，形成连续铺牌，而不是一张完全停稳后才开始下一张。

所有卡到位后保留至少 `250ms` 稳定阵列观察时间。P5 最终态不自动退出、不清空、不进入下一阶段。

### 6. reduced-motion

- reduced-motion 取消浅弧、旋转和落位 pop；每张只做 `360ms` 的直线 ease-out 平移与尺寸插值，stagger 为 `70ms`。
- 总时长为 `760ms + (N-1)×70ms`；最终布局、id、顺序、尺寸与标准模式完全一致。
- 仍不得淡入或重生卡牌。

### 7. 控件与审阅接口

新增：

- `P5 起点`；
- `播放 P5`；
- `暂停/继续 P5`；
- `重播 P5`；
- `最终阵列`。

保留 P1–P4 控件。点击其他阶段或切换 cardCount 必须清理 P5。新增 `window.__p5Review`：

- `state()`：返回 mode、elapsed、duration、cardCount、phase；
- `poseAt(ms)`：返回 N 张稳定卡的 id/image/state/queueIndex/当前姿态/targetSlot；
- `layoutFor(count)`：返回上表的纯确定性布局；
- `setTime(ms)`：固定到 P5 指定帧。

状态闭集建议为 `queued|recalling|settled`。P5 任意时刻恰好存在 N 个卡牌实例。

### 8. 文件范围

只允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p5/**`

禁止修改 `games/**`、`src/**`、`assets/**`、SDK、独立 ScreenFx 原型。不得进入 S2 或正式实现。

### 9. 自验与出口

1. 对 N=`1,2,3,4,5` 分别验证 P3、P4、P5 的实例数始终等于 N，id 为正确有序前缀。
2. N=5 的 P3/P4 关键固定帧与冻结版本 Canvas 像素一致；P4(N) 终帧与 P5(N) `0ms` 对每个 N 均像素一致。
3. P4 标准/reduced 总时长分别严格为 `N×950ms / N×300ms`；P5 duration 符合本单公式。
4. 截图至少包含：N=1 最终阵列、N=2 最终阵列、N=3 召回中段、N=3 最终阵列、N=4 最终阵列、N=5 首张召回、N=5 多张交叠召回、N=5 最终阵列。
5. 五种最终布局逐项核对中心、尺寸、顺序、旋转、alpha 和无重叠。
6. 所有卡从 queued 到 recalling 到 settled 均保持相同 id/image；无 alpha 淡入、无临时实例。
7. 标准与 reduced-motion 对五种 N 均完成状态机自验；标准模式至少对 N=1、3、5 做真实浏览器完整播放。
8. 对当前选中 N 完成快速重播 20 次、失焦/隐藏暂停、单 RAF 和 P1–P4 回切清理；控制台/pageerror 为 0。
9. 更新 notes：cardCount 单一来源、五种布局表、duration 公式、召回轨迹/stagger/pop、P4→P5 接口、reduced-motion 与已知偏差。
10. 完成后等待 owner 对 P5 给出“冻结 / 继续修改”，不得进入 S2 或正式游戏实现。

---

## S1-P/P4：逐卡摇动、右飞与自然露出

### 1. 施工目标与边界

从 P3-R2 `1050ms` 的五卡接力终帧无跳帧接手，依次展示 `card-0…card-4`：当前顶牌停稳可读，克制地左右摇一下，随后沿短弧向右飞出画面；它移动后，下一张因为原有遮挡被解除而自然露出。五张全部飞出后停在 P5 的“右侧画外已展示队列”交接状态。

本单不做翻面、不做稀有度爆光、不做最终阵列、不召回卡牌、不接宿主图片。P5 仍禁止施工。

### 2. 稳定实例与真实叠放铁律

- 全程只存在 P3 已创建的五个稳定实例 `card-0…card-4`，禁止每轮删除旧卡、创建新卡或换一个没有相同 id 的替身。
- 五张卡从 P3 开始就各自持有不同的原创正面占位图；`card-1…4` 在被遮挡时也已经存在且正面朝向镜头。禁止在上一张飞走的瞬间才交换贴图、淡入卡面或生成卡牌。
- 为保持已冻结 P3 画面，允许把此前下层“通用背面占位”的隐藏主体替换为不同正面占位，但 P3 已验收的叠放几何、可见边缘色值、终帧位置和时间轴不得漂移。
- 飞出的卡牌只移动到右侧画外队列，仍保留 id、顺序、卡面 key 和最终姿态。P5 必须复用这五个实例。

### 3. P4 起点合同

- P4 `0ms` 必须像素级等于 P3-R2 `1050ms`。
- 顶牌 `card-0` 中心 `(720,360)`、尺寸 `260×390`、旋转 `−0.035rad`；其余卡牌沿用 P3 的每层 `+5px x / −6px y` 叠放偏移。
- P4 起点不得闪白、缩放跳变、重排或先隐藏下层卡。

### 4. 五轮确定性时间轴

标准模式每张卡一个 `0.95s` 周期，五张总长 `4.75s`。第 `i` 张卡的周期起点为 `i × 0.95s`：

| 周期内时间 | 阶段 | 要求 |
|---|---|---|
| `0–0.18s` | 停稳可读 | 顶牌保持正面完整可见，不漂移 |
| `0.18–0.45s` | 克制摇动 | 围绕展示位左右各摆一次；水平位移峰值 `6–10px`，旋转增量峰值 `2.5°–4°`，垂直位移不超过 `5px`；回到接近起始姿态 |
| `0.40–0.95s` | 向右飞出 | 与摇动尾部交叠 `0.05s`；cubic ease-in 沿浅弧右移至画外，中心终点建议 `(1560,300)`，旋转收至约 `+10°`，尺寸最多放大到 `1.04–1.07×` |
| `0.40–0.62s` | 余牌收拢 | 与当前牌飞出并行；剩余卡组整体补偿一层旧偏移，使下一张平滑回到主展示位，不得瞬移 |

- 飞出卡全程保持 alpha 1，由画布边界自然裁掉；禁止在画面中央淡没。
- 下一张从飞出卡开始移动的第一帧起就因遮挡解除逐步可见，不另做淡入。到当前牌右移约一个卡宽时，下一张应已完整可读。
- 每轮只有当前最上层卡摇动；下方剩余卡只执行共同的收拢 tween，不各自漂移。
- 第五张执行同样的摇动与右飞，不得留在中心假装结果页。`4.75s` 终帧中心为空，五张均保存在右侧画外已展示队列中。

### 5. 右侧画外队列与 P5 接口

- 画外队列按展示顺序保存 `card-0…card-4`，不得反转。
- 建议为每张保存 `queueIndex` 与确定性的画外姿态；画外中心 x 必须大于逻辑画布右边界加半张卡宽，确保不可见但实例仍可查询。
- `window.__p4Review.poseAt(ms)` 必须返回五张卡的稳定 id、`state: stacked|active|flying|queued`、中心、尺寸、旋转、alpha 与 queueIndex。
- P4 终帧就是 P5 `0ms` 的唯一接口；本阶段不得把卡牌提前排列回屏幕。

### 6. 控件与审阅接口

在现有控制区追加或替换为不遮挡主体的：

- `P4 起点`；
- `播放 P4`；
- `暂停/继续 P4`；
- `重播 P4`；
- `P5 画外队列帧`。

保留 P1–P3 的既有审阅入口。点击任一其他阶段控件必须清理 P4 计时和 RAF；再次进入 P4 从同一五卡接力帧开始。`window.__p4Review` 至少提供 `state()`、`poseAt(ms)` 和 `setTime(ms)`。

### 7. reduced-motion、失焦与重入

- reduced-motion 使用 `0.30s/张`、总长 `1.50s`：取消摇动、弧线和额外旋转，只保留短暂停稳、直接向右平移出画面及剩余卡组平滑收拢；五张的展示顺序和最终队列必须与标准模式相同。
- 失焦/隐藏时暂停且不累计墙钟；恢复后等待用户主动继续。
- 只允许一个 RAF；连续快速重播必须从 P4 `0ms` 的同一五卡姿态重算，禁止残留画外卡或重复实例。

### 8. 文件范围

只允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p4/**`

禁止修改 `games/**`、`src/**`、`assets/**`、SDK、独立 ScreenFx 原型，不得提前实现 P5。

### 9. 自验与出口

1. P3-R2 `1050ms` 与 P4 `0ms` Canvas 像素一致。
2. 固定帧截图至少包含：P4 起点、`card-0` 摇动极值、`card-0` 飞出且 `card-1` 自然露出、`card-2` 停稳、`card-4` 停稳、P5 画外队列终帧。
3. 每个固定帧均能查询到恰好五个稳定 card id；任何时刻不得多于或少于五个。
4. 下一张卡不依赖 alpha 淡入；检查 `card-1…4` 在前一张尚未飞走前已经存在。
5. 五次余牌补位均为 tween，不出现单帧位置跳变；当前飞出与补位存在明确并行窗口。
6. 五张不同占位卡按 `0→4` 顺序展示并按相同顺序进入 queued。
7. 标准模式与 reduced-motion 的终态 id、顺序和队列姿态语义一致。
8. 真实浏览器控制台/pageerror 为 0；完整播放 10 次、快速重播 20 次、P1/P2/P3 回切清理通过。
9. 更新 notes：五张卡占位表、单卡周期、摇动峰值、右飞贝塞尔/缓动、收拢补位方式、画外队列姿态、P5 接口和已知偏差。
10. 完成后等待 owner 对 P4 给出“冻结 / 继续修改”，禁止进入 P5。

---

## S1-P/P3-R2：无 Seal 整体撕顶、包体下坠与卡组接力

### 1. 返工依据

参考视频截图的有效信息仅限运动与结构关系：包装顶部是一个近似水平、略带浅弧和轻微自然起伏的开口边，不是大幅锯齿；顶部撕离后剩余包口持续存在。不得复制参考视频中的角色、文字、品牌、图案或包装美术。

P3-R1 有两个明确错误：

1. 断口使用等距三角锯齿，视觉像剪纸，不像快速撕开的薄包装；
2. 顶片已经被抛飞时，原位置仍按从右到左的 frontier 裁剪顶部，形成“同一顶部既飞走又逐段消失”的双重表现。

P3-R2 必须删除这两个机制，而不是仅调快。

### 2. 全局移除 Seal

- 从 P1、P2、P3 的玩家可见画面中彻底移除 Seal 图像、Seal 控件、`state.seal`、Seal image source 和相关说明。
- Front A/B 图片本身保持完整；卡包顶部只保留极细的包装压边/印刷安全线，不再有横向米色封条。
- P2 圆环中的 8 个卡包也不得出现 Seal。
- P2 终帧与 P3-R2 首帧仍须像素一致；新的比较基线是“无 Seal 的 Front B 英雄位”。
- 历史 P1/P2 的尺寸、正背面、Flip、圆环、锁定和聚焦仍冻结，只有 Seal 视觉被 owner 新判词全局撤销。

### 3. 断口形状

- 撕下顶部约占包高 `14%–17%`。
- 断口总体接近水平浅弧：中心相对两端下凹或上拱约 `5–10px`。
- 只允许 `5–7` 个平滑控制点，局部自然起伏幅度 `2–6px`；禁止三角形、等距锯齿和尖锐重复节奏。
- 使用一条确定性的平滑曲线或二次贝塞尔段；顶片下缘与包体上缘必须来自同一曲线并完全互补。
- 剩余包口可有 `2–4px` 深色内沿和 `1–2px` 冷色/浅色高光，表达参考图中的薄包装开口；不得加入厚重能量环。

### 4. 整体分离铁律

P3-R2 不再存在 `tear/frontier` 从右向左裁剪进度。只允许三个状态：

1. `attached`：完整无 Seal 卡包；
2. `detached`：在极短断裂点之后，完整顶片与完整剩余包体同时存在，边缘互补；
3. `gone`：顶片作为完整单件飞出视区/淡出。

顶片一旦进入 `detached`，其纹理、宽度和裁片不得随着时间继续减少。顶片飞行只改变位置、旋转和整体 alpha。

### 5. 新时间轴

总时长暂定 `1.05s`：

| 阶段 | 时间 | 要求 |
|---|---:|---|
| 无 Seal 停稳 | `0–0.10s` | P2 无 Seal 英雄位终帧 |
| 极短预备 | `0.10–0.16s` | 包体上沿轻微拉紧/上移不超过 3px，不裁剪顶部 |
| 整体断裂 | `0.16s` | 单一时间点切换为互补的完整顶片 + 剩余包体 |
| 顶片抛飞 | `0.16–0.48s` | 完整顶片向右上飞离，旋转约 `30°–55°`；不得缩短或逐段消失 |
| 包体下坠 | `0.22–0.82s` | 剩余包体 ease-in 加速向下离屏 |
| 卡组上升 | `0.32–1.05s` | 5 张叠放卡组成一个整体从包内上升；与包体下坠并行至少 `0.45s` |

总节奏应比 P3-R1 更干净；不需要显示“撕裂从右向左扫过”的过程。

### 6. 卡组接力结构

- 使用 `5` 张 `2:3` 原创占位卡，每张是独立稳定实例 `card-0…card-4`。
- 顶层 `card-0` 使用清晰卡面占位；下方 `card-1…4` 至少露出顶部或侧边 `4–8px`，证明它们实际存在于第一张下面，而不是之后再生成。
- 卡组上升时整体保持一致运动，只允许每层有固定的轻微位置/旋转偏差；禁止各张卡独立漂动。
- P3-R2 终帧：卡组中心建议约 `(720,360)`，顶层卡尺寸约 `260×390`；下层边缘仍可见，包体已经完全离屏。
- 顶层卡不得在 P3-R2 中摇动、飞走或翻面；这些从 P4 `0ms` 接手。
- `window.__p3Review.poseAt(ms)` 必须能返回 `topPiece/body/cardStack[]` 的完整姿态与稳定 card id。

### 7. 控件

控件改为：

- `P3-R2 起点`；
- `播放 P3-R2`；
- `暂停/继续 P3-R2`；
- `重播 P3-R2`；
- `P4 卡组接力帧`。

彻底删除 `Seal 开/关`。P1/P2 原有控制重新排版，不能因删掉 Seal 留下错误状态或空按钮。

### 8. reduced-motion、失焦与重入

- reduced-motion 总时长 `0.28s`：完整顶部整体淡出偏移、包体下移淡出、卡组整体上移淡入；不出现 frontier。
- 失焦暂停、单 RAF 和 P1/P2 回切清理继续保留。
- 快速重播不得残留顶片、旧包体或重复卡组。

### 9. 文件范围

只允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p3-r2/**`

禁止修改 `games/**`、`src/**`、`assets/**`、SDK、独立 ScreenFx 原型，不得提前实现 P4/P5。

### 10. 自验

1. 全文件检查不得再存在活动代码中的 `Seal` 图片、按钮、状态或绘制调用；历史说明可保留并明确标记为否决内容。
2. P2 无 Seal 终帧与 P3-R2 `0ms` 首帧 Canvas 像素一致。
3. 截图：无 Seal 起点、断裂前一帧、断裂后一帧、完整顶片抛飞、包体/卡组交叉、P4 卡组接力终帧。
4. 对断裂后连续多个固定帧检查：顶片裁片宽度与纹理内容恒定，只改变 transform/alpha。
5. 包体与卡组并行时间不少于 `0.45s`。
6. P3-R2 终帧同时存在 5 个稳定 card id，`card-1…4` 的边缘在顶层下方可见。
7. 真实浏览器控制台/pageerror 为 0；实际播放 10 次、快速重播 20 次通过。
8. 更新 notes：平滑断口控制点、三态分离模型、完整顶片轨迹、5 卡叠放偏移、P4 接力合同、参考图只借鉴结构不复制美术。
9. 完成后等待 owner 对 P3-R2 判词，禁止进入 P4。

---

## S1-P/P3-R1：顶部快速撕飞、包体下坠与首卡接力

### 1. 返工结论

删除原 P3 的 SealAttached/SealRibbon/TearEdge 分段卷带、上片慢抬、主体微沉和 3.8 秒长演出。新 P3 是一段不超过约 `1.35s` 的快速过桥动作：卡包顶部约 15% 沿一条预制不规则撕裂线瞬间断开并高速飞走；剩余包体几乎同时向屏幕下方坠落隐藏；第一张通用卡背从原包口方向开始飞出，把视觉控制权交给 P4。

目标是“干净、快速、有冲击”，不是模拟真实纸张物理。

### 2. 与 P2/P4 的边界

- 起点仍须像素级等于 P2 终帧：`#3 / Front B / 400×600 / center(720,410)`。
- P3-R1 可以调整或隐藏独立 Seal 层，以服务整块顶部撕飞；不得再表现 Seal 自己卷起。
- P3-R1 只允许出现**一张无内容的通用卡背占位**，且只播放到“开始飞出/露出主体轮廓”的接力状态。
- 多张卡依次飞出、卡面替换、翻面、停留、稀有度和最终陈列全部属于 P4，禁止在本单提前实现。
- P4 起点必须与 P3-R1 的首卡接力终帧无跳帧衔接。

### 3. 撕裂几何

1. 撕裂线位于包体顶部约 `15%–20%` 高度范围；如果必须完整带走当前 Seal，占比可在该范围内取视觉最自然值，但不得超过约 `22%`。
2. 撕裂线横跨包体全宽，采用 7–11 个固定控制点形成低幅锯齿；垂直起伏约 `8–18px`，不得像规则直线，也不得出现夸张山峰。
3. 顶片必须真实使用 Front B 顶部图像及 Seal 的相应部分裁切，不得用纯色矩形替代。
4. 剩余包体顶部边缘必须使用与顶片互补的同一条撕裂线，不能两条边对不上。
5. 不生成碎纸雨；最多允许 3–6 个极短命、确定性的纸屑点强化断裂瞬间。

### 4. 快速时间轴

默认总时长 `1.30s`：

| 阶段 | 时间 | 要求 |
|---|---:|---|
| 极短停稳 | `0–0.10s` | 完全继承 P2 终帧 |
| 顶部瞬撕 | `0.10–0.32s` | 锯齿断口从右向左快速完成；顶片在后半程已经开始获得向右上速度 |
| 顶片抛飞 | `0.22–0.68s` | 顶片沿右上抛物线高速离开，旋转约 `35°–70°` 并淡出；不卷曲、不分段 |
| 包体下坠 | `0.28–0.98s` | 剩余包体先有 `2–4px` 反冲，再以 ease-in 加速向下离屏；不得匀速漂走 |
| 首卡接力 | `0.54–1.30s` | 在包体尚未完全离屏时，第一张卡背从撕裂口方向沿上升弧线出现；包体下坠与首卡上升至少并行 `0.30s` |

禁止出现“顶片飞完 → 等待 → 包体下坠 → 等待 → 卡牌出现”的串行停顿。

### 5. 顶片运动

- 初速度方向：右上；水平位移约 `260–380px`，垂直位移约 `180–280px`。
- 旋转中心偏向撕裂起点，飞行中累计旋转约 `35°–70°`，只转一次，不翻来覆去。
- 顶片在 `0.68s` 前完全离开主要视区或淡至 0。
- 可以在断裂一瞬加入 1 帧白色细边或轻微亮闪，但禁止全屏爆光和慢速光环。

### 6. 包体下坠

- 剩余包体必须保持正面朝向，不翻转、不缩成一点。
- `0.28s` 左右先向上/右产生极轻微反冲，再向下加速。
- 到 `0.98s` 时主体边界完全离开画布下方，alpha 为 0 或不可见。
- 下坠过程与首卡上升互相让位：卡背应绘制在包体开口之后、包体主体之前或按明确层级穿出，不得看起来从包面中央穿模。

### 7. 首卡接力占位

- 使用一张竖向 `2:3` 通用卡背，占位尺寸从约 `130×195` 增长至 `220×330`；不得使用具体卡面或稀有度信息。
- 起点在撕裂口下方，被包体遮住大部分；随着包体下坠，卡背沿轻微右弧上升到画面中心附近。
- P3-R1 终帧只需让卡背完整可见并仍带少量上升动势；不得翻面或停稳展示。
- 在 notes 中定义 P4 接力参数：位置、尺寸、速度方向、旋转角、时间归零规则。

### 8. 控件和审阅接口

删除或废弃旧 P3 的 `已开启状态` 与慢速包口控件，改为：

- `P3-R1 起点`；
- `播放 P3-R1`；
- `暂停/继续 P3-R1`；
- `重播 P3-R1`；
- `P4 接力帧`。

`window.__p3Review` 可保留名称，但 `setTime(ms)` 的上限改为 `1300ms`，`state()` 返回新阶段；旧 `layersAt` 不得继续暴露已删除的 SealRibbon/InnerGlow 语义，可改为 `poseAt(ms)`。

### 9. 减少动态、失焦和重入

- reduced-motion 下压缩为 `0.32s`：顶部淡出/偏移、包体向下淡出、首卡背淡入上移；仍保持先撕开后首卡的语义顺序。
- 失焦暂停和单 RAF 规则不变。
- P1/P2 控件被点击时必须清理 P3-R1 的顶片、纸屑、包体位移和卡背占位。
- 快速重播只允许一条时间轴，不得残留上一轮的顶片或首卡。

### 10. 文件范围

仅允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p3-r1/**`

禁止修改 `games/**`、`src/**`、`assets/**`、SDK、独立 ScreenFx 原型和正式打包流程。

### 11. 自验与交付

1. P2 终帧与 P3-R1 `0ms` 首帧 Canvas 像素一致；
2. 截图：起点、撕裂中段、顶片抛飞、包体/首卡交叉中段、包体即将离屏、P4 接力终帧；
3. 真浏览器控制台/pageerror 为 0；
4. 实际播放 10 次，锯齿线、顶片轨迹和首卡终点一致；
5. 快速重播 20 次无残留、无多时间轴；
6. 顶片是完整单件，不出现旧版六段矩形卷带；
7. `0.58–0.88s` 区间必须能同时看到包体下坠与卡背上升；
8. P3-R1 终帧不出现包体，只保留首卡接力状态；
9. 更新 notes：锯齿控制点、顶片轨迹、包体曲线、首卡接力参数、reduced-motion 与已知偏差；
10. 完成后等待 owner 对 P3-R1 判词，禁止进入完整 P4。

---

## S1-P/P3：封条剥离、包口开启与内部发光

### 1. 本单目标

从 P2 已冻结的英雄位结束态无跳帧衔接，完成一段可重复播放的确定性开包原型：选中卡包短暂停稳，封条蓄光并从右向左被撕开，已剥离部分形成可读的卷曲/飘带轨迹并飞离；随后包口沿封条所在区域裂开发光，上沿开启，最终停在“内部能量已显露、等待 P4 出卡”的稳定状态。

本单只裁决封条撕开方向、撕裂速度、卷曲幅度、包体反应、开启幅度、内部光强和 P4 接口状态。不得提前生成、弹出或展示任何卡牌。

### 2. 必须保持的 P1/P2 冻结项

1. P3 起点必须逐像素等于 P2 结束态：Front B、Seal 开、`400×600`、中心 `(720,410)`、透明舞台。
2. 保持高:宽=`3:2` 的超薄双面纸片卡包；不得恢复软包装褶皱、厚盒、PBR、地面或倒影。
3. Front、Back、Seal 仍为独立图片槽。封条动画只能消费 Seal 层，不得把封条烘焙进 Front B。
4. 透明舞台和 P1/P2 控件必须继续可用；P3 不得改坏 Flip、圆环或聚焦段。
5. 不使用随机数决定撕裂形状或轨迹；每次回放必须得到相同关键帧。

### 3. 演出设计结论

- 封条为贴在包面上方区域的横向纸/箔带，从**右端开始向左撕**。
- 撕开不是简单矩形缩短：未撕部分仍贴合包面，已撕部分形成 4–7 段的平滑折线或贝塞尔卷带，末端向右上方抬起。
- 撕裂边缘需要一条细小、不规则但确定性的亮色断口，沿撕裂进度移动；不做实时纸张物理。
- 封条完全脱离后沿右上弧线飞出并淡出；不能瞬间消失。
- 包体只做克制反应：撕裂进行时约 `±2°` 的快速回弹或 `4–8px` 横向受力，不改变中心基线，不做软体波动。
- 包口位于封条原位置附近。开启时上沿/上片向上抬起约 `55–85px` 并轻微后仰，下方主体只下沉 `8–16px`；不得把整个卡包对半炸开。
- 开启缝隙先出现细线，随后扩为约 `28–46px` 的发光口；最终保持可供 P4 卡牌从中升起的出口。

### 4. P3 时间轴

总时长建议 `3.8s`，默认按下表实现：

| 阶段 | 时间 | 并行关系与要求 |
|---|---:|---|
| 英雄位停稳 | `0–0.35s` | 完全继承 P2 结束态，给眼睛确认目标 |
| 封条蓄光 | `0.35–0.70s` | Seal 边缘与右端拉片渐亮；包体不移动 |
| 从右向左撕开 | `0.70–1.65s` | 撕裂前沿移动、卷带增长、包体受力回弹三者并行 |
| 封条飞离 | `1.65–2.15s` | 已完整分离的 Seal 沿右上弧线飞出并淡出；断口细光出现 |
| 包口开启 | `2.00–3.25s` | 与封条退场后半段交叠；上沿抬起、主体微沉、缝隙扩张、内部光增强并行 |
| 待出卡保持 | `3.25–3.80s` | 动作收束，无卡牌出现；内部光轻微稳定呼吸但不循环驱动阶段完成 |

封条飞离与包口开启必须有约 `0.15s` 交叠，避免“封条彻底消失后卡包才突然开始动”的割裂感。

### 5. 视觉层级

P3 至少分为以下独立层，后续能力计划才能映射成通用演出数据：

1. `PackBody`：Front B 主体；
2. `PackTop`：可抬起的上沿/上片，图像内容与 Front B 连续；
3. `SealAttached`：尚未撕开的封条部分；
4. `SealRibbon`：已经撕开的卷带部分；
5. `TearEdge`：移动中的断口细线与少量碎屑；
6. `InnerGlow`：包口内部径向光、细粒子和外溢光。

原型可以用 Canvas 几何与内嵌占位图表达，但说明文档必须明确未来哪些层映射为图片槽、遮罩、路径动画和 ScreenFx/粒子；禁止把原型自由绘制方式当成正式引擎方案。

### 6. P3 控件与审阅状态

保留全部 P1/P2 控件，并新增：

- `P3 起点`：直接显示 P2 英雄位结束态；
- `播放 P3`：从停稳播放到待出卡状态；
- `暂停/继续 P3`；
- `重播 P3`；
- `已开启状态`：直接查看 P3 最终包口与内部光。

读数显示阶段名和 `当前时间 / 3.80秒`。审阅接口增加 `window.__p3Review.setTime(ms)` 与只读 `state()`，方便固定帧截图；接口只用于原型验收。

### 7. 音效标记（只记录，不接正式音频）

在 notes 中记录三个未来 Sfx cue，不生成正式音频文件：

- `seal_tension`：`0.48s`，短促蓄力；
- `seal_tear`：`0.70–1.65s`，随撕裂进度连续或分段；
- `pack_open_bloom`：`2.05s`，开启与能量涌出。

这些 cue 以后由音频能力消费同一演出时间轴；不得在原型里依赖音频完成时驱动状态。

### 8. 减少动态、失焦与重入

- reduced-motion 下将 P3 压缩为约 `0.65s`：完整 Seal 淡出 → 包口淡入开启 → 内部光稳定，仍须保留三个可理解状态。
- 页面失焦自动暂停且不累计墙钟；恢复后保持暂停，由用户继续。
- 播放、重播和 P2→P3 切换只能有一条有效 requestAnimationFrame；快速点击不得留下旧封条、重复光层或多个时间轴。
- 任何 P1/P2 控件被点击时必须退出 P3 并清理 P3 临时状态。

### 9. 文件范围

本单只允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p3/**`

禁止修改 `games/**`、`src/**`、`assets/**`、SDK、manifest、构建和发布脚本。不得修改或合并独立的 `screen-fx-comet-prototype.dc.html`。

### 10. 正确截图路径

继续使用已验证的短生命周期 Playwright + 本机 Edge：显式指定 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，直接访问绝对 `file:///.../prototype.dc.html`，监听 `console/pageerror`，使用 `omitBackground:true` 写入 `ui-refs/p3/`，最后关闭 browser。

应用内浏览器自动化拒绝 `file://` 不是阻塞，也不能据此跳过截图。若当前施工聊天的应用内 browser 工具返回禁止替代通道，不要在该工具内绕过；完成代码与静态自验后诚实报告，由独立复查聊天按允许的短生命周期 Playwright 路径完成真渲染复查。

### 11. 自验与交付

1. 真实浏览器控制台和 `pageerror` 为 0；
2. 固定截图至少包括：P3 起点、撕裂 35%、撕裂 80%、封条飞离、包口开启中段、最终待出卡状态、透明背景；
3. 连续播放 10 次，封条方向、卷带形态、断口位置、开启终点完全一致；
4. 快速重播 20 次，只保留一条时间轴且无残留 SealRibbon/InnerGlow；
5. P2 完整播放结束后直接进入 P3，第一帧像素级无跳变；
6. P3 完成后切换 P1 Front/Back 与 P2 圆环，所有旧状态可正常重建；
7. reduced-motion 和失焦暂停通过；
8. 更新 `prototype-notes.md`：六层结构、时间轴/easing、卷带路径、开口尺寸、三个 Sfx cue、失焦与减少动态策略、截图证据和已知偏差；
9. 完成后等待 owner 对 P3 给出“冻结 / 继续修改”，禁止进入 P4。

---

## S1-P/P2：多卡包圆环、旋转、停靠与聚焦

### 1. 本单目标

在已冻结 P1 双面纸片卡包基础上，实现一段可重复播放的确定性原型：多个卡包从画面中组成带景深层级的椭圆环，围绕中心旋转，随后减速锁定一个预先指定的卡包；被选中卡包沿连续轨迹移动并放大到 P1 英雄展示位，其余卡包同步退场。

本单只裁决卡包数量、圆环构图、旋转方向与速度、减速节奏、选中提示、聚焦轨迹及前后景遮挡。不做 P3 撕封条、不做 P4 卡牌弹出、不做 P5 结果总览。

### 2. 必须保持的 P1 冻结项

1. 单包高:宽=`3:2`，英雄位仍为 `400×600`，中心约 `(720,410)`。
2. Front、Back、Seal 为三个独立图片槽；圆环中的每个卡包复用相同结构，不得退回硬盒、软包装、PBR、地面或倒影。
3. 舞台缺省真实透明；审阅棋盘格仍只作为辅助，不进入目标画面。
4. 卡包正反方向、90° 极薄边缘和 P1 Flip 行为不得因 P2 改坏。
5. 不添加随机选择；P2 固定选中一个稳定序号，确保每次回放与截图一致。

### 3. 圆环构图默认方案

- 数量：默认 `8` 个卡包；不得提供自由数量滑杆把裁决推给 owner。
- 环中心：约 `(720,400)`。
- 投影：水平半径约 `330px`，垂直半径约 `135px`，形成面向镜头的透视椭圆环。
- 圆环卡包基础尺寸：约 `150×225px`；根据环上深度连续缩放到约 `0.72–1.08`，前景清晰、后景略小。
- 深度顺序必须随角度变化：后半环先绘制，前半环后绘制；禁止卡包互相穿插时出现错误遮挡。
- 透明度可随深度轻微变化，但后排不得淡到不可辨认；不使用模糊冒充景深。
- 卡包允许有极小的切线偏航以强化圆环方向，但正面主图必须仍可辨识，不做连续翻背面。

### 4. P2 完整时间轴

总时长建议 `5.4–6.2s`，默认先按 `5.8s` 实现：

| 阶段 | 时间 | 要求 |
|---|---:|---|
| 圆环建立 | `0–0.65s` | 8 个卡包由中心附近错峰展开到椭圆环；禁止瞬移 |
| 稳定旋转 | `0.65–3.15s` | 全环同向旋转约 `150°–210°`，速度稳定且能读清卡包 |
| 减速锁定 | `3.15–4.15s` | cubic ease-out 减速，目标卡包准确停到前景选中位；不得回弹抖动 |
| 选中确认 | `4.15–4.45s` | 目标包一次克制的轮廓亮起/微抬，其余包开始降权 |
| 聚焦英雄位 | `4.45–5.80s` | 目标包沿连续曲线移动到 `(720,410)` 并放大为 `400×600`；其余包向外散开并淡出 |

目标包位移、缩放和其余包退场必须并行发生。聚焦过程不得先瞬移到中心再放大，也不得在结束一帧突然切换成 P1 卡包。

### 5. 原型状态与控制

必须保留 P1 静态审阅能力，并新增：

- `圆环静态`：直接查看完整 8 包构图与前后遮挡；
- `播放 P2`：从圆环建立播放到英雄位稳定；
- `暂停/继续`：用于检查任意中间状态；
- `重新播放`：清理旧状态并确定性复播；
- `透明棋盘格`：继续复用 P1 辅助开关。

读数显示当前阶段和 `当前时间 / 5.8秒`。不得加入自由速度、半径或数量调参面板。

### 6. 选中与聚焦表现

1. 固定选中编号建议为 `#3`，在代码和说明中使用稳定 id，而不是数组当前位置或随机数。
2. 选中提示只允许一次克制的金色轮廓、光点或约 `1.04` 倍微抬；禁止在 P2 提前做稀有度大爆发。
3. 聚焦时保持正面朝向，Front 图不得扭曲、镜像或在过渡中换成 Back。
4. 聚焦落点必须与 P1 英雄位逐像素一致；结束后可直接进入 P1 Front 状态而无跳帧。
5. 其余 7 包必须有明确退场轨迹并在聚焦结束前完全淡出，不能瞬间隐藏。

### 7. 减少动态与失焦

- `prefers-reduced-motion` 下可将圆环建立、旋转和聚焦压缩为约 `0.8s` 的分段淡入/淡出，但仍须展示圆环构图、选中确认和英雄位三个语义状态。
- 页面失焦再恢复时不得按墙钟跳到未知状态；原型允许暂停并在恢复后继续，或确定性落到当前片段结束态，必须在说明中写清。
- 连续快速点击播放/重播只能存在一条有效时间轴，不能叠加多个 requestAnimationFrame。

### 8. 文件范围

本单只允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p2/**`

禁止修改 `games/**`、`src/**`、`assets/**`、SDK、manifest、构建和发布脚本。ScreenFx 彗星转场为另一条横向能力原型，不得混入 P2 卡包圆环时间轴。

### 9. 正确的本地截图方法

应用内浏览器自动化只允许 `http/https`，拒绝 `file://`；这不是原型故障，也不是 P2 的阻塞条件。不得继续要求 owner 启动静态服务，也不得宣称因此无法自验。

项目已有 `playwright`，但默认 Playwright Chromium 未安装。正确方法是使用短生命周期 Playwright，并显式指定本机 Edge：

```js
const { chromium } = require('playwright');
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--no-first-run', '--no-default-browser-check'],
});
```

随后用隔离 page 访问绝对 `file:///C:/.../prototype.dc.html`，以 `page.screenshot({ path, omitBackground: true })` 写入 `ui-refs/p2/`，监听 `console` 与 `pageerror`，最终必须 `await browser.close()`。这属于 AGENTS.md 3.1 允许的短生命周期无头浏览器只读验收；不得借此启动 Vite 或任何服务。

### 10. 自验与交付

1. 真实浏览器控制台 `0 error`；
2. 截图至少包括：圆环静态、稳定旋转中段、减速锁定、聚焦中段、英雄位结束态、透明背景；
3. 连续完整播放 10 次，固定目标始终相同，结束位置与尺寸一致；
4. 快速连续点击播放/重播 20 次，只有一条时间轴生效；
5. 检查前后排遮挡随旋转正确变化，不出现绘制顺序跳变；
6. 检查聚焦位移与缩放连续，其余卡包退场无瞬移；
7. 更新 `prototype-notes.md`：8 包坐标/尺寸、深度排序、固定选中 id、逐段时长/easing、失焦策略、减少动态策略、截图方法与已知偏差；
8. 交付后等待 owner 对 P2 给出“冻结 / 继续修改”，禁止进入 P3。

---

## S1-P/P1-R2：双面纸片卡包与透明舞台

### 1. Owner 新方向

1. 取消软包装鼓起、褶皱、复杂侧面、PBR 材质和 GLB 模型路线。
2. 卡包改成超薄纸片式双面表现件，整体为竖向长方形。
3. 比例暂按 **高:宽 = 3:2**；1440×900 原型建议约 `600×400`，保持画面主体清楚但给后续圆环留空间。
4. 卡包必须有独立正面图和背面图，后续可以直接替换为 AI 生成图片。
5. 舞台背景透明，删除现有黑色/黑紫背景、星点、径向光晕、地面、倒影和灯光表现。
6. 后续撕封条使用一张独立透明封条图覆盖在正面，不让封条烘焙进正面图；本单只保留封条占位和锚点，不制作完整撕开演出。

### 2. 本单唯一目标

把 `prototype.dc.html` 从“软包装展示台”改为“透明舞台上的双面纸片卡包”，验证比例、正反图切换、绕 Y 轴转身和可替换图片结构。不得进入 P2 圆环，也不得实现完整撕封条。

### 3. 画布与透明要求

- 逻辑画布保持 `1440×900`；外围仅用于浏览器缩放，不改变逻辑构图。
- `html`、`body`、舞台和 Canvas 均不得绘制不透明底色；截图为 PNG 时主体外区域必须保留 alpha=0。
- 删除地面分界、镜面倒影、背景粒子、中心光晕、主光/轮廓光和材质扫光。
- 为方便 owner 在浅色页面查看，原型可以提供一个仅供审阅的“透明棋盘格 开/关”控件；缺省必须为真正透明，棋盘格不得进入游戏目标画面。

### 4. 卡包几何

- 竖向矩形，高:宽=`3:2`；建议宽 `400px`、高 `600px`。
- 视觉厚度只保留 `1–3px` 的边缘线或极薄侧边；禁止恢复盒体、鼓包、褶皱和软包装压边。
- 圆角保持克制，建议 `0–8px`；不使用扑克牌花色、相框边或厚重卡牌边框。
- 封条占位横跨卡包靠上区域，单独绘制/分层并标记 `Seal`；关闭封条占位时正面图必须保持完整。

### 5. 正反面图片槽

原型至少提供四个控制：

- `正面 A`
- `正面 B`
- `显示正面`
- `显示背面`

要求：

1. 正面 A/B 是两张明显不同的本地原创占位图；切换只替换 Front 图片槽，不改变几何或动画状态。
2. 背面使用独立 Back 图片槽，不得把正面水平镜像冒充背面。
3. 正面图、背面图和封条图在代码结构及说明中分别记为 `Front`、`Back`、`Seal`；未来均映射为独立 texture/image key。
4. 图片以 cover 或明确的 3:2 安全区显示，不拉伸变形。
5. AI 新封面只需替换 `Front` 图片，不要求重做卡包结构。

### 6. 转身动画

- 保留 `Front` 静态状态；新增或调整 `Flip Preview`，让纸片绕 Y 轴从正面转到背面，再返回正面。
- 0° 显示正面，90° 只剩极薄边缘，180° 显示正确方向的背面；背面文字/图案不得镜像。
- 总时长建议 `1.8–2.4s`；使用缓入缓出，不需要展示原软包装的 ±24° 摇摆。
- 正反面切换必须发生在接近 90° 的最窄阶段，不能在正对镜头时突然换图。
- 转动中心固定，不能横向跳跃、缩放跳变或上下漂移。
- reduced-motion 下允许缩短为淡化换面，但最终正反状态必须正确。

### 7. 文件范围

仍仅允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p1/**`（确有必要时）

禁止修改 `games/**`、`src/**`、`assets/**`、SDK、manifest、构建和发布脚本。此前 `Model3D.materialSlots` 不得施工。

### 8. 自验与交付

1. 断网本地运行，控制台零 error；
2. 用真实 alpha 检查截图角像素，四角 alpha 必须为 0；
3. 截图：正面 A、正面 B、背面、90° 极薄边缘、封条占位关闭；
4. 连续切换正面 A/B 20 次，画布与卡包状态不重置；
5. 连续播放 Flip Preview 10 次，正反方向正确、中心无漂移；
6. 更新 `prototype-notes.md`：3:2 尺寸、Front/Back/Seal 三槽、安全区、转身时序、透明输出和未来资产映射；
7. 完成后等待 owner 对 P1 给出“冻结 / 继续修改”，禁止进入 P2。

---

## S1-P/P1-R1：软包装轮廓与可替换封面返工

### 1. 返工依据

独立真渲染复查确认第一版在 1440×900 下可运行、无控制台错误、转身中心稳定、倒影可独立关闭，但存在以下阻塞偏差：

1. 主体像硬质卡牌或相框，不像密封软包装卡包；
2. 缺少顶部/底部压边、封口横纹、四角收缩、袋体鼓起和褶皱；
3. 当前厚度过度规整，转身时更像硬盒；
4. 正面高光带过宽、过白，缺乏铝膜/塑膜/镭射材质感；
5. 倒影与主体脱节，近端过暗、整体过度模糊；
6. 尚未证明“包体不变，只换封面”的产品方向。

因此 P1 未冻结，禁止开始 P2。

### 2. 本单唯一目标

在不改变 P1 既定镜头和主体时序的前提下，把原型重构为可信的软包装卡包，并增加两套本地占位封面即时切换，验证“固定包体 + 可替换 Cover 槽”的视觉产品方向。

### 3. 保持不变

- 1440×900 逻辑画布及等比缩放；
- 卡包中心约 `(720,410)`；
- Turn 总时长 `2.8s`，角度 `0° → +24° → 0° → -24° → 0°`；
- Front、Turn、Hero Loop、重新播放、倒影开关、辅助线和 reduced-motion；
- 离线单文件优先；禁止远程依赖；
- 不进入 P2–P5，不创建正式游戏，不修改引擎。

### 4. 软包装重构验收

1. 外轮廓不能再是规则矩形框：顶部/底部各有明确密封压边，四角略微收缩，左右边缘存在轻微不规则起伏。
2. 包体中部相对边缘有可感知但克制的鼓起；转身时正面不能保持完全共面的硬板观感。
3. 顶部和底部压边必须有连续细横纹或热封纹，且在左右转身时透视方向正确。
4. 至少加入 4–8 条低对比度褶皱，褶皱高光随 yaw 改变，不得画成固定白线。
5. 原硬相框式三重边框删除或弱化，改为包装印刷安全框，不承担几何厚度表达。
6. 正面高光收窄、降低不透明度并分成主高光与次级膜面反射；左右转身时移动方向正确。
7. 包体边缘、压边和封口必须与封面印刷层区分，使后续更换封面不会改变几何轮廓。

### 5. 可替换封面原型验收

1. 增加 `封面 A`、`封面 B` 两个明确控件；切换不得重载页面、重置当前 Front/Turn/Hero 状态或改变包体几何。
2. 两套封面必须在构图、主色和徽记上有明显差异，均为本地原创占位，不使用参考视频 IP。
3. 封面层只覆盖预留的 `Cover` 印刷区域；顶部/底部压边、侧边、褶皱高光、包装材质与倒影仍由公共包体层负责。
4. 当前是 authoring-time 原型，不得借此在 `src/**` 实现 `materialSlots`；只需在 `prototype-notes.md` 明确映射为未来 `Cover → textureKey`。
5. 切换封面后，Front、左右转身和倒影必须同步显示新封面，不能出现旧封面残影或倒影不同步。

### 6. 倒影修正

- 倒影近端从卡包底边接续，不保留明显无因空隙；
- 近端轮廓可辨，远端快速衰减；
- 降低全局模糊，优先用纵向衰减和轻微扰动表达镜面；
- Front、Turn 两侧极值及封面切换后均保持同步；
- 关闭倒影时背景中不得残留烘焙倒影。

### 7. 文件范围

仍仅允许修改：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p1/**`（确有必要时）

禁止修改 `games/**`、`src/**`、`assets/**`、SDK、manifest、构建与发布脚本。

### 8. 自验与交付

1. 断网打开本地文件，控制台零 error；
2. 截图：封面 A Front、封面 B Front、封面 A 右转极值、封面 B 左转极值、倒影关闭；
3. 连续切换封面 20 次，包体状态、动画进度和倒影不重置；
4. Turn 连续回放 10 次，中心无漂移、首尾无跳变；
5. 810×506 仅检查等比缩放，不改变 1440×900 逻辑排版；
6. 更新 `prototype-notes.md`：包体几何、Cover 安全区、两套封面、褶皱/高光策略、倒影参数及未来 `Model3D.materialSlots` 映射；
7. 完成后只请求 owner 对 P1 给出“冻结 / 继续修改”，不得开始 P2。

---

## S1-P/P1：单卡包正面展示、3D 转动与倒影原型

### 1. 施工目标

交付一份浏览器可直接运行、无需网络与后端的 1440×900 原型，用来回答四个视觉问题：

1. 卡包在画面中的大小、中心高度与正视镜头是否正确；
2. 3D 转动是否能清晰展示卡包厚度，同时保持正面图案可读；
3. 黑色镜面地面的倒影强度、长度和模糊感是否合适；
4. 灯光、背景与微粒是否已经达到“抽卡演出开场”的质感。

本单不追求完整抽卡流程，不得提前加入圆环、封条撕开、卡牌弹出或结果页。

### 2. 强制开工阅读

主施工 agent 必须在本会话完整阅读并在第一次进度更新列出：

1. 根 `AGENTS.md`；
2. `docs/llm-onboarding.md`；
3. `docs/playbooks/index.md`；
4. `docs/playbooks/game-production.md`；
5. `docs/design/data-driven-manifesto.md`；
6. `docs/design/game-card-reveal/brief.md`；
7. 本文件；
8. `docs/design/ui-playbook.md`；
9. `docs/playbooks/ui.md`；
10. `docs/playbooks/3d.md`；
11. `docs/playbooks/rendering-fx.md`；
12. `docs/playbooks/movement-pathfinding.md`；
13. `docs/playbooks/events-logic.md`；
14. `docs/playbooks/assets.md`；
15. `docs/playbooks/art-pipeline.md`。

本单不含 DokiWorld 接入和打包，因此暂不读取 SDK 八项追加文件；后续进入宿主接线时必须重新过完整追加阅读闸。

### 3. 文件归属

施工 agent 本单只负责：

- `docs/design/game-card-reveal/prototype.dc.html`
- `docs/design/game-card-reveal/prototype-notes.md`
- `docs/design/game-card-reveal/ui-refs/p1/**`（仅确有必要的本地原型占位资源）

禁止修改：

- `games/**`
- `src/**`
- `assets/**`
- DokiWorld SDK、manifest、构建和发布脚本

若认为必须修改以上禁止区域，立即停止该项并按缺口协议留下实查证据；不得先改后报。

### 4. 原型技术边界

1. 原型必须本地离线可运行，禁止依赖 CDN、远程字体、远程图片或在线模型。
2. 优先单文件 `.dc.html`；可用原生 Canvas/WebGL、CSS 3D 和原型专用 JS。
3. 原型代码不受正式运行时 LayoutNode/渲染器实现方式约束，但必须在文件顶部注明“仅为设计原型，禁止复制进生产游戏”。
4. 不得从 `node_modules` 复制第三方整库源码塞入 HTML；若使用仓库已有第三方库，需说明其启动方式与许可，且仍要满足 owner 无需启动新服务即可目击。
5. 本阶段卡包可以使用明确标注的原创占位纹样，不得直接复制参考视频中的商标、卡包图案或受保护角色。

### 5. 逻辑画布与构图基线

- 逻辑画布：固定 `1440×900`；窗口变化时等比缩放并留黑边，不重排构图。
- 卡包展示中心：建议先放在 `(720, 410)` 附近，而非几何正中，给倒影和后续卡牌上升预留空间。
- 卡包正面建议占画面高度 `44%–52%`；厚度必须可见但不能像硬盒。
- 地面分界建议在画布高度 `68%–74%`。
- 背景采用深黑、深靛蓝或黑紫色，不使用纯黑平涂；中心有低频径向光晕。
- 所有占位文字至少按 1440×900 真画布可读，不以 810×506 侧栏作为字号基准。

### 6. 必须实现的 P1 状态

原型至少提供以下三个可点击并可重复播放的状态：

#### A. `Front` 静态正面

- 卡包正对镜头；
- 清楚看到正面、轻微侧厚度、封边和顶部封口；
- 地面有与卡包同步的镜面倒影；
- 有稳定主光、轮廓光与低强度环境粒子；
- 用来确认最终英雄构图。

#### B. `Turn` 三维展示

- 从正面开始，先向一侧转动约 `18°–28°`，再经过正面转向另一侧，最后回到正面；
- 总时长建议 `2.4–3.2s`，必须使用缓入缓出，不允许匀速机械自转；
- 转动过程中倒影、明暗和高光必须同步变化；
- 卡包中心不得上下漂移或缩放跳变；
- 目的为展示“这是有厚度的真实卡包”，不是炫技转一整圈。

#### C. `Hero Loop` 待机镜头

- 6–10 秒可循环观察；
- 卡包只有极轻微呼吸/悬浮和不超过约 `6°` 的缓慢偏航；
- 环境微粒、轮廓光、高光扫过与倒影保持克制；
- 循环首尾不能跳帧。

### 7. 原型控制与可审阅性

必须有一组不遮挡主体的原型控制：

- `正面`；
- `播放转身`；
- `待机循环/暂停`；
- `重新播放`；
- `倒影 开/关`；
- `占位辅助线 开/关`。

控制区明确显示当前片段名和时长。不得加入大量调参滑杆把设计裁决推给 owner；施工 agent 应先给出一套有主张的默认值。

### 8. 质感最低标准

- 卡包必须有正面、背面、侧边和封口厚度，禁止只画一张会旋转的平面图。
- 正面应有至少三层视觉：底色/纹样、中央徽记、边框或箔线。
- 高光必须跟随转角变化，不能只是固定透明白条。
- 倒影不能等同于垂直翻转图片；至少要有透视对应、从近到远衰减和轻微模糊/扰动。
- 背景粒子不得穿过卡包正面形成脏点。
- 关闭倒影后，其余构图仍应成立。
- `prefers-reduced-motion` 下停止循环待机，并把 `Turn` 缩短为可理解的淡化过渡。

### 9. `prototype-notes.md` 必填内容

记录实际采用的：

- 画布与安全区；
- 卡包宽、高、厚度和中心坐标；
- 相机等效视角/FOV；
- Front、Turn、Hero Loop 的逐段时长和 easing；
- 灯光方向、颜色与相对强度；
- 倒影 opacity、衰减范围和模糊策略；
- 占位素材清单与最终需替换项；
- 与生产引擎能力的对应关系；
- 已知偏差，不得写“之后再调”而不说明偏差是什么。

### 10. 自验要求

施工 agent 在交 owner 前必须完成：

1. 直接打开本地 `.dc.html`，确认断网仍可运行；
2. 1440×900 截图：Front、Turn 左极值、Turn 右极值、Hero Loop；
3. 810×506 仅做等比缩放检查，不据此放大逻辑字号或改布局；
4. 连续回放 Turn 十次，确认中心无漂移、首尾无跳变、控制不失效；
5. 倒影开关前后截图，证明倒影并非烘焙进背景；
6. reduced-motion 检查；
7. 浏览器控制台零 error。

如果验收需要 owner 启动任何服务，必须按 AGENTS.md 的强制交接格式给出命令；本单目标是无需启动服务。

### 11. P1 交付格式

交付时只报告：

- 原型文件绝对路径；
- 说明文件绝对路径；
- 四张关键截图路径；
- 实际时长与关键参数摘要；
- 已知偏差；
- 明确请求 owner 给出“冻结 / 需要修改”的判词。

不得把“文件存在”“能打开”或 agent 自评当作冻结。owner 未明确冻结前，不得开始 P2。

### 12. 明确禁止的顺手扩展

- 不做多卡包圆环；
- 不做选择逻辑或随机抽取；
- 不做撕封条；
- 不做卡牌弹出；
- 不做结果列表；
- 不接宿主图片和 SDK；
- 不生成正式美术资产；
- 不修改引擎来迎合原型；
- 不启动前后端；
- 不执行任何 Git/GitHub 命令。

---

## 后续段落占位（禁止提前施工）

- `S1-P/P2`：圆环、旋转、停靠、聚焦。
- `S1-P/P3`：封条与包体开启。
- `S1-P/P4`：逐卡揭示与稀有度层级。
- `S1-P/P5`：结果总览、跳过与完整串联。
- `S2`：完整 capability plan、宿主远程纹理桥缺口裁决、SDK 契约冻结。

## Owner 修订 · 实际 App 移除底部对话框（2026-10-10）

- 判词：接受并已实施。实际游戏只显示透明背景上的抽卡演出，不显示阶段文字、暂停、跳过、退出、错误或回执重试对话框。
- 实现边界：不改变 P2–P5 轨道与结果合同；运行入口不挂载 UI，`bottomBarH=0`。`Space` / `Enter` 与 `Esc` 仅作为不可见键盘兜底；宿主负责自身关闭 chrome。
- 失败行为：关键包内美术不可用时 requestExit，不留透明死页；单张宿主卡面失败仍按原合同使用包内 fallback。
- 验收：源码与真 dist 均须满足 canvas 存在，`[data-action]`、`#reveal-controls-row`、`#reveal-stage` 全部不存在；natural、skipped、rejected retry、cancelled 生命周期保持通过。

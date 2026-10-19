# S6 美术、音效与演出对齐（施工自证，未送 Owner 平台逐行复核）

基准：Owner 定稿 S1-P-06 的 `ui-refs/29-transparent-fixed-recipe.png`、`30-purple-static-failure.png`、`31-transparent-success.png`，同画布 1440×900；2026-10-14 Owner 又确认 S1-P-07 无限取料及 S1-P-08 棒身全段可抓、取消 Q/E/终局重开、单个小烟云。现版 `scripts/potion-s4-browser-probe.mjs --stage=S6` 产出 20 张真浏览器截图；隔离 Edge 和局部 Vite 已关闭。Owner 美术平台逐行 ☑ 尚未执行，不宣称 S6 人门通过。

| # | GDD 承诺 | 结论 | 证据 / 说明 |
|---|---|---|---|
| 1 | 三分之四视角坩埚，中心是透明敞口，锅体静止且不发光，边缘与原型同样平滑 | ✅ | `shots/S6-01-start.png`；同 SHA 锅 PNG，仅锅 Sprite opt-in `sampling:smooth`。默认 Sprite 最近邻及恢复由定向测试覆盖，独立复查仍待终判。 |
| 2 | 初始清水；投料与有效搅拌只让汤色/汤中气泡变化 | ✅ | `shots/S6-01-start.png` 已无黑缝，并由现有 `ProgressBar.fillColor` 数据消费原型同源双层径向渐变；`S6-02-add.png`、`S6-03-stir.png`、`S6-06-failure.png` 验证步骤色、气泡和紫汤。 |
| 3 | 搅拌棒常驻且从锅口伸入，真实圈数识别；锅沿遮挡其入水段 | ✅ | `shots/S6-01-start.png`、`S6-08-pointer-stir.png`、`S6-12-touch-stir.png`；圆头渐变 SVG 在锅沿前景，初始倾斜约 0.25rad、底端渐隐，鼠标/触屏完整圈均推进。 |
| 4 | 错误只把汤变浑浊紫，不移动或点亮锅 | ✅ | `shots/S6-06-purple-before-result.png`：终局立即锁玩法但先展示紫汤/静止锅约 880ms，随后才出现 `shots/S6-06-failure.png` 结算；定稿 `30-purple-static-failure.png` 的玩家可见停留帧不再被弹窗吞掉。 |
| 5 | 成功结算按定稿大框展示青蓝月相药剂瓶 | ✅ | Owner 本轮选择按 `31-transparent-success.png` 放大；`shots/S6-05-success.png` 为 640px 结算框并展示正式 `potion/result-bottle`。仅月露样例使用此本地图，赤焰不误挂青蓝瓶。 |
| 6 | 有效投料/整圈/成功/失败有声音；无音频设备可静默降级 | ✅ | `potion-sfx.ts` 纯 `SfxSpec` 数据由引擎 `SynthAudioPort` 解释；只在世界只读投影发生接受/终局状态变化时播音，未满圈/锅外释放不播。`potion-sfx.test.ts` 覆盖四种音、无事件与终局去重；端口本身无 `AudioContext` 静默。 |
| 6a | reduced-motion 保留步骤和汤色，停波纹/气泡运动 | ✅ | `shots/S6-13-reduced-motion.png` 与隔离浏览器计算样式：投料后 `data-liq-bub` 数量 0、液面脊 `animationName=none`；宿主只读媒体偏好驱动 `wave/bubbles` 闭集数据，不改世界。 |
| 7 | 五种材料有原型植物/果实/花瓣图，卷轴有卷边、木架有横档 | ✅ | `shots/S6-01-start.png`：五图、居中名称与原型描述、无份数，木架横档不再被大色块吞没；卷轴顶/底卷边改为多层木色渐变且按 26px 尺度呈现，步骤圆章与卡片可读。 |
| 8 | 美术台账逐行复核并释放 S6 | ⚠ 报 owner 于美术平台逐行 ☑ | 本地台账现为 8 行 filled，严格台账审计 8/8、0 孤儿；平台逐行复核尚未由 Owner 执行，Agent 不代按 ☑，也不宣称 S6 三门通过。 |
| 9 | 1440×900 透明舞台在宽屏窗口等比居中 | ✅ | `shots/S6-14-wide-centered.png`；隔离浏览器 2500×1250 实测 `#potion-root` 左边界等于 `(viewportW - stageW)/2` ±2px，随后回到 1440×900 完整走查仍通过。 |
| 10 | 搅拌棒头、棒身、入水端均可抓；起握不瞬移，保持完整顺逆判定 | ✅ | 通用 `grabSegment` 定向 12 项测试通过，`S6-03-stir.png` 与 `S6-08-pointer-stir.png` 为棒头真指针链；棒身中段/入水端独立浏览器复查仍在进行，完整手势工单未释放。 |
| 11 | 底部只显示放大居中的步骤，不显示“投入锅口”或 Q/E | ✅ | `S6-02-add.png`、`S6-03-stir.png` 真帧；LayoutNode/真实 DOM 断言没有旧提示，Q/E 键位已撤。 |
| 12 | 成败终局只展示结果并交付宿主，不在本局重开 | ✅ | `S6-05-success.png`、`S6-06-failure.png` 均无重开按钮；`scripts/potion-doki-smoke.mjs` 以 vendored SDK 真 host/client 握手完成 success、failure、rejected 三局，均只有一个不可变回执，拒收保持锁定且不取消。真实 DokiWorld 部署环境联调另属 S7。 |
| 13 | 失败弹窗只有一个小烟云，紫汤在弹窗前可见 | ✅ | `S6-06-purple-before-result.png` 与 `S6-06-failure.png`，单个 `potion-result-symbol`；无中部巨云。 |
| 14 | 结算在游戏舞台中央，宽屏也不靠左 | ⚠ 技术复核通过，报 owner 刷新真机目击 | 正式结果 UI 挂完整舞台 overlay；直接访问 Owner 的 5173 后，在 1135×886、1440×900、2500×1250 均断言结算框与舞台及视口中心误差 ≤2px，真帧 `shots/owner-5173/S6-17-narrow-result-centered.png`、`S6-16-wide-result-centered.png`。Owner 仍报告旧画面不居中，须新加载页面后目击确认；不以自动断言替其审美验收。 |
| 15 | 右侧材料悬停高亮并扫光，点击与拖动均易命中 | ✅ | `S6-15-material-hover.png` 真浏览器悬停帧、移开恢复断言；Canvas 指针只读命中驱动材料卡 LayoutNode 外观，材料命中区扩大，既有鼠标/触屏投料链均通过。 |
| 16 | 投料/搅拌时只让汤面发亮，汤色与亮度连续过渡，不让锅体发光 | ⚠ 机器复核通过，报 owner 真机目击 | 针对 Owner 反馈的瞬间变色，新液色上叠旧液色并以 750ms 淡出；液面亮心/双环以 180ms 渐亮、720ms 渐灭。`shots/owner-5173/S6-02a-add-fade-start.png`、`S6-02b-add-fade-middle.png`、`S6-02-add.png` 是直接在 Owner 5173 页同一次投料的开始/峰值/落定真帧，探针断言旧液层透明度严格下降；`S6-03-stir.png` 验证搅拌 cue。锅 Sprite 未变；reduced-motion 保留静态反馈。Owner 尚未目击新版连续动画。 |

迭代 1（2026-10-13）：正式锅/瓶、合成音效与结算富屏接入；真渲染发现旧占位把手/锅脚外露，删独立几何后重测。当前 0 条 ❌，2 条 ⚠ 均有明确 Owner 裁决/平台复核去向；正式 S6 完成判词尚未成立。

迭代 2（2026-10-14）：Owner 批准五张原型原创 SVG 与闭集装饰后接入；真渲染初拍发现顶卷边盖住标题，调内距后重跑 13 张截图、真鼠标/触屏完整链均 PASS。当前 0 条 ❌、1 条 ⚠（仅 Owner 美术平台逐行复核），正式 S6 完成判词仍未成立。

迭代 3（2026-10-14）：Owner 真浏览器反馈推翻旧截图视觉通过判词。改定尺宿主、液面盒、两侧 UI、字体和搅拌棒资产；`npx tsc --noEmit` PASS。Edge 截图探针于浏览器启动失败，Vitest/Vite build 于 `realpath` EPERM 失败，故 #2/#3/#7/#9 保留 ❌，须恢复可用隔离浏览器后逐项真渲染对照，不以代码自评消红。

迭代 4（2026-10-14）：按 Owner 第二轮局部截图修卷轴装饰块、编号和架面文字/横档、扩大清水投影并调棒前景，`npx tsc --noEmit` 退出 0。`npx vitest run games/game-potion-brewing/screen.test.ts` 在收集前对 `node_modules/vitest/dist/spy.js` 的 realpath 返回 EPERM，0 个测试实际运行；本轮未取得有效新截图。材料无限取用只更新未重新定稿的原型候选，正式 S4 库存合同未动。#1 锅缘采样缺口、#2/#3/#7/#9 真渲核验和 Owner 平台逐行美术复核仍未通过。

迭代 5（2026-10-14）：Owner 重新确认无限取料原型与 Sprite 平滑采样 A。正式游戏去 Resource/耗尽/所有份数 UI，锅单图 smooth；更新合同/能力计划/验收剧本与探针。`npx tsc --noEmit` PASS；本地受控权限下 6 files / 35 Vitest PASS、UI 审计 0 重叠/0 硬低对比（4 条次级文字低于 AA 警告）、14 张隔离真浏览器截图/宽屏居中/鼠标/触控/终局/重开 PASS；普通沙箱 Vitest 收集前 EPERM，不把首次 0 tests 算绿。当前 #2/#7 仍 ❌，美术平台 #8 ⚠ 待 Owner；尚未满足视觉 1:1 或 S6 收束门。

迭代 6（2026-10-14）：只用既有闭集数据把液面改为定稿原型同源的双层径向渐变，卷边与横档补木色渐变并按原型尺度去掉默认内距，五张本地材料图补原型描述副文。重新隔离真渲染 14 张并完整自玩 0 浏览器错误；#2/#7 的玩家可见承诺达到基准，❌ 归零。仍保留 #8 Owner 美术平台逐行 ☑，不代签人门；公共 Sprite 工单由异人定向复查 PASS 并释放。

最终机器回执（2026-10-14）：`node scripts/align-count.mjs --game game-potion-brewing --stage S6` 为 ✅9/⚠1/❌0、退出 0；UI 审计 0 重叠/0 对比警告/0 border-image 缺陷；`npx vitest run src/ui/components` 75 文件/569 测试 PASS，炼药+Sprite 定向 6 文件/35 测试 PASS，验收剧本 5/5 PASS；`npm run build` exit 0（仅现有大 chunk 告警）。`scripts/ui-walkthrough-probe.mjs` 的 DOM action 可驱动率 0/24，因本游戏主要交互在 Canvas 而该通用探针只枚举 DOM `[data-action]`，不是玩家真实投料覆盖；本游戏用专用真指针/触屏探针验收，不把 0/24 伪装成 UI 点击 PASS。

迭代 7（2026-10-14）：异人真渲复查指出旧 `S6-06-failure.png` Modal 遮住紫汤，不能用 `liquidColor` 单测代替玩家可见性。修正为世界终局即时、表现延迟：失败 880ms、成功 1250ms，reduced-motion 延时为 0；定时器销毁时清理，素材异步加载不能提前显示弹窗。隔离浏览器重跑 15 张/0 错误，新增 `S6-06-purple-before-result.png` 真帧且断言背景色 `rgb(97,83,102)`、此时 Modal 尚未出现。该返修经非施工者独立复跑真浏览器、35 项定向测试与 tsc，判 #4 局部 PASS，见 `review/POTION-SMOOTH-UNLIMITED-2026-10-14.md`；不代替 S6 整体复查或 Owner 美术平台逐行复核。

迭代 8（2026-10-14）：按 Owner S1-P-08 变更增加通用棒身胶囊握持、移除 Q/E 与局内重开、单云失败框、汤中气泡/旋涡与局部闪光。短生命周期 1440×900 真浏览器 15 帧/0 错误，棒头顺时针两圈和逆时针终圈、失败紫汤停留帧、单云弹窗、触控与 reduced-motion 均 PASS；`node tools/ui-audit.mjs tools/audits/potion-brewing.audit.ts` 0 重叠/0 硬对比/0 border-image 问题。30 项炼药/手势定向测试、2 项独立 App 合同测试与 tsc 通过；DokiWorld 便携构建与文档闭包退出 0。棒身独立复查、S6 美术平台人门与 SDK 真宿主联调仍待，不能把候选写成阶段通过。

迭代 9（2026-10-14）：独立手势复查发现旧系统把满圈 Signal ID 绑 `World.getVersion()`，restore 后 hash 分叉；改成快照稳定的 `emittedTurns` 与单次系统运行防重，新增默认环/棒身两条满圈恢复回归，13/13 手势测试、31/31 炼药+手势定向及 tsc 退出 0，15 帧浏览器自玩仍 0 错误。`scripts/potion-doki-smoke.mjs` 真 SDK 假宿主 success/failure/rejected/preview 四路径连续两轮通过，拒收仍保持原终局，预览不交付，没有重复回执；短时浏览器和服务均已关闭。通用棒身工单获异人独立 PASS 并释放，S6 美术平台 Owner 人门与 S7 真实部署环境联调仍独立待办。

迭代 10（2026-10-14）：针对 Owner 真浏览器反馈，结果 Modal 改挂满舞台 overlay；材料卡在 Canvas 指针经过时以现有 LayoutNode 样式高亮与 sheen 扫光，投料命中区扩大；投料/搅拌 cue 给液面短时径向高光而锅 Sprite 不变。隔离 Edge + 局部 Vite 自玩 17 帧/0 错误，结果框在 1440 与 2500 宽度均几何居中，悬停/移开与液体 cue 真 DOM 断言通过。UI 审计 0 阻断，10 项定向测试、tsc 均退出 0；审计另有非阻断的通用“华丽件命中 0”提示，本作外观直接对齐定稿原型而非换入无关预制件。S6 Owner 平台逐行美术复核仍待，不代签阶段人门。

迭代 11（2026-10-14）：Owner 明确指出 5173 真页仍看不到闪光/结算不居中，因此改用已由 Owner 启动的 `http://localhost:5173/?game=game-potion-brewing` 做隔离浏览器直连复现，不再仅信任临时 5700。旧投料帧确实只有很淡的青色环，原 650ms cue 且 reduced-motion 会彻底隐藏；现把高亮做成汤内白青/紫亮心与高对比双环，延长 1400ms，reduced-motion 保留静态反馈。直连 5173 自玩 18 帧/0 浏览器错误，投料/搅拌亮心真帧在 `shots/owner-5173/`；结算框在 1135、1440、2500 三种视口均与舞台、视口中心误差 ≤2px。10 项定向测试、tsc、UI 审计阻断 0、本地构建均 PASS。Owner 的浏览器仍须重新载入并目击两项视觉结果，#14/#16 保留 ⚠；不据此宣称 S6 人门通过。直连探针只关闭自己的隔离 Edge，未启动/停止 Owner 的 5173 服务。

迭代 12（2026-10-15）：Owner 指出投料特效仍生硬，关键是不能突变汤色。实查 Demo 液面色 750ms 过渡与亮度脉冲后，在既有 LayoutNode 闭集内叠加旧液色 750ms 淡出、新亮心与双环 180ms 渐亮/720ms 渐灭；有效搅拌未满总圈数时用 CSS `color-mix` 显示中间色。隔离 Edge + 局部 Vite 自玩 20 帧/0 浏览器错误，投料三帧显示清水→高亮混色→新汤色，并断言旧液层透明度递减；又直接连接 Owner 已启动的 `http://localhost:5173/?game=game-potion-brewing` 重跑同一探针，20 帧/0 错误、exit 0，截图位于 `shots/owner-5173/`，仅关闭自身隔离 Edge。10 项炼药定向测试、75 文件/569 项 UI 测试、tsc、UI 审计阻断 0、本地 build 均 PASS。`game-skill-audit` 无红旗，唯一墙钟提示属于既有只读指针预览采样，不参与世界/步骤结果。异人局部复查 PASS，见 `review/S6-liquid-continuity-2026-10-15.md`；快速连续输入小于 180ms 尚未验收，Owner 真机审美确认与 S6 人门亦待，不宣称 S6 整体通过。

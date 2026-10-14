# Sprite 平滑采样与无限取料独立复查（2026-10-14）

复查主体：`/root/potion_sampling_review`；与施工主体不同。范围为本轮 `Sprite.sampling` 通用可选字段、坩埚消费、炼药材料无限取用/去份数、2026-10-14 UI 微调及失败紫汤停留帧返修。结论：**本轮定向返修 PASS**；S6 仍有 Owner 美术平台逐行复核，不等于整关或 Owner 人门通过。

## 独立复跑

- `npx vitest run games/game-potion-brewing/blueprint.test.ts games/game-potion-brewing/screen.test.ts src/assembly/validate-manifest.test.ts src/renderer/drag-preview.test.ts`：4 文件、27 测试 PASS，退出码 0。第一次在普通沙箱因 `realpath node_modules/vitest/dist/spy.js` EPERM 于收集前失败（0 tests）；随后仅用受控本地测试权限复跑才取得有效结果。
- `npx vite-node scripts/acceptance-run.mjs --game game-potion-brewing`：5/5 剧本 PASS，其中 `05-repeat-material` 9 检查点；退出码 0。
- `npx tsc --noEmit`：退出码 0。
- `node scripts/game-skill-audit.mjs game-potion-brewing`：PASS、红旗零；告警为 `game-potion-brewing.ts:117` 墙钟 1 处，标注为建议而非红旗。
- `node scripts/potion-s4-browser-probe.mjs --stage=S6`：隔离短时 Vite + 无头浏览器，14 张截图、浏览器错误 0、退出码 0；探针 `finally` 关闭浏览器及本次临时服务，未启动整套 ZeroCraft。访问地址为探针独占的 `http://localhost:5700/?game=game-potion-brewing`。本复查独立重跑，非采信施工者回执。

## 实证与撤修验红

- `src/engine/protocol/components/render.ts:32` 的闭集类型、`src/skills/atoms/sprite/index.ts:63` 的闭集 schema 和 `src/assembly/validate-manifest.test.ts:96-104` 的非法/合法采样断言一致。`src/renderer/canvas-renderer.ts:171` 初始最近邻，`:312-318` 单图切 `smooth`、`finally` 恢复；`src/renderer/drag-preview.test.ts` 真调用渲染器，观测两图的 `drawImage` 采样依次为 `[true,false]`，结束仍 `false`。坩埚在 `games/game-potion-brewing/blueprint.ts:41` 单独选择 `smooth`，其它图未整体改采样。
- 在**内存中**从 `canvas-renderer.ts` 精确抽取 `drawSprite` 方法，断言 `if (sprite?.sampling === 'smooth') ctx.imageSmoothingEnabled = true;` 锚点恰好命中一次，再将该句改成 `if (false)`，转译运行同一个假 Canvas：原实现该图绘制时 `true`，锚定撤修后 `false`，两次返回后上下文均恢复 `false`。输出 `ANCHOR-SABOTAGE: PASS original smooth=true; anchored mutant smooth=false; restoration=false`。共享树没有被改动。此项证明采样分支被观测；并非对整套 Vitest 的源文件破坏复跑。
- `games/game-potion-brewing/blueprint.ts` 不再声明材料 `Resource` 或库存扣减效果，`KeyBinding` 不带库存条件；`blueprint.test.ts` 的重复材料测试证明两次同 ID 推进至第二步，第三次在搅拌步投料进入 `failure`。`screen.ts` 材料卡仅姓名，无数量节点；`screen.test.ts` 对“剩余”和计数节点作反向断言。`game-potion-brewing.ts` 无库存读取/禁用分支。`05-repeat-material` 对重复成功路径提供真引擎对账。
- 无限取料另作**内存锚定撤修**：从 `blueprint.ts` 的 `const POT_X` 到 `buildPotionBlueprint` 提取并转译当前函数，断言材料 `Clickable: { action: addSignal(ingredient.ingredientId), onlyFlag:` 锚点恰好命中一次；在该处重新注入 `Resource: { id: "stock", current: 1 }`。原蓝图该材料 `Resource=undefined`，突变蓝图 `Resource.current=1`，使现有 `blueprint.test.ts` 的 `getComponent('Resource')?.toBeUndefined()` 断言转红。输出 `UNLIMITED-ANCHOR-SABOTAGE: PASS baseline Resource=undefined; anchored mutant Resource.current=1 => existing blueprint Resource-absence assertion RED`。该证据是蓝图函数的内存突变验证，未修改共享源文件或直接复跑整个 Vitest 突变版。

## 告警与边界

- `Sprite.sampling` 缺省时依赖渲染器初始化的 `imageSmoothingEnabled=false` 和各显式平滑路径恢复上下文；当前定向测试覆盖“smooth 后默认图最近邻”。未发现本轮采样泄漏。
- 本复查独立刷新并目击 `self-check/shots/S6-01-start.png`（1440×900）与 `S6-14-wide-centered.png`（2500×1250）。开局图可见卷轴文字/序号各在自身框内，材料卡居中且无数量标记，木架横档仍可见；清水铺至锅口内缘，未见原先黑缝，搅拌棒在前景且尖端没入水面，锅边较旧图平滑。宽屏图三栏整体居中，探针对 `#potion-root` 的边框位置还作了 ≤2px 的对称误差断言。此为本轮指明的两帧和真手势全链的定向目击，**未**形成与原型同画布逐像素差异归零的 S6 总验收，也未替代 Owner 美术复核。
- `public/games/game-potion-brewing/pipeline.json` 中旧“库存 2→1→0”证据属于变更前历史，不可充当新无限取料规则的当前通过证明；本报告不代改流程板，也不代 Owner 签人门。

## 最终 UI 微调的独立再复查（2026-10-14）

- 在最新工作树独立复跑三屏 UI 审计：`node tools/ui-audit.mjs games/game-potion-brewing/{screen,screen-result,screen-exit}.audit.ts --w 1440 --h 900`（实际逐条单独执行）均退出 0；三屏各自重叠 0、硬低对比 0、3–4.5 对比警告 0、border-image 前提缺失 0。审计另有**非阻断**“华丽件命中 0/1/1、house 主题：否”提示；源码 `screen.ts` 的 `POTION_THEME` 实际继承 `apolloBrocade`，程序化卷边/横档和正式素材由 LayoutNode/Canvas 共同呈现，不能把静态分类误报为缺主题，但也没有把这些告警隐藏。
- `npx vitest run games/game-potion-brewing/{screen,blueprint,art,potion-sfx}.test.ts src/renderer/drag-preview.test.ts src/assembly/validate-manifest.test.ts`（实际使用展开的六个文件）：6 文件、35 测试 PASS，退出码 0。
- `node scripts/potion-s4-browser-probe.mjs --stage=S6` 在本地受控测试权限独立重跑：14 张截图、浏览器错误 0、退出码 0；短时 `localhost:5700` 临时服务已由脚本关闭，复查后没有监听。`node scripts/align-count.mjs docs/design/game-potion-brewing/self-check/S6-alignment.md`：✅ 9、⚠ 1（去向齐）、❌ 0，退出码 0；这是施工自证单的计数，不代替本复查判词。
- 直接目击最新 `shots/S6-01-start.png` 与 `S6-14-wide-centered.png`：#2 初始清水已有蓝色双层渐变且贴合锅沿，无透底黑缝；`S6-02-add.png`、`S6-03-stir.png` 可见投料后汤色加深而锅身不变。#7 卷轴上/下卷边由旧纯色块改为带高光的细木纹层，材料架两条横档可见且不再被卡片吞没，五张卡均有居中材料名和原型副文，未见剩余份数。2500×1250 宽屏舞台保持居中。两项定向缺陷本轮**未复现**。
- **当轮发现并已返修的 S6 #4 偏差**：旧 `shots/S6-06-failure.png` 的居中失败 Modal 完全遮住坩埚，定稿 `ui-refs/30-purple-static-failure.png` 则显示静止锅和紫汤。复查人当轮实证报告后，施工者增加弹窗前的失败汤色停留帧；最终独立结果见下一节。旧截图/缺陷保留作返修因果证据，不再代表最新运行态。

## 失败紫汤停留帧返修独立复查（2026-10-14）

- 最新 `game-potion-brewing.ts:110-117` 先把世界终局投影为紫汤，再在普通动效下延后失败弹窗 880ms、成功弹窗 1250ms；`reduced-motion` 选择 0ms。`:187` 销毁清理 pending timer，回调 `disposed` guard 防止销毁后挂 UI；异步瓶图到达只在世界仍 active 或结果弹窗已可见时更新，不能偷跑提前露弹窗。
- 独立复跑 `npx vitest run` 六个前述定向文件：6/6 文件、35/35 测试 PASS，退出码 0；`npx tsc --noEmit` 退出码 0。
- 独立复跑 `node scripts/potion-s4-browser-probe.mjs --stage=S6`：15 张截图、浏览器错误 0、退出码 0。脚本在错误提交后 120ms 明确断言 `#potion-result` 未出现且液面计算底色为 `rgb(97, 83, 102)`，然后拍 `shots/S6-06-purple-before-result.png`；再等待 Modal、拍 `S6-06-failure.png` 并执行重开及后续鼠标/触屏全链。复查人直接目击新增停留帧：紫汤填满锅口、锅静止且无弹窗遮挡；后续失败弹窗正常出现。临时浏览器/5700 服务由探针 finally 关闭。
- 对 `game-potion-brewing.ts` 的 `next.status === 'failure' ? 880 : 1250` 做内存唯一锚点撤修探针：原失败延时 880ms，大于浏览器“120ms 未弹窗”阈值；替换为 0ms 后违反该断言。输出 `RESULT-DELAY-SABOTAGE: PASS failure hold=880ms; anchored removal=0ms would violate browser no-modal-at-120ms assertion`。这是表达式级内存破坏证明，非隔离副本全浏览器突变跑；真浏览器原实现已独立通过。
- 返修判词：原先“失败 Modal 立即盖锅”的可见偏差已在玩家可见链中消除，本轮 #4 局部 PASS。这里不代签 S6 Owner 平台 8 行素材逐行 ☑，也不把 `align-count` 机器绿等同于 Owner 美术认可。

# S2 能力计划与宿主合同 · 施工自检

日期：2026-10-12  
阶段判定：**技术自检 PASS；S2 仍受 S1 Owner 控制台前置约束，且 S2 Owner 人门未通过。**

## 范围与架构判断

- 接受需求：现场搜证可由现有 `t2-clickable`、Flag/Resource、`t2-event-when`、`t2-effect-apply`、`t3-flow`、timeline/presentation、Sprite 与 LayoutNode 重组，不需要游戏层状态机、DOM、Canvas 或自由命中解释器。
- 两个真实缺口都按 Owner A 路下沉通用引擎：静态预烘焙 alpha hit-mask 与宿主动态 HTTPS PNG/mask 桥。两单均已有施工自检和非施工者独立 PASS。
- 游戏层例外为 0；S2 没有创建 `games/**`、Doki app、manifest 或正式生产资产，未越过 S3/S7 边界。

## 验收逐项

1. `capability-plan.md` 实名列出引擎 capability、数据表、解释者、确定性边界、UI/美术槽与代码准入阶梯；`GCI-S2-01/02` 均为 delivered。
2. `dokiworld-contract-v1.md` 冻结 input/output 合同名与 v1、exact-key 规则、ASCII 安全稳定 ID、1–12 对象、64 KiB envelope、131072 mask bits、HTTPS PNG/CORS/尺寸、cover/contain/anchor、rotation 0、preview、completed/cancelled/error、宿主权威和幂等；ID 可直接进入桥的 session/asset key，不需要游戏层映射器。
3. 背景、场景对象与证物图片均声明原生像素尺寸；正式局任何 URL/CORS/解码/尺寸/mask 失败都 fail-closed，不会扩大为矩形点击或产生成功结果。
4. 首次收录幂等由 `collected` Flag 作为转移门；普通对象只 viewed；必需计数由 Resource/effect 更新；完成由 `t2-event-when` edge + flow 表达，没有文字/UI 反推规则。
5. 动态 URL、图片字节和 mask payload 不进入 World/snapshot/hash/Signal/output；World 只持会话临时 key 和纯组件数据。
6. 正式 parser、schema 3 manifest、SDK 假宿主与 dist 属 S7 实现/交付，不作为 S2 设计冻结的循环前置；届时必须逐字实现本合同并重跑上线清单。

## 实证

- 静态 mask 独立复查：`review/REQ-ENG-ALPHA-HIT-MASK-independent.md`，PASS。
- 动态视觉桥独立复查：`review/REQ-ENG-HOST-VISUAL-HIT-MASK-independent.md`，PASS；独立定向 **8 files / 120 tests**，ESLint、DOCS-REF、Vite build PASS；两组唯一锚点撤修均准确转红并恢复。
- `capability-gaps.json` 可严格 JSON 解析，`GCI-S2-01/02` 均为 `route:"engine" / state:"delivered"`。
- `node scripts/docs-ref-guard.mjs`：PASS。
- `node scripts/context-budget-guard.mjs`：共享仓库仍有既有容量红项；本单完成后已按规则从主需求池移除，未把全库红冒称为 S2 全绿。
- 全库 `tsc` 与 `sim-dom-fence` 仍只有复查记录列出的既有无关红项，本单文件零命中。

## 尚未通过的门

- S1 路线图现为 `review / selfCheck pass / review pass / owner required`，必须由 Owner 在控制台终审；agent 不代签。
- S1 未成为 done 前，S2 即使技术自检与独立复查通过，也保持 `blocked`，不得进入 S3。
- S1 前置完成后，S2 才能进入控制台 `review` 并由 Owner 终审。

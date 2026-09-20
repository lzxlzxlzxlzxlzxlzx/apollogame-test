# 第二轮交付索引

状态：外部实验已运行，候选不具备正式入库资格。程序自证，未作独立复查或人工签核。

## 修改文件

- `README.md`：增加第二轮入口，第一轮报告、脚本和图片保持原状。

## 新增文件

- `prompts/card-frame-round-02.txt`：真实生成调用的完整提示词。
- `candidates/card-frame/round-02/candidate-01.png`：原始生成图，1586×992 RGBA。
- `normalized/card-frame/round-02/candidate-01-resized.png`：640×400，仅缩放，保留Alpha。
- `composites/nine-slice-round-02.png`：484×270、900×100、100×600九宫格对照。
- `composites/round-02-{original-ink,ink-proposal}-{1280x720,800x450}.png`：四张带真实控件的离线合成。
- `runtime-preview/index.html`、`preview.ts`、`ink-proposal.css`、`ROUND-02.md`：独立预览与操作说明。
- `runtime-preview/round-02/`：两次真实运行截图、卡框截取、无卡框背景与测量JSON；`collapse-probe.png`仅是未进入倒塌状态的探针结果。
- `runtime-preview/debug.png`：首次载入排查截图。`.vite/`是隔离预览自动产生的可再生依赖缓存。
- `tools/round02.py`、`serve-round02.mjs`、`runtime-round02.mjs`、`finish-round02.py`：导入、检查、预览、复跑和哈希验证。
- `reports/technical-check-round-02.json`、`nine-slice-round-02.json`、`review-round-02.json`：基础检查、拉伸检查与四项分离结论。
- `reports/artifact-hashes-round-02-run-{1,2}.json`、`reproducibility-round-02.json`：两次确定性构建及实时截图稳定性结果。
- `reports/formal-hashes-round-02-{before,after}.json`：四个正式文件SHA256，全部未改变。
- 本文件。

## 结果边界

原图真实Alpha范围0–255，外围可见像素比例0，棋盘格启发式风险0，安全区亮度标准差0.424，文件896881字节；缩放图179792字节。禁止符号由视觉模型检查，未见违规，但不是可靠OCR穷尽证明。

四项结论：技术整体不通过（基础文件检查通过、22px九宫格失败）；视觉方向建议人工评审；实机适配不通过；正式资源准入不通过。

两次测量和9项确定性产物哈希一致。动态实机截图哈希不一致，已保留双方哈希。AI抽取、倒塌判定、竖屏和帧率退化没有通过证据。

所有持久写入均位于实验目录；未改正式源码、素材、索引、台账和生产流程。该standalone目录无Git元数据，未提交或推送。

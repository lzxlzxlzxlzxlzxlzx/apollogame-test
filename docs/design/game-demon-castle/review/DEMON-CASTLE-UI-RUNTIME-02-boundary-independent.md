# DEMON-CASTLE-UI-RUNTIME-02｜真实视觉边界独立复核

日期：2026-10-16  
复核性质：非施工者、小范围真实边界复核。本文只确认当前差异与压力边界，不是完整 HUD 复查，不修复缺口，不给正式 Host 整单 PASS，也不代签 PUI、原型、路线图或 Owner 门。

## 结论

**CONCERNS / 诊断门保持 RED。** 独立运行得到预期 **3 条产品可见差异、exit 1、pageErrors 0**：

1. 入口 hover 实际 `translateY=0`、`brightness=1.07`、无批准的 5px glow；冻结原型要求 `-3px / 1.2 / glow 5px`。
2. 入口 pressed 实际 `translateY=+1px`、`brightness=0.9`；冻结原型要求 `+3px / 0.85`。
3. 合法但极端的 64 字季节名 + 64 字时段名，在 375×812 视口的状态丝带内实际为 `width=285px`、`height=56.015625px`、`font-size=8px`、`line-height=11.2px`，约 5 行，不能保持单行。

分级：Critical 0；Major 0；Minor 0。以上按“未决的产品可见差异 / 通用 authoring 压力边界”记录，不在本局部复核中擅自替代整单缺陷分级或 Owner/PUI 裁决。

## 独立实证

### 冻结基准

- `demon-castle-ui-revision-01.dc.html` 的独立 SHA-256 为 `4c39e9f04dab441945a277bea000ab3db71fd2870996442a1177a4a7d28ee415`，与 `prototype-approval.md` 的 2026-10-16 修订 02 定稿记录一致。
- 原型 CSS 明确给入口图面：hover `translateY(-3px)`、`brightness(1.2)`、`drop-shadow(0 0 5px #d6b6ef)`；pressed `translateY(3px)`、`brightness(.85)`。因此前两条红不是探针自造阈值。
- Owner 已选择“按钮 A：通用 PUI”。本报告只证明当前 Host 与冻结原型尚有可见差异，不把该选择冒充 PUI 已交付或整单已收束。

### 探针真实性与隔离

逐读 `scripts/demon-castle-ui-runtime-02-boundary.probe.mjs` 与真实 fixture 后确认：

- Vite transform 的 fixture 锚点 `date: '蚀月季 第999日（第999天）', slot: '暮色'` 在当前 fixture **恰好命中 1 次**；只在内存把 read model 替换为 64/64 中文名称，没有写共享源文件。
- fixture 使用正式 Demon Castle descriptor / Life package / asset slots，挂载共享 `mountLifeGame` 与真实 AssetManager；未向 Host 传 `StoragePort`。`localStorage`、`IndexedDB` 只出现在“不会访问”的注释中，无调用或导入；极端文案只替换 UI read model，不写 World、save 或 Owner 存档。
- 探针只绑定随机 `127.0.0.1` 端口，不启动 5173 或整套 ZeroCraft。Edge 使用 Playwright 临时 profile；`finally` 明确关闭 browser/server 并删除内部 scratch。
- 为遵守本复核“只永久写本文”的所有权边界，独立执行使用工作区内一次性复制根；执行前后对当前 `src`、Demon Castle 四文件、该游戏 public art 与 fixture 共 **1175 个文件**逐一 SHA-256 对比，`mismatchCount=0`。没有改写共享 self-check 截图或 measurements。

沙箱内 Edge 初始化因临时 profile 权限失败；按授权改用受控沙箱外短生命周期执行。真实输出：随机地址 `http://127.0.0.1:57818/`，三条 failure，`pageErrors=[]`，最终断言 `3 !== 0`，进程 **exit 1**；随后日志确认浏览器、server 与内部 scratch 均关闭/清理。

### 64 字合同与实际截图

- `LIFE_HOST_CALENDAR_LABEL_MAX_LENGTH` 当前为 64；`bounds map entries and display name length without truncating accepted content` 独立点名为 **1 passed / 46 skipped**，证明恰 64 字确实由严格 core 接受，65 字拒收。故第三条红不是绕过 validator 的非法输入。
- 独立目击 `calendar-64-64-375.png`：长季节名和长时段名在顶部丝带内明显折成约 5 行；量测与画面一致，不是 selector、字体加载或断言假红。
- 但这只是**通用 authoring 合法上限压力**，不是当前魔王城策划内容。正式数据仍只有 `eclipse→月相季`、`dawn→黎明`、`night→夜晚`，真实短名称没有触发该极端换行。本报告不得把 64/64 压力现象冒充魔王城实际需求、Owner 挡板，或要求 Owner 先选择极端布局策略。

## 边界判词

- 按钮反馈：真实、当前产品可见、与冻结原型 1:1 不一致；保持未决，等待已选 A 的通用 PUI 实现与后续独立复验。
- 64/64 名称：真实、合法输入下可复现的通用展示上限压力；记录为能力边界，但不阻塞当前魔王城短名称，也不替 Owner/架构方擅定截断、滚动、缩放或改布局策略。
- 本探针 RED 是诚实诊断结果，不是整单 FAIL/PASS 门的代签；未重跑 817 项全量回归，符合本次窄复核范围。

终态：一次性复制根及截图已清理；没有改生产源码、原型、原 calendar 报告、PUI、正式游戏文件或路线图。

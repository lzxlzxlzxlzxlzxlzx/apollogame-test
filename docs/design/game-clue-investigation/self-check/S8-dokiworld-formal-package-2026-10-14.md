# DokiWorld 正式搜证包自检（2026-10-14）

## 范围与结论

正式 App 候选 `dokiworld/game-clue-investigation/`，版本 `0.2.0`；上传候选为 `release/game-clue-investigation/game-clue-investigation-dokiworld.zip`。与先前 0.1.0 文档接收实验包不同，本包接收合同化现场输入、加载宿主背景/物件/证物 PNG 与像素 mask，在玩家收齐必需线索后回传单次结果。Owner 的真实 DokiWorld 上传确认仍待执行；本记录不代签 S8。

## 自检证据

- `npm test`：12/12 PASS。覆盖严格输入/输出、1–12 件范围、字段与图片/mask 边界、真实 UTF-8 64 KiB 超限拒绝、文档内输入输出示例经正式 parser/validator、dist manifest/文档/SHA 文件集合。
- `npm run test:runtime`：1 文件 / 3 项 PASS；生成的 1、7、12 物件 manifest 经真实引擎 registry 与 LayoutNode validator。
- `node scripts/dokiworld-docs-guard.mjs game-clue-investigation`：PASS。
- `npm run build`：PASS；正式构建器生成 dist、包内文档与 SHA 清单。构建警告仍有 random capability chunk 动态/静态导入重叠，以及 minify 后主 chunk 超 500 kB；没有把警告记为静默全绿。
- 正式 ZIP：仓库 Doki 卫生检查与 SHA 清单 helper 校验后按标准 dist 根目录生成，159 个文件、880036 bytes；非施工者确认 ZIP 条目集合等于 dist、逐文件字节相同且 158 条 SHA 全匹配。标准 Python 发布屏 helper 在 Windows 下无法 `CreateProcess('npm')`（WinError 2）而中断；没有改发布屏，改用已成功构建的 dist 与同一卫生/SHA helper 生成本地候选。
- 非施工者 Edge 真浏览器：有效输入握手、CORS PNG 解码与尺寸校验、点击 PNG 热点、收录到宿主 accepted 单次 `complete()`；并实际覆盖 rejected、取消和完成后重开重复收录。每轮零 console warning/error，临时服务与浏览器均关闭。HTTPS parser 唯一锚点撤修命中 1，临时撤检版本错收 HTTP、正式 parser 拒绝；源码前后 hash 未变。详情见 `review/S8-dokiworld-formal-package-independent-2026-10-14.md`，窄范围 PASS。

## 仍未验证/流程状态

- 尚未把正式 ZIP 上传至 DokiWorld；平台真实导入与嵌套 `apps.launch()` 接受由 Owner 操作/确认。
- 全游戏 S8 终检独立复查原记录仍是 FAIL（`review/S8-independent-2026-10-14.md`）：它涉及全库在途改动、全仓测试红与 cart/full-suite 复查口径冲突。本包的局部 PASS 不覆盖或改写该结论。
- 未通过/退回 Owner 人门；未执行远程 Git、远程数据库或整套 ZeroCraft 启停。

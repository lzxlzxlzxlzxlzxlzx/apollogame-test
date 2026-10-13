# GAL-PUI-S3-MODAL-TITLE-COLOR · 自检导航

范围仅 `Modal.titleColor?: LabelColor`：缺省仍 `t.text`，复用 token/custom 安全合同，保留 aria/focus/close。

- 最终定向：相关 UI 回归 46/46，覆盖 custom/token、裸色/注入拒收及旧默认标题色。
- 浏览器：深皮 custom `node tools/ui-audit.mjs tools/audits/gal-s3-modal-title.audit.ts --w 720 --h 420`；浅底默认 `node tools/ui-audit.mjs tools/audits/gal-s3-modal-title-light.audit.ts --w 720 --h 420`（均 exit 0）。
- 撤修：将 Modal title 的 `resolveLabelColor(p.titleColor, t, t.text)` 临时回退为 `t.text`，custom 标题断言必须转红；恢复后重跑。

独立复查：`GAL-PUI-S3-MODAL-TITLE-COLOR-independent.md` 局部 PASS；不签 GAL 亮主题整屏或 Modal 外的文字色。

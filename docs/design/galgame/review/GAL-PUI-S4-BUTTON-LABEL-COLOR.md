# GAL-PUI-S4-BUTTON-LABEL-COLOR · 自检导航

范围仅 `Button.labelColor?: LabelColor`：复用现有 token / 单键安全 custom 合同；缺省字节不变，显式值只覆盖内建文字色。

- 自证：全 `src/ui/components` 回归 68 文件 / 528 测试通过；其中 S4 定向合同为 3 文件 / 40 测试通过。
- 浏览器：`node tools/ui-audit.mjs tools/audits/gal-s4-button-label-color-dark.audit.ts --w 720 --h 420` 及 `node tools/ui-audit.mjs tools/audits/gal-s4-button-label-color-light.audit.ts --w 720 --h 420`（均 exit 0，短生命周期 `file://` 浏览器已关闭）。
- 合同锚点：亮主题夜景 ghost 显式 `skin:''` + `{custom:'#F4EEFF'}`；token/custom 合法，裸色、注入、空值和额外键拒收；ActionSink、原生 disabled/focus 与 theme/node skin 路径不改。
- 撤修：将 `renderButton` 的 `labelColorStyle` 临时固定为空，custom 色输出断言必须转红；恢复后重跑。

撤修实证：`labelColorStyle=''` 后 `skin-layer-and-modal-title.test.ts` 精确 2 项转红（custom 与 token 输出锚点）；恢复实现后完整 UI 回归恢复 68/528。`npx tsc --noEmit --pretty false` 仍由既有 `game-card-reveal`、`game-dice`、`game-theft`、`launcher` 诊断退出 1；未见本票文件诊断。

独立复查：`GAL-PUI-S4-BUTTON-LABEL-COLOR-lead-independent.md` 局部 PASS；仅放行 GAL 的纯数据消费，不签 S5/S6、原型 1:1 或项目里程碑。

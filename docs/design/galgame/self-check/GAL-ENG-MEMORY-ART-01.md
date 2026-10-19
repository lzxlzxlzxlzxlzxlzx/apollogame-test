# GAL-ENG-MEMORY-ART-01 · 回想图数据槽施工自证（2026-10-13）

Owner 对回想图数据槽选择 A。本票只增加可选 `previewImage` / `lockedImage` key 与闭集消费；未创建、批准或登记任何新图片。`docs/design/galgame/gal-art-01a-media-candidates-2026-10-13.md` 是待审候选清单，不是资产台账。

- 严格校验：字段可缺省；存在时只能是资产 key，保留旧 `art:`/`audio:`/`video:` namespace 并拒绝 `file:`/`javascript:`/`data:`、绝对路径与异常分段；传入 resolver 时还需可解析。旧 GallerySpec 继续可用。独立复查先发现无 resolver 的伪 scheme 漏网，施工侧补守卫后重新复跑，不能把修前结果冒充最终通过。
- 投影隔离：未解锁卡只投影 `lockedAssetKey`，不把 `previewImage`、标题或重播动作送到 UI；解锁卡只投影预览 key。
- 画面降级：已给且能解析 URL 才渲染 Image 与 V2 深色遮罩；缺 key/URL 时保留原占位暗卡。深亮 `gallery-memories-art` 静态 `file://` 探针均加载两张夹具图，锁态未出现重播键。现用的是已登记 demo 背景/框皮作**功能夹具**，不代表新内容素材获批；隔离浏览器已关闭。
- 修后 `npx vitest run src/services/gal-ui src/assembly/gal-package.test.ts src/assembly/gal-package.review.test.ts src/assembly/gal-world.test.ts --maxWorkers=2 --minWorkers=1`：12 文件 108/108，退出 0；`npx tsc --noEmit --pretty false`：退出 0。默认沙箱的 Vite `realpath EPERM` 未收集测试，随后经受控隔离进程复跑才获得上述结果；不把 EPERM 轮次记绿。

独立复查另见 `../review/GAL-ENG-MEMORY-ART-01-independent.md`，尚不由施工者签结论。完整 S5/S6 仍需逐件图片许可/审美批准、入库、同内容同画布对照及关键帧验收。

# GAL-ART-01A 存读档系统框增量独立复查（2026-10-14）

结论：**指定增量局部 PASS**。复查人不是施工人；只核 V2 存读档系统框新增的作品品牌、容量说明、底栏双操作及无图/旧切片回退。此结论不等于完整 S5/S6、最终美术、全库门禁或 Owner 人门通过。

## 独立证据

- 范围：比对施工自证 `../self-check/GAL-ART-01A-slots-system-chrome-2026-10-14.md`、定稿同画布 `../gal-ui-v2-save.png`、当前实现 `src/services/gal-ui/gal-ui-structure.ts`、`gal-ui-art.ts`、宿主 `gal-ui-slice-host.ts` 和相关测试。共享树有大量其他项目在途更改；本复查未改实现、素材、原型、工单或路线图。
- 独立复跑 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-read-model.test.ts`：2 文件 31/31，exit 0；`gal-ui-slice-host.test.ts`：34/34，exit 0；`npx tsc --noEmit`：exit 0。首轮沙箱内 Vitest 在 `node_modules/vitest/dist/spy.js` 的只读 `realpath` 遇 EPERM、0 测试执行，受控重跑通过；不能把首轮算测试失败或绿灯。
- 独立 `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-slots.audit.ts`：exit 0；40 个绝对定位元素、重叠 0、硬对比失败 0、3–4.5 警告 0、border-image 前提缺失 0；house 主题与 5 个 skin 命中。审计逻辑画布为 1060×760，不替代 1440×900 截图。
- 独立隔离 `node src/services/gal-ui/verify-gal-art-live.mjs`：静态临时 Vite 构建 + Edge，exit 0；输出定向到独立 Temp 目录，访问 `file:` 静态页，结束后浏览器、构建和截图目录均清理。存档/读档深浅四态实测作品标题 `✧ 月影书简`（来自夹具 model.title，非通用模板硬编码英文名），品牌 y=14，容量说明为 `每页 4 × 3 = 12 个存档位 · 选择后操作`、y=126；操作框 x=1096、y=785.5、124×44，返回框 x=1232、y=785.5、124×44；系统框 1404×830。浏览器脚本也核图片装载和底栏 ActionSink。
- 实际截图与 `gal-ui-v2-save.png` 在 1440×900 同画布目击：三处增量目标可见；原型使用英文演示品牌与演示槽内容，当前数据化中文作品标题和夹具槽内容属预期数据差异，不把它误判为几何一致或终图审批。卡片文字/终图质感等其余差异仍归 S5 差异单。
- 无图、旧切片结构：`gal-ui-art.test.ts` 点名断言这三处只在已载入的 V2 系统框与非切片槽皮共存时出现；纯默认和旧切片树均无新增节点，`validateLayoutNode(v2)` 零 issue。返回按钮的 `action` 是 `gal.slot.back`；宿主 `gal-ui-slice-host.ts` 消费该动作并返回先前页面，相关宿主测试独立通过。
- 撤修验红：从 `gal-ui-structure.ts` 读取容量说明的**唯一**源码锚点（命中数=1），用 Vite `transform` 仅在独立临时构建的内存模块中替换成 ASCII 标记 `MUTANT_CAPACITY`；隔离浏览器读到该标记，原文断言转红；原源码和其他在途文件未改，恢复正常构建后上列浏览器基线为绿。首次变异试跑因临时 HTML 漏 charset 产生乱码，补 `meta charset=utf-8` 后重跑明确 `ANCHOR=1 MUTANT=MUTANT_CAPACITY ORIGINAL_EXPECTATION=RED`、exit 0。

## 限制与判词

这是系统框局部闭集接线的 PASS，不覆盖所有按钮四态、完整逐像素一致、卡片文字和已填槽预览终图、首作素材来源/许可或发行范围。全库 `scoped-gate` 的共享树依赖违规与本地基线缺失未在本次复查中解决，也不由本票代签 S5/S6 或路线图 Owner 门。项目路线图本次未改，仍应保持 `media-and-final-skin` active、门禁待完成。

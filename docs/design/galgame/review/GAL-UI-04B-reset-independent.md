# GAL-UI-04B 恢复默认 Profile 基础接口独立复查

- 复查主体：非施工 agent `/root/review_gal_reset`；日期：2026-10-12。
- 边界：仅 `src/services/gal-profile/gal-profile.ts` 的 `resetGalProfilePreferences` / `persistGalPreferencesReset` 与其定向测试；不签设置页启用、不签 `ui-settings-confirmations` 整个里程碑或全库门禁。
- 判词：**局部 PASS；范围审计和全库门禁未签。**

## 独立核证

1. `src/services/gal-profile/gal-profile.ts:210` 只替换 `preferences`，其余 Profile 事实由对象展开保留；默认值由当前包的 `createGalProfile(pkg)` 给出，包身份不符抛 `CorruptSaveError`。`gal-profile.test.ts:210` 验当前版本全部偏好恢复、已读与 CG 解锁保留、幂等和无操作不重写时间戳。
2. `gal-profile.ts:270` 通过 `serialGalProfile(pkg.id, ...)` 在同一包的读－改－写队列中加载最新 Profile，并只在 `saveGalProfile` 成功后返回更新结果；写失败向调用方抛出，队列可重试。`gal-profile.test.ts:231` 验失败写入后旧确认仍在、下一次重置成功。`gal-profile.test.ts:119` 的真实 V1 信封迁移回归仍通过。
3. 独立运行 `npx vitest run src/services/gal-profile/gal-profile.test.ts --reporter=verbose`：退出码 **0，13/13**。相邻 `gal-confirmation-policy.test.ts` 和 `narrative-profile-bridge.test.ts`：退出码 **0，15/15**；未见测试告警。首次沙箱运行因读取 `node_modules/vitest/dist/spy.js` 报 `EPERM`，**0 条测试执行**；经受控放行重跑后才采信上述绿灯。
4. 隔离副本撤修验红：对副本唯一锚点 `const preferences = createGalProfile(pkg).preferences;`（原件 `gal-profile.ts:212`）改为保留 `profile.preferences`，并让副本测试只导入副本实现。锚点及导入路径均实查命中；Vitest 退出码 **1，2/13 红**，恰为 `gal-profile.test.ts:210` 的重置值断言与 `:231` 的失败写入断言。副本随后删除；原件未改。
5. 额外隔离测试将恢复默认与另一确认切换并发提交；退出码 **0，14/14**（原 13 条加 1 条）。最终 `autoDelayMs` 回包默认 `500`、`overwrite=true`、后续 `load=false`、既有 CG 解锁仍在，信封时间戳为后续写的 `42`；临时用例随后删除。与 `gal-profile.ts:237` 的包级串行实现一致。
6. `src/services/gal-ui/gal-ui-settings.ts:142` 仍把“恢复默认（待接入）”显示为禁用并派 `gal.unavailable`；本票没有把未接入的音频/画面等设置伪装成可用。启用按钮仍须等全部纳管偏好有真实消费者，符合 `docs/design/galgame/requests.md:196` 的定稿边界。

## 未签范围

- 未调用任何 Git 命令；Owner 禁令下无法以 `git diff --stat` 审计本票相对于提交基线的文件范围，故本单只基于所见文件与运行证据签局部语义。
- 未运行全库 `tsc` / `vitest` / build，也未作浏览器 UI 验收；本次无服务启动、无数据库操作。设置页全功能与 V2 S5/S6 差异仍在项目控制台 `ui-settings-confirmations` / `media-and-final-skin` 里程碑内。

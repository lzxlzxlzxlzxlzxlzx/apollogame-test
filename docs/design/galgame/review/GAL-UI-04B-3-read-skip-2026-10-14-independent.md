# GAL-UI-04B-3 已读快进 / Profile V6 独立复查（2026-10-14）

判词：**指定增量局部 PASS**。复查者与施工者不同；本判词不覆盖 PUI StoryRef 逐字完成接口、其他设置消费者、全局恢复默认、S5/S6、素材或 Owner 人门。

## 范围与实证

- 对照施工自证 `self-check/GAL-UI-04B-3-read-skip-2026-10-14.md`、工单及当前共享树 diff。增量落在 `src/services/gal-profile/gal-profile.ts`、`src/services/gal-ui/gal-playback-scheduler.ts`、`gal-ui-settings.ts`、`gal-ui-slice-host.ts` 与对应点名测试；共享树另有大量其他在途文件，不把全树 diff 归于本票。未发现此增量触碰 `src/ui/**`、冻结原型或资产索引。
- 独立执行 `npx vitest run src/services/gal-profile/gal-profile.test.ts src/services/gal-ui/gal-playback-scheduler.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts`：3 文件、62/62 通过、退出码 0。首轮默认沙箱在测试收集前遇 `node_modules/vitest/dist/spy.js` 的 Vite `realpath EPERM`，0 测试执行；受控本地非沙箱同命令复跑成功。该环境告警不记为测试通过，也不掩盖之。
- `gal-profile.ts` 的 `GAL_PROFILE_SCHEMA=6`、`migrations[5]` 将 V5 严格解码后补 `readSkipEnabled:true`；`loadGalProfile` 只读打开旧封套。`gal-profile.test.ts` 点名核 V5 封套读取后字节/对象未被写回、旧 `skipMode` 保留、V6 偏好写入与非法布尔拒绝。`normalizePreferences` 以精确字段和布尔类型拒绝损坏 V6。
- `gal-playback-scheduler.ts` 的初次 reconcile 与已排队回调均按当前帧 `read ? readSkipEnabled : skipMode==='all'` 判定；`gal-playback-scheduler.test.ts` 点名核已读关/未读开、其反向许可、晚到偏好变化、旧 epoch、StoryRef 变更、时钟失败和边界停止。宿主 `gal-ui-slice-host.ts` 在文本设置页且有播放时钟才接受具名 `gal.settings.skip-read`，只收 `true/false`，持久化成功才更新 Profile；对应宿主测试核非法参数、重开、已读行停止、无任务与加载取消。

## 独立撤修验红与复现

未编辑共享实现。将 `gal-playback-scheduler.ts` 源码读入内存，先断言唯一锚点 `frame.read ? frame.readSkipEnabled : frame.skipMode === 'all'` 恰好命中 1 次，再仅在内存转译副本中把已读分支误改为 `skipMode==='all'`。同一隔离时钟/帧 `read=true, readSkipEnabled=false, skipMode='all'` 下，原版 `mode=off, tasks=0, reason=disabled`；破坏版 `mode=skip, tasks=1`，预期反例由绿转红。无文件需要恢复。这证明“未读允许”不得偷偷重新启用已读快进，不依赖施工者自述。

## 告警与边界

- 当前手册 `save-platform.md` 的 GAL Profile 行仍称 V4 迁移，已落后于 V6 代码；应由相应维护者随后更新，不据此否定代码局部行为。
- 本次未独立复跑施工方所报 98 文件/788 测试、真浏览器四页、全库 scoped-gate；不可转述为本复查通过。共享树全量门禁及 PUI StoryRef 接口仍待各自责任方证实。
- 项目控制台 `media-and-final-skin` 仍为 `active`，`selfCheck/review=pending`、`owner=required`；本局部 PASS 不改变里程碑或 Owner 人门。

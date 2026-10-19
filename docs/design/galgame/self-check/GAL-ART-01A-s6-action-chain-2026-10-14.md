# GAL-ART-01A · S6 真实宿主动作链局部自证（2026-10-14）

结论：**施工侧局部通过，待非施工者独立复查**。这张单只证明无素材的结构夹具中，已存在的闭集动作可以跨屏完成一个关键玩家循环；不证明 V2 有图终态、全按钮状态、全部时序或整个 S6 完成。

## 实查与边界

- 当前 `requests.md` 与 S5 差异单已记载 S6 焦点/弹窗/键盘链独立局部 PASS，故本轮没有重复改它，也未修改定稿原型、PUI、Profile、资产或运行时实现。
- 新探针 `src/services/gal-ui/verify-gal-s6-action-chain-live.mjs` 构建现有 `gal-ui-live-wheel.audit.ts`，使用真实 `GalSliceHost`、`mountUI`、World 与**仅内存** Profile/手动存档端口。只启动短时隔离 Edge 和 `file://` 静态页，不接 Owner 浏览器、远程数据库或整套 ZeroCraft；`finally` 关闭浏览器并清理临时构建。
- 探针不提供美术资源，截图是 1440×900 **结构夹具**。其中无图立绘、条纹底、旧切片存档页与已获 V2 有图局部复查的视觉不是同一验收对象，不得拿这些图给 S5 终图签字。

## 玩家循环与断言

| # | 玩家可见动作 / 结果 | 证据 |
| --- | --- | --- |
| 1 | 首页开始进入序章，点击台词进入两选项 | [开局](shots/GAL-ART-01A-s6-01-start.png)、[选择](shots/GAL-ART-01A-s6-02-choice.png) |
| 2 | 空的 2 号槽在读取页不可提交，权威槽仍空 | [空槽](shots/GAL-ART-01A-s6-03-empty-load.png)、探针 `isDisabled`/`slot2` 断言 |
| 3 | 选第一封信后保存 2 号槽，槽状态由空变已填 | [已存](shots/GAL-ART-01A-s6-04-saved.png)、`slot2` 真值 |
| 4 | 滚轮回滚至选项并改选第二封信；再读 2 号槽回到第一分支 | [改选](shots/GAL-ART-01A-s6-05-rechoice.png)、[读档](shots/GAL-ART-01A-s6-06-loaded.png)、真实 ref 对比 |
| 5 | 回想从画廊进入隔离剧情，不出现手动保存键；退出后活动 World 哈希与已读集合未被回想改写 | [回想](shots/GAL-ART-01A-s6-07-replay.png)、哈希/Profile 断言 |
| 6 | 返回主页重新开始后，剧情回到开局；手动槽仍在，且新局还能继续推进到选项 | [重开](shots/GAL-ART-01A-s6-08-restarted.png)、ref/槽/继续推进断言 |

短时浏览器探针退出 0，八张截图已目击，页面错误为空，浏览器及临时构建已关闭。相邻 `gal-ui-slice-host.test.ts` + `gal-manual-save.test.ts` 共 44/44，`npx tsc --noEmit` 退出 0。画面占位、已填槽预览缺少真实媒体、关键帧、全按钮四态及 PUI 04B-1 仍是独立差异，整体 S5/S6 和项目 Owner 人门保持未通过。

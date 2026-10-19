# 月影魔王城 · 共享 Life Host 真机试玩验收包

工单：`SIMLIFE-DEMON-PLAYTEST-01`  
状态：**导航可发现性机器预检待独立复查；owner 真机目击待执行**  
目标：只验收已正式物化的 `game-demon-castle` 能被共享 Life Host 发现、启动、显示已批准素材，并完成三段建设主线；本单不新增玩法、宿主或游戏私有 UI/TS。

## 1. 生产代码判断

**Production zero-code verdict：接受。** 当前正式四文件已经满足 launcher catalog、共享 host 与本地 AssetIndex 的既有契约，不需要新增生产代码。为让本试点持续可复现，测试位于 `src/authoring/demon-castle-playtest-contract.test.ts`（正式游戏目录必须严格只含四个 canonical JSON），锚定正式四文件发现、共享 host mount、26 个槽位/索引闭合、owner 审批元数据、素材实际字节 hash 与 art URL，并通过真实语义 action 流水线完成三段建设主线；它不改变运行时行为。

机器静态事实：

- 固定发现：`games/*/life-launcher.json`、同目录 `life-host.json`、`life.json`、`asset-slots.json`。
- 本游戏运行时 ID：`life:game-demon-castle`；catalog 条目 `status=playable`、`diagnostics=[]`。
- 唯一共享入口：`LifeGameRunner → mountLifeLauncherItem → mountLifeGame`；没有魔王城 loader 分支或私有 game TS。
- 正式 descriptor：`slug=artSlug=game-demon-castle`；共享美术加载 URL 为 `/games/game-demon-castle/art/index.json`。
- 本地 AssetIndex：26 个 `filled texture`，与 26 个正式槽位闭合；每项均有 `ownerDecision=approved`，served file 存在且 SHA-256 与 index 一致。

## 2. Owner 启动与页面入口

请使用全新的隐私窗口或临时浏览器配置，避免旧自动存档跳过开局；不要清理日常浏览器数据。

启动命令由 owner 在仓库根目录执行：

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

成功日志应包含 Vite `Local: http://127.0.0.1:5173/`，端口被占用时命令必须报错而不是悄悄换端口。停止方式：在同一终端按 `Ctrl+C`。

精确直达页面：

```text
http://127.0.0.1:5173/?game=life%3Agame-demon-castle
```

浏览器验收窗口内容区优先设为 1440×900、缩放 100%，但正式逻辑画布统一由 `life-standard-v1` 决定：宿主 `900×620`、顶栏安全区 `52`、格边长 `32`、相机 `28×19` 可视格。响应式 `cover` 只改变显示比例；不得改变逻辑格、可视格数或 HUD 安全区。截图必须记录实际 viewport。

## 3. 控制方式

| 输入 | 语义 |
| --- | --- |
| `WASD` / 方向键 | 连续移动；松键应立即停止 |
| `E` | 请求当前位置互动；唯一可用项可直接执行，多项时打开菜单 |
| `Tab` / `Shift+Tab` | 菜单下一项 / 上一项 |
| `Enter` | 确认当前项 |
| `Esc` | 返回上级或关闭菜单 |
| `T` | 推进当前时段 |
| `N` | 推进到下一天 |
| 鼠标 | 可直接点击互动菜单叶项和 HUD 的 T/N 控件 |

每次互动以 play-field 中的玩家位置、目标实体、弹出的互动菜单，以及 HUD 的地点/背包/目标变化为准；不要用坐标猜测是否到位。共享 HUD 必须始终显示当前场景名。出口格使用青色内框/门柱标记；玩家站上出口格时，黄色当前格外框与青色出口内框应同时可辨，并出现带目的地的 `……（E）` 提示。

## 4. 六步完整试玩路径

### ① 启动并进入共享 Host

打开直达 URL，等待标题与画面稳定。

应观察：

- 没有 launcher 回退、白屏或 `data-life-runner-error` 错误遮罩；
- HUD 标题为“月影魔王城”，初始目标为“收集月木与影矿，修复庭院中的王座厅。”；
- HUD 地点为“月影庭院”；
- 日期/月相为 eclipse 第 1 日、dawn；背包有 4 份月铃种子；
- 右上角只有共享壳层齿轮菜单。

截图：`PT-01-boot-1440x900.png`，必须同时包含标题、初始目标、日期/时段、背包和完整 play-field。

### ② 移动与批准素材实显

用 WASD/方向键在庭院移动，分别靠近王座厅、温室遗迹与石像鬼工匠；松开所有方向键后观察角色停止。

应观察：

- 月影魔王少女为透明背景像素角色，不是纯色占位；王座厅、温室、石像鬼与庭院地砖均显示对应图像；
- 角色脚点、碰撞、镜头跟随和提示锚点一致，没有半格漂移、裁切或 HUD 遮挡；
- 黄色当前格必须包含玩家精灵的底部中心脚点；连续移动尚未跨过格边界时高亮不得提前跳格，脚点越过边界时高亮、互动格与碰撞格必须在同一帧切到正侧格；
- 石像鬼/月井使者等 NPC 的贴图以自身 footprint 底部中心落在地图位置，不得把图片左上角当判定点；
- 在同一浏览器 viewport 下与 Little Valley 对照时，单格屏幕比例、28×19 可视格和顶栏安全区一致；魔王城角色/建筑差异只来自各 AssetSlot 的 `render.display` / `render.anchor`；
- 浏览器 Network 过滤 `/games/game-demon-castle/art/`：`index.json` 与 PNG 请求均为 200，不应出现 404；Console 无启动异常。

截图：`PT-02-courtyard-approved-art.png`，至少同时出现玩家、一个 NPC、王座厅或温室和庭院地砖。

### ③ 收齐第一章建设材料

从庭院东侧森林拱门进入月影森林，靠近 `moonwood-fallen-log`，按 E/菜单执行 `forage` 直到获得 **4 月木**；经西侧出口返回。再从庭院南侧地穴楼梯进入地下工坊，靠近 `shadow-ore-vein`，执行 `mine` 直到获得 **3 影矿**。

应观察：

- play-field 依次切换为森林、地下工坊对应的批准地砖与实体组合；warp 后玩家出现在合法入口，且能在各场景触发对应的 forage/mine 互动；
- 森林入口到达后 HUD 显示“月影森林”，出口格提示“返回月影庭院（E）”；工坊入口到达后 HUD 显示“地下工坊”，出口格提示“返回月影庭院（E）”；无需先离开入口格即可按 E 返回，也不得在无输入时自动弹回；
- 庭院↔森林、庭院↔地下工坊各往返两次；键盘 E 与鼠标点击菜单叶项各至少覆盖一次，切场景后旧互动菜单必须关闭且不得执行旧场景选项；
- 月木倒木、影矿矿脉、森林/工坊地砖使用批准素材；
- 每次采集后背包数量增加、资源剩余递减；资源耗尽后不能继续凭空产出；
- 此时靠近 `forge-core` 可看到 build 目标，但温室前置未完成时应显示 locked/不可用，这属于正确状态。

截图：`PT-03-materials-and-scenes.png`。至少保存一张能同时证明场景素材和背包 `月木×4 / 影矿×3` 的画面；若一张无法容纳，可加 `PT-03b-undercrypt.png`。

### ④ 完成王座厅建设

返回庭院，走到 `throne-hall` 合法交互距离，按 E；若出现多项菜单，用 Tab 选 build、Enter 确认。

应观察：

- build 在材料齐全时为可用，不得继续 `zone-disallowed`；
- 背包准确扣除 2 月木与 1 影矿；王座厅由破败图切换为 `throne-hall-restored` 批准素材；
- 目标从“点亮王座厅”切换为“修复月庭温室”；石像鬼关系 +10、月井使者关系 +5；
- 建成后再次靠近王座厅时不应再出现 build 菜单项，因此无法重复建造，也不得再次扣材料；`already-completed` 是陈旧/伪造 action 的系统防线，不作为当前 UI 的可见文案要求。

截图：`PT-04-throne-restored.png`，必须包含修复后建筑、更新后的目标和材料余量。

### ⑤ 种植月铃并完成温室

在庭院花圃选择至少两格：依次执行 till、water、选择 moonbell seed、plant；两块地都完成后按 N 到下一天、再次浇水，再按 N 到成熟日并 harvest 两朵月铃。靠近 `greenhouse-ruin` 执行 build。

应观察：

- seeded → growing → mature 三阶段均使用批准月铃作物素材；N 推进日期且移动不会卡住；
- 收获后背包至少有 2 月铃花；温室 build 可用并准确扣除 2 月铃花与 1 月木；
- 温室切换为 `greenhouse-restored`；目标切换为“唤醒地底熔炉”；月井使者关系 +12；
- 温室完成前 forge 必须 locked，完成后 forge 才能进入材料判定。

截图：`PT-05-greenhouse-restored.png`；另建议保存 `PT-05a-moonbell-mature.png` 证明成熟作物素材实际消费。

### ⑥ 唤醒熔炉并查看首章反馈

进入地下工坊，靠近 `forge-core` 执行 build；完成后按 T 切到 night，可与工坊中的石像鬼交谈。随后返回森林与月井使者交谈，选择“熔炉苏醒后，我们要去哪里？”并确认最终台词。

应观察：

- forge build 可用，准确扣除余下 2 影矿与 1 月木；熔炉切换为 `forge-core-awakened` 批准素材；
- “唤醒地底熔炉”完成，第一章没有仍 active 的旧节点；石像鬼关系 +15；
- night 时石像鬼调度到工坊；对话能显示相应角色、选项和“向北的雾门将会开启……”反馈；
- 三个建设点均已由真实玩家路径证明 build：王座厅、温室、熔炉。刷新页面后自动存档应恢复完成状态，而不是回到破败外观。

截图：`PT-06-forge-and-chapter-feedback.png`，必须包含苏醒熔炉或最终对话；建议另存 `PT-06b-restored-after-reload.png` 证明恢复。

## 5. 三建设点强制验收矩阵

| 建设点 | 正确前置 | 完成前可用性 | 完成后的画面/状态 |
| --- | --- | --- | --- |
| `throne-hall` | 2 月木 + 1 影矿 | `build available` | restored 皮肤；温室节点 active |
| `greenhouse-ruin` | 王座旗标 + 2 月铃花 + 1 月木 | 王座前 locked；王座后 available | restored 皮肤；熔炉节点 active |
| `forge-core` | 温室旗标 + 2 影矿 + 1 月木 | 温室前 locked；温室后 available | awakened 皮肤；首章终点 completed |

任一点在正确前置满足后仍 `zone-disallowed`、不出现 build、错误扣料、重复扣料、完成皮肤不切换或剧情节点不推进，均判 **FAIL**。

## 6. 批准素材必测矩阵

至少在截图序列中真实出现以下类别：

- 玩家：`player:moon-demon`；
- NPC：`npc:gargoyle-artisan`，推荐同时覆盖 `npc:moonwell-keeper`；
- 三张地砖：庭院、森林、地下工坊；
- 资源：月木倒木、影矿矿脉；
- 作物：seeded、growing、mature 至少 mature 必须留图；
- 建筑初始/完成对：王座厅、温室、熔炉三组必须各看到至少一次状态切换。

机器测试已验证 26/26 index 条目批准、存在且 bytes hash 正确；真机门验证的是它们确实被浏览器请求并绘制，而不是仅存在于台账。

## 7. 失败分类与回报格式

| 分类 | 典型症状 | 必须附带 |
| --- | --- | --- |
| `DISCOVERY` | 直达 URL 回到货架、条目不可运行 | 完整 URL、页面截图、Console |
| `HOST` | 白屏、错误遮罩、HUD/Canvas 缺失 | viewport、Console 首个错误、截图 |
| `ART` | 纯色回退、错图、404、完成皮肤不切换 | asset key、Network URL/status、前后截图 |
| `INPUT` | 松键后继续移动、E/Tab/Enter 无响应、到达出口自动弹回或不能立即显式返回 | 按键序列、场景/位置、录屏或连续截图 |
| `NAVIGATION` | HUD 场景名错误、出口格无青色标记、提示缺目的地、往返后旧菜单残留 | 场景、出口、输入方式、提示文字与连续截图 |
| `BUILD` | 前置满足后仍 locked/zone-disallowed、扣料错误 | 建设点、背包、目标、提示文字、截图 |
| `STORY` | 节点/关系/对话未推进 | 建设点、完成前后目标/关系、对话截图 |
| `SAVE` | 刷新后状态丢失或恢复错误 | 是否隐私窗口、刷新前后截图、Console |
| `LAYOUT` | 1440×900 viewport 下遮挡、裁切、提示出屏，或与 Little Valley 的格比例/可视格/HUD 安全区不一致 | viewport、浏览器缩放、整页截图与同尺寸 Little Valley 对照截图 |
| `POSE` | 黄色当前格与人物脚点分离、提示漂移、跨格时判定/高亮不同步，或 NPC 以图片左上角落位 | 静止截图、跨格前后连续截图/录屏、场景与移动方向 |

统一回报模板：

```text
结果：PASS / FAIL
浏览器与版本：
viewport / 缩放：
是否全新隐私窗口：
失败步骤与分类：
场景 / 建设点 / HUD目标 / 背包：
实际结果：
预期结果：
Console 首个错误：
Network 失败 URL：
证据文件名：
```

## 8. 当前机器证据与 owner gate

- `src/authoring/demon-castle-playtest-contract.test.ts` + launcher/host/art 定向：**6 files / 35 tests PASS**。
- 新测试 ESLint：PASS。
- 正式四文件 discovery、共享 host mount、art slug/URL、26 槽闭包与 26 份批准素材 bytes：PASS。
- 正式包真实语义流水线已自动完成 4 月木/3 影矿采集、王座建设、两格月铃两日成长/收获、温室建设、熔炉建设，并断言三个建设/旗标/剧情节点全部 completed、材料准确清零：PASS。
- `SIMLIFE-POSE-ANCHOR-01` 机器探针覆盖 Little Valley 与 Demon Castle 正式包的静止/连续脚点、floor 格边界、LifeActivityContext、相机可视约束、WorldUI 锚点、AssetSlot display/fit/anchor/offset 与 snapshot/hash 只读边界；扩展回归 **14 files / 130 tests PASS**，仍需 owner 真机截图确认视觉结果。
- 端口 5173 当前无 listener；按 Owner 禁令，agent 未启动 Vite，也没有伪造浏览器截图。

本验收包完成不等于 owner gate 通过。只有 owner 真机完成六步、提供截图/反馈并明确判定后，路线图 owner gate 才能推进。

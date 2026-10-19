# 经验证修复协议（Debug Skill Protocol）

> 吸收自 OpenGame 的 **Debug Skill**：维护一份"经验证修复的活协议"，把反复出现的
> 集成/运行时错误按 **症状(signature) → 根因 → 修复 → 守卫** 立档，下次同症状直接复用。
> 这里只收**真在本仓库发生过、且已修复并有守卫**的条目（不收臆测）。新修一个就追加一条。

格式约定：每条含 `症状`（可据此匹配的报错/现象）、`根因`、`修复`、`守卫`（防回归的测试/机制）。

---

## FIX-001 · 数据透视器一打开就白屏

- **症状**：进入 🔬 数据透视器（当时的默认游戏·该旧作已删）整页空白；控制台 `TypeError: Cannot read properties of undefined (reading 'length')`，栈指向 `FieldEditor` 的 `buf.length`。tsc/build/单测全绿却白屏。
- **根因**：蓝图里**可选字段值为 `undefined`**（如 `Tween.loops`）。`kindOf(undefined)` 落到 `'json'` → 编辑器初值 `JSON.stringify(undefined) === undefined` → `buf` 为 `undefined` → `buf.length` 抛错 → React 卸载整棵树。**没有任何检查真正渲染过该组件**，所以静态全绿。
- **修复**：① `inspect.ts` 加 `fieldKind(value, declaredType)`：值缺省时用 capability schema 的声明类型挑编辑器，不再落 `'json'`。② `FieldEditor` 初值对 `undefined/null` 一律取空串；`commit` 加"未改动不写"护栏。
- **守卫**：`src/studio/inspector.render.test.tsx` —— `renderToString` 真渲染默认游戏（当时的默认蓝图含该崩溃字段）；并断言"缺省值字段不得被判成 json"不变式。
- **通用教训**：**纯静态检查（tsc/build/单测）不渲染组件 → 抓不到渲染期崩溃**。React 组件要有一条 `renderToString` 烟雾路径。

## FIX-002 · Windows 启动 `FileNotFoundError [WinError 2]`

- **症状**：`python3 zerocraft.py` 在 Windows 上 `check_env` 处崩，`subprocess.call(['npm','install'])` 抛 `WinError 2 系统找不到指定的文件`。
- **根因**：Windows 上 `npm`/`npx`/`vite` 是 `.cmd` 批处理外壳；`subprocess` 直传裸名列表 → `CreateProcess` 找不到可执行映像。launcher 原本 POSIX-only。
- **修复**：单点跨平台壳 `_spawn(cmd)`：Windows 走 `shell=True`（cmd.exe 按 PATHEXT 解析 `.cmd`），POSIX 原样 list 执行（行为不变）。所有 npm/npx/git 调用都走它。另把 `find|wc` 的 unix-ism 换成 `pathlib`。
- **守卫**：`_spawn` 两分支产物已核对；`python3 zerocraft.py typecheck` 经壳跑通真实 `npx tsc`。（真·Windows CI 是待办。）
- **通用教训**：任何 `subprocess` 调 node 工具链要考虑 Windows 的 `.cmd` 外壳；不要假设 POSIX。

## FIX-003 · 生产流程板报“解析失败”并显示 `node` 乱码

- **症状**：生产流程板整页报 `解析失败: 'node' �����ڲ����ⲿ���...`；Vite 前端仍可运行。
- **根因**：API 与 Vite 可由不同进程、不同时间启动；长驻 Python API 的继承 PATH 不一定包含后来可用的 Node.js。流程板用 Windows shell 执行裸 `node`，命令不存在时 `cmd.exe` 输出本地代码页文本，接口又按 UTF-8 解码，遂同时出现“找不到 node”和乱码。Vite 默认解析 `localhost` 到 `::1` 时还会让文档中的 `127.0.0.1:5173` 拒绝连接。
- **修复**：新增 `_node_spawn`，按 `ZEROCRAFT_NODE` → PATH → Windows 标准安装目录解析真实 `node.exe`，并用 `shell=False` 启动；流程板将启动失败与 JSON 解析失败分开。Vite 显式绑定 `127.0.0.1`。
- **守卫**：`py_compile` 通过；测试进程清空 PATH 后 `_pipeline_cli(['board','game-dice','--json'])` 仍返回 `ok:true`；重启后 `/api/pipeline` 返回成功，真实浏览器可从 `127.0.0.1:5173` 打开生产流程板。
- **通用教训**：长驻后端不得假设与前端共享 PATH；真实 `.exe` 应解析绝对路径直接执行，只有 `.cmd` 才需要 shell。工具启动失败必须单独分类，不能伪装成输出解析错误。

---

## FIX-NNN · （模板）

- **症状**：
- **根因**：
- **修复**：
- **守卫**：
- **通用教训**：

# DokiWorld App 独立资产闭包｜引擎缺口裁决单

> 日期：2026-09-24  
> 状态：owner 已选择 A；通用闭包器与 game-dice 首个消费已实现，等待独立复查  
> 触发案例：`game-physics-dice`

## 0. 本轮交付

- 通用实现：`scripts/app-asset-closure.mjs`
- 首个消费：`dokiworld/game-physics-dice/scripts/build.mjs`
- 点名测试：`dokiworld/game-physics-dice/tests/asset-closure.test.mjs`
- 包内证据：`dokiworld/game-physics-dice/dist/ASSET-CLOSURE.json`

当前闭包器已经负责 AssetIndex 校验、文件复制、material 贴图 key 对账、路径穿越/远端资源拒绝、便携索引生成、本机 provenance 路径清理、显式额外资源树复制和闭包报告。共享 PUI 的 CJK 字体 CSS 仍硬编码 `/ui-fonts/`，受专职域限制，本轮用闭包器的受控 absolute→relative 重写作迁移桥；锚点缺失或重写残留会直接失败，不再散落在每个 App 脚本。

## 1. 现状实查

已查：

- `docs/playbooks/assets.md`：游戏运行时只应消费本地 AssetIndex，资产按 key 解析；本地目录应 hermetic。
- `src/assets/asset-index.ts`：`registerAssetIndex` 已能把 filled texture/mesh 按 id 注册，`filledSrc` 可按 id 得到 URL。
- `scripts/vendor-asset.mjs`：能把共享货架资产复制进游戏本地目录，但不负责 DokiWorld dist 导出。
- `scripts/dokiworld-pack-smoke.py`：核 manifest/zip/hash，当前不从游戏 AssetIndex 建立资源闭包。
- `dokiworld/game-physics-dice/scripts/build.mjs`：专门遍历 game-dice 的 index，复制文件、复制整套字体，并在编译后字符串替换站点绝对 URL。
- `games/game-dice/dice-window.ts` 与 `src/engine/host/three-dice-overlay.ts`：运行时仍硬编码 `/games/game-dice/art/...`，没有按资产 key 消费索引。
- `docs/workflow/requests.md` 的旧 REQ-DOKIPACK 结案备注：已经把“资产 URL 基准可配置”记为下一游戏再次撞到时应下沉的引擎缺口候选；game-dice 现已再次撞到。

结论：当前 capability 能管理和加载资产，但**不能通用地把某游戏本地 AssetIndex 导出为可搬迁的 App 资源闭包**。game-dice 能独立运行，是专用 build script 补齐的，不可自动推广到后续游戏。

## 2. 为什么现有能力不能重组解决

`vendor-asset` 解决“共享货架 → 游戏本地库”，不解决“游戏本地库 → App dist”。`registerAssetIndex`/`filledSrc` 是运行时解析，不复制字节、不生成 portable index，也不验证最终包。`dokiworld-pack-smoke` 只检查已经进入 zip 的文件，不能发现被构建脚本漏掉且运行时才请求的资源。

继续复制 game-dice 的脚本会为每个 App 重写一遍：资产遍历、路径重写、字体复制、provenance 清理、哈希和闭包验证。这不是数据重组，而是平行打包器。

## 3. 路线 A｜下沉通用 App 资产闭包能力（推荐）

在共享 `scripts/`/资产层提供确定性 packager，输入为：游戏 slug、本地 AssetIndex、目标 dist、公开 asset base 和额外显式依赖组；输出为 portable index、复制后的文件与闭包报告。

最低职责：

1. 用 `parseAssetIndex` 校验输入，遍历所有 filled 且带 path 的文件型资产；material/generator 等无文件资产按类型处理。
2. 防路径穿越，确认源文件位于该游戏本地 art 根；复制到 dist 稳定相对路径。
3. 生成 portable AssetIndex：运行 path 改成相对 URL；保留 id/type/spec/license/source 与可公开 provenance，删除/规范化本机绝对路径字段。
4. 递归闭合 material 引用的贴图 key、atlas sidecar、模型附属文件和显式字体组；悬空 key/文件直接失败。
5. 生成机器报告：索引数、复制数、缺失数、孤儿数、外部 URL、绝对路径和 SHA256 覆盖率。
6. 提供可配置 asset base/URL resolver，禁止继续在编译后的 JS 中做字符串替换。
7. `dokiworld-pack-smoke` 消费闭包报告并校验包内每个运行引用有实物。
8. game-dice 把 UI 画框和两个 STL 改为资产 key，通过已解析 URL/模型句柄消费；删除硬编码站点路径与专用复制逻辑。

代价：触及共享 `src/assets/**` 与 `scripts/**`，需要主程施工、独立复查；必须兼容现有站点运行和其他游戏本地索引。收益是所有未来 DokiWorld App 自动具备可搬迁资产包，不再逐游戏写复制器。

选错代价：若范围做得过大，可能把发布器和运行期 AssetManager 耦合。应把“纯闭包规划函数”和“Node 文件复制胶水”分层，运行时不依赖 Node。

## 4. 路线 B｜继续逐 App 定制 build script

每个 `dokiworld/<app-id>/scripts/build.mjs` 自己复制 index 资产、改 URL、带字体、清理元数据和写哈希。

代价：初次改动小，但每个新游戏都会复制同形代码；任一脚本漏一种资产或 URL 写法就可能在宿主中丢图。当前 game-dice 的硬编码路径、bundle 字符串替换和 provenance 泄漏已经证明这种路线会漂移。

通用性：无。选错代价是后续每个 App 都要重新审计独立运行，且旧包不会自动获得修复。

## 5. 推荐与边界

推荐 A。此缺口属于跨游戏共享打包与资产单一真相，不应在 game-dice 再加一轮专用补丁后宣称解决。

本轮未修改 `src/ui/**` 或共享运行时 AssetIndex API。后续由 PUI 提供可配置字体 asset base 后，应删除 `/ui-fonts/` 的构建期重写桥；这不影响当前包的独立运行与闭包完整性。

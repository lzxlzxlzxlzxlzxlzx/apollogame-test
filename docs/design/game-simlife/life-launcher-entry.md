# Life 启动器条目契约（`zerocraft.life-launcher.v1`）

## 目的与边界

Life 游戏不再需要向 `src/launcher.tsx` 的内置卡片表和 `GameRunner` 的 loader map 各加一处分支。构建器只扫描固定约定 `games/*/life-launcher.json`，并把条目与同目录的固定三文件关联：

- `life-host.json`
- `life.json`
- `asset-slots.json`

条目字段不包含路径、URL、模块名、函数、HTML/CSS、prompt、provider 或 approval。`life-host.json` 内的 `packagePath` / `assetSlotsPath` 仍只是 authoring identity；启动器不会读取或解释它们。

## 严格格式

```json
{
  "schema": "zerocraft.life-launcher.v1",
  "id": "game-seaside-market",
  "title": "海风集市",
  "subtitle": "潮汐经营 · 数据驱动",
  "description": "经营一座随潮汐变化的海边集市。",
  "color": "#17364a",
  "accentColor": "#62d6c5",
  "icon": "🐚"
}
```

根对象是闭集，未知字段一律拒绝。`id` 必须是最长 52 字符的小写 `game-*` kebab，并同时等于目录名、`life-host.json.slug`、`life.json.meta.id` 与 `asset-slots.json.game`。展示文本必须是有界单行纯文本；颜色只接受六位十六进制。

## 发现、隔离与运行

生产 catalog 只消费四个写死的 eager `import.meta.glob`。它不接收运行时 importer，不 fetch JSON，也不会对数据字段做 dynamic import。发现结果按目录稳定排序；重复 id、身份不一致、缺少固定文件或任一严格 contract 失败时，条目只成为带稳定诊断 code 的 `coming-soon` 卡片，不会获得 runnable bundle。

可运行条目在 launcher 内使用 `life:<id>` 运行时命名空间，避免与现有内置 `game-*` 和 library `lib:*` 冲突。`LifeGameRunner` 只把已验证数据对象交给 `mountLifeGame`，并负责异步失败、切换与返回时的释放。它不允许调用方覆盖存档 slot；slot 继续由 `life-host.v1` descriptor identity 派生。

启动器展示元数据、descriptor、asset governance 和 prompt 都保持在 World 外，不进入 snapshot/hash/save。当前 `game-simlife` 保留既有内置入口；本契约服务于后续经 owner 审批、由受限 materializer 正式落盘的新 Life 游戏。

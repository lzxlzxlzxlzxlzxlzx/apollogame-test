# AssetSlotBrief authoring contract

`AssetSlotBrief` 是生成前的视觉槽契约，不是 sim component，也不是另一份 AssetIndex。它让只会填 JSON 的模型在出图前就知道“画什么、输出多大、锦标在哪、哪个 JSON 字段消费”，并且让机器能证明产物没有绕过人审。

## 三个权威面

- Life package / 游戏数据：只管 `skinKey` 和 world placement / collision / depth。这些 world facts 不复制进 brief。
- AssetSlotBrief / pending：只管生成约束、consumer pointer、人审状态。prompt 只存在这个 authoring 面。
- AssetIndex：唯一已批准、可运行的资产真相。渲染器仍只按 key 取 AssetManager handle。

`compileLifeVisualCatalog()` 是单向隔离边：它只保留 source size / display / anchor / fit / offset / sampling / fallback。prompt、path、license、provider/model、文件 bytes 不能进 World、snapshot、hash 或 save。

建筑例外不是复制 world 真相：generation bundle 会跨文档对账 building 槽的 `render.display` 与其 consumer 所在 placement 的显式 `width/height`。`cell` 必须逐值一致，`pixel` 必须按共享 32px 逻辑格精确换算；不一致整包拒绝。多格建筑 warp 另由 Life JSON 的 `interactionPlacementId` 指向该 placement，素材尺寸不能反向决定交互范围。

## JSON skeleton

```json
{
  "version": 1,
  "game": "game-slug",
  "note": "Existing placeholders only; asset-manager owns import and registration.",
  "slots": [{
    "slotId": "life.tile.meadow",
    "assetKey": "art:game:tile:meadow",
    "kind": "tile",
    "consumers": [{
      "document": "world.life.json",
      "jsonPointer": "/tileCatalog/grass/visual/skinKey"
    }],
    "asset": {
      "usage": "sprite",
      "colorSpace": "srgb",
      "outputPx": { "width": 32, "height": 32 },
      "alpha": "opaque",
      "sampling": "nearest"
    },
    "render": {
      "display": { "unit": "cell", "width": 1, "height": 1 },
      "anchor": { "x": 0.5, "y": 0.5 },
      "fit": "cover",
      "offset": { "x": 0, "y": 0 },
      "fallbackRole": "ground"
    },
    "generation": {
      "briefVersion": 1,
      "styleId": "pixel.warm-rural",
      "prompt": "seamless warm rural pixel meadow tile, top-down, no text",
      "negativePrompt": ["perspective", "text", "border"]
    },
    "governance": {
      "approval": "placeholder",
      "humanApprovalRequired": true,
      "licenseRequired": true,
      "briefFingerprint": "asset-slot-v1:<tool-derived>"
    }
  }]
}
```

上例展示不带 profile 的 legacy-compatible manifest。方向化 manifest 可在根部加入完整 `artDirection`，其 schema 与两个 engine-owned fixture 以 `src/assets/life-art-direction.ts` 为单一真相，禁止在文档中抄一份会漂移的 defaults。profile 是可选的 legacy 兼容字段；一旦存在，所有槽位必须带安全 `semanticPrompt`，且 styleId、最终 prompt/negativePrompt、outputPx、alpha、sampling、display、anchor、fit、零 offset 必须与 profile 的稳定派生结果逐字一致。`illustrated-2d` 只收 linear 高分辨率源图，tile opaque，其余 kind transparent；必带非像素高清正向短语及 pixel art/sprite sheet/UI/text/border 负向词。其 384×512 player/npc 仍只占 `1×1.5 cell`，与 legacy 32×48 sprite 在 32px 逻辑格上的地图比例相同；profile 不进入 Life runtime，源图尺寸也不会改变逻辑格。

词表是闭集：`kind=tile|crop|player|npc|building|resource|item`，`alpha=opaque|transparent`，`sampling=nearest|linear`，`display.unit=cell|pixel`，`fit=cover|contain`。不接受 stretch；Life v1 不支持命名 atlas frame，仅可显式声明 sprite-sheet index 0，否则 validator 拒绝，不伪装半支持。

`briefFingerprint` 由 `deriveAssetSlotBriefFingerprint()` 对规范化 brief 派生，模型填错或手改会报错。非 placeholder 的 `approved` 槽还必须携带 `sha256:<64 hex>` 的 `contentHash`；文件审批时由工具对字节派生，不信任模型输入。

## 唯一生命周期

1. 程序侧从游戏 JSON 建 slot，运行 `npx vite-node scripts/asset-slot-guard.ts <game>` 核对 JSON pointer、key 闭包和现有 placeholder index metadata。checker 只读。
2. `asset-manager` 决定 vendor 现有素材或按 brief 生成候选；程序线不挑图、不生图、不验许可、不登记 index。
3. AI 或 `art-replace` 只能写 `art/ai/pending/` + `pending.json`。真产物生成时不得写最终 `gen/`、不得写 skinKey alias，不得改 AssetIndex。
4. 机器先核 outputPx / alpha / usage / colorSpace / fingerprint / provenance；人审 approve 后工具才复制到最终位、派生 content SHA-256、登记 AssetIndex，并记 `approvedAt/reviewedBy`。reject 删候选并把 art-replace 行退回 placeholder。
5. approve 后再跑 slot guard + asset reconcile。旧 placeholder 在候选待审期仍可运行，不会被未审图覆盖。

## Little Valley slice

`games/game-simlife/little-valley.asset-slots.json` 对当前所有 visual key / consumer 做了完整闭包，包含 tile、三阶 crop、player、mayor、farmhouse、berry、ore 与现有 item/mine entrance/blocker 引用。全部 `approval:"placeholder"`：它们只是对现有本地 SVG 的尺寸/消费声明，不表示已接入 AI 或新真素材。下一步任何生成、导入、许可核验与 local index 更新都必须由 `asset-manager` 执行。

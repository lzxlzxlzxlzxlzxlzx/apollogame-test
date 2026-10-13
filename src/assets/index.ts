// 资产(美术)系统 —— 表现层，活在确定性 sim 之外。
// sim 只持有 textureKey；这里把 key → 已加载资产 + 子矩形，交给渲染后端绘制。
export type {
  Rect,
  TextureDescriptor,
  AtlasDescriptor,
  SpriteSheetDescriptor,
  PrerenderedSequenceDescriptor,
  ModelDescriptor,
  AssetDescriptor,
  AnimationDescriptor,
  AssetManifest,
  AssetHandle,
  LoadedAsset,
  ResolvedFrame,
  FrameRef,
  AssetLoader,
} from './asset-types.js';
export { AssetManager, StubAssetLoader } from './asset-manager.js';
export { HostVisualSession, HostPngAssetLoader, parseHostVisuals, projectHostVisual, createHostVisualAssetManager, type HostVisual, type PreparedHostVisual, type HostVisualWorldProjection } from './host-visual-bridge.js';
export { ftpFrames, ftpToAtlasEntry, mergeAtlasIntoIndex, normalizeFrameName, type FtpAtlasJson } from './pack-atlas.js';
export { ImageAssetLoader, isImageHandle, type ImageAssetHandle } from './image-loader.js';
// 游戏本地美术索引装载（两形态·失败静默回退·REQ-SHELL ②）
export {
  gameArtIndexUrl,
  loadGameArtInto,
  loadGameArtOverrides,
  pickArtOverrides,
  createArtAssets,
  type GameArtLoadOptions,
} from './game-art-load.js';
export { ModelAssetLoader, isModelHandle } from './model-loader.js';
export { PBR_MATERIALS, resolvePbr, hasPbrLobes, type PbrMaterialDef, type PbrPreset, type PbrOverrides } from './pbr-materials.js';
export {
  parseAssetIndex,
  pendingAssets,
  filledAssets,
  registerAssetIndex,
  buildMaterialCatalog,
  ASSET_TYPES,
  deriveColorSpace,
  textureSpecOf,
  parseHitMaskSpec,
  TEXTURE_USAGES,
  COLOR_SPACES,
  TEXTURE_WRAPS,
  MESH_COLLISIONS,
  type AssetType,
  type AssetStatus,
  type AssetIndexEntry,
  type AssetIndex,
  type SheetSpec,
  type TextureSpec,
  type MeshSpec,
  type MaterialSpec,
  type HitMaskSpec,
  type TextureUsage,
  type ColorSpace,
  type TextureWrap,
  type MeshCollision,
} from './asset-index.js';
// 贴图生成器注册表（REQ-VECTOR-ART 步3：texture + spec.generator=程序矢量一等公民）
export {
  registerTextureGenerator,
  hasTextureGenerator,
  listTextureGenerators,
  generatorSpecOf,
  resolveGeneratedSrc,
  type TextureGeneratorFn,
  type TextureGeneratorParams,
  type GeneratorSpec,
} from './texture-generators.js';
// 资源库统一模型（浏览器/搜索用；三来源适配成一种记录）
export {
  LIBRARY_TAXONOMY,
  taxonomyOf,
  categoryLabel,
  inferCategory,
  projectRecords,
  artlibRecords,
  manifestRecords,
  queryLibrary,
  rankRecords,
  libraryCounts,
  expandAliases,
  type AliasMap,
  type RankedRecord,
  type LibraryRecord,
  type LibrarySource,
  type LibraryStatus,
  type LibraryQuery,
  type LibraryTypeDef,
  type LibraryCategoryDef,
} from './library.js';
// 导入器纯核心（嗅探/归一化/切割；UI 与写盘在外层）
export { sniffImage, fnv1a, type ImageInfo, type ImageFormat } from './import/sniff.js';
export { DEFAULT_PROFILE, type NormalizationProfile, type CategoryRule } from './import/profile.js';
export {
  parseAssetSlotManifest,
  validateAssetSlotManifest,
  validateAssetSlotClosure,
  validateAssetPendingIsolation,
  resolveJsonPointer,
  deriveAssetSlotBriefFingerprint,
  stableAssetSlotJson,
  compileLifeVisualCatalog,
  ASSET_SLOT_KINDS,
  ASSET_SLOT_ALPHA,
  ASSET_SLOT_SAMPLING,
  ASSET_SLOT_FITS,
  ASSET_SLOT_DISPLAY_UNITS,
  ASSET_SLOT_FALLBACK_ROLES,
  ASSET_SLOT_APPROVALS,
  type AssetSlotKind,
  type AssetSlotBrief,
  type AssetSlotManifest,
  type AssetSlotIssue,
  type LifeVisualRule,
  type LifeVisualCatalog,
} from './asset-slot-brief.js';
export {
  planLifeAssetCandidates,
  deriveLocalAssetCandidateFingerprint,
  ASSET_CANDIDATE_PLAN_SCHEMA,
  type AssetCandidateDecision,
  type AssetCandidatePlanReason,
  type LocalAssetCandidate,
  type AiAssetCandidateRequest,
  type AssetCandidatePlanItem,
  type AssetCandidatePlan,
} from './life-asset-candidate-plan.js';
export {
  buildLifeAssetReviewPacket,
  LIFE_ASSET_REVIEW_PACKET_SCHEMA,
  LIFE_ASSET_REVIEW_STATUS,
  type LifeAssetReviewDiagnostic,
  type LifeAssetReviewSpec,
  type LifeAssetReviewRender,
  type LifeAssetLocalReviewItem,
  type LifeAssetAiReviewItem,
  type LifeAssetInvalidReviewItem,
  type LifeAssetReviewItem,
  type LifeAssetReviewPacket,
} from './life-asset-review-packet.js';
export {
  buildLifeAssetGenerationBatch,
  buildLifeAssetGenerationBatchFromArtifacts,
  LIFE_ASSET_GENERATION_BATCH_SCHEMA,
  LIFE_ASSET_2D_PROVIDER,
  LIFE_ASSET_2D_PROVIDERS,
  type LifeAsset2dProvider,
  type LifeAssetProviderSelection,
  type LifeAssetGenerationDiagnostic,
  type LifeAssetLocalReviewExecution,
  type LifeAssetAiGenerationExecution,
  type LifeAssetInvalidGenerationExecution,
  type LifeAssetGenerationExecution,
  type LifeAssetGenerationBatch,
} from './life-asset-generation-batch.js';
export {
  planImport,
  planEntries,
  slugify,
  splitVariant,
  categoryFor,
  type ImportFile,
  type ImportPlan,
  type PlanRow,
  type PlanAction,
} from './import/normalize.js';
export { gridDims, gridCells, sheetSpec, atlasFrames, type GridParams } from './import/slice.js';

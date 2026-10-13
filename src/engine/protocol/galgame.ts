/** Pure, versioned GAL authoring contract. Runtime interpretation is deliberately out of scope. */
import type { ConditionExpr } from './components/logic.js';
import type { SfxSpec } from '../../services/audio/synth-audio.js';

export const GAL_PACKAGE_SCHEMA = 1 as const;
export type LocalizedText = Readonly<Record<string, string>>;
export type AssetKey = string;
export type CharacterId = string; export type SceneId = string; export type BackgroundId = string; export type CgId = string;
export type AudioId = string; export type VoiceId = string; export type VideoId = string; export type EndingId = string;
export type MemoryId = string; export type ResourceId = string; export type FlagId = string; export type EmotionId = string;
export interface StoryRef { readonly chapterId: string; readonly nodeId: string }

export interface GalUiSpec { readonly template: 'gal-template'; readonly titleBackground?: BackgroundId; readonly titleBgm?: AudioId }
export interface EndingSpec { readonly title: LocalizedText }
export type UnlockRule = { readonly kind: 'reach-node'; readonly ref: StoryRef } | { readonly kind: 'reach-ending'; readonly ending: EndingId } | { readonly kind: 'explicit' };
export interface PreferenceDefaults { readonly textSpeedMsPerChar: number; readonly autoDelayMs: number; readonly skipMode: 'read-only'|'all'; readonly bgmVolume: number; readonly sfxVolume: number; readonly voiceVolume: number; readonly muted: boolean }
export interface CharacterSpec {
  readonly id: CharacterId; readonly name: LocalizedText;
  readonly portraits: { readonly neutral: AssetKey; readonly expressions: Readonly<Record<EmotionId, AssetKey>>; readonly fallback: 'neutral'|'silhouette' };
  readonly voice?: { readonly characterId: string; readonly tts?: { readonly lang?: string; readonly voiceHint?: string; readonly rate?: number; readonly pitch?: number; readonly volume?: number } };
  readonly defaults?: { readonly side?: 'left'|'right'|'center'; readonly visible?: boolean };
}
export interface SceneSpec { readonly id: SceneId; readonly background?: BackgroundId; readonly ambience?: { readonly bgm?: AudioId; readonly volume?: number }; readonly cast?: Readonly<Record<CharacterId, { readonly visible: boolean; readonly side?: 'left'|'right'|'center'; readonly zOrder?: number; readonly emotion?: EmotionId }>>; readonly uiVariant?: 'default' }
export interface MediaCatalog {
  readonly backgrounds: Readonly<Record<BackgroundId, { readonly image: AssetKey; readonly title?: LocalizedText }>>;
  readonly cg: Readonly<Record<CgId, { readonly image: AssetKey; readonly title: LocalizedText; readonly unlock: UnlockRule }>>;
  readonly audio: { readonly bgm: Readonly<Record<AudioId, { readonly asset: AssetKey; readonly loop: boolean; readonly defaultVolume?: number }>>; readonly sfx: Readonly<Record<AudioId, { readonly asset?: AssetKey; readonly synth?: SfxSpec }>>; readonly voice: Readonly<Record<VoiceId, { readonly asset?: AssetKey; readonly charId: CharacterId; readonly text?: LocalizedText }>> };
  readonly video: Readonly<Record<VideoId, { readonly asset: AssetKey; readonly poster?: AssetKey; readonly skippable: boolean; readonly audioPolicy: 'embedded'|'mute' }>>;
}
export interface GallerySpec { readonly memories: Readonly<Record<MemoryId, { readonly title: LocalizedText; readonly entry: StoryRef; readonly unlock: UnlockRule }>>; readonly music: Readonly<Record<AudioId, { readonly unlock: UnlockRule }>> }
export interface PresentationDelta {
  readonly scene?: SceneId|null; readonly background?: BackgroundId|null;
  readonly cast?: Readonly<Record<CharacterId, { readonly visible?: boolean; readonly side?: 'left'|'right'|'center'; readonly zOrder?: number; readonly emotion?: EmotionId; readonly motion?: 'none'|'enter-left'|'enter-right'|'leave-left'|'leave-right'|'shake'|'focus' }>>;
  readonly cg?: { readonly show?: CgId; readonly hide?: boolean }; readonly bgm?: { readonly play?: AudioId; readonly stop?: boolean; readonly fadeTicks?: number };
  readonly sfx?: readonly AudioId[]; readonly video?: { readonly play: VideoId; readonly wait: boolean } | { readonly stop: true }; readonly transition?: 'cut'|'fade'|'wipe'|'dissolve';
}
export type StoryEffect = { readonly kind: 'resource'; readonly id: ResourceId; readonly op: 'add'|'set'; readonly value: number } | { readonly kind: 'flag'; readonly id: FlagId; readonly value: boolean } | { readonly kind: 'unlockCg'; readonly id: CgId } | { readonly kind: 'unlockMemory'; readonly id: MemoryId } | { readonly kind: 'unlockMusic'; readonly id: AudioId };
export interface GalNodeBase { readonly presentation?: PresentationDelta; readonly enter?: readonly StoryEffect[]; readonly checkpoint?: 'auto'|'none'|'hard'; readonly loop?: true }
export type GalNode =
  | (GalNodeBase & { readonly kind:'line'; readonly speaker?: CharacterId; readonly text: LocalizedText; readonly voice?: VoiceId; readonly next: StoryRef|null })
  | (GalNodeBase & { readonly kind:'choice'; readonly prompt?: LocalizedText; readonly options: readonly { readonly id:string; readonly text:LocalizedText; readonly when?: ConditionExpr; readonly effects?: readonly StoryEffect[]; readonly next:StoryRef }[] })
  | (GalNodeBase & { readonly kind:'check'; readonly prompt?: LocalizedText; readonly check: { readonly attribute: ResourceId; readonly difficulty: number; readonly dice?: number; readonly bonusFrom?: ResourceId; readonly bonusDiv?: number }; readonly pass: { readonly effects?: readonly StoryEffect[]; readonly next: StoryRef }; readonly fail: { readonly effects?: readonly StoryEffect[]; readonly next: StoryRef } })
  | (GalNodeBase & { readonly kind:'jump'; readonly when?: ConditionExpr; readonly then:StoryRef; readonly otherwise?:StoryRef })
  | (GalNodeBase & { readonly kind:'ending'; readonly ending:EndingId; readonly text?:LocalizedText });
export interface GalChapter { readonly id:string; readonly title:LocalizedText; readonly start:string; readonly scene?: SceneId; readonly nodes:Readonly<Record<string, GalNode>> }
export interface GalPackage {
  readonly schemaVersion:typeof GAL_PACKAGE_SCHEMA; readonly id:string; readonly title:LocalizedText; readonly defaultLocale:string; readonly locales:readonly string[]; readonly entry:StoryRef;
  readonly ui: GalUiSpec; readonly characters: Readonly<Record<CharacterId, CharacterSpec>>; readonly scenes: Readonly<Record<SceneId, SceneSpec>>; readonly chapters:Readonly<Record<string,GalChapter>>; readonly endings:Readonly<Record<EndingId, EndingSpec>>; readonly gallery: GallerySpec; readonly media: MediaCatalog; readonly preferences: PreferenceDefaults;
}

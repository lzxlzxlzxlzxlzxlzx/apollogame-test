import type { StoryRef } from '../engine/protocol/galgame.js';

/** Authoring-only data. None of these shapes is a playable GalPackage node. */
export const GAL_DRAFT_KINDS = ['brief', 'bible', 'routes', 'graph', 'beats', 'manuscript', 'script'] as const;
export type GalDraftKind = typeof GAL_DRAFT_KINDS[number];
export type GalDraftStatus = 'draft' | 'approved' | 'rejected' | 'superseded';
export type GalDraftEligibility = 'current' | 'stale' | 'blocked';

export interface GalBrief {
  readonly id: string;
  readonly titleHint?: string;
  readonly defaultLocale: string;
  readonly locales: readonly string[];
  readonly target: { readonly minutes: number; readonly routes: number; readonly endings: number };
  readonly genre: readonly string[];
  readonly audience: 'all-ages' | 'teen' | 'mature';
  readonly themes: readonly string[];
  readonly prohibitedContent: readonly string[];
  readonly artDirection: {
    readonly style: string;
    readonly palette: readonly string[];
    readonly referenceIds: readonly string[];
  };
  readonly platforms: readonly ('web' | 'desktop')[];
  readonly constraints: readonly string[];
}

export interface NarrativeBible {
  readonly briefId: string;
  readonly world: { readonly premise: string; readonly rules: readonly string[] };
  /** Legacy place notes. The closed location list belongs on the route outline, after the story beats exist. */
  readonly locations?: readonly { readonly id: string; readonly name: string; readonly description: string }[];
  readonly characters: readonly {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly motivation: string;
    readonly traits: readonly string[];
    readonly arc: string;
    readonly visualNeed: { readonly silhouette: string; readonly costume: string; readonly expressions: readonly string[] };
  }[];
  readonly relationships: readonly {
    readonly from: string;
    readonly to: string;
    readonly kind: 'ally' | 'rival' | 'family' | 'romance' | 'other';
    readonly note: string;
  }[];
  readonly canonRules: readonly string[];
  readonly narrativeProhibitions: readonly string[];
}

export interface RouteOutline {
  readonly bibleId: string;
  readonly routes: readonly { readonly id: string; readonly leadCharacterId?: string; readonly premise: string; readonly milestoneIds: readonly string[]; readonly endingIds: readonly string[] }[];
  readonly forks: readonly { readonly id: string; readonly sourceMilestoneId: string; readonly options: readonly { readonly id: string; readonly targetMilestoneId: string; readonly intent: string }[] }[];
  readonly milestones: readonly { readonly id: string; readonly summary: string }[];
  readonly endings: readonly { readonly id: string; readonly routeId: string; readonly outcome: string; readonly conditionIntent?: string }[];
  readonly locations?: readonly { readonly id: string; readonly name: string; readonly description: string }[];
}

export type StoryGraphNode = (
  | { readonly kind: 'line-slot'; readonly next: StoryRef }
  | { readonly kind: 'choice'; readonly options: readonly { readonly id: string; readonly next: StoryRef }[] }
  | { readonly kind: 'check'; readonly pass: StoryRef; readonly fail: StoryRef; readonly checkIntent: string }
  | { readonly kind: 'jump'; readonly then: StoryRef; readonly otherwise?: StoryRef }
  | { readonly kind: 'ending'; readonly endingId: string }
) & { readonly routeId?: string; readonly milestoneId?: string };

export interface StoryGraphDraft {
  readonly routesDraftId: string;
  readonly entry: StoryRef;
  readonly chapters: Readonly<Record<string, {
    readonly title: string;
    readonly start: string;
    readonly sceneId?: string;
    readonly nodes: Readonly<Record<string, StoryGraphNode>>;
  }>>;
  readonly sceneSlots: readonly { readonly id: string; readonly locationId: string }[];
}

export interface SceneBeatSheet {
  readonly graphDraftId: string;
  readonly beats: Readonly<Record<string, {
    readonly anchor: StoryRef;
    readonly sceneSlotId: string;
    readonly castIds: readonly string[];
    readonly mood: string;
    readonly dramaticPurpose: string;
    readonly backgroundNeedId?: string;
    readonly bgmNeedId?: string;
    readonly cgNeedId?: string;
    readonly presentationNeeds: {
      readonly transition?: 'cut' | 'fade' | 'wipe' | 'dissolve';
      readonly motions: readonly string[];
    };
    readonly order: number;
  }>>;
  readonly mediaNeeds: readonly { readonly id: string; readonly kind: 'background' | 'bgm' | 'cg'; readonly brief: string }[];
}

/** Prose dialogue. It is not a line record and not a GalPackage node. */
export interface DialogueManuscript {
  readonly beatsDraftId: string;
  readonly locale: string;
  readonly passages: readonly {
    readonly id: string;
    readonly anchor: StoryRef;
    readonly speakerId?: string;
    readonly text: string;
  }[];
}

export type ScriptDraftNode = (
  | { readonly kind: 'line'; readonly text: string; readonly speakerId?: string; readonly emotion?: string; readonly sceneSlotId?: string; readonly cgNeedId?: string; readonly next: StoryRef }
  | { readonly kind: 'choice'; readonly prompt: string; readonly options: readonly { readonly id: string; readonly text: string; readonly next: StoryRef }[] }
  | { readonly kind: 'ending'; readonly endingId: string; readonly text: string }
);

/** Line records. After approval, these are the script authority. Asset keys stay out of this draft. */
export interface LineScriptDraft {
  readonly manuscriptDraftId: string;
  readonly locale: string;
  readonly entry: StoryRef;
  readonly chapters: Readonly<Record<string, {
    readonly title: string;
    readonly start: string;
    readonly nodes: Readonly<Record<string, ScriptDraftNode>>;
  }>>;
}

export interface GalDraftDataByKind {
  readonly brief: GalBrief;
  readonly bible: NarrativeBible;
  readonly routes: RouteOutline;
  readonly graph: StoryGraphDraft;
  readonly beats: SceneBeatSheet;
  readonly manuscript: DialogueManuscript;
  readonly script: LineScriptDraft;
}

/** Stored content is immutable; status and review notes are projected from events. */
export interface GalDraftRecord<K extends GalDraftKind = GalDraftKind> {
  readonly schemaVersion: 1;
  readonly kind: K;
  readonly projectId: string;
  readonly draftId: string;
  readonly revision: number;
  readonly basedOn: readonly string[];
  readonly contentHash: string;
  readonly summary: string;
  readonly data: GalDraftDataByKind[K];
}

export interface GalReviewEvent {
  readonly eventId: string;
  readonly action: 'approve' | 'reject' | 'supersede' | 'revoke';
  readonly projectId: string;
  readonly draftId: string;
  readonly reviewerId: string;
  readonly reason: string;
  /** Only owner-reviewed revocation may remove a current approved version without replacement. */
  readonly reviewerRole: 'reviewer' | 'owner';
}

export interface GalDraftLedger {
  readonly drafts: readonly GalDraftRecord[];
  readonly events: readonly GalReviewEvent[];
}

export interface GalDraftView<K extends GalDraftKind = GalDraftKind> extends GalDraftRecord<K> {
  readonly status: GalDraftStatus;
  readonly eligibility: GalDraftEligibility;
  readonly reviewNotes: readonly string[];
}

export interface GalDraftIssue {
  readonly path: string;
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface GalDraftCheck {
  readonly ok: boolean;
  readonly issues: readonly GalDraftIssue[];
}

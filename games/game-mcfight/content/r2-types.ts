/** Authoring values are tagged; pending values have no numeric fallback. */
export type AdoptionState = 'adopted' | 'normalized' | 'rebuilt' | 'pending-design';
export interface ContentValue {
  status: AdoptionState; adoptionId: string; value?: number | string | boolean;
}
export interface R2UnitDefinition {
  id: string; legacyId: string; name: string; sourceId: string;
  shopVisibility: 'visible' | 'hidden'; movement: 'ground' | 'flying'; tags: string[];
  attributes: Record<string, ContentValue>; loadoutIds: string[];
  decisionId: string; presentationId: string; collisionSlot: string;
  noActiveAttack: boolean; runtimeAlias?: string; role?: string; runtimeSelectionOrder?: ContentValue;
  s4Attributes?: Record<string, ContentValue>;
  compatibility?: 'r3-batch-1';
}
export interface R2Loadout {
  id: string; unitId: string; templateIds: string[]; label: string;
  mode: 'active' | 'passive' | 'triggered'; parentId: string | null;
  parameters: Record<string, ContentValue>; sourceRef: string; modifierIds: string[];
  contracts: string[]; stateScope: 'entity-instance/loadout-id';
  actionLock: 'exclusive' | 'parent' | 'none'; presentationSlot: string;
  eligibility: ContentValue; hitEligibility: ContentValue;
  summonUnitIds: string[]; gapIds: string[];
  variant: 'restoration' | 's4-validated'; runtimeAlias?: string;
}
export interface R2DecisionProfile {
  id: string; unitId: string; candidates: string[]; policyText: string;
  sourceRef: string; status: 'pending-design' | 'configured' | 's4-validated';
  selection: 'pending-design' | 'priority'; orderedCandidates: string[];
  gates: readonly string[]; fallback: 'idle' | 'wander-near-spawn';
  runtimeCandidates: string[];
}
export interface R2PresentationProfile {
  id: string; unitId: string; identity: { path: string; status: string };
  attackCandidate: { path: string | null; status: string }; death: { status: string };
  anchor: 'feet-center' | 'body-center'; facing: 'right'; mirror: true;
  collisionSlot: string; s6ArtBinding: 'pending';
  actions: { id: string; loadoutId: string; semantics: string[]; status: 'missing';
    anchors: Record<string, { status: 'missing'; coordinates: null }>;
    vfx: { status: 'missing' }; sfx: { status: 'missing' } }[];
}

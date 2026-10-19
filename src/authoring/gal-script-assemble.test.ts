/* AI START */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { InputQueue } from '@engine/protocol/components.js';
import { NARRATIVE_ADVANCE, NARRATIVE_CHOOSE, type NarrativeProjection, type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { createGalWorld } from '../assembly/gal-world.js';
import { validateGalPackage } from '../assembly/gal-package.js';
import { parseAssetIndex } from '../assets/asset-index.js';
import { assembleApprovedGalScript, type GalArtApproval, type GalScriptCandidate } from './gal-script-assemble.js';

const read = (url: string): unknown => JSON.parse(readFileSync(new URL(url, import.meta.url), 'utf8'));
const script = read('../../docs/design/galgame/drafts/manor-escape/script-candidate.json') as GalScriptCandidate;
const approval = read('../../docs/design/galgame/drafts/manor-escape/art-approval.json') as GalArtApproval;

function play(optionId: 'opt-leave' | 'opt-stay'): string {
  const { package: pkg } = assembleApprovedGalScript(script, approval);
  const { world } = createGalWorld(pkg, { schema: 1, entities: { random: { RandomSeed: { seed: 7, sequence: 0 } } } });
  for (let step = 0; step < 400; step++) {
    const projection = world.getComponent<NarrativeProjection>('story', 'NarrativeProjection');
    if (projection?.endingId) return projection.endingId;
    const choice = projection?.options?.find(item => item.id === optionId && item.available);
    const key = projection?.kind === 'choice' ? NARRATIVE_CHOOSE : NARRATIVE_ADVANCE;
    world.getComponent<InputQueue>('input', 'InputQueue')!.actions = [{ source: 'test', phase: 'action', key, ...(choice ? { arg: choice.id } : {}) }];
    world.tick();
    const receipt = world.getComponent<StoryRuntime>('story', 'StoryRuntime')?.lastReceipt;
    if (receipt?.status === 'rejected') throw new Error(`${receipt.reason ?? 'rejected'} at ${projection?.nodeId}`);
  }
  throw new Error('story did not reach an ending');
}

describe('manor escape approved package', () => {
  it('assembles the approved script and confirmed images without inventing audio', () => {
    const { package: pkg, omittedAudio } = assembleApprovedGalScript(script, approval);
    const keys = new Set([...approval.portraits, ...approval.backgrounds, ...approval.cg].map(item => item.assetKey));
    expect(validateGalPackage(pkg, { resolveAsset: key => keys.has(key) })).toEqual({ ok: true, issues: [] });
    expect(omittedAudio).toEqual(['bgm-manor', 'bgm-outside']);
    expect(pkg.media.audio.bgm).toEqual({});
    expect(pkg.characters.mechanic?.portraits.expressions['专注']).toBe('art:manor-escape/mechanic-focus');
    const stored = read('../../public/games/manor-escape/package.json');
    expect(stored).toEqual(pkg);
  });

  it('reaches both approved endings from the same package', () => {
    expect(play('opt-leave')).toBe('end-leave');
    expect(play('opt-stay')).toBe('end-stay');
  });

  it('registers every approved image in the work art index', () => {
    const index = parseAssetIndex(read('../../public/games/manor-escape/art/index.json'));
    const ids = index.assets.map(asset => asset.id);
    expect(new Set(ids).size).toBe(27);
    expect(index.assets.every(asset => asset.status === 'filled' && asset.type === 'texture' && asset.path?.startsWith('/games/manor-escape/art/'))).toBe(true);
    expect(index.assets.every(asset => asset.source === 'Owner 本机部署的 AI 生成' && asset.provenance?.approvedBy === 'owner')).toBe(true);
    const urls = read('../../public/games/manor-escape/content-urls.json') as Record<string, string>;
    const { package: pkg } = assembleApprovedGalScript(script, approval);
    const referenced = [
      ...Object.values(pkg.characters).flatMap(character => [character.portraits.neutral, ...Object.values(character.portraits.expressions)]),
      ...Object.values(pkg.media.backgrounds).map(item => item.image),
      ...Object.values(pkg.media.cg).map(item => item.image),
    ];
    expect(referenced.every(key => typeof urls[key] === 'string' && urls[key].startsWith('/games/manor-escape/art/'))).toBe(true);
  });
});
/* AI END */

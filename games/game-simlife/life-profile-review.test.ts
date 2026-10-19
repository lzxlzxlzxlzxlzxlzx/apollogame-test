import {describe,expect,it} from 'vitest';
import {deriveAssetSlotBriefFingerprint,type AssetSlotBrief} from '@assets/asset-slot-brief.js';
import {checkLifeGenerationBundle,lifeGenerationPayload,sha256Canonical,type LifeGenerationBundleV1} from '@zerocraft/engine/authoring/life-generation-bundle.js';
import {littleValleyGenerationBundle} from './life-generation-bundle.fixture.js';
import {buildLifeProfileReview,validateLifeProfileReview} from '@zerocraft/engine/authoring/life-profile-review.js';

function fixture():LifeGenerationBundleV1{
  const bundle=littleValleyGenerationBundle() as any;
  bundle.game.lifePackage.logic={...(bundle.game.lifePackage.logic??{}),resources:[{id:'renown',initial:3,min:0,max:10}]};
  bundle.game.lifePackage.relationships=[{npcId:'mayor',min:0,max:100,initial:20,levels:[{id:'known',min:0,titleKey:'Known'}],dailyCaps:{talk:1,gift:1,action:1},rules:[]}];
  bundle.game.lifePackage.profile={titleKey:'Profile',attributes:[{id:'renown',titleKey:'Renown',display:'gauge',source:{kind:'resource',id:'renown'},iconSkinKey:'art:profile:renown',surfaces:['profile','hud']},{id:'bond',titleKey:'Bond',display:'value',source:{kind:'relationship',npcId:'mayor'},iconSkinKey:'art:profile:bond'}]};
  const slot=(index:number,id:string):AssetSlotBrief=>{
    const value={slotId:`profile.${id}`,assetKey:`art:profile:${id}`,kind:'ui-icon' as const,consumers:[{document:'life.json',jsonPointer:`/profile/attributes/${index}/iconSkinKey`}],asset:{usage:'sprite' as const,colorSpace:'srgb' as const,outputPx:{width:32,height:32},alpha:'transparent' as const,sampling:'nearest' as const},render:{display:{unit:'pixel' as const,width:24,height:24},anchor:{x:.5,y:.5},fit:'contain' as const,offset:{x:0,y:0},fallbackRole:'ui-icon' as const},generation:{briefVersion:1,styleId:'test',prompt:`${id} icon`,negativePrompt:['text']},governance:{approval:'placeholder' as const,humanApprovalRequired:true as const,licenseRequired:true as const,briefFingerprint:''}};
    return{...value,governance:{...value.governance,briefFingerprint:deriveAssetSlotBriefFingerprint(value as AssetSlotBrief)}};
  };
  bundle.assetSlots.draft.slots.push(slot(0,'renown'),slot(1,'bond'));
  bundle.provenance.sourceHashes.lifePackage=sha256Canonical(bundle.game.lifePackage);
  bundle.provenance.sourceHashes.assetSlotsDraft=sha256Canonical(bundle.assetSlots.draft);
  bundle.provenance.baseHash=sha256Canonical(lifeGenerationPayload(bundle));
  return bundle;
}

describe('LifeProfileReview v1',()=>{
  it('binds canonical bundle hash and authored rows to exact authoritative sources and ui-icon consumers',()=>{
    const bundle=fixture();const result=buildLifeProfileReview(bundle);expect(result.valid).toBe(true);
    if(!result.valid)return;
    expect(result.review.inputHash).toBe(checkLifeGenerationBundle(bundle).canonicalHash);
    expect(result.review.rows).toMatchObject([{id:'renown',surfaces:['profile','hud'],initial:3,range:{min:0,max:10},icon:{slotId:'profile.renown',status:'placeholder'}},{id:'bond',surfaces:['profile'],initial:20,relationshipLevel:{id:'known',titleKey:'Known'},icon:{slotId:'profile.bond',status:'placeholder'}}]);
    expect(validateLifeProfileReview(bundle,result.review)).toEqual([]);
    const roundTrip=JSON.parse(JSON.stringify(result.review));
    expect(validateLifeProfileReview(bundle,roundTrip)).toEqual([]);
    expect(buildLifeProfileReview(structuredClone(bundle))).toMatchObject({valid:true,review:{inputHash:result.review.inputHash}});
  });
  it('fails closed on missing icon consumers, stale hashes and forged rows',()=>{
    const bundle=fixture();const mutable=bundle as any;mutable.assetSlots.draft.slots.pop();
    mutable.provenance.sourceHashes.assetSlotsDraft=sha256Canonical(bundle.assetSlots.draft);mutable.provenance.baseHash=sha256Canonical(lifeGenerationPayload(bundle));
    expect(buildLifeProfileReview(bundle)).toMatchObject({valid:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'bundle_missing_slot'})])});
    const fresh=fixture();const built=buildLifeProfileReview(fresh);expect(built.valid).toBe(true);if(!built.valid)return;
    const stale=structuredClone(built.review) as any;stale.inputHash=`sha256:${'0'.repeat(64)}`;expect(validateLifeProfileReview(fresh,stale)[0]?.code).toBe('stale_input_hash');
    const forged=structuredClone(built.review) as any;forged.rows[0].initial=99;expect(validateLifeProfileReview(fresh,forged)[0]?.code).toBe('review_drift');
  });
});

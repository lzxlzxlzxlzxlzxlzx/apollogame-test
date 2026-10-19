import type { AssetSlotBrief } from '@assets/asset-slot-brief.js';
import type { LifeGamePackage, LifeProfileSource } from '@engine/protocol/life-sim.js';
import { canonicalLifeGenerationJson, checkLifeGenerationBundle, type LifeGenerationBundleV1, type LifeGenerationDiagnostic } from './life-generation-bundle.js';

export const LIFE_PROFILE_REVIEW_SCHEMA = 'zerocraft.life-profile-review.v1' as const;

export interface LifeProfileReviewRow {
  readonly id:string;
  readonly titleKey:string;
  readonly display:'value'|'gauge';
  readonly surfaces:readonly ('profile'|'hud')[];
  readonly source:LifeProfileSource;
  readonly initial:number;
  readonly range:{readonly min:number;readonly max:number};
  readonly relationshipLevel?:{readonly id:string;readonly titleKey:string};
  readonly icon:{
    readonly skinKey:string;
    readonly slotId:string;
    readonly consumer:{readonly document:'life.json';readonly jsonPointer:string};
    readonly status:AssetSlotBrief['governance']['approval'];
  };
}

export interface LifeProfileReviewV1 {
  readonly schemaVersion:typeof LIFE_PROFILE_REVIEW_SCHEMA;
  readonly game:string;
  readonly inputHash:string;
  readonly titleKey:string;
  readonly rows:readonly LifeProfileReviewRow[];
}

export interface LifeProfileReviewDiagnostic { readonly path:string;readonly code:string;readonly message:string }
export type LifeProfileReviewBuildResult =
  | {readonly valid:true;readonly diagnostics:readonly [];readonly review:LifeProfileReviewV1}
  | {readonly valid:false;readonly diagnostics:readonly LifeProfileReviewDiagnostic[]};

const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const fromBundleDiagnostic=(value:LifeGenerationDiagnostic):LifeProfileReviewDiagnostic=>({path:value.path,code:`bundle_${value.code}`,message:value.message});

/** One-way review projection. It cannot introduce profile rows, values, or asset approval. */
export function buildLifeProfileReview(rawBundle:unknown):LifeProfileReviewBuildResult {
  const checked=checkLifeGenerationBundle(rawBundle);
  if(!checked.ok||checked.canonicalHash===undefined)return{valid:false,diagnostics:checked.diagnostics.map(fromBundleDiagnostic)};
  const bundle=rawBundle as LifeGenerationBundleV1;
  const life=bundle.game.lifePackage as LifeGamePackage;
  if(!life.profile)return{valid:false,diagnostics:[{path:'/game/lifePackage/profile',code:'profile_required',message:'profile review requires a Life profile declaration'}]};
  const resources=new Map((life.logic?.resources??[]).map((value)=>[value.id,value]));
  const relationships=new Map((life.relationships??[]).map((value)=>[value.npcId,value]));
  const diagnostics:LifeProfileReviewDiagnostic[]=[];
  const rows:LifeProfileReviewRow[]=[];
  life.profile.attributes.forEach((attribute,index)=>{
    const pointer=`/profile/attributes/${index}/iconSkinKey`;
    const matches=bundle.assetSlots.draft.slots.filter((slot)=>slot.kind==='ui-icon'&&slot.assetKey===attribute.iconSkinKey&&slot.consumers.some((consumer)=>consumer.document==='life.json'&&consumer.jsonPointer===pointer));
    if(matches.length!==1){diagnostics.push({path:`/game/lifePackage${pointer}`,code:matches.length===0?'profile_icon_consumer_missing':'profile_icon_consumer_ambiguous',message:`profile attribute ${attribute.id} must have exactly one ui-icon AssetSlot consumer at life.json#${pointer}`});return;}
    if(attribute.source.kind==='resource'){
      const value=resources.get(attribute.source.id);
      if(!value){diagnostics.push({path:`/game/lifePackage/profile/attributes/${index}/source/id`,code:'profile_source_missing',message:'resource source is missing'});return;}
      rows.push({...attribute,surfaces:attribute.surfaces??['profile'],source:{...attribute.source},initial:value.initial,range:{min:value.min,max:value.max},icon:{skinKey:attribute.iconSkinKey,slotId:matches[0]!.slotId,consumer:{document:'life.json',jsonPointer:pointer},status:matches[0]!.governance.approval}});
      return;
    }
    const value=relationships.get(attribute.source.npcId);
    if(!value){diagnostics.push({path:`/game/lifePackage/profile/attributes/${index}/source/npcId`,code:'profile_source_missing',message:'relationship source is missing'});return;}
    const level=[...value.levels].filter((candidate)=>candidate.min<=value.initial).at(-1)!;
    rows.push({...attribute,surfaces:attribute.surfaces??['profile'],source:{...attribute.source},initial:value.initial,range:{min:value.min,max:value.max},relationshipLevel:{id:level.id,titleKey:level.titleKey},icon:{skinKey:attribute.iconSkinKey,slotId:matches[0]!.slotId,consumer:{document:'life.json',jsonPointer:pointer},status:matches[0]!.governance.approval}});
  });
  if(diagnostics.length)return{valid:false,diagnostics};
  return{valid:true,diagnostics:[],review:{schemaVersion:LIFE_PROFILE_REVIEW_SCHEMA,game:bundle.game.slug,inputHash:checked.canonicalHash,titleKey:life.profile.titleKey,rows}};
}

export function validateLifeProfileReview(rawBundle:unknown,rawReview:unknown):readonly LifeProfileReviewDiagnostic[]{
  const built=buildLifeProfileReview(rawBundle);
  if(!built.valid)return built.diagnostics;
  if(!record(rawReview))return[{path:'$',code:'review_type',message:'profile review must be an object'}];
  const expectedKeys=['game','inputHash','rows','schemaVersion','titleKey'];const actualKeys=Object.keys(rawReview).sort();
  if(actualKeys.length!==expectedKeys.length||actualKeys.some((key,index)=>key!==expectedKeys[index]))return[{path:'$',code:'review_closed',message:'profile review must use the closed v1 shape'}];
  if(rawReview.schemaVersion!==LIFE_PROFILE_REVIEW_SCHEMA)return[{path:'/schemaVersion',code:'review_schema',message:'profile review schema does not match v1'}];
  if(rawReview.inputHash!==built.review.inputHash)return[{path:'/inputHash',code:'stale_input_hash',message:'profile review inputHash does not match the current bundle'}];
  for(const key of ['game','titleKey','rows'] as const)if(canonicalLifeGenerationJson(rawReview[key])!==canonicalLifeGenerationJson(built.review[key]))return[{path:`/${key}`,code:'review_drift',message:`${key} does not match the current bundle projection`}];
  return[];
}

export function parseLifeProfileReview(rawBundle:unknown,rawReview:unknown):LifeProfileReviewV1{
  const diagnostics=validateLifeProfileReview(rawBundle,rawReview);
  if(diagnostics.length)throw new Error(`Invalid LifeProfileReview:\n${diagnostics.map((entry)=>`${entry.path} [${entry.code}] ${entry.message}`).join('\n')}`);
  return rawReview as LifeProfileReviewV1;
}

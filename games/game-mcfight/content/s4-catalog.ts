import { S4_BALANCE_V1, S4_UNIT_IDS, secondsToTicks, speedPerTick, type S4SkillId } from './s4-balance.js';

/** Unspecified S4 animation timings remain explicit experimental template defaults. */
export const S4_TEMPLATE_EXPERIMENT = Object.freeze({ windupSeconds: .35, recoverySeconds: .45, regionLifeTicks: 2, chargeMaxTravel: 40 });
export interface S4SkillTemplate {
  id: S4SkillId; form: 'melee' | 'projectile' | 'area' | 'dive' | 'charge' | 'beam' | 'heal';
  damage: number; cd: number; range: number; windup: number; recovery: number; radius: number;
  speed?: number; life: number; blockedBy?: string;
  releaseAt?: 'self' | 'target';
  minRange?: number; safeRadius?: number; hpThreshold?: number;
  onHitStatus?: 'burn'|'wither'|'slow'|'poison';
}
const b = S4_BALANCE_V1.skills, ticks = secondsToTicks;
const base = (id: S4SkillId, form: S4SkillTemplate['form'], damage: number, cd: number, range: number): S4SkillTemplate => ({
  id, form, damage, cd: ticks(cd), range, windup: ticks(S4_TEMPLATE_EXPERIMENT.windupSeconds),
  recovery: ticks(S4_TEMPLATE_EXPERIMENT.recoverySeconds), radius: .1, life: S4_TEMPLATE_EXPERIMENT.regionLifeTicks,
});
export const s4SkillTemplates: readonly S4SkillTemplate[] = [
  { ...base('slash', 'melee', b.slash.damage, b.slash.cd, b.slash.range), windup: ticks(b.slash.windup), recovery: ticks(b.slash.recovery) },
  { ...base('arrow', 'projectile', b.arrow.damage, b.arrow.cd, b.arrow.range), windup: ticks(b.arrow.windup), recovery: ticks(b.arrow.recovery), radius: b.arrow.radius, speed: speedPerTick(b.arrow.speed), life: ticks(b.arrow.travel / b.arrow.speed) },
  { ...base('dive', 'dive', b.dive.damage, b.dive.cd, b.dive.range), windup: ticks(b.dive.descend), recovery: ticks(b.dive.rise), radius: b.dive.radius, life: ticks(b.dive.contact) },
  { ...base('charge', 'charge', b.charge.damage, b.charge.cd, S4_TEMPLATE_EXPERIMENT.chargeMaxTravel), radius: b.charge.radius, speed: speedPerTick(b.charge.speed), minRange: b.charge.minRange, life: ticks(S4_TEMPLATE_EXPERIMENT.chargeMaxTravel / b.charge.speed) },
  base('strike', 'melee', b.strike.damage, b.strike.cd, b.strike.range),
  { ...base('quake', 'area', b.quake.damage, b.quake.cd, b.quake.radius), radius: b.quake.radius, windup: ticks(b.quake.windup), releaseAt: 'self' },
  { ...base('beam', 'beam', b.beam.damage, b.beam.cd, b.beam.range), windup: ticks(b.beam.windup), radius: b.beam.width / 2 },
  { ...base('potion', 'area', b.potion.damage, b.potion.cd, b.potion.range), radius: b.potion.radius, releaseAt: 'target' },
  { ...base('heal', 'heal', -b.heal.healing, b.heal.cd, 0), safeRadius: b.heal.safeRadius, hpThreshold: b.heal.hpRatioAtMost },
];
export const s4Catalog = {
  units: S4_UNIT_IDS.map(id => ({ id, ...S4_BALANCE_V1.units[id], decisionProfileId: `${id}-decision`, presentationProfileId: `${id}-placeholder` })),
  loadouts: s4SkillTemplates.map(template => ({ id: template.id, templateId: template.id })),
  templates: s4SkillTemplates,
  decisions: S4_UNIT_IDS.map(id => ({ id: `${id}-decision`, candidates: [...S4_BALANCE_V1.units[id].skills] })),
  presentations: S4_UNIT_IDS.map(id => ({ id: `${id}-placeholder`, kind: 'geometry', radius: S4_BALANCE_V1.units[id].radius })),
};

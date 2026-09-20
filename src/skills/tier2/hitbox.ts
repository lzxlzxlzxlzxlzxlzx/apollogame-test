import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { DamageReceiver, DamageRequest, DeathConversion, Trigger, Hitbox, Tag, Status, Resource, DestroyRequest, PrefabOrigin, Transform, SpawnRequest, ProjectileFlight, MobilityLock } from '@engine/protocol/components.js';
import { findByComponentId, findSourceResource } from '@engine/core/query.js';
import { queueResourceMod } from '@skills/atoms/resource/index.js';
import { checkEntity } from './entity-check.js';
import { findDebugTrace, appendTrace } from '@skills/debug-trace.js';
import { addTimedEffect } from './over-time.js';

// 全局按 id 找 Resource（REQ-F-047 系数乘区；R11 路由的只读侧）。
function findResourceById(world: IWorld, id: string): Resource | undefined {
  const e = findByComponentId(world, 'Resource', 'id', id);
  return e ? world.getComponent<Resource>(e, 'Resource') : undefined;
}

// scaleByResource 解析（REQ-F-065 per-caster 异质缩放）：先查「施法者本地」——伤害区的源实体
// （PrefabOrigin.source，由 caster/self-rule 盖章）自身、或其**同次展开的复合兄弟**（同 templateId+seq，
// 如棋子的子件）所持的 resId Resource（口径见 engine/core/query.ts 的 findSourceResource，
// resource-apply 的 ResourceModify.scope:'source' 共用同一份查找，REQ-SPENDONFIRE）；
// 未命中再回退**全局** findResourceById（团队系数 dmg_scale 等行为不变，本函数读侧专属默认）。
// 让"每将装备不同 → atk 加成异质"用一份 strike 模板 + per-unit 资源缩放表达，退掉星级/装备的模板族爆炸。
function findScaleResource(world: IWorld, zoneId: string, resId: string): Resource | undefined {
  const src = world.getComponent<PrefabOrigin>(zoneId, 'PrefabOrigin')?.source;
  if (src) {
    const r = findSourceResource(world, src, resId);
    if (r) return r;
  }
  return findResourceById(world, resId); // 全局回退（无 source / 未命中本地）
}

// ═══════════════════════════════════════════════════════════════
//  hitbox —— 关系型战斗核心（ARPG 能力簇）。把"攻击判定命中 → 对命中目标结算"变成纯数据。
//
//  复用 trigger-zone（不重走 Overlap）：伤害区实体标 ZONE_FLAG → trigger-zone 产
//  Trigger{zone:hitbox, other:目标}。本能力读 Trigger，对每个 other（目标）：
//    ① 阵营过滤：hb.targetMask 非 0 时要求 target.Tag.flags & targetMask（friend/foe）。
//    ② 状态门　：hb.requireMask 非 0 时要求 target.Status.flags 含齐这些位（如碎冰要求 frozen）。
//    ③ 伤害　　：dmg = hb.amount + floor(target.maxOf(resource) * fracOfMax)；以**局部**
//        ResourceModify(scope:'local') 挂到 target → resource-apply 改 target 自己的 Resource（逐目标）。
//    ④ 状态　　：setMask 置位、clearMask 清位 target.Status（set frozen / clear frozen）。
//
//  一口气覆盖 ARPG 五缺口：接触→伤害(1) / 逐目标(2) / 计算数值(3) / 阵营过滤(4) /
//  AOE fan-out(5：一个伤害区重叠 N 目标 → N 个 Trigger → 各自结算)。
//  确定性：只读 Trigger/Tag/Status/Resource + 位运算/整数算术，无浮点超越函数 → 单端录放一致。
//  定序：runsAfter trigger-zone（要 Trigger 已就绪）、runsBefore resource-apply（产 ResourceModify）。
//  burst vs 持续：瞬时 nova 用短 Timer（命中一拍即销毁）；持续火环靠长寿命每拍结算（生命周期控制）。
//
//  已知约束（R14 同源）：一实体一组件 → 同一目标同一 tick 被多个 hitbox 命中时，后写的 ResourceModify
//  覆盖前者（少数同帧多 AOE 叠加场景）。瞬时技能逐拍单发不触发；批量叠加待 R14 的"批改资源"演进。
//
//  onHit（薄缺口，2026-07-26 Lead 裁：命中即生成——击中火花/受击特效，穿透武器每命中一喷）：命中
//  （过滤门通过）时若 hb.onHit.spawnTemplate 存在 → 在 target 位置发 SpawnRequest（spawnOnHit helper，
//  独立 carrier 实体，同 mortal/path-follow 先例）。cadence 与伤害**同拍**：持续重叠多 tick（常驻光环/
//  贯穿激光滞留）→ 每 tick 每 Trigger 各喷一次（与伤害每 tick 结算一致，符合预期）；一次性命中（抛射体
//  撞完即毁）=一次。若某游戏要「每目标只喷一次」= 游戏层 cooldown/调优，不在本引擎缺口内。AOE/穿透
//  fan-out 天然成立（多 Trigger 各自 spawnOnHit）。缺省不填 = 零回归，现有 hitbox 行为逐字节不变。
// ═══════════════════════════════════════════════════════════════

function maxOf(world: IWorld, entity: string, resourceId: string): number {
  const r = world.getComponent<Resource>(entity, 'Resource');
  return r && r.id === resourceId ? r.max : 0;
}

// 命中特效（onHit）：在 target 位置（命中点近似，读 target 自己的 Transform）发 SpawnRequest。
// 挂到独立 carrier 实体（同 mortal.ts dropTemplate / path-follow.ts onEnd 先例——不挂 target 自身，
// 避免同 tick 多个 zone 命中同一 target 时互相覆盖 target 上的组件，也避免 target 恰好本 tick 被
// 销毁时组件跟着消失）。carrier id = `onhit:<zone>:<target>`，与 trigger-zone 的 `trigger:<zone>:<other>`
// 同一 (zone,target) 配对下天然唯一（每 tick 至多一条同 key Trigger）。
// 幂等重建、勿裸 createEntity（同 battle-timeline.ts pump() 的 try-destroy-then-create 先例）：持续重叠
// 场景本函数每 tick 都会用同一 carrier id 再发一次。正常路径下 prefab 当拍已消费**并销毁**整个 carrier
// 实体，下一拍这里等价于"不存在→新建"。但若这局没装 prefab（或消费者尚未跑到）——引擎 tick() 的通用
// consumes 清理会在 prefab-spawn 执行后无条件剥掉 SpawnRequest 组件（不管 system 内部代码是否真读到，
// 见 world.ts tick()），只留一具 0 组件的空壳实体：光查"组件还在不在"判不出"实体还在不在"，必须显式
// destroy 再 create。destroyEntity 对不存在的 id 是安全 no-op（World.destroyEntity 实现），故无条件调用
// 零风险；两次调用都只读写整数/字符串 id，无随机无墙钟，确定性不变。
function spawnOnHit(world: IWorld, zoneId: string, hb: Hitbox, target: string): void {
  if (!hb.onHit?.spawnTemplate) return;
  const t = world.getComponent<Transform>(target, 'Transform');
  const carrier = `onhit:${zoneId}:${target}`;
  world.destroyEntity(carrier);
  world.createEntity(carrier);
  world.addComponent(carrier, {
    type: 'SpawnRequest',
    templateId: hb.onHit.spawnTemplate,
    x: t?.x ?? 0,
    y: t?.y ?? 0,
  } as SpawnRequest);
}

export const hitboxCapability = defineCapability({
  id: 't2-hitbox',
  version: '1.0.0',

  describe: {
    name: 'hitbox',
    summary: '攻击判定命中结算：读 Trigger（伤害区→目标），按 Tag 阵营 + Status 门过滤，对命中目标施局部伤害（含 % max 计算伤害）+ 置/清 Status 位。',
    semantic: ['tier2', 'combat', 'damage'],
    whenToUse:
      'ARPG/动作/塔防/弹幕的伤害结算。伤害区挂 Hitbox + Shape + Sensor + Tag(含 ZONE_FLAG)；目标挂 Tag(阵营) + Resource(hp) + 可选 Status。整套战斗 = 数据，无游戏代码。',
    examples: [
      '冰霜新星：Hitbox{ resource:"hp", amount:5, targetMask:ENEMY, setMask:FROZEN } → 命中所有敌人，扣血 + 冻结',
      '碎冰重锤：Hitbox{ resource:"hp", fracOfMax:0.2, targetMask:ENEMY, requireMask:FROZEN, clearMask:FROZEN } → 只对冰冻敌人结算 20% maxHP 真伤并解冻',
      'AOE：一个伤害区与 N 个敌人重叠 → N 个 Trigger → 各自结算（fan-out）',
    ],
  },

  components: {
    provides: {
      Hitbox: {
        category: 'config',
        describe: '攻击判定：对进入的目标按阵营/状态过滤后施伤害（固定 amount 或 fracOfMax 计算）+ 置/清 Status。',
        fields: {
          onlyTarget: { type: 'string', describe: '可选单一实体身份过滤，不改变碰撞形状' },
          sourceCheck: { type: 'string', describe: '每次接触检查PrefabOrigin.source资格；失败清理区域' },
          resource: { type: 'string', describe: '目标身上要改的 Resource id（如 hp）' },
          damageType: { type: 'string', describe: '普通/真伤类别，传递公共伤害路由' },
          armorPiercing: { type: 'boolean', describe: '路由时护甲与韧性按0，保留非护甲倍率' },
          damageOrigin: { type:'string',describe:'direct/indirect；未指定保留直接来源语义' },
          routePeriodicDamage: { type:'boolean',describe:'DoT显式经过公共伤害路由，保留来源与实际扣血回执' },
          dotEffectId: { type:'string',describe:'状态身份；不同中毒/燃烧/凋零可以独立刷新' },
          amount: { type: 'number', describe: '固定伤害（正数 = 伤害，内部按负向施加）' },
          fracOfMax: { type: 'number', describe: '计算伤害 = 目标该资源 max 的此分数（0.2 = 20%）' },
          targetMask: { type: 'number', describe: '仅作用于 Tag.flags 含此位的目标（阵营过滤；0 = 不限）' },
          requireMask: { type: 'number', describe: '仅作用于 Status.flags 含齐此位的目标（如 frozen）' },
          requireHpFracBelow: { type: 'number', describe: '仅作用于 hp 比例 < 此值的目标（残血技；REQ-F-061）' },
          requireHpFracAbove: { type: 'number', describe: '仅作用于 hp 比例 >= 此值的目标（满血/精英技）' },
          executeBelow: { type: 'number', describe: '命中且 hp 比例 < 此值 → 处决清 0（斩杀；与 amount 同存）' },
          setMask: { type: 'number', describe: '命中后给目标 Status 置这些位' },
          clearMask: { type: 'number', describe: '命中后清目标 Status 这些位' },
          statusDuration: { type: 'number', describe: '>0：命中置 setMask 后过 N tick 自动清除（挂 OverTime，定时冻结/眩晕）' },
          dotPerTick: { type: 'number', describe: '>0：每 dotPeriod tick 对目标 resource 造成此真伤（中毒/燃烧 DoT，挂 OverTime）' },
          dotPeriod: { type: 'number', describe: 'DoT 结算周期 tick（缺省 1）' },
          dotDuration: { type: 'number', describe: 'DoT 总时长 tick' },
          onHit: { type: 'string', describe: '{spawnTemplate}：命中（过滤门通过后）在目标位置发 SpawnRequest；缺省不发（击中火花/受击特效/穿透弹逐命中生成）' },
          onHitStatus: { type: 'string', describe: "命中后附加数据驱动状态[{id,duration,damagePerTick,period,multiplier}]；未命中不附加" },
        },
      },
    },
    reads: ['Trigger', 'Hitbox', 'Tag', 'Status', 'Resource', 'PrefabOrigin', 'Transform', 'FrameStartTransform', 'DamageReceiver', 'DeathConversion', 'DestroyRequest'],
    writes: ['ResourceModify', 'Status', 'OverTime', 'DestroyRequest', 'SpawnRequest', 'DamageRequest'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'hitbox',
      phase: SystemPhase.Resolve,
      reads: ['Trigger', 'Hitbox', 'Tag', 'Status', 'Resource', 'PrefabOrigin', 'Transform', 'FrameStartTransform', 'DamageReceiver', 'DeathConversion', 'DestroyRequest'],
      // DestroyRequest：REQ-F-044 consumeOnHit 自毁（写者→cascade/destroy-apply 单向汇入，无回边）。
      // SpawnRequest：onHit 命中特效——唯一读+consume 它的是 prefab（t3-prefab），prefab 不写
      // Trigger/Hitbox/Tag/Status/Resource，只产生本系统→prefab 单向边，不成环（见文件头/回归测试）。
      writes: ['ResourceModify', 'Status', 'OverTime', 'DestroyRequest', 'SpawnRequest', 'DamageRequest'],
      consumes: [],
      runsAfter: ['trigger-zone'],
      // 先施加伤害/状态/挂 OverTime，再让 over-time tick 既有状态效果，最后 resource-apply 结算。
      // hitbox 与 over-time 都 read-modify-write Status → 组件拓扑互为前驱=环，显式定序打破（R10 同法）。
      // Read deletion intents already issued before contact (e.g. Flow capture),
      // not Mortal's later result of this contact's own damage. The explicit
      // edge retains Hitbox -> damage -> resource -> Mortal and prevents the
      // shared DestroyRequest declaration from inferring Mortal -> Hitbox.
      runsBefore: ['resource-apply', 'over-time', 'mortal'],
      execute(world: IWorld) {
        // REQ-F-044：本拍真正结算过命中的 zone 实体集（consumeOnHit 结算后自毁；集合语义与遍历序无关）。
        const settled = new Set<string>();
        const trace = findDebugTrace(world);
        const rejected: string[] = [];
        // Capture deletion is effective before physical destruction. Guarded
        // effects must stop now, including regions spawned on a previous tick.
        const doomed = new Set(world.query('DestroyRequest').map(([id]) => world.getComponent<DestroyRequest>(id, 'DestroyRequest')!.entityId));
        for (const [zoneId] of world.query('Hitbox')) {
          const hb = world.getComponent<Hitbox>(zoneId, 'Hitbox')!;
          if (!hb.sourceCheck) continue;
          const source = world.getComponent<PrefabOrigin>(zoneId, 'PrefabOrigin')?.source;
          if (!source || doomed.has(source) || !checkEntity(world, source, hb.sourceCheck)) {
            settled.add(zoneId);
            if (trace) rejected.push(zoneId);
          }
        }
        const invalidSources = new Set(settled);
        if (trace && rejected.length) appendTrace(trace, world.getVersion() + 1, 'hitbox', 'reject', rejected.join(','), 'invalid source: effect cancelled');
        for (const [tid] of world.query('Trigger')) {
          const trig = world.getComponent<Trigger>(tid, 'Trigger')!;
          const hb = world.getComponent<Hitbox>(trig.zone, 'Hitbox');
          if (!hb || invalidSources.has(trig.zone)) continue;
          const flight = world.getComponent<ProjectileFlight>(trig.zone, 'ProjectileFlight');
          if (flight?.exhausted) continue;
          if (hb.sourceCheck && !flight) {
            const source = world.getComponent<PrefabOrigin>(trig.zone, 'PrefabOrigin')?.source;
            if (!source || doomed.has(source) || !checkEntity(world, source, hb.sourceCheck)) {
              invalidSources.add(trig.zone); settled.add(trig.zone); continue;
            }
          }
          const target = trig.other;
          if (hb.onlyTarget !== undefined && hb.onlyTarget !== target) continue;

          // B4 category filters are a physical-hit eligibility gate: a rejected
          // category is not a successful contact and must not apply statuses.
          const category = hb.damageCategory ?? (hb.damageType === 'true' ? 'true' : 'melee');
          const targetReceiver = world.getComponent<DamageReceiver>(target, 'DamageReceiver');
          if (targetReceiver?.rejectDamageCategories?.includes(category)) continue;

          // ① 阵营过滤
          if (hb.targetMask) {
            const tag = world.getComponent<Tag>(target, 'Tag');
            if (!tag || (tag.flags & hb.targetMask) === 0) continue;
          }
          // ② 状态门
          if (hb.requireMask) {
            const st = world.getComponent<Status>(target, 'Status');
            if (!st || (st.flags & hb.requireMask) !== hb.requireMask) continue;
          }
          // ②.5 血量比例门 / 处决（REQ-F-061）：只读目标当前 hp 比例(current/max)做 gate（残血/满血条件技）；
          //      处决=命中即清 0（与 amount 同存 → 低于阈值斩杀、否则走常规伤害）。乘法比较避免除法（同 fracOfMax 风格，确定）。
          if (hb.requireHpFracBelow !== undefined || hb.requireHpFracAbove !== undefined || hb.executeBelow !== undefined) {
            const tr = world.getComponent<Resource>(target, 'Resource');
            const hasHp = !!tr && tr.id === hb.resource && tr.max > 0;
            if (hb.requireHpFracBelow !== undefined && (!hasHp || tr!.current >= tr!.max * hb.requireHpFracBelow)) continue;
            if (hb.requireHpFracAbove !== undefined && (!hasHp || tr!.current < tr!.max * hb.requireHpFracAbove)) continue;
            if (hb.executeBelow !== undefined && hasHp && tr!.current > 0 && tr!.current < tr!.max * hb.executeBelow) {
              queueResourceMod(world, target, hb.resource, -tr!.current, 'local'); // 清 0 = 处决
              settled.add(trig.zone);
              spawnOnHit(world, trig.zone, hb, target); // 处决也是命中，同样喷 onHit
              continue; // 处决即终结，跳过常规伤害/状态，避免双结算
            }
          }
          // ③ 伤害（固定 + 计算），局部寻址到目标自身。queueResourceMod 累加 → 同帧多段命中不丢伤害（R14 真修 A）。
          // REQ-F-047 活系数乘区：amount × 全局系数资源（缺省 ×1）；fracOfMax 不乘（保"按目标 max"语义）。
          let base = hb.amount ?? 0;
          if (hb.scaleByResource) {
            const coef = findScaleResource(world, trig.zone, hb.scaleByResource);
            if (coef) base = base * coef.current;
          }
          let dmg = base;
          if (hb.fracOfMax) dmg += Math.floor(maxOf(world, target, hb.resource) * hb.fracOfMax);
          if (dmg !== 0) {
            const receiver=world.getComponent<DamageReceiver>(target,'DamageReceiver');
            const conversion=world.getComponent<DeathConversion>(target,'DeathConversion');
            if(receiver?.resource===hb.resource||conversion?.resource===hb.resource){
              const id=`damage:${tid}`,source=flight?.shot?.source??world.getComponent<PrefabOrigin>(trig.zone,'PrefabOrigin')?.source??trig.zone;
              world.createEntity(id);world.addComponent(id,{type:'DamageRequest',target,source,sourceTags:flight?.shot?.sourceTags??world.getComponent<Tag>(source,'Tag')?.flags??0,resource:hb.resource,amount:dmg,damageType:hb.damageType,damageCategory:hb.damageCategory,knockback:hb.knockback,armorPiercing:hb.armorPiercing,origin:hb.damageOrigin} as DamageRequest);
            }else queueResourceMod(world, target, hb.resource, -dmg, 'local');
          }
          settled.add(trig.zone); // 过了阵营/状态门=真结算（含纯状态命中）
          if (hb.singleImpact && flight) flight.exhausted = true;
          spawnOnHit(world, trig.zone, hb, target); // onHit：命中即生成（击中火花/受击特效，穿透每命中各喷一个）
          // ④ Status 置/清位
          if (hb.setMask || hb.clearMask) {
            let st = world.getComponent<Status>(target, 'Status');
            if (!st) {
              world.addComponent(target, { type: 'Status', flags: 0 } as Status);
              st = world.getComponent<Status>(target, 'Status')!;
            }
            if (hb.setMask) st.flags |= hb.setMask;
            if (hb.clearMask) st.flags &= ~hb.clearMask;
          }
          if (hb.onHitStatus?.length) {
            let st = world.getComponent<Status>(target, 'Status');
            if (!st) { world.addComponent(target, { type: 'Status', flags: 0 } as Status); st = world.getComponent<Status>(target, 'Status')!; }
            const statusSource = flight?.shot?.source ?? world.getComponent<PrefabOrigin>(trig.zone, 'PrefabOrigin')?.source ?? trig.zone;
            const statusTags = flight?.shot?.sourceTags ?? world.getComponent<Tag>(statusSource, 'Tag')?.flags ?? 0;
            st.effects = st.effects ?? [];
            for (const effect of hb.onHitStatus) {
              const prev = st.effects.find(e => e.id === effect.id);
              if (prev) { prev.multiplier = Math.max(prev.multiplier ?? 1, effect.multiplier ?? 1); prev.source = statusSource; prev.sourceTags = statusTags; }
              else st.effects.push({ id: effect.id, multiplier: effect.multiplier, source: statusSource, sourceTags: statusTags });
              if (effect.statusMask) {
                st.flags |= effect.statusMask;
                addTimedEffect(world, target, { id: `status:${effect.id}`, period: 1, duration: effect.duration, elapsed: 0, clearStatusOnEnd: effect.statusMask });
              }
              if ((effect.damagePerTick ?? 0) > 0 && effect.duration > 0) addTimedEffect(world, target, { id: effect.id, resource: hb.resource, amountPerTick: -(effect.damagePerTick ?? 0), period: Math.max(1, effect.period ?? 20), duration: effect.duration, elapsed: 0, damageRoute: { source: statusSource, sourceTags: statusTags } });
            }
          }
          // A mobility lock is a separate, refreshable effect.  It deliberately
          // does not write a hard-control Status bit, so Flow/cooldown behaviour
          // continues while movement is vetoed by the B3 capability.
          if (hb.onHitMobilityLock && (!hb.onHitMobilityLock.requireTagMask || (world.getComponent<Tag>(target, 'Tag')?.flags ?? 0) & hb.onHitMobilityLock.requireTagMask)) {
            const prior = world.getComponent<MobilityLock>(target, 'MobilityLock');
            const untilTick = world.getVersion() + hb.onHitMobilityLock.duration;
            if (prior) {
              prior.untilTick = Math.max(prior.untilTick, untilTick);
              prior.groundWhileLocked = prior.groundWhileLocked || hb.onHitMobilityLock.groundWhileLocked;
            } else {
              const current = world.getComponent<Status>(target, 'Status')?.flags ?? 0;
              world.addComponent(target, { type:'MobilityLock', untilTick, groundWhileLocked: hb.onHitMobilityLock.groundWhileLocked,
                originalAir: (current & 4) !== 0, originalGround: (current & 8) !== 0 } as MobilityLock);
            }
          }
          // ⑤ 时间维度（D-003 + R14 真修 B）：命中时 addTimedEffect 追加到目标 OverTime 列表。
          //    DoT 与"定时状态清除"现在**可同时挂**（各一条 TimedEffect，不再二选一）；同 id 刷新防叠爆。
          if (hb.dotPerTick && hb.dotDuration) {
            const source=world.getComponent<PrefabOrigin>(trig.zone,'PrefabOrigin')?.source??trig.zone;
            addTimedEffect(world, target, {
              id: hb.dotEffectId??`dot:${hb.resource}`,
              resource: hb.resource,
              amountPerTick: -hb.dotPerTick,
              period: hb.dotPeriod ?? 1,
              duration: hb.dotDuration,
              elapsed: 0,
              ...(hb.routePeriodicDamage?{damageRoute:{source,sourceTags:world.getComponent<Tag>(source,'Tag')?.flags??0}}:{}),
            });
          }
          if (hb.statusDuration && hb.setMask) {
            addTimedEffect(world, target, {
              id: `status:${hb.setMask}`,
              period: 1,
              duration: hb.statusDuration,
              elapsed: 0,
              clearStatusOnEnd: hb.setMask,
            });
          }
        }
        // REQ-F-044：单发结算——结算过的 consumeOnHit zone 自毁（DestroyRequest 请求制，cascade 连挂件，
        // 次拍 destroy-apply 移除；站桩金币泵的原子解）。
        for (const zid of settled) {
          const hb = world.getComponent<Hitbox>(zid, 'Hitbox');
          if ((invalidSources.has(zid) || hb?.consumeOnHit) && !world.hasComponent(zid, 'DestroyRequest')) {
            world.addComponent(zid, { type: 'DestroyRequest', entityId: zid } as DestroyRequest);
          }
        }
      },
    },
  ],
});

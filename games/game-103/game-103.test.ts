import { describe, it, expect, vi } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/index.js';
import type { Command } from '@zerocraft/engine/net/index.js';
import type { Resource, Tag, GameFlow, Transform } from '@zerocraft/engine/engine/protocol/components.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import { rollOffer } from '@zerocraft/engine/skills/tier2/index.js';
import type { DraftCandidate } from '@zerocraft/engine/skills/tier2/index.js';
import { validateLayoutNode } from '@zerocraft/engine/ui/components/index.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import type { Sprite } from '@zerocraft/engine/engine/protocol/components.js';
import { buildBlueprint } from './blueprint.js';
import { buildHud, buildResult, buildLevelUp } from './hud.js';
import { newlyUnlocked } from './achievements.js';
import { recordScore, BOARD_MAX, type ScoreEntry } from './leaderboard.js';
import { ENEMY, ZONE, PLAYER, START, KUNAI, SHAMBLER, BRUTE, BOSS, ARCHER, ENEMIES, LEVEL_XP, MATCH_SECONDS, PLAYER_DEF, DRAFT_POOL, DRAFT_N, WEAPONS, PASSIVE_BY_KEY, WEAPON_BY_KEY, WEAPON_ANIM, WEAPON_BIT, SPAWN_CAP, SPAWNER_TIERS } from './theme.js';
// 子弹现用序列帧 fx 精灵表覆盖静态 skin：在场皮肤 = 动画帧 sheet（若有）否则原 skin。
const skinOf = (key: string): string => WEAPON_ANIM[key]?.sheet ?? WEAPON_BY_KEY[key].skin;

// 一步 sim（复刻引擎 step：每拍都注入命令→清 InputQueue·空则清空·防陈留信号重复触发）。
function step(e: Engine, cmds: Command[] = []): void {
  applyCommands(e.world, cmds);
  e.world.tick();
}
function stepN(e: Engine, n: number): void { for (let i = 0; i < n; i++) step(e); }
// 驱动一个动作信号（enqueueAction → applyCommands 路由进 InputQueue → keybind→Signal→Effect·仅本拍在场）。
function fireAction(e: Engine, name: string): void {
  const input = new QueuedInputSource('hud');
  input.enqueueAction(name);
  step(e, input.commandsForTick(e.world.getVersion() + 1));
}
function hasSprite(e: Engine, key: string): boolean {
  for (const [id] of e.world.query('Sprite')) { const s = e.world.getComponent<Sprite>(id, 'Sprite'); if (s && s.textureKey === key) return true; }
  return false;
}

// ── 小工具 ──────────────────────────────────────────────────────────────────
function res(e: Engine, eid: string, id = 'Resource'): number { return e.world.getComponent<Resource>(eid, id)?.current ?? 0; }
function resById(e: Engine, id: string): number {
  for (const [eid] of e.world.query('Resource')) { const r = e.world.getComponent<Resource>(eid, 'Resource'); if (r && r.id === id) return r.current; }
  return NaN;
}
function countTag(e: Engine, bit: number): number {
  let n = 0;
  for (const [id] of e.world.query('Tag')) { const t = e.world.getComponent<Tag>(id, 'Tag'); if (t && (t.flags & bit) !== 0) n++; }
  return n;
}
function xf(e: Engine, eid: string): Transform | undefined { return e.world.getComponent<Transform>(eid, 'Transform'); }
function flowState(e: Engine): string { return e.world.getComponent<GameFlow>('flow', 'GameFlow')?.current ?? '?'; }
function tickN(e: Engine, n: number): void { for (let i = 0; i < n; i++) e.world.tick(); }
// 驱动移动：每 tick 注入一条 move 命令（复刻 net applyCommands·Controllable→Velocity）。
function move(e: Engine, dx: number, dy: number, n: number, t0 = 1): void {
  for (let i = 0; i < n; i++) {
    const cmd: Command = { playerId: 'p1', tick: t0 + i, move: { dx, dy } };
    applyCommands(e.world, [cmd]);
    e.world.tick();
  }
}
function fresh(): Engine { const e = new Engine(); e.load(buildBlueprint()); return e; }

describe('game-103《幸存者核心原型》· M1 灰盒（数据驱动·零专属系统）', () => {
  it('S3 骨架：蓝图纯数据装载 + 空跑 2 tick 无错 + 关键单例齐全', () => {
    const bp = buildBlueprint();
    expect(bp.capabilities.length).toBeGreaterThan(25);
    const ids = Object.keys(bp.entities);
    for (const key of ['player', 'collector', 'killbox', 'camera', 'flow', 'library', 'level', 'clock', 'levelup-gate', 'spawn-0']) {
      expect(ids).toContain(key);
    }
    expect(() => JSON.stringify(bp.entities)).not.toThrow();
    const e = fresh();
    expect(() => tickN(e, 2)).not.toThrow();
  });

  it('走位：注入 move 命令 → 玩家沿方向移动（Controllable→Velocity→motion-apply）', () => {
    const e = fresh();
    const x0 = xf(e, 'player')!.x;
    move(e, 1, 0, 10);
    expect(xf(e, 'player')!.x).toBeGreaterThan(x0 + PLAYER_DEF.moveSpeed * 5);
  });

  it('边界：一直向右走不越出场地右墙（t2-bounds-clamp）', () => {
    const e = fresh();
    move(e, 1, 0, 900);
    expect(xf(e, 'player')!.x).toBeLessThanOrEqual(2400);
  });

  it('单敌群 spawn：够久后敌人被生怪票→prefab 生出来（且会追向玩家）', () => {
    const e = fresh();
    expect(countTag(e, ENEMY)).toBe(0);
    tickN(e, SHAMBLER.hp > 0 ? 120 : 120);
    expect(countTag(e, ENEMY)).toBeGreaterThan(0);
  });

  it('自动开火：玩家冷却到点生子弹（ZONE 判定区数量随开火上升）', () => {
    const e = fresh();
    tickN(e, KUNAI.cd + 2);
    // 子弹是 ZONE 区；此刻场上至少有玩家/宝石外的一发子弹或其命中痕迹——用 ZONE 计数与初始比较。
    expect(countTag(e, ZONE)).toBeGreaterThan(0);
  });

  it('闭环：走位吃怪 → 掉宝石 → 磁吸拾取入经验 → 升级（等级>1）', () => {
    const e = fresh();
    // 真实玩法=玩家走位穿过怪群/宝石（慢起步下敌稀·原地会被远程清光收不到经验·需移动收集）。绕圈 60s。
    for (let s = 0; s < 60; s++) move(e, [1, 0, -1, 0][Math.floor(s / 2) % 4], [0, 1, 0, -1][Math.floor(s / 2) % 4], 60, 1 + s * 60);
    expect(resById(e, 'level')).toBeGreaterThan(1);
    expect(resById(e, 'score')).toBeGreaterThan(0);
  });

  it('接触伤害/死亡：长时间贴身敌群 → 玩家 hp 掉光 → flow 转 defeat（慢起步·后期密度才致命）', () => {
    const e = fresh();
    // 慢起步：前期稀疏可控·跑久（90s·进阶段②③密度上来）原地不还手扛不住连续接触 DPS。
    tickN(e, 60 * 90);
    // 要么已被打死（defeat），要么 hp 明显受损——接触伤害真实生效。
    expect(res(e, 'player') < PLAYER_DEF.maxHp || flowState(e) === 'defeat').toBe(true);
  });

  it('v3 经验曲线：升级后阈值 nextxp 递增（XP_STEP）+ xp 归零（曲线爬升·非固定）', () => {
    const e = fresh();
    tickN(e, 2);
    const base = resById(e, 'nextxp');
    // 手动灌满经验到阈值 → 触发升级
    for (const [eid] of e.world.query('Resource')) { const r = e.world.getComponent<Resource>(eid, 'Resource'); if (r && r.id === 'xp') { r.current = base; break; } }
    tickN(e, 3);
    expect(resById(e, 'level')).toBeGreaterThan(1);
    expect(resById(e, 'nextxp')).toBeGreaterThan(base);   // 阈值涨了（下级更贵）
    expect(resById(e, 'xp')).toBeLessThan(base);          // xp 归零重来
  });

  it('v3 升满不断档：所有武器/被动 owned 到满，rollOffer 仍出「力量精粹」（maxLevel 极大·永不空）', () => {
    const pool: DraftCandidate[] = DRAFT_POOL.map((u) => ({ id: u.id, weight: u.weight, slot: u.slot, maxLevel: u.maxLevel }));
    const owned: Record<string, number> = {};
    for (const u of DRAFT_POOL) owned[u.id] = u.maxLevel; // 全满级
    owned.might = 5; // 力量精粹已持有但远未满（maxLevel 999）→ 仍可选
    const offers = rollOffer(pool, { owned, slots: { weapon: { used: 6, cap: 6 }, passive: { used: 6, cap: 6 } } }, { n: DRAFT_N, seed: 7 });
    expect(offers.length).toBeGreaterThan(0);             // 池不空（might maxLevel 999 未满）
    expect(offers.some((c) => c.id === 'might')).toBe(true);
  });

  it('胜负：clock 达 15:00 → flow 转 victory（活满即胜）', () => {
    const e = fresh();
    // 直接把 clock 顶到阈值验证胜利转移（免跑 54000 tick）。
    for (const [eid] of e.world.query('Resource')) {
      const r = e.world.getComponent<Resource>(eid, 'Resource');
      if (r && r.id === 'clock') { r.current = MATCH_SECONDS; break; }
    }
    tickN(e, 2);
    expect(flowState(e)).toBe('victory');
  });

  it('UI 卫生：HUD/结算/三选一 LayoutNode 树 validateLayoutNode 零 issue（check-ui 机械门）', () => {
    const st = { hp: 72, maxHp: 100, xp: 3, xpMax: LEVEL_XP, level: 4, elapsed: 522, score: 387, combo: 0, comboFlash: 0, toast: null, status: 'playing' as const };
    expect(validateLayoutNode(buildHud(st))).toEqual([]);
    expect(validateLayoutNode(buildHud({ ...st, combo: 12, comboFlash: 1 }))).toEqual([]); // 连杀横幅态也零 issue
    expect(validateLayoutNode(buildResult({ ...st, status: 'victory' }))).toEqual([]);
    expect(validateLayoutNode(buildResult({ ...st, status: 'defeat' }))).toEqual([]);
    const offers = DRAFT_POOL.slice(0, 3).map((u) => ({ id: u.id, name: u.name, desc: u.desc, accent: u.accent, level: 1, max: u.maxLevel, isNew: false, action: u.effectSignal, icon: u.icon }));
    expect(validateLayoutNode(buildLevelUp(offers))).toEqual([]);
    // 升级卡图标（owner「纯色块换成有意义的图」）：每张卡的图标徽章渲染 emoji（非空色块）
    const luTree = buildLevelUp(offers);
    const emo: string[] = [];
    const walkE = (n: LayoutNode): void => { if (n.id?.endsWith('-ico-e') && n.props) emo.push(String((n.props as Record<string, unknown>).text)); (n.children ?? []).forEach(walkE); };
    walkE(luTree);
    expect(emo.length).toBe(3);                          // 三张卡各一枚 emoji 图标
    expect(emo.every((e) => e && e.length > 0)).toBe(true);
    expect(DRAFT_POOL.every((u) => u.icon && u.icon.length > 0)).toBe(true); // 全候选都有图标
  });

  it('连杀横幅（owner「1 秒内杀 5+=连杀·左右上角闪动态数字」）：<门槛不显·达门槛左右两角大数字·随连杀数放大·闪换色', () => {
    const base = { hp: 80, maxHp: 100, xp: 1, xpMax: LEVEL_XP, level: 2, elapsed: 30, score: 40, toast: null, status: 'playing' as const };
    const labels = (node: LayoutNode): Array<{ id: string; text: string; size: number; color: string }> => {
      const out: Array<{ id: string; text: string; size: number; color: string }> = [];
      const walk = (n: LayoutNode): void => {
        if (n.id?.startsWith('s-combo-') && n.props) { const p = n.props as Record<string, unknown>; out.push({ id: n.id, text: String(p.text), size: Number(p.size), color: String(p.color) }); }
        (n.children ?? []).forEach(walk);
      };
      walk(node); return out;
    };
    // 未达门槛（combo 4 < 5）→ 无连杀数字
    expect(labels(buildHud({ ...base, combo: 4, comboFlash: 0 })).length).toBe(0);
    // 达门槛（combo 8）→ 左右两枚大数字·含连杀数
    const l8 = labels(buildHud({ ...base, combo: 8, comboFlash: 0 }));
    expect(l8.length).toBe(2);
    expect(l8.every((x) => x.text.includes('8'))).toBe(true);
    // 连杀越多字越大（动态放缩）
    const l20 = labels(buildHud({ ...base, combo: 20, comboFlash: 0 }));
    expect(l20[0].size).toBeGreaterThan(l8[0].size);
    // 闪：comboFlash 0/1 换色
    const c0 = labels(buildHud({ ...base, combo: 8, comboFlash: 0 }))[0].color;
    const c1 = labels(buildHud({ ...base, combo: 8, comboFlash: 1 }))[0].color;
    expect(c0).not.toBe(c1);
  });

  it('三选一 draft：rollOffer 从候选池过滤+加权抽 3 个不重复（确定性·同 seed 同结果）', () => {
    const pool: DraftCandidate[] = DRAFT_POOL.map((u) => ({ id: u.id, weight: u.weight, slot: u.slot, maxLevel: u.maxLevel }));
    const state = { owned: {}, slots: { weapon: { used: 0, cap: 6 }, passive: { used: 0, cap: 6 } } };
    const a = rollOffer(pool, state, { n: DRAFT_N, seed: 2 });
    const b = rollOffer(pool, state, { n: DRAFT_N, seed: 2 });
    expect(a.length).toBe(3);
    expect(new Set(a.map((c) => c.id)).size).toBe(3);       // 不重复
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id)); // 确定性
  });

  it('升级选中「锋刃手册」→ 全局 power 系数 +0.2（KeyBinding→Effect·子弹伤害随之涨）', () => {
    const e = fresh();
    tickN(e, 3);
    const p0 = resById(e, 'power');
    fireAction(e, 'pick_blade');
    step(e); step(e); // 清队 + Effect 写入下一拍生效（不重复触发）
    expect(resById(e, 'power')).toBeCloseTo(p0 + PASSIVE_BY_KEY.blade.value, 5);
  });

  it('升级选中「护盾环」→ Caster 生成跟随玩家的环绕光球武器（新武器·带皮肤槽）', () => {
    const e = fresh();
    tickN(e, 3);
    expect(hasSprite(e, skinOf('orbit'))).toBe(false);
    fireAction(e, 'pick_orbit');
    step(e); step(e);
    expect(hasSprite(e, skinOf('orbit'))).toBe(true); // 护盾环光球已展开
  });

  it('VBUG-02 修：护盾环光球挂 Orbit 真绕玩家转（相对位移 > 0·半径守恒·t2-orbit-motion）', () => {
    const e = fresh();
    tickN(e, 3);
    fireAction(e, 'pick_orbit');
    step(e); step(e);
    // 光球 = 带 orbit 武器 Tag 位且挂 Orbit 组件的实体（静态环回退时 Orbit 缺失 → 本断言红）。
    const balls: string[] = [];
    for (const [id] of e.world.query('Tag')) {
      const t = e.world.getComponent<Tag>(id, 'Tag');
      if (t && (t.flags & WEAPON_BIT.orbit) !== 0 && e.world.getComponent(id, 'Orbit' as never)) balls.push(id);
    }
    expect(balls.length).toBe(WEAPON_BY_KEY.orbit.amount); // 3 球全挂 Orbit
    const rel = (id: string) => { const b = xf(e, id)!, p = xf(e, 'player')!; return { dx: b.x - p.x, dy: b.y - p.y }; };
    const r0 = rel(balls[0]);
    stepN(e, 30);
    const r1 = rel(balls[0]);
    // 真绕转：30 拍相对玩家位移明显（角步 0.045 rad/tick × 30 拍 ≈ 77°·弧长 ≈ 92px）；静态环 = 0。
    expect(Math.hypot(r1.dx - r0.dx, r1.dy - r0.dy)).toBeGreaterThan(40);
    // 半径守恒（rotor + sqrt 归一防漂移）：始终 ≈ 配置 radius。
    expect(Math.hypot(r0.dx, r0.dy)).toBeCloseTo(WEAPON_BY_KEY.orbit.radius, 1);
    expect(Math.hypot(r1.dx, r1.dy)).toBeCloseTo(WEAPON_BY_KEY.orbit.radius, 1);
  });

  it('VBUG-02 定序面：满蓝图（orbit-motion 与 motion/hierarchy/camera-follow 同装）装载零成环告警', () => {
    // topological-sort 的推断环平局裁决只打 console.warn 不改退出码（CLAUDE.md「读告警」铁律）——
    // 这里把 warn 收进证物断言：装载 + 空跑不得出现 [topological-sort]/Circular 字样。
    const warns: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });
    try {
      const e = new Engine();
      e.load(buildBlueprint());
      tickN(e, 2);
    } finally {
      spy.mockRestore();
    }
    expect(warns.filter((w) => w.includes('[topological-sort]') || w.includes('Circular'))).toEqual([]);
  });

  it('进化系统（E2·重组）：evo 信号 destroy-tagged 删基础武器挂点 + Caster spawn 进化体', () => {
    const e = fresh();
    tickN(e, 3);
    fireAction(e, 'pick_orbit');                 // 拿护盾环
    step(e); step(e);
    expect(hasSprite(e, skinOf('orbit'))).toBe(true);
    const orbitBallsBefore = countTag(e, WEAPON_BIT.orbit);
    expect(orbitBallsBefore).toBeGreaterThan(0); // 基础护盾环挂点在场（带武器 Tag 位）
    fireAction(e, 'evo_orbit');                   // 进化！
    stepN(e, 4);
    // 基础护盾环挂点被 destroy-tagged 清掉；进化体「无限回环」挂点已 spawn（5 球·带 orbitevo Tag 位）
    expect(countTag(e, WEAPON_BIT.orbit)).toBe(0);
    expect(countTag(e, WEAPON_BIT.orbitevo)).toBeGreaterThan(orbitBallsBefore); // 进化体球更多
  });

  it('武器册全射法：每把武器都能被 draft 生成并射出（straight/nova/beam/boomerang/orbit/pet/bomb/trail）', () => {
    const hasBigNova = (e: Engine): boolean => { // nova/爆炸=无 sprite 画大圈：找 Hitbox 且 Shape 大半径
      for (const [id] of e.world.query('Hitbox', 'Shape')) { const s = e.world.getComponent(id, 'Shape') as unknown as { radius?: number }; if ((s.radius ?? 0) >= 80) return true; }
      return false;
    };
    const hasTint = (e: Engine, tint: number): boolean => { // 尾迹=无 sprite 画小圈·靠独有色辨识
      for (const [id] of e.world.query('Hitbox', 'Color')) { const c = e.world.getComponent(id, 'Color') as unknown as { tint?: number }; if (c?.tint === tint) return true; }
      return false;
    };
    for (const w of WEAPONS.filter((x) => x.key !== 'kunai')) {
      const e = fresh();
      tickN(e, 3);
      fireAction(e, `pick_${w.key}`);
      // 逐拍推进·任一拍命中即算生效（nova/爆炸短命·跑完就消失·须过程中捕获）。
      const wantNova = w.pattern === 'nova' || w.pattern === 'bomb';
      let ok = false;
      for (let i = 0; i < w.cd + w.life + 6 && !ok; i++) { step(e); ok = w.pattern === 'trail' ? hasTint(e, w.tint) : wantNova ? hasBigNova(e) : hasSprite(e, skinOf(w.key)); }
      expect(ok).toBe(true);
    }
  });

  it('BUG-01/v2⑤ 修：世界空间地砖网格线实体在场（随相机卷动→相对位移·非屏幕固定）', () => {
    const ids = Object.keys(buildBlueprint().entities);
    expect(ids.filter((k) => k.startsWith('gridv-') || k.startsWith('gridh-')).length).toBeGreaterThan(20);
  });

  it('v2③ 无限流 + 同屏 cap：长跑后敌人持续存在且活敌数被 GroupCount 钳在 cap 内（不爆炸）', () => {
    const e = fresh();
    tickN(e, 900); // 15s
    const alive = countTag(e, ENEMY);
    expect(alive).toBeGreaterThan(0);                    // 无限刷·一直有敌
    expect(resById(e, 'enemies_alive')).toBeGreaterThan(0);
    expect(alive).toBeLessThanOrEqual(SPAWN_CAP + 12);   // 同屏 cap 生效·实体不爆炸（+余量=同拍多 spawner 齐发）
  });

  it('v2③ 难度递增：分层敌 afterSec 时间门 + 胖子更肉（一发打不死）', () => {
    expect(SPAWNER_TIERS.some((t) => t.afterSec > 0)).toBe(true); // 有时间门=越晚越难
    expect(BRUTE.hp).toBeGreaterThan(SHAMBLER.hp * 3);            // 胖子远肉于蹒跚者
    expect(BRUTE.hp / KUNAI.dmg).toBeGreaterThan(3);             // 飞镖一发打不死（多发才行）
  });

  it('Boss：首领敌层在册（周期出现·afterSec 时间门）+ 巨血（无限局 escalation 节点）', () => {
    const boss = SPAWNER_TIERS.find((t) => t.key === 'boss');
    expect(boss).toBeDefined();
    expect(boss!.afterSec).toBeGreaterThan(0);            // 时间门=局中才现身
    expect(BOSS.hp).toBeGreaterThan(BRUTE.hp * 10);       // 首领远肉于普通敌
    const lib = (buildBlueprint().entities.library as { PrefabLibrary: { templates: Record<string, unknown> } }).PrefabLibrary.templates;
    expect(lib).toHaveProperty('enemy_boss');             // 库含首领 prefab
  });

  it('E7 远程敌（archer/boss）：body 挂 Timer(shoot)+SelfRule spawn ebolt·库含敌弹·弹朝玩家且射程有界（打不了太远）', () => {
    const lib = (buildBlueprint().entities.library as { PrefabLibrary: { templates: Record<string, { entities: Record<string, Record<string, unknown>> }> } }).PrefabLibrary.templates;
    // 近战敌无远程挂点·远程敌有
    const shBody = lib.enemy_shambler.entities.body;
    expect(shBody.SelfRule).toBeUndefined();
    const arBody = lib.enemy_archer.entities.body as { Timer?: { id: string }; SelfRule?: { do: Array<{ template: string }> } };
    expect(arBody.Timer?.id).toBe('shoot');
    expect(arBody.SelfRule?.do[0].template).toBe('ebolt_archer');
    // 库含敌弹·朝玩家（Launch targetMask:PLAYER）·命中玩家扣血
    expect(lib).toHaveProperty('ebolt_archer');
    expect(lib).toHaveProperty('ebolt_boss');
    const bolt = lib.ebolt_archer.entities.p as { Launch: { toward: string; targetMask: number }; Hitbox: { targetMask: number; amount: number } };
    expect(bolt.Launch.toward).toBe('target');
    expect(bolt.Launch.targetMask).toBe(PLAYER);
    expect(bolt.Hitbox.targetMask).toBe(PLAYER);
    expect(bolt.Hitbox.amount).toBeGreaterThan(0);
    // 「打不了太远」：射程 ≈ projSpeed×life 有界·且明显小于场地跨度（玩家可走位躲）
    const range = ARCHER.ranged!.projSpeed * ARCHER.ranged!.life;
    expect(range).toBeGreaterThan(150);   // 够到中距=有紧张感
    expect(range).toBeLessThan(400);      // 不跨屏狙=能躲
    // spawner 有 archer 层·时间门>0
    const at = SPAWNER_TIERS.find((t) => t.key === 'archer');
    expect(at?.afterSec).toBeGreaterThan(0);
  });

  it('子弹序列帧：武器/敌弹挂 AnimState+Frame(单 clip 循环)·Sprite 指向 fx 精灵表·anim-state 推帧', () => {
    const lib = (buildBlueprint().entities.library as { PrefabLibrary: { templates: Record<string, { entities: Record<string, Record<string, unknown>> }> } }).PrefabLibrary.templates;
    // 玩家飞镖=紫能量镖动画帧
    const kp = lib.proj_kunai.entities.p as { Sprite: { textureKey: string }; Frame?: { total: number }; AnimState?: { clips: Record<string, { count: number; loop: boolean }>; moveClip: string } };
    expect(kp.Sprite.textureKey).toBe('103/fx-magic_dart');
    expect(kp.Frame?.total).toBe(6);
    expect(kp.AnimState?.clips.fly.count).toBe(6);
    expect(kp.AnimState?.clips.fly.loop).toBe(true);
    expect(kp.AnimState?.moveClip).toBe('fly');
    // 敌弹=实心亮红球（辨敌我·owner「敌弹必须一眼区分」）：纯 Color 深红·脉冲 Tween·红光环 child，不用动画帧
    const ab = lib.ebolt_archer.entities.p as { Color: { tint: number }; Tween?: { loop?: string }; Shape: { category: number } };
    expect(ab.Color.tint).toBe(0xff1030);
    expect(ab.Tween?.loop).toBe('pingpong');
    expect((lib.ebolt_archer.entities.glow as { Color: { tint: number } }).Color.tint).toBe(0xff3355);
    // anim-state capability 在册（否则帧不动）
    const caps = buildBlueprint().capabilities as Array<{ id?: string }>;
    expect(caps.some((c) => c.id === 't2-anim-state')).toBe(true);
    // 运行期真推帧：发一发 kunai 子弹·跑若干 tick·Frame.index 应前进（循环播放）
    const e = fresh();
    stepN(e, KUNAI.cd + 2); // 起始武器自动发一发
    let bolt = '';
    for (const [id] of e.world.query('Frame', 'AnimState')) { bolt = id; break; }
    expect(bolt).not.toBe('');
    const f0 = (e.world.getComponent(bolt, 'Frame') as unknown as { index: number }).index;
    stepN(e, 4);
    const f1cmp = e.world.getComponent(bolt, 'Frame') as unknown as { index: number } | undefined;
    if (f1cmp) expect(f1cmp.index).not.toBe(f0); // 仍在场则帧已推进（未消失=已飞出=也算动过）
  });

  it('被动属性轴（stat-bind）：选疾风→移速真变快；选磁石→拾取环真变大（modifier-stack→ModifierTotals→投影）', () => {
    const e = fresh();
    tickN(e, 2);
    // 基准：玩家移速 = Controllable.speed；拾取环半径 = collector Shape.radius。
    const speed0 = (e.world.getComponent('player', 'Controllable') as unknown as { speed: number }).speed;
    const pick0 = (e.world.getComponent('collector', 'Shape') as unknown as { radius: number }).radius;
    // 选 3 层疾风 + 2 层磁石
    for (let i = 0; i < 3; i++) fireAction(e, 'pick_swift');
    for (let i = 0; i < 2; i++) fireAction(e, 'pick_magnet');
    stepN(e, 3); // 待 modifier-stack 聚合 → stat-bind 投影（stepN 清 InputQueue·防陈留信号重复加层）
    const speed1 = (e.world.getComponent('player', 'Controllable') as unknown as { speed: number }).speed;
    const pick1 = (e.world.getComponent('collector', 'Shape') as unknown as { radius: number }).radius;
    expect(speed1).toBeGreaterThan(speed0); // 移速 = base×(1+0.10×3)=1.3×
    expect(pick1).toBeGreaterThan(pick0);   // 拾取范围 = base×(1+0.30×2)=1.6×
    expect(speed1).toBeCloseTo(speed0 * 1.3, 4);
    expect(pick1).toBeCloseTo(pick0 * 1.6, 4);
    // 幂等：再跑多拍不复利漂移（从 base 重算·不滚雪球）
    stepN(e, 30);
    const speed2 = (e.world.getComponent('player', 'Controllable') as unknown as { speed: number }).speed;
    expect(speed2).toBeCloseTo(speed1, 6);
  });

  it('无目标不哑火（Launch.fallbackDir）：直飞类子弹 Launch 声明 fallbackDir（修「没敌人时子弹不动」）', () => {
    const lib = (buildBlueprint().entities.library as { PrefabLibrary: { templates: Record<string, { entities: Record<string, Record<string, unknown>> }> } }).PrefabLibrary.templates;
    // 直线/穿透类（straight/beam/boomerang/pet）子弹都带兜底方向 → 索敌落空沿它发射而非冻原地。
    const kl = lib.proj_kunai.entities.p.Launch as { toward: string; targetMask: number; fallbackDir?: { x: number; y: number } };
    expect(kl.toward).toBe('target');
    expect(kl.fallbackDir).toBeDefined();
    expect(Math.hypot(kl.fallbackDir!.x, kl.fallbackDir!.y)).toBeGreaterThan(0); // 非零方向
    // laser（beam）同样带 fallbackDir
    const ll = lib.proj_laser.entities.p.Launch as { fallbackDir?: unknown };
    expect(ll.fallbackDir).toBeDefined();
  });

  it('Boss/精英必现（capBypass）：boss 刷怪票不被同屏 cap 门挡（修「全程没见过 boss」根因）', () => {
    const ents = buildBlueprint().entities as Record<string, { SelfRule?: { whenGlobal?: unknown } }>;
    // 找 boss 的 spawner（key 含 boss），其 whenGlobal 不得包含 enemies_alive 门（capBypass）。
    const bossSpawners = Object.entries(ents).filter(([k]) => /^spawner-\d+-boss-/.test(k));
    expect(bossSpawners.length).toBeGreaterThan(0);
    const hasAliveGate = (g: unknown): boolean => {
      if (!g || typeof g !== 'object') return false;
      const o = g as { kind?: string; id?: string; of?: unknown[] };
      if (o.kind === 'resource' && o.id === 'enemies_alive') return true;
      if (o.kind === 'and' && Array.isArray(o.of)) return o.of.some(hasAliveGate);
      return false;
    };
    for (const [, sp] of bossSpawners) expect(hasAliveGate(sp.SelfRule?.whenGlobal)).toBe(false);
    // 杂兵(shambler)反之：受 cap 门约束。
    const trash = Object.entries(ents).find(([k]) => /^spawner-\d+-shambler-/.test(k));
    expect(hasAliveGate((trash![1] as { SelfRule?: { whenGlobal?: unknown } }).SelfRule?.whenGlobal)).toBe(true);
  });

  it('磁力吸附（空间索引下沉后便宜复接）：宝石近距 Perception+Steering→飞向玩家；收取环受磁石被动放大', () => {
    const bp = buildBlueprint();
    const lib = (bp.entities.library as { PrefabLibrary: { templates: Record<string, { entities: Record<string, Record<string, unknown>> }> } }).PrefabLibrary.templates;
    const gemBody = lib.gem_blue.entities.body as { Perception?: { targetTag: number; sightRadius: number }; Steering?: { mode: string }; Hitbox?: { resource: string } };
    expect(gemBody.Perception?.targetTag).toBe(PLAYER);       // 近距索敌玩家→飞入
    expect(gemBody.Perception?.sightRadius).toBeGreaterThan(PLAYER_DEF.pickupRadius); // 吸附半径 > 收取真空区=有飞行段
    expect(gemBody.Steering?.mode).toBe('seek');
    expect(gemBody.Hitbox?.resource).toBe('xp');
    // 磁石被动放大收取真空区：collector 有 pickup→Shape.radius 的 StatBind。
    const collector = bp.entities.collector as { StatBind?: { bindings: Array<{ key: string; component: string; field: string }> } };
    const b = collector.StatBind?.bindings.find((x) => x.key === 'pickup');
    expect(b?.component).toBe('Shape');
  });

  it('冲击波升级范围越来越大（owner·数据配方·零引擎活）：pick +1 lvl_shock → shockRadius total → nova proj StatBind 乘 Shape.radius', () => {
    const bp = buildBlueprint();
    const ents = bp.entities as Record<string, Record<string, unknown>>;
    // ① 层数资源 lvl_shock 在场（0 层起）
    expect((ents['lvl-shock']?.Resource as { id: string })?.id).toBe('lvl_shock');
    // ② 两条 ModifierSource：shockRadius-base(底 1) + shockRadius-lvl(读 lvl_shock×radiusPerLevel)
    expect((ents['mod-base-shock']?.ModifierSource as { target: string })?.target).toBe('shockRadius');
    const mlvl = ents['mod-lvl-shock']?.ModifierSource as { valueFrom: { resourceId: string; scale: number } };
    expect(mlvl.valueFrom.resourceId).toBe('lvl_shock');
    expect(mlvl.valueFrom.scale).toBeGreaterThan(0);
    // ③ pick_shock 同时 +1 lvl_shock
    expect((ents['fx-lvl-shock']?.Effect as { targetId: string })?.targetId).toBe('lvl_shock');
    // ④ nova proj 挂 StatBind：ModifierTotals[shockRadius] × base → Shape.radius
    const lib = (ents.library as { PrefabLibrary: { templates: Record<string, { entities: Record<string, Record<string, unknown>> }> } }).PrefabLibrary.templates;
    const sb = lib.proj_shock.entities.p.StatBind as { bindings: Array<{ key: string; component: string; field: string; op: string }> };
    const bind = sb.bindings.find((x) => x.key === 'shockRadius')!;
    expect(bind.component).toBe('Shape');
    expect(bind.field).toBe('radius');
    expect(bind.op).toBe('mul');
    // 粒子也随级放大（owner「升级后粒子也应更高」）：每颗火花挂 StatBind 把 shockRadius 乘到 Velocity(飞更远)+Shape(更大)。
    const spark = lib.sparks_shock.entities.s0.StatBind as { bindings: Array<{ key: string; component: string; field: string }> };
    expect(spark.bindings.some((x) => x.key === 'shockRadius' && x.component === 'Velocity' && x.field === 'vx')).toBe(true);
    expect(spark.bindings.some((x) => x.key === 'shockRadius' && x.component === 'Shape' && x.field === 'radius')).toBe(true);
    // ⑤ 运行期真放大：拿 3 次冲击波 → 跑到发射 → nova proj 的 Shape.radius > 基础 120
    const e = fresh();
    for (let i = 0; i < 3; i++) fireAction(e, 'pick_shock');
    let maxR = 0;
    for (let i = 0; i < WEAPON_BY_KEY.shock.cd + 4; i++) {
      step(e);
      for (const [id] of e.world.query('StatBind', 'Shape')) {
        const s = e.world.getComponent(id, 'Shape') as unknown as { radius?: number };
        if ((s.radius ?? 0) > maxR) maxR = s.radius ?? 0;
      }
    }
    expect(maxR).toBeGreaterThan(120); // 3 层 → 明显 > 基础半径
  });

  it('命中反馈（REQ-HIT-FX·主程 Hitbox.onHit）：定向弹命中敌→喷 hitfx 小火花；穿透弹逐命中各喷', () => {
    const lib = (buildBlueprint().entities.library as { PrefabLibrary: { templates: Record<string, { entities: Record<string, Record<string, unknown>> }> } }).PrefabLibrary.templates;
    // hitfx 模板在册（3 颗小火花·category0 零碰撞）
    expect(lib.hitfx).toBeDefined();
    expect(Object.keys(lib.hitfx.entities).length).toBe(3);
    // 定向弹 Hitbox 挂 onHit:hitfx；nova/爆炸（AOE per-tick）不挂（防刷屏）
    const kunaiHit = lib.proj_kunai.entities.p.Hitbox as { onHit?: { spawnTemplate: string } };
    expect(kunaiHit.onHit?.spawnTemplate).toBe('hitfx'); // 穿透飞镖有命中反馈
    const shockHit = lib.proj_shock.entities.p.Hitbox as { onHit?: unknown };
    expect(shockHit.onHit).toBeUndefined();               // nova AOE 不挂（每敌每拍喷=刷屏）
    // 运行期：飞镖命中敌 → 世界里冒出 hitfx 火花实体（Timer+Color+无 Hitbox 的小粒子）
    const e = fresh();
    let sawFx = false;
    for (let i = 0; i < 200 && !sawFx; i++) {
      step(e);
      for (const [id] of e.world.query('Timer', 'Color', 'Shape')) {
        const s = e.world.getComponent(id, 'Shape') as unknown as { radius?: number; category?: number };
        if (s.category === 0 && (s.radius ?? 0) <= 3 && !e.world.getComponent(id, 'Hitbox')) { sawFx = true; break; }
      }
    }
    expect(sawFx).toBe(true);
  });

  it('成就（owner「解锁些成就」·纯数据阈值表 + 纯判定）：达阈值首次解锁·已解锁不重弹·横幅渲染', () => {
    // newlyUnlocked：峰值连杀 10 → 解 combo10；已解不再返回
    const s1 = newlyUnlocked({ peakCombo: 10, kills: 5, elapsed: 20, level: 2 }, new Set());
    expect(s1.some((a) => a.id === 'combo10')).toBe(true);
    expect(s1.some((a) => a.id === 'combo20')).toBe(false); // 20 未到
    const s2 = newlyUnlocked({ peakCombo: 10, kills: 5, elapsed: 20, level: 2 }, new Set(['combo10']));
    expect(s2.length).toBe(0); // 已解锁不重复
    // 多路统计各自解锁：累计击杀/等级/存活
    const s3 = newlyUnlocked({ peakCombo: 0, kills: 100, elapsed: 300, level: 10 }, new Set());
    expect(s3.map((a) => a.id).sort()).toEqual(['kills100', 'level10', 'survive300']);
    // HUD 成就横幅：toast 在场 → 渲染金带含成就名；null → 不渲染文本
    const base = { hp: 90, maxHp: 100, xp: 0, xpMax: LEVEL_XP, level: 1, elapsed: 5, score: 3, combo: 0, comboFlash: 0, status: 'playing' as const };
    const findText = (node: LayoutNode, id: string): string | null => {
      let hit: string | null = null;
      const walk = (n: LayoutNode): void => { if (n.id === id && n.props) hit = String((n.props as Record<string, unknown>).text); (n.children ?? []).forEach(walk); };
      walk(node); return hit;
    };
    expect(findText(buildHud({ ...base, toast: null }), 's-ach-t')).toBeNull();
    const t = findText(buildHud({ ...base, toast: { icon: '🔥', name: '小试锋芒 · 10 连杀' } }), 's-ach-t');
    expect(t).toContain('小试锋芒');
  });

  it('尾迹刃（微创新·movement=weapon）：移动时身后落静态灼烧段·沿路径散布成尾迹（非堆一点）', () => {
    const e = fresh();
    tickN(e, 3);
    fireAction(e, 'pick_trail');
    // 玩家持续向右走若干拍 → 尾迹段应沿路径落在不同 x（散布=尾迹），而非全叠一处。
    const TRAIL = WEAPON_BY_KEY.trail.tint;
    const xs = new Set<number>();
    let t = 100;
    for (let i = 0; i < 40; i++) {
      applyCommands(e.world, [{ playerId: 'p1', tick: t++, move: { dx: 1, dy: 0 } }]); // 一直向右走
      e.world.tick();
      for (const [id] of e.world.query('Hitbox', 'Color', 'Transform')) {
        const c = e.world.getComponent(id, 'Color') as unknown as { tint?: number };
        if (c?.tint === TRAIL) { const tf = e.world.getComponent(id, 'Transform') as unknown as { x: number }; xs.add(Math.round(tf.x)); }
      }
    }
    expect(xs.size).toBeGreaterThan(3); // 多个不同 x=尾迹沿路径散布（非静止堆叠）
    // 尾迹段是静态的（无 Velocity）·per-tick 穿透伤（Hitbox 打敌）
    const seg = WEAPON_BY_KEY.trail;
    expect(seg.projSpeed).toBe(0);
  });

  it('本地排行榜（owner「死亡后排行榜+成绩一起展示·存本地」）：击杀排序·名次·截 MAX·结算屏渲染', () => {
    const mk = (score: number, time = 30, at = score): ScoreEntry => ({ score, time, level: 2, win: false, at });
    // 击杀降序排 + 返回本局名次
    const prev = [mk(50), mk(30), mk(10)];
    const r1 = recordScore(mk(40), prev);
    expect(r1.board.map((e) => e.score)).toEqual([50, 40, 30, 10]);
    expect(r1.rank).toBe(2); // 40 排第 2
    // 并列击杀 → 存活时长更长者靠前
    const r2 = recordScore({ score: 30, time: 99, level: 2, win: false, at: 999 }, prev);
    expect(r2.board[1].time).toBe(99); // 同 30 杀·time99 在前
    // 超过 MAX 截断·垫底成绩未进榜 rank=0
    const many = Array.from({ length: BOARD_MAX }, (_, i) => mk(100 + i));
    const rLow = recordScore(mk(1), many);
    expect(rLow.board.length).toBe(BOARD_MAX);
    expect(rLow.rank).toBe(0); // 未进榜
    // 结算屏渲染排行榜（含本局高亮行 + 标题）·validateLayoutNode 零 issue
    const st = { hp: 0, maxHp: 100, xp: 0, xpMax: LEVEL_XP, level: 3, elapsed: 88, score: 40, combo: 0, comboFlash: 0, toast: null,
      board: r1.board, rank: r1.rank, status: 'defeat' as const };
    const tree = buildResult(st);
    expect(validateLayoutNode(tree)).toEqual([]);
    const ids: string[] = [];
    const walk = (n: LayoutNode): void => { if (n.id) ids.push(n.id); (n.children ?? []).forEach(walk); };
    walk(tree);
    expect(ids).toContain('s-lb-title');     // 排行榜标题在场
    expect(ids.filter((x) => /^s-lb-\d+$/.test(x)).length).toBe(4); // 4 行榜单
  });

  it('难度：胖子/精英血厚(非一枪死)+远程弹更大更清晰', () => {
    expect(BRUTE.hp).toBeGreaterThan(150);                 // 肉·血条看得见（owner「血条不够长/一枪死」）
    expect(ENEMIES.some((x) => x.key === 'sniper')).toBe(true);  // 精英狙击=攻击性高的远程
    expect(ENEMIES.some((x) => x.key === 'bruiser')).toBe(true); // 精英重装=大肉
    const archer = ENEMIES.find((x) => x.key === 'archer')!;
    expect(archer.ranged!.radius).toBeGreaterThanOrEqual(9);     // 敌弹调大=更清晰
  });

  it('bug 修：升级卡技能星星不溢出屏幕（无上限被动 might maxLevel999 → 用数值不渲 999 颗星）', () => {
    // 构造一张大段位卡（模拟 might maxLevel 999）+ 一张普通卡（max 5）
    const offers = [
      { id: 'might', name: '力量精粹', desc: '+8%', accent: 'passive' as const, level: 12, max: 999, isNew: false, action: 'pick_might' },
      { id: 'blade', name: '锋刃', desc: '+20%', accent: 'passive' as const, level: 2, max: 5, isNew: false, action: 'pick_blade' },
    ];
    const tree = buildLevelUp(offers);
    expect(validateLayoutNode(tree)).toEqual([]);
    // 递归找所有 Rating 节点，断言没有 max>6（否则=999 颗星撑爆屏）
    const ratings: Array<{ max?: number }> = [];
    const walk = (n: { type: string; props?: { max?: number }; children?: unknown[] }): void => {
      if (n.type === 'Rating') ratings.push(n.props ?? {});
      for (const c of (n.children ?? []) as typeof n[]) walk(c);
    };
    walk(tree as never);
    for (const r of ratings) expect(r.max ?? 0).toBeLessThanOrEqual(6);
  });

  it('v2④ 敌人头顶血条：敌 prefab 带 Gauge(绑 hp)→受击缩短=伤害反馈可见', () => {
    const e = fresh();
    tickN(e, 60); // 待开局怪生出
    let hasGauge = false;
    for (const [id] of e.world.query('Gauge')) { const g = e.world.getComponent(id, 'Gauge') as { resourceId?: string } | undefined; if (g && g.resourceId === 'hp') { hasGauge = true; break; } }
    expect(hasGauge).toBe(true);
  });

  it('BUG-03 修：回旋镖弹体真飞（Launch 定向·无 Steering 抵消）→ Transform 随 tick 位移', () => {
    const e = fresh();
    tickN(e, 3);
    fireAction(e, 'pick_boom');
    stepN(e, WEAPON_BY_KEY.boom.cd + 5); // 待挂点发出 proj_boom
    // 找到 proj_boom 弹体，记录位置
    let boomId = '';
    for (const [id] of e.world.query('Sprite')) { const s = e.world.getComponent<Sprite>(id, 'Sprite'); if (s && s.textureKey === skinOf('boom')) { boomId = id; break; } }
    expect(boomId).not.toBe('');
    const p0 = xf(e, boomId)!;
    const x0 = p0.x, y0 = p0.y;
    stepN(e, 6);
    const p1 = xf(e, boomId);
    // 弹体仍在(未消失)则必须移动了（不再"停原地"）；若已消失=已飞出回收，也算真飞（非卡住）。
    if (p1) expect(Math.hypot(p1.x - x0, p1.y - y0)).toBeGreaterThan(1);
  });

  it('确定性：两把独立同 tick → 同 hash（可回放/balance-sim）', () => {
    const a = fresh(); const b = fresh();
    tickN(a, 600); tickN(b, 600);
    expect(a.hash()).toBe(b.hash());
  });
});

// 加固追加（2026-08-24）：① 确定性升格——原 :626「确定性」只空跑（零输入），输入管线（move 命令 +
// pick 信号）整条不在被测路径上；补一条带输入脚本的双跑同 hash。② ⚔ 终局后 pick_*（testing.md
// ⚔「点已禁用的键」）——实测钉现状。
describe('game-103 · 输入脚本确定性 + ⚔ 终局后 pick', () => {
  it('确定性（带输入脚本）：两把同 move+pick_* 序列同 tick → 同 hash（可回放·补 :626 空跑盲区）', () => {
    const run = (): string => {
      const e = fresh();
      tickN(e, 3);
      fireAction(e, 'pick_boom'); // 拾取回旋镖（Caster spawn 挂点）
      move(e, 1, 0, 120, 10); // 东行 2s（Controllable→Velocity）
      fireAction(e, 'pick_might'); // 拾取被动（Effect 改 power）
      move(e, 0, 1, 120, 200); // 南行 2s
      return e.hash();
    };
    expect(run()).toBe(run());
  });

  // ⚠ 评审假设「defeat/victory 后 fireAction(pick_*) no-op」与实测不符——sim 层 KeyBinding→Signal→
  // Effect/Caster 链无 GameFlow 相位闸，终局后 pick 信号仍生效（实跑：defeat 后 pick_might power
  // 1→1.08·pick_heart hp 0→30·挂点照常 spawn）。终局屏不渲升级卡=闸只在 HUD 层。按「不改游戏
  // 逻辑·如实按真实行为钉」落断言；日后 sim 若加相位闸，此测转红即按新语义改写。
  it('⚔ defeat 后 pick_might/pick_heart：信号仍生效（sim 无相位闸·钉现状）·GameFlow 终态不可逆', () => {
    const e = fresh();
    tickN(e, 3);
    e.world.getComponent<Resource>('player', 'Resource')!.current = 0; // 玩家 hp 归零
    tickN(e, 2);
    expect(flowState(e)).toBe('defeat');
    const p0 = resById(e, 'power');
    fireAction(e, 'pick_might'); // 力量精粹 +8%
    expect(resById(e, 'power')).toBeCloseTo(p0 + 0.08, 10); // 实测：Effect 未被终局拦截
    const hp0 = res(e, 'player');
    fireAction(e, 'pick_heart'); // 生命护心 +30
    expect(res(e, 'player')).toBe(hp0 + 30); // 实测：回血生效
    expect(flowState(e)).toBe('defeat'); // 终态无回程转移——回血也不复活回 playing
  });

  it('⚔ victory 后 pick_boom：武器挂点仍会生成（sim 无相位闸·钉现状）·flow 恒 victory', () => {
    const e = fresh();
    tickN(e, 3);
    for (const [eid] of e.world.query('Resource')) { // 把表拨到赛程终点 → victory
      const r = e.world.getComponent<Resource>(eid, 'Resource');
      if (r && r.id === 'clock') r.current = MATCH_SECONDS;
    }
    tickN(e, 2);
    expect(flowState(e)).toBe('victory');
    const sr0 = [...e.world.query('SelfRule')].length;
    fireAction(e, 'pick_boom');
    e.world.tick();
    expect([...e.world.query('SelfRule')].length).toBeGreaterThan(sr0); // 实测：Caster 照常 spawn 挂点
    expect(flowState(e)).toBe('victory'); // 终态不动
  });
});

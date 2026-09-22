import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import { identityCardPlayCapability } from './identity-card-play.js';
import { resourceCapability } from '@atom-skills/resource/index.js';

function make(cardId = 'advance', focus = 3): World {
  const w = new World();
  for (const s of identityCardPlayCapability.systems) w.addSystem(s);
  for (const s of resourceCapability.systems) w.addSystem(s);
  w.createEntity('rng'); w.addComponent('rng', { type: 'RandomSeed', seed: 7, sequence: 0 } as any);
  w.createEntity('catalog'); w.addComponent('catalog', { type: 'CardCatalog', version: 1, allowedResources: ['focus', 'progress'], cards: [{ cardId, focusCost: 2, maxCopies: 2, effects: [{ kind: 'modify-resource', targetId: 'progress', op: 'add', value: 3 }] }] } as any);
  w.createEntity('pile'); w.addComponent('pile', { type: 'IdentityCardPile', deck: [cardId], hand: [], discard: [], handLimit: 1, phase: 'play', playPhase: 'play' } as any);
  for (const [eid, id, current] of [['focus-res', 'focus', focus], ['progress-res', 'progress', 0]] as const) { w.createEntity(eid); w.addComponent(eid, { type: 'Resource', id, current, min: 0, max: 99 } as any); }
  return w;
}
const pile = (w: World) => w.getComponent<any>('pile', 'IdentityCardPile')!;
const res = (w: World, eid: string) => w.getComponent<any>(eid, 'Resource')!.current;
function play(w: World, cardId: string) { w.createEntity(`cmd-${cardId}`); w.addComponent(`cmd-${cardId}`, { type: 'IdentityCardCommand', cardId } as any); }

describe('identity-card-play', () => {
  it('在 Intent 相位只排入 ResourceModify，交 Update 的 resource-apply 应用', () => {
    const system = identityCardPlayCapability.systems[0];
    expect(system.phase).toBe(SystemPhase.Intent);
    expect(system.writes).toContain('ResourceModify');
    expect(system.writes).not.toContain('Resource');
  });
  it('洗牌、抽牌、扣费、效果和弃牌按声明顺序确定执行', () => {
    const w = make(); w.tick(); expect(pile(w).hand).toEqual(['advance']);
    play(w, 'advance'); w.tick();
    expect(res(w, 'focus-res')).toBe(1); expect(res(w, 'progress-res')).toBe(3); expect(pile(w).discard).toEqual(['advance']);
  });
  it('出牌只排入 ResourceModify，且由同拍 resource-apply 消费', () => {
    const w = make(); w.tick(); play(w, 'advance');
    const observed: string[] = [];
    w.setObserver({
      onSystemEnd(system) {
        if (system.id !== 'identity-card-play') return;
        observed.push(`${w.getComponent<any>('focus-res', 'ResourceModify')!.amount}/${w.getComponent<any>('progress-res', 'ResourceModify')!.amount}`);
      },
      onSystemStart(system) { if (system.id === 'resource-apply') observed.push('resource-apply'); },
    });
    w.tick();
    expect(observed).toEqual(['-2/3', 'resource-apply']);
    expect(w.hasComponent('focus-res', 'ResourceModify')).toBe(false);
    expect(w.hasComponent('progress-res', 'ResourceModify')).toBe(false);
  });
  it('未知牌与手牌外出牌 fail-closed', () => {
    const w = make(); w.tick(); play(w, 'unknown'); w.tick(); expect(res(w, 'focus-res')).toBe(3); expect(pile(w).discard).toEqual([]);
    const other = make(); other.tick(); play(other, 'advance'); other.getComponent<any>('pile', 'IdentityCardPile')!.hand = []; other.tick(); expect(res(other, 'focus-res')).toBe(3);
  });
  it('专注不足与非法效果均不移动牌或写资源', () => {
    const poor = make('advance', 1); poor.tick(); play(poor, 'advance'); poor.tick(); expect(pile(poor).hand).toEqual(['advance']); expect(res(poor, 'progress-res')).toBe(0);
    const bad = make(); bad.getComponent<any>('catalog', 'CardCatalog')!.cards[0].effects[0].targetId = 'not-allowed'; bad.tick(); play(bad, 'advance'); bad.tick(); expect(pile(bad).hand).toEqual([]); expect(pile(bad).deck).toEqual(['advance']);
  });
  it('目录副本上限与重复 cardId 都在抽牌前拒绝', () => {
    const tooMany = make(); tooMany.getComponent<any>('pile', 'IdentityCardPile')!.deck.push('advance', 'advance'); tooMany.tick(); expect(pile(tooMany).hand).toEqual([]);
    const duplicate = make(); duplicate.getComponent<any>('catalog', 'CardCatalog')!.cards.push({ ...duplicate.getComponent<any>('catalog', 'CardCatalog')!.cards[0] }); duplicate.tick(); expect(pile(duplicate).hand).toEqual([]);
  });
  it('牌库耗尽时确定性洗回弃牌再抽取', () => {
    const w = make(); w.tick(); play(w, 'advance'); w.tick(); w.tick(); expect(pile(w).hand).toEqual(['advance']); expect(pile(w).discard).toEqual([]);
  });
  it('同 catalog、seed 与命令双跑一致', () => {
    const run = () => { const w = make(); w.tick(); play(w, 'advance'); w.tick(); return [pile(w), res(w, 'focus-res'), res(w, 'progress-res')]; };
    expect(run()).toEqual(run());
  });
  it('效果严格按目录数组顺序执行，trace 可还原生效与拒绝原因', () => {
    const w = make();
    w.getComponent<any>('catalog', 'CardCatalog')!.cards[0].effects = [
      { kind: 'modify-resource', targetId: 'progress', op: 'set', value: 2 },
      { kind: 'modify-resource', targetId: 'progress', op: 'add', value: 3 },
    ];
    w.createEntity('trace'); w.addComponent('trace', { type: 'DebugTrace', events: [], tick: 4, max: 20 } as any);
    w.tick(); play(w, 'advance'); w.tick();
    expect(res(w, 'progress-res')).toBe(5);
    expect(w.getComponent<any>('trace', 'DebugTrace')!.events.map((e: any) => e.kind)).toEqual(['decision', 'commit']);
    const rejected = make(); rejected.createEntity('trace'); rejected.addComponent('trace', { type: 'DebugTrace', events: [], tick: 2, max: 20 } as any); rejected.tick(); play(rejected, 'unknown'); rejected.tick();
    expect(rejected.getComponent<any>('trace', 'DebugTrace')!.events[0]).toMatchObject({ kind: 'reject', what: '未知 cardId unknown' });
  });
  it('目录单例异常与非 f1-resource 的操作符均 fail-closed 并留下 reject', () => {
    const duplicateCatalog = make();
    duplicateCatalog.createEntity('catalog-2');
    duplicateCatalog.addComponent('catalog-2', { ...duplicateCatalog.getComponent<any>('catalog', 'CardCatalog')! } as any);
    duplicateCatalog.createEntity('trace'); duplicateCatalog.addComponent('trace', { type: 'DebugTrace', events: [], tick: 1, max: 20 } as any);
    duplicateCatalog.tick();
    expect(duplicateCatalog.getComponent<any>('trace', 'DebugTrace')!.events[0]).toMatchObject({ kind: 'reject' });
    expect(duplicateCatalog.getComponent<any>('trace', 'DebugTrace')!.events[0].what).toContain('CardCatalog=2');
    const unsupported = make();
    unsupported.getComponent<any>('catalog', 'CardCatalog')!.cards[0].effects[0].op = 'mul';
    unsupported.tick();
    expect(pile(unsupported).hand).toEqual([]);
  });
  it('非法牌区参数拒绝，且同拍多命令的 trace 聚合在三条以内', () => {
    const malformed = make(); malformed.getComponent<any>('pile', 'IdentityCardPile')!.handLimit = Number.NaN;
    malformed.createEntity('trace'); malformed.addComponent('trace', { type: 'DebugTrace', events: [], tick: 1, max: 20 } as any);
    malformed.tick();
    expect(malformed.getComponent<any>('trace', 'DebugTrace')!.events[0]).toMatchObject({ kind: 'reject', what: '手牌上限非法' });
    const many = make('advance', 5); many.getComponent<any>('pile', 'IdentityCardPile')!.deck.push('advance'); many.getComponent<any>('pile', 'IdentityCardPile')!.handLimit = 2;
    many.tick(); many.createEntity('trace'); many.addComponent('trace', { type: 'DebugTrace', events: [], tick: 2, max: 20 } as any);
    for (const id of ['a', 'b', 'c', 'd']) { many.createEntity(`cmd-${id}`); many.addComponent(`cmd-${id}`, { type: 'IdentityCardCommand', cardId: 'advance' } as any); }
    many.tick();
    const events = many.getComponent<any>('trace', 'DebugTrace')!.events;
    expect(events).toHaveLength(3);
    expect(events.map((event: any) => event.kind)).toEqual(['decision', 'commit', 'reject']);
    expect(events[2].what).toContain('advance 不在手牌');
  });
});

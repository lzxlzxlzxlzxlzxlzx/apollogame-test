import type { LayoutNode } from '@ui/components/index.js';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { GameFlow, Resource, Shape, Tag, Transform } from '@engine/protocol/components.js';
import { S4_ACTIONS as A, S4_BALANCE_V1 as B, S4_TICK_RATE, S4_UNIT_IDS,type S4UnitId } from './content/s4-balance.js';
import type { S4Session } from './s4-session.js';
import { S4_COMBAT_PENDING, s4TeamMask } from './s4-world.js';

const label = (id: string, text: string, size = 15): LayoutNode => ({ type: 'Label', id, props: { text, size } });
const button = (id: string, text: string, action: string, args = {}, disabled = false): LayoutNode => ({ type: 'Button', id, props: { label: text, action, actionArg: JSON.stringify(args), disabled, kind: 'hero' }, layout: { fx: [{ kind: 'sheen-hover' }] } });
const panel = (id: string, children: LayoutNode[], row = false): LayoutNode => ({ type: 'Panel', id, props: {}, layout: { direction: row ? 'row' : 'column', gap: 10, padding: 14 }, children });
const skillNames = { slash: '挥斧', arrow: '骨箭', dive: '俯冲', charge: '冲锋', strike: '近战', quake: '震地', beam: '激光', potion: '药水', heal: '自疗' };
export function readS4View<U extends string>(s: S4Session<U>) {
  return { phase: s.phase, selected: s.selectedUnitId, gold: s.gold, round: s.round, outcome: s.outcome, reward: s.reward,
    owned: s.roster.map(r => ({ ...r, name: s.content.units[r.unitId].name, deployed: s.deployed.some(d => d.instanceId === r.instanceId) })),
    canEnter: s.canEnterDeploy, canStart: s.canStartBattle, reason: s.startReason, dragging: s.dragging,
    playerAlive: s.unitsInBattle(1).length, enemyAlive: s.unitsInBattle(2).length,
    seconds: s.battleTicks / S4_TICK_RATE, playerDamage: s.playerDamage, enemyDamage: s.enemyDamage, playerHealing: s.playerHealing, enemyHealing: s.enemyHealing,
    enemies: s.enemyUnits.map(u => s.content.units[u.unitId].name),
  };
}
export type S4View<U extends string=S4UnitId> = ReturnType<typeof readS4View<U>>;
export function renderS4(view: S4View): LayoutNode {
  const title = panel('s4-heading', [label('s4-title', 'MC FIGHT', 28), label('s4-budget', `第 ${view.round} 轮 · 金币 ${view.gold} · 持有 ${view.owned.length}/6`, 18)], true);
  if (view.phase === 'shop') {
    const cards = [0, 1].map(row => {
      const group = panel(`cards-${row}`, S4_UNIT_IDS.slice(row * 3, row * 3 + 3).map(id => {
        const d = B.units[id], select = button(`select-${id}`, d.name, A.select, { unitId: id });
        select.props = { label: d.name, action: A.select, actionArg: JSON.stringify({ unitId: id }), kind: 'ghost' };
        return { ...panel(`card-${id}`, [select, label(`role-${id}`, `${d.price} 金 · ${d.role}`, 13), button(`buy-${id}`, '购买', A.buy, { unitId: id }, view.gold < d.price || view.owned.length >= 6)]), layout: { flex: 1, padding: 8, gap: 6, direction: 'column' as const } };
      }), true);
      group.layout = { ...group.layout, padding: 6, gap: 8 }; return group;
    });
    const d = B.units[view.selected];
    const details = panel('shop-details', [label('detail-name', d.name, 24), label('detail-role', d.role), label('detail-hp', `生命 ${d.hp} · 护甲 ${d.armor}`), label('detail-speed', `移速 ${d.speed} · 半径 ${d.radius}`), ...d.skills.map(id => { const key = id as keyof typeof B.skills, p = B.skills[key]; return label(`detail-${id}`, `${skillNames[key]} · CD ${p.cd} 秒${'damage' in p ? ` · 伤害 ${p.damage}` : ` · 治疗 ${p.healing}`}`, 14); }), label('target-rules', view.selected === 'vex' ? '俯冲可攻击地面；下降时可被反击' : '攻击地面敌人；飞行窗口内可选中', 13), label('promise-rule', '单体近战前摇启动后承诺本次命中', 13), label('art-note', 'S4 几何占位 · 正式动作待制作', 12)]);
    details.layout = { ...details.layout, width: 290 };
    const catalog = panel('shop-cards', cards); catalog.layout = { ...catalog.layout, flex: 1, padding: 0 };
    return { ...panel('s4-shop', [title, ...(S4_COMBAT_PENDING.length ? [label('assembly-warning', `施工预览 · 尚未接通：${S4_COMBAT_PENDING.map(p => skillNames[p.skill as keyof typeof skillNames]).join('、')} · 非 S4 完成版`, 14)] : []), panel('shop-content', [catalog, details], true), rosterPanel(view), button('enter-deploy', '进入部署', A.deploy, {}, !view.canEnter)]), layout: { width: 960, height: 720, direction: 'column', padding: 14, gap: 8 } };
  }
  if (view.phase === 'result') return { ...panel('s4-result', [title, label('result-outcome', ({ victory: '胜利', defeat: '失败', draw: '平局', none: '' })[view.outcome], 42), label('result-reward', `奖励 +${view.reward} 金`), label('result-duration', `战斗耗时 ${view.seconds.toFixed(2)} 秒`), label('result-alive', `剩余单位：我方 ${view.playerAlive} · 敌方 ${view.enemyAlive}`), label('result-damage', `造成伤害：我方 ${view.playerDamage} · 敌方 ${view.enemyDamage}`), label('result-healing', `治疗量：我方 ${view.playerHealing} · 敌方 ${view.enemyHealing}`), label('damage-definition', '只计实际扣除或恢复的生命，不计过量；治疗单列。', 13), button('result-continue', '继续购买', A.continue)]), layout: { width: 960, height: 720, padding: 48, gap: 24, direction: 'column' } };
  const sellRow: LayoutNode = { ...panel('deploy-sell-row', view.owned.map(r => {
    const sell = button(`deploy-sell-${r.instanceId}`, `出售 ${r.name}`, A.sell, { instanceId: r.instanceId }, !!view.dragging);
    sell.props = { label: `出售 ${r.name}`, action: A.sell, actionArg: JSON.stringify({ instanceId: r.instanceId }), disabled: !!view.dragging, kind: 'ghost' }; sell.layout = { height: 36, flex: 1 }; return sell;
  }), true), layout: { direction: 'row', gap: 6, padding: 0 } };
  return { ...panel('s4-header', [title, label('phase-hint', view.phase === 'deploy' ? `部署 ${view.owned.filter(r => r.deployed).length} · ${view.reason || '部署就绪'} · 敌军：${view.enemies.join('、')}` : `战斗 ${view.seconds.toFixed(1)} 秒 · 我方 ${view.playerAlive} / 敌方 ${view.enemyAlive}`, 14), ...(view.phase === 'deploy' ? [sellRow] : [])]), layout: { width: 960, height: view.phase === 'deploy' ? 160 : 120, padding: 8, direction: 'column', gap: 3 } };
}
function rosterPanel(view: S4View): LayoutNode {
  const roster = panel('roster', view.owned.length ? view.owned.map(r => ({ ...panel(`roster-${r.instanceId}`, [label(`name-${r.instanceId}`, `${r.name}${r.deployed ? ' · 已部署' : ''}`, 13), button(`sell-${r.instanceId}`, '出售', A.sell, { instanceId: r.instanceId })]), layout: { flex: 1, padding: 6, gap: 4, direction: 'column' as const } })) : [label('empty-roster', '购买单位后进入部署，将待命栏单位拖入蓝色区域。')], true);
  roster.layout = { ...roster.layout, padding: 6, gap: 6 }; return roster;
}
export function renderS4Footer(view: S4View<string>): LayoutNode {
  return panel('s4-footer', view.phase === 'deploy' ? [button('back-shop', '返回商店', A.back), label('drag-help', '拖动下方圆形单位部署；拖回待命栏撤回。', 13), button('start-battle', '开始战斗', A.start, {}, !view.canStart)] : [label('battle-help', '自动战斗 · 真实碰撞与技能结算', 14)], true);
}

/** Render-only projection: copies factual Shape/Transform, never owns a gameplay position. */
export function projectS4Field<U extends string>(session: S4Session<U>): World {
  const view = new World();
  const add = (id: string, components: Record<string, object>) => { view.createEntity(id); Object.entries(components).forEach(([type, data]) => view.addComponent(id, { type, ...data } as Component)); };
  const t = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
  add('camera', { Camera: { zoom: 18, offsetX: 0, offsetY: 0, rotation: 0, viewportW: 960, viewportH: 720 } });
  for (const [id, x, width, tint] of [['player-zone', -10, 16, 0x173b50], ['buffer-zone', 0, 4, 0x34363d], ['enemy-zone', 10, 16, 0x503132], ['bench-zone', 0, 38, 0x283346]] as const) add(id, { Transform: t(x, id === 'bench-zone' ? 14 : 0), Shape: { kind: 'box', width, height: id === 'bench-zone' ? 4 : 20 }, Color: { tint, alpha: 1 } });
  const text = (id: string, x: number, y: number, content: string, size = .7) => add(id, { Transform: t(x, y), Text: { content, fontSize: size, fontFamily: 'sans-serif', anchor: 'center', lineSpacing: 1 }, Color: { tint: 0xffffff, alpha: 1 } });
  text('blue-label', -10, -9, '己方部署区'); text('red-label', 10, -9, '敌方部署区'); text('bench-label', 0, 11.5, '待命栏 / 撤回区');
  const names = new Map([...session.roster, ...session.enemyUnits].flatMap(u => [[u.instanceId, session.content.units[u.unitId].name] as const, [`${u.instanceId}#0:body`, session.content.units[u.unitId].name] as const]));
  for (const [id] of session.world.query('Transform', 'Shape')) {
    const shape = session.world.getComponent<Shape>(id, 'Shape')!, transform = session.world.getComponent<Transform>(id, 'Transform')!, tag = session.world.getComponent<Tag>(id, 'Tag')?.flags ?? 0;
    const battle = session.phase === 'battle' || session.phase === 'result', playerMask = battle ? s4TeamMask(1) : 1, enemyMask = battle ? s4TeamMask(2) : 2;
    add(id, { Transform: { ...transform }, Shape: { ...shape }, Color: { tint: (tag & playerMask) ? 0x75cfff : (tag & enemyMask) ? 0xff987b : 0xf5d567, alpha: session.world.hasComponent(id, 'Hitbox') ? .6 : 1 } });
    const hp = session.world.getComponent<Resource>(id, 'Resource');
    if (hp?.id === 'hp') text(`${id}-hp`, transform.x, transform.y - 1.5, `${names.get(id) ?? ''} ${hp.current}/${hp.max}`, .65);
  }
  if (session.phase === 'deploy') for (const u of session.enemyUnits) { add(u.instanceId, { Transform: t(u.x, u.y), Shape: { kind: 'circle', radius: session.content.units[u.unitId].radius }, Color: { tint: 0xff987b, alpha: 1 } }); text(`${u.instanceId}-name`, u.x, u.y - 1.5, session.content.units[u.unitId].name); }
  for (const [id] of session.world.query('GameFlow', 'Transform')) {
    const flow = session.world.getComponent<GameFlow>(id, 'GameFlow')!, p = session.world.getComponent<Transform>(id, 'Transform')!;
    if (flow.current !== 'Ready') text(`${id}-phase`, p.x, p.y + 1.6, flow.current, .6);
  }
  return view;
}

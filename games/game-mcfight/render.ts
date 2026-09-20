import type { LayoutNode } from '@ui/components/index.js';
import type { Resource, Shape, Transform, GameFlow, Status, Timer } from '@engine/protocol/components.js';
import { catalog, requireId } from './content/catalog.js';
import { bodyId, selectionAction } from './world.js';
import type { McFightSession } from './session.js';

export function readView(session: McFightSession) {
  const w = session.engine.world;
  return { phase: session.phase, selectedUnitId: session.selectedUnitId,
    units: catalog.units.map(unit => {
      const id = bodyId(unit.id), body = w.getComponent<Transform>(id, 'Transform')!;
      return { id: unit.id, hp: w.getComponent<Resource>(id, 'Resource')!.current,
        radius: (w.getComponent<Shape>(id, 'Shape') as Shape & { radius: number }).radius,
        x: body.x, y: body.y, status: w.getComponent<Status>(id, 'Status')!.flags,
        skills: unit.skillLoadoutIds.map(skill => ({ id: skill,
          phase: w.getComponent<GameFlow>(`${unit.id}#0:${skill}`, 'GameFlow')!.current,
          cd: Math.max(0, w.getComponent<Timer>(`${unit.id}#0:${skill}`, 'Timer')!.duration - w.getComponent<Timer>(`${unit.id}#0:${skill}`, 'Timer')!.elapsed),
        })),
      };
    }),
  };
}
export type View = ReturnType<typeof readView>;
const label = (id: string, text: string, size = 16): LayoutNode => ({ type: 'Label', id, props: { text, size } });
export function renderShop(view: View): LayoutNode {
  const unit = requireId(catalog.units, view.selectedUnitId), text = requireId(catalog.texts, unit.textId);
  const art = requireId(catalog.presentations, unit.presentationProfileId), current = requireId(view.units, unit.id);
  return { type: 'Panel', id: 'mcfight-shop', props: {}, layout: { width: 960, height: 640, padding: 30, direction: 'column', gap: 18 }, children: [
    { type: 'Panel', id: 'heading', props: { bare: true }, layout: { direction: 'row', align: 'center', justify: 'between' }, children: [
      { type: 'Label', id: 'title', props: { text: catalog.game.title, size: 36, font: 'epic' } },
      { type: 'Badge', id: 'stage', props: { text: `商店 / ${view.phase}`, tone: 'ok' } },
    ] },
    label('notice', catalog.game.notice, 14),
    { type: 'Panel', id: 'catalog', props: { bare: true }, layout: { direction: 'row', gap: 16 }, children: catalog.units.map(def => {
      const t = requireId(catalog.texts, def.textId), runtime = requireId(view.units, def.id);
      return { type: 'Panel', id: `card-${def.id}`, props: {}, layout: { flex: 1, padding: 18, direction: 'column', gap: 12 }, children: [
        label(`portrait-${def.id}`, `${t.placeholder}  ${t.name}`, 25),
        label(`category-${def.id}`, requireId(catalog.shop, def.shopId).label, 14),
        label(`hp-${def.id}`, `HP ${runtime.hp} / ${def.hp}`, 16),
        { type: 'Button', id: `select-${def.id}`, props: { label: view.selectedUnitId === def.id ? '正在查看' : `查看${t.name}`, action: selectionAction(def.id), kind: 'hero', disabled: view.selectedUnitId === def.id }, layout: { fx: [{ kind: 'sheen-hover' }] } },
      ] };
    }) },
    { type: 'Panel', id: 'details', props: {}, layout: { direction: 'column', padding: 18, gap: 10 }, children: [
      label('unit-name', text.name, 24), label('description', text.description),
      label('body', `位置 (${current.x}, ${current.y}) · 碰撞 / 选择半径 ${current.radius} · 状态位 ${current.status}`, 14),
      ...current.skills.map(skill => {
        const l = requireId(catalog.loadouts, skill.id), p = l.parameters;
        return label(`skill-${skill.id}`, `${requireId(catalog.templates, l.templateId).action} · ${skill.phase} · 伤害 ${p.damage} · 距离 ${p.range} · 攻击半径 ${p.radius} · CD ${skill.cd}/${p.cd}`, 14);
      }),
      label('art', `素材缺失 ${art.clips.length} 段 · 根挂点 ${art.root} · 默认朝${art.facing === 'right' ? '右' : '左'} · 镜像${art.mirror ? '启用' : '关闭'} · 缩放 ${art.scale}`, 14),
      label('slots', art.clips.map(clip => `${clip.semantic} [${clip.slot}: ${clip.status}]`).join(' / '), 12),
    ] },
    label('fixture', catalog.game.parameters, 13),
  ] };
}

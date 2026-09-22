import { describe, it, expect, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Draggable, InputQueue, Transform, Shape, HexBoard, HexPos, Tag, Flag, Resource } from '@engine/protocol/components.js';
import { dragPlaceCapability } from './drag-place.js';
import { synthesizeDrag } from '../../net/host/queued-input.js';

const ALLY = 1 << 1;
function mk(layout: 'axial' | 'odd-r' = 'odd-r'): World {
  const w = new World();
  for (const s of dragPlaceCapability.systems) w.addSystem(s);
  w.createEntity('board');
  w.addComponent('board', { type: 'HexBoard', cols: 8, rows: 8, tileSize: 10, originX: 0, originY: 0, layout } as HexBoard);
  w.createEntity('q');
  w.addComponent('q', { type: 'InputQueue', actions: [] } as InputQueue);
  return w;
}
function seat(w: World, id: string, x: number, y: number, extra: Partial<Draggable> = {}): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Shape', kind: 'box', width: 16, height: 16 } as Shape);
  w.addComponent(id, { type: 'Tag', flags: ALLY } as Tag);
  w.addComponent(id, { type: 'Draggable', snap: 'hex', ...extra } as Draggable);
}
const dragTo = (w: World, fx: number, fy: number, tx: number, ty: number) => {
  w.getComponent<InputQueue>('q', 'InputQueue')!.actions = [{ source: 'p1', key: 'drag', x: fx, y: fy, values: [tx, ty], phase: 'drag' }];
};
const clearIn = (w: World) => { w.getComponent<InputQueue>('q', 'InputQueue')!.actions = []; };
const tf = (w: World, id: string) => w.getComponent<Transform>(id, 'Transform')!;
const hp = (w: World, id: string) => w.getComponent<HexPos>(id, 'HexPos');

describe('T2 drag-place（拖拽摆放，REQ-F-045）', () => {
  it('壳层合成：超阈值产 drag 动作、阈值内为点击（null）', () => {
    expect(synthesizeDrag('p1', { x: 0, y: 0 }, { x: 3, y: 3 })).toBeNull(); // <6px
    const d = synthesizeDrag('p1', { x: 100, y: 200 }, { x: 30, y: 25 })!;
    expect(d).toMatchObject({ key: 'drag', x: 100, y: 200, values: [30, 25] });
  });

  it('上场：板外席位拖进板 → 吸附格写 HexPos + Transform=格投影', () => {
    const w = mk();
    seat(w, 's1', 200, 200); // 板外（板 ~80x60px）
    dragTo(w, 200, 200, 21, 23); // 终点≈ col2,row3（odd-r 奇行 x=2*10+5=25,y=22.5 附近）
    w.tick();
    const cell = hp(w, 's1')!;
    expect(cell).toBeTruthy();
    expect(cell.r).toBe(3);
    expect(tf(w, 's1').y).toBe(3 * 7.5); // 吸附到格投影
  });

  it('调位 + 回席：板内拖板内改格；拖出板 → 移除 HexPos、自由落点', () => {
    const w = mk();
    seat(w, 's1', 200, 200);
    dragTo(w, 200, 200, 11, 8); w.tick(); // 上板
    const c1 = { ...hp(w, 's1')! };
    dragTo(w, tf(w, 's1').x, tf(w, 's1').y, 41, 31); w.tick(); // 板内调位
    const c2 = hp(w, 's1')!;
    expect(c2.q !== c1.q || c2.r !== c1.r).toBe(true);
    dragTo(w, tf(w, 's1').x, tf(w, 's1').y, 300, 300); w.tick(); // 拖出板
    expect(hp(w, 's1')).toBeUndefined(); // 回席失格
    expect(tf(w, 's1').x).toBe(300);
  });

  it('onlyFlag 相位门：非备战期拖拽被忽略', () => {
    const w = mk();
    w.createEntity('ph'); w.addComponent('ph', { type: 'Flag', id: 'in_prep', active: false } as Flag);
    seat(w, 's1', 200, 200, { onlyFlag: 'in_prep' });
    dragTo(w, 200, 200, 11, 8); w.tick();
    expect(hp(w, 's1')).toBeUndefined(); // 门关，没动
    w.getComponent<Flag>('ph', 'Flag')!.active = true;
    dragTo(w, 200, 200, 11, 8); w.tick();
    expect(hp(w, 's1')).toBeTruthy(); // 门开
  });

  it('上板限额：场上数≥level → 进板整次拒绝；板内调位不受限', () => {
    const w = mk();
    w.createEntity('lv'); w.addComponent('lv', { type: 'Resource', id: 'level', current: 1, min: 0, max: 9 } as Resource);
    seat(w, 'a', 200, 200, { capTagMask: ALLY, capResource: 'level' });
    seat(w, 'b', 200, 240, { capTagMask: ALLY, capResource: 'level' });
    dragTo(w, 200, 200, 11, 8); w.tick(); clearIn(w); // a 上板（0<1 放行）
    expect(hp(w, 'a')).toBeTruthy();
    dragTo(w, 200, 240, 31, 8); w.tick(); clearIn(w); // b 进板：已 1≥1 → 拒
    expect(hp(w, 'b')).toBeUndefined();
    expect(tf(w, 'b').x).toBe(200); // 整次拒绝，原地不动
    dragTo(w, tf(w, 'a').x, tf(w, 'a').y, 41, 23); w.tick(); // a 板内调位不受限
    expect(hp(w, 'a')).toBeTruthy();
  });

  it('确定性：同输入两次跑同落点', () => {
    const run = () => {
      const w = mk();
      seat(w, 's1', 200, 200);
      dragTo(w, 200, 200, 33, 17); w.tick();
      const c = hp(w, 's1')!;
      return `${c.q},${c.r},${tf(w, 's1').x},${tf(w, 's1').y}`;
    };
    expect(run()).toBe(run());
  });

  it('REQ-F-057 落子重放：成功落点把实体自带 keep Tween 倒带（elapsed=0/done=false）；被拒不重放', () => {
    const w = mk();
    seat(w, 's1', 200, 200);
    w.addComponent('s1', { type: 'Tween', target: 'Transform.scaleY', from: 1.4, to: 1, elapsed: 12, duration: 12, easing: 'easeOut', done: true, keep: true } as never);
    dragTo(w, 200, 200, 35, 35); // 上板成功
    w.tick();
    const tw = w.getComponent('s1', 'Tween') as unknown as { elapsed: number; done: boolean };
    expect(tw.done).toBe(false); // 倒带重放
    expect(tw.elapsed).toBe(0); // 归零（本测试世界未挂 tween 系统，纯验钩子写入）
    // 相位门拒绝 → 不重放
    clearIn(w);
    tw.done = true; tw.elapsed = 12; // 模拟播完态
    w.createEntity('gate');
    w.addComponent('gate', { type: 'Flag', id: 'in_prep', active: false } as Flag);
    (w.getComponent('s1', 'Draggable') as unknown as { onlyFlag?: string }).onlyFlag = 'in_prep';
    dragTo(w, 35, 35, 65, 35);
    w.tick();
    expect((w.getComponent('s1', 'Tween') as unknown as { done: boolean }).done).toBe(true); // 门拒 → 没倒带
  });

  it('定序守护：与 grid-move/motion-apply/flow/zone/group/self-rule/resource-apply 同场不抛（输入先行七件套，REQ-F-050 补 motion-apply）', async () => {
    const { gridMoveCapability } = await import('./grid-move.js');
    const { flowCapability } = await import('../tier3/flow.js');
    const { zoneOccupancyCapability } = await import('./zone-occupancy.js');
    const { groupCountCapability } = await import('./group-count.js');
    const { selfRuleCapability } = await import('./self-rule.js');
    const { resourceCapability } = await import('@atom-skills/resource/index.js');
    // REQ-F-050 回归锁：motion-apply（主角自由移动）与 drag-place 互为 Transform RMW 对——
    // 首个同场世界（game-f）曾成 22 系统 SCC；six 件套补成七件套后此图必须可排。
    const { motionApplyCapability } = await import('../tier1/index.js');
    // 读告警纪律：推断环只 warn 不抛，收进断言（ENG-03 形状）
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const w = mk();
      for (const cap of [gridMoveCapability, motionApplyCapability, flowCapability, zoneOccupancyCapability, groupCountCapability, selfRuleCapability, resourceCapability]) {
        for (const s of cap.systems) w.addSystem(s as never);
      }
      seat(w, 's1', 200, 200);
      expect(() => { for (let i = 0; i < 3; i++) w.tick(); }).not.toThrow();
      const bad = warn.mock.calls.map((c) => c.map(String).join(' ')).filter((m) => m.includes('[topological-sort]') || m.includes('Circular'));
      expect(bad).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});

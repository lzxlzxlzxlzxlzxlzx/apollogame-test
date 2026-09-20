import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { HexBoard, HexPos, GridMover, Relation, Transform } from '@engine/protocol/components.js';
import { gridMoveCapability } from './grid-move.js';
import { hexDistance } from './hex.js';

function board(w: World, cols = 8, rows = 8, tileSize = 10): void {
  w.createEntity('board');
  w.addComponent('board', { type: 'HexBoard', cols, rows, tileSize, originX: 0, originY: 0 } as HexBoard);
}
function unit(w: World, id: string, q: number, r: number, opts: { period?: number; target?: string; transform?: boolean } = {}): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'HexPos', q, r } as HexPos);
  if (opts.period !== undefined) w.addComponent(id, { type: 'GridMover', period: opts.period } as GridMover);
  if (opts.target) w.addComponent(id, { type: 'Relation', kind: 'target', targetId: opts.target } as Relation);
  if (opts.transform) w.addComponent(id, { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
}
function mk(): World {
  const w = new World();
  for (const s of gridMoveCapability.systems) w.addSystem(s);
  return w;
}
const pos = (w: World, id: string) => w.getComponent<HexPos>(id, 'HexPos')!;

describe('grid-move · 逐格寻路移动', () => {
  it('每 period tick 走一格，逐步逼近目标', () => {
    const w = mk(); board(w);
    unit(w, 'hero', 0, 0, { period: 2, target: 'enemy' });
    unit(w, 'enemy', 5, 0); // 静止目标（无 GridMover）
    const d0 = hexDistance(pos(w, 'hero'), pos(w, 'enemy'));
    w.tick(); // elapsed 1 < 2 → 不动
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(d0);
    w.tick(); // elapsed 2 → 走一格
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(d0 - 1);
  });

  it('到目标相邻格即停（不踏上目标格，攻击距离）', () => {
    const w = mk(); board(w);
    unit(w, 'hero', 0, 0, { period: 1, target: 'enemy' });
    unit(w, 'enemy', 4, 0);
    for (let i = 0; i < 20; i++) w.tick();
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(1); // 停在相邻
    expect(pos(w, 'hero')).not.toEqual(pos(w, 'enemy'));         // 不重叠
  });

  it('占位：不踏上其它单位占的格（绕行）', () => {
    const w = mk(); board(w);
    unit(w, 'hero', 0, 0, { period: 1, target: 'enemy' });
    unit(w, 'enemy', 4, 0);
    // 直线上塞静止友军/敌占格——占位契约的主体是「单位」（HexPos∧GridMover，REQ-F-051）：
    // 静立单位 = 挂 GridMover 不给目标（period 任意，无 Relation 永不走）。
    unit(w, 'block1', 2, 0, { period: 999 }); unit(w, 'block2', 2, -1, { period: 999 }); unit(w, 'block3', 2, 1, { period: 999 });
    const occupiedKeys = new Set<string>();
    for (let i = 0; i < 25; i++) {
      w.tick();
      const p = pos(w, 'hero');
      occupiedKeys.add(`${p.q},${p.r}`);
      // hero 永不踏占格
      expect([[2, 0], [2, -1], [2, 1], [4, 0]].some(([q, r]) => q === p.q && r === p.r)).toBe(false);
    }
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(1); // 绕过仍到相邻
  });

  it('REQ-F-051：placement 数据实体（HexPos 无 GridMover）不占格——单位径直穿行其格；静止目标仍停相邻', () => {
    const w = mk(); board(w);
    unit(w, 'hero', 0, 0, { period: 1, target: 'enemy' });
    unit(w, 'enemy', 4, 0); // 静止目标（无 GridMover）——既有契约不变
    // 直线必经之路上放三个「席位 marker」类实体（带 HexPos 不带 GridMover）：不挡路
    unit(w, 'm1', 1, 0); unit(w, 'm2', 2, 0); unit(w, 'm3', 3, 0);
    const visited = new Set<string>();
    for (let i = 0; i < 12; i++) { w.tick(); const p = pos(w, 'hero'); visited.add(`${p.q},${p.r}`); }
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(1); // 到相邻（目标格显式入阻挡，不踏上）
    expect(pos(w, 'hero')).not.toEqual(pos(w, 'enemy'));
    expect(visited.has('2,0') || visited.has('1,0') || visited.has('3,0')).toBe(true); // 真穿行过 marker 格（直线未绕）
  });

  it('Transform 由 HexPos 投影同步（供渲染/战斗距离）', () => {
    const w = mk(); board(w, 8, 8, 10);
    unit(w, 'hero', 3, 2, { period: 1, transform: true }); // 无目标 → 不动，仅同步 Transform
    w.tick();
    const t = w.getComponent<Transform>('hero', 'Transform')!;
    expect(t.x).toBe(3 * 10 + 2 * 5);   // q*tile + r*tile/2 = 40
    expect(t.y).toBe(2 * 7.5);          // r*tile*0.75 = 15
  });

  it('无棋盘 / 无目标 → 不动、不报错', () => {
    const w = mk();
    unit(w, 'hero', 0, 0, { period: 1, target: 'enemy' });
    expect(() => w.tick()).not.toThrow(); // 无 HexBoard → return
    board(w);
    unit(w, 'lonely', 1, 1, { period: 1 }); // 无 Relation
    expect(() => w.tick()).not.toThrow();
    expect(pos(w, 'lonely')).toEqual({ q: 1, r: 1, type: 'HexPos' } as never); // 不动
  });
});

describe('grid-move · 确定性', () => {
  it('同布局同输入多次跑 → 同终局（lockstep 安全）', () => {
    const run = () => {
      const w = mk(); board(w);
      unit(w, 'hero', 0, 0, { period: 1, target: 'enemy' });
      unit(w, 'enemy', 5, 3);
      unit(w, 'b1', 2, 1); unit(w, 'b2', 3, 1);
      for (let i = 0; i < 15; i++) w.tick();
      const p = pos(w, 'hero');
      return `${p.q},${p.r}`;
    };
    expect(run()).toBe(run());
  });
});

// ── REQ-025 回归：aggro(读 Transform/写 Relation) + grid-move(读 Relation/写 Transform) 同场不成环 ──
import { aggroCapability } from '../tier3/aggro.js';
import { motionApplyCapability } from '../tier1/motion-apply.js';
import type { Perception, Tag } from '@engine/protocol/components.js';
describe('grid-move · REQ-025 与 aggro 同场不成环', () => {
  it('aggro+grid-move 同跑：拓扑排序不抛 + 单位索敌并沿 hex 寻路逼近', () => {
    const w = new World();
    for (const s of aggroCapability.systems) w.addSystem(s);
    for (const s of gridMoveCapability.systems) w.addSystem(s);
    // Aggro reads frame-start positions; grid movement is not a snapshot producer.
    for (const s of motionApplyCapability.systems) w.addSystem(s);
    board(w);
    const ENEMY = 1 << 1;
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Perception', targetTag: ENEMY, sightRadius: 0 } as Perception); // 0=无限视野
    w.addComponent('hero', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('hero', { type: 'HexPos', q: 0, r: 0 } as HexPos);
    w.addComponent('hero', { type: 'GridMover', period: 1 } as GridMover);
    w.createEntity('enemy');
    w.addComponent('enemy', { type: 'Tag', flags: ENEMY } as Tag);
    w.addComponent('enemy', { type: 'Transform', x: 999, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('enemy', { type: 'HexPos', q: 6, r: 0 } as HexPos);
    expect(() => { for (let i = 0; i < 12; i++) w.tick(); }).not.toThrow(); // 不成环（修复前此处抛环）
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(1); // 索到敌、寻路到相邻
  });
});

// ── REQ-F-030 回归：CC 定身（GridMover.haltStatusMask，对齐 Steering 既有语义） ──
import type { Status } from '@engine/protocol/components.js';
import { overlapDetectCapability } from '@atom-skills/overlap-detect/index.js';
import { triggerZoneCapability } from './trigger-zone.js';
import { hitboxCapability } from './hitbox.js';
import { overTimeCapability } from './over-time.js';
describe('grid-move · REQ-F-030 CC 定身', () => {
  const FROZEN = 1 << 3;
  function frozenUnit(w: World, id: string, q: number, r: number, target: string): void {
    w.createEntity(id);
    w.addComponent(id, { type: 'HexPos', q, r } as HexPos);
    w.addComponent(id, { type: 'GridMover', period: 1, haltStatusMask: FROZEN } as GridMover);
    w.addComponent(id, { type: 'Relation', kind: 'target', targetId: target } as Relation);
  }
  it('被冻不走：Status 命中掩码 → 原地定身；清位 → 恢复走', () => {
    const w = mk(); board(w);
    frozenUnit(w, 'hero', 0, 0, 'enemy');
    unit(w, 'enemy', 5, 0);
    w.addComponent('hero', { type: 'Status', flags: FROZEN } as Status);
    for (let i = 0; i < 5; i++) w.tick();
    expect(pos(w, 'hero').q).toBe(0); // 冻着：一步未动
    expect(pos(w, 'hero').r).toBe(0);
    w.getComponent<Status>('hero', 'Status')!.flags = 0; // 解冻
    w.tick();
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(4); // 恢复走（5→4）
  });
  it('时钟暂停：冻结期 elapsed 不累计，解控后按剩余节奏恢复、无补步突进', () => {
    const w = mk(); board(w);
    w.createEntity('hero');
    w.addComponent('hero', { type: 'HexPos', q: 0, r: 0 } as HexPos);
    w.addComponent('hero', { type: 'GridMover', period: 3, haltStatusMask: FROZEN } as GridMover);
    w.addComponent('hero', { type: 'Relation', kind: 'target', targetId: 'enemy' } as Relation);
    unit(w, 'enemy', 5, 0);
    w.tick(); // elapsed 1
    w.addComponent('hero', { type: 'Status', flags: FROZEN } as Status);
    for (let i = 0; i < 4; i++) w.tick(); // 冻 4 拍：elapsed 仍 1
    expect(w.getComponent<GridMover>('hero', 'GridMover')!.elapsed).toBe(1);
    expect(pos(w, 'hero').q).toBe(0);
    w.getComponent<Status>('hero', 'Status')!.flags = 0; // 解冻
    w.tick(); // elapsed 2 < 3 → 仍不走（无补步）
    expect(pos(w, 'hero').q).toBe(0);
    w.tick(); // elapsed 3 → 走一格
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(4);
  });
  it('掩码不匹配 / 无掩码 → 照走（缺省行为不变）', () => {
    const w = mk(); board(w);
    frozenUnit(w, 'a', 0, 0, 'enemy');
    unit(w, 'enemy', 5, 0);
    w.addComponent('a', { type: 'Status', flags: 1 << 5 } as Status); // 别的状态位
    unit(w, 'b', 0, 3, { period: 1, target: 'enemy' }); // 无掩码
    w.tick();
    expect(hexDistance(pos(w, 'a'), pos(w, 'enemy'))).toBe(4); // 照走
  });
  it('定序守护：grid-move(读 Status) + overlap/trigger/hitbox/over-time 同场拓扑不抛（runsBefore 破第三方环）', () => {
    const w = new World();
    for (const cap of [overlapDetectCapability, triggerZoneCapability, hitboxCapability, overTimeCapability, gridMoveCapability]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    board(w);
    frozenUnit(w, 'hero', 0, 0, 'enemy');
    unit(w, 'enemy', 4, 0);
    expect(() => { for (let i = 0; i < 5; i++) w.tick(); }).not.toThrow(); // 无显式 runsBefore 时此处抛环
    expect(hexDistance(pos(w, 'hero'), pos(w, 'enemy'))).toBe(1); // 未被冻 → 正常寻路到相邻
  });
});

// ── REQ-F-034 回归：视觉滑行（glideSpeed —— 逻辑格瞬步、Transform 恒速滑行） ──
describe('grid-move · REQ-F-034 平滑滑行', () => {
  const FROZEN = 1 << 3;
  function glider(w: World, id: string, q: number, r: number, glideSpeed: number, opts: { period?: number; target?: string; halt?: number } = {}): void {
    w.createEntity(id);
    w.addComponent(id, { type: 'HexPos', q, r } as HexPos);
    w.addComponent(id, { type: 'GridMover', period: opts.period ?? 1, glideSpeed, ...(opts.halt ? { haltStatusMask: opts.halt } : {}) } as GridMover);
    if (opts.target) w.addComponent(id, { type: 'Relation', kind: 'target', targetId: opts.target } as Relation);
    w.addComponent(id, { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  }
  const tx = (w: World, id: string) => w.getComponent<Transform>(id, 'Transform')!.x;

  it('缺省（无 glideSpeed）：仍逐格硬钉（零迁移回归）', () => {
    const w = mk(); board(w, 8, 8, 10);
    unit(w, 'u', 2, 0, { period: 1, transform: true });
    w.tick();
    expect(tx(w, 'u')).toBe(20); // 直接钉到投影点
  });

  it('滑行：HexPos 瞬步为 SIM 真相，Transform 恒速逼近、到点精确贴齐（无 epsilon）', () => {
    const w = mk(); board(w, 8, 8, 10);
    glider(w, 'u', 0, 0, 3, { target: 'enemy' });
    unit(w, 'enemy', 3, 0);
    w.tick(); // 走步拍：HexPos 0→1（逻辑瞬步），视觉次拍起滑（每拍恒一次 glideSpeed）
    expect(pos(w, 'u').q).toBe(1); // 逻辑格已到（占位/寻路真相）
    expect(tx(w, 'u')).toBe(0); // 本拍循环顶时格还是 0 → 未滑
    w.tick(); // 循环顶朝投影 10 滑 3px；随后 HexPos 1→2（到 enemy 相邻停）
    expect(pos(w, 'u').q).toBe(2);
    expect(tx(w, 'u')).toBe(3);
    // 剩余 17px 朝投影 20：3px/拍 × 5 拍 → 18，末拍剩 2 ≤ 3 贴齐
    for (let i = 0; i < 5; i++) w.tick();
    expect(tx(w, 'u')).toBe(18);
    w.tick();
    expect(tx(w, 'u')).toBe(20); // 精确贴齐投影点，不渐近
  });

  it('冻结=时间静止：滑行中被冻 Transform 原地停，解冻续滑', () => {
    const w = mk(); board(w, 8, 8, 10);
    glider(w, 'u', 0, 0, 2, { target: 'enemy', halt: FROZEN });
    unit(w, 'enemy', 4, 0);
    w.tick(); // HexPos→1（视觉未滑）
    w.tick(); // 滑 2px + HexPos→2
    expect(tx(w, 'u')).toBe(2);
    w.addComponent('u', { type: 'Status', flags: FROZEN } as Status);
    for (let i = 0; i < 3; i++) w.tick(); // 冻 3 拍
    expect(tx(w, 'u')).toBe(2); // 视觉一并停（不滑）
    expect(pos(w, 'u').q).toBe(2); // 逻辑也停
    w.getComponent<Status>('u', 'Status')!.flags = 0;
    w.tick(); // 解冻：续滑
    expect(tx(w, 'u')).toBeGreaterThan(2);
  });

  it('确定性：同输入两次跑滑行轨迹一致', () => {
    const run = () => {
      const w = mk(); board(w, 8, 8, 10);
      glider(w, 'u', 0, 0, 2.5, { target: 'enemy' });
      unit(w, 'enemy', 5, 2);
      const trail: number[] = [];
      for (let i = 0; i < 12; i++) { w.tick(); trail.push(w.getComponent<Transform>('u', 'Transform')!.x, w.getComponent<Transform>('u', 'Transform')!.y); }
      return trail.join(',');
    };
    expect(run()).toBe(run());
  });
});

// ── REQ-F-037（外审 Q5 裁决 c）：'odd-r' 错位矩形棋盘 —— sim 纯 axial、几何≡拓扑 ──
import { offsetToAxial, axialToOffset, hexCellKey } from './hex.js';
describe('grid-move · REQ-F-037 odd-r 棋盘（几何与拓扑同构）', () => {
  function boardOddR(w: World, cols = 8, rows = 8, ts = 10): void {
    w.createEntity('board');
    w.addComponent('board', { type: 'HexBoard', cols, rows, tileSize: ts, originX: 0, originY: 0, layout: 'odd-r' } as HexBoard);
  }
  it('坐标换算往返 + 真投影呈交错矩形：offset(col,row) 摆子 → x = col·ts + (row&1)·ts/2', () => {
    for (const [col, row] of [[0, 0], [2, 3], [7, 6], [5, 1]]) {
      const a = offsetToAxial(col, row);
      expect(axialToOffset(a.q, a.r)).toEqual({ col, row }); // 往返一致
    }
    const w = mk(); boardOddR(w);
    const a = offsetToAxial(2, 3); // 奇行
    unit(w, 'u', a.q, a.r, { period: 1, transform: true });
    const b = offsetToAxial(2, 4); // 偶行同列
    unit(w, 'v', b.q, b.r, { period: 1, transform: true });
    w.tick();
    expect(w.getComponent<Transform>('u', 'Transform')!.x).toBe(2 * 10 + 5); // 奇行半格
    expect(w.getComponent<Transform>('v', 'Transform')!.x).toBe(2 * 10); // 偶行不偏 → 矩形外轮廓
  });
  it('几何≡拓扑：6 个 axial 邻居的投影距离全部 < 1.05·ts（旧 offset 投影的 1.5ts 跳格消失）', () => {
    const w = mk(); boardOddR(w);
    const board = w.getComponent<HexBoard>('board', 'HexBoard')!;
    const proj = (q: number, r: number) => ({ x: q * 10 + r * 5, y: r * 7.5 }); // 真投影
    const c = offsetToAxial(4, 4);
    for (const d of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      const p0 = proj(c.q, c.r), p1 = proj(c.q + d[0], c.r + d[1]);
      const dist = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
      expect(dist).toBeLessThan(10 * 1.05); // 视觉相邻=逻辑相邻
    }
    expect(board.layout).toBe('odd-r');
  });
  it('错位矩形边界：行首负 q 可走、行尾越界不可走（A* 按 offset col 裁切）', () => {
    const w = mk(); boardOddR(w, 8, 8);
    // 第 5 行（r=5）的合法 axial q 范围是 [-2, 5]（col = q+2 ∈ [0,8)）
    const u = offsetToAxial(0, 5); // q=-2：行首
    unit(w, 'walker', u.q, u.r, { period: 1, target: 'enemy' });
    const e = offsetToAxial(4, 5);
    unit(w, 'enemy', e.q, e.r);
    for (let i = 0; i < 10; i++) w.tick();
    expect(hexDistance(pos(w, 'walker'), pos(w, 'enemy'))).toBe(1); // 从负 q 区正常寻路到相邻
    expect(axialToOffset(pos(w, 'walker').q, pos(w, 'walker').r).col).toBeGreaterThanOrEqual(0); // 永在板内
  });
  it('占位键不撞：负 q 与上一行行尾在旧键 r*cols+q 下同值，hexCellKey 区分', () => {
    const cols = 8;
    const oldKey = (q: number, r: number) => r * cols + q;
    expect(oldKey(-1, 2)).toBe(oldKey(7, 1)); // 旧键撞（2*8-1 = 15 = 1*8+7）
    expect(hexCellKey(-1, 2, cols, 'odd-r')).not.toBe(hexCellKey(7, 1, cols, 'odd-r')); // 新键不撞
    // 功能验证：两单位分占这两格，互不视为"同格占位"
    const w = mk(); boardOddR(w, 8, 8);
    unit(w, 'a', -1, 2, { period: 1 });
    unit(w, 'b', 7, 1, { period: 1 });
    unit(w, 'mover', 0, 2, { period: 1, target: 'tgt' });
    unit(w, 'tgt', 3, 2);
    expect(() => { for (let i = 0; i < 10; i++) w.tick(); }).not.toThrow();
    expect(hexDistance(pos(w, 'mover'), pos(w, 'tgt'))).toBe(1); // 占位语义正常
  });
});

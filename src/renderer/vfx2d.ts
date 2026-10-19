import type { IWorld, EntityId } from '@engine/core/types.js';
import type { Transform, Signal } from '@engine/protocol/components.js';
import type { Vfx2D } from '@atom-skills/vfx2d/index.js';
import { mulberry32 } from '@atom-skills/random/index.js';
import { fnv1a32 } from '@engine/math/hash.js';
import { clamp01, lerp } from '@engine/math/scalar.js';

// ═══════════════════════════════════════════════════════════════
//  renderer/vfx2d —— Vfx2D 的渲染层解释器（纯表现·渲染器私有粒子池）。
//  step(world, dt)：读 Vfx2D + Transform + 同实体 Signal → 发射/推进/回收（永不写世界）；draw(ctx)：在 world→device
//  基变换下按世界坐标画。dt 由调用方给（秒）；random = 每发射器一条 mulberry32（种子=实体 id 哈希）→ 同输入同画面，
//  但与 sim 种子无关、不进快照。实体消失 → 发射器连粒子一起丢（防泄漏）。
//  三角函数只在此渲染面用（sim 面禁 trig 的 eslint 规则不覆盖 renderer）。
// ═══════════════════════════════════════════════════════════════

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number;
  ring: boolean; // ring 粒子：半径 = age·speed，线宽 = size
}

interface Emitter { particles: Particle[]; acc: number; rng: () => number; seen: boolean }

const DEF = { count: 12, life: 0.6, lifeVar: 0.3, speed: 80, speedVar: 0.5, angle: 0, spread: Math.PI, size: 4, sizeEnd: 0, color: 0xffffff, gravity: 0, drag: 0, max: 256 } as const;

function hasSignal(world: IWorld, eid: EntityId, name: string): boolean {
  const s = world.getComponent<Signal>(eid, 'Signal');
  return !!s && s.name === name;
}

function hex(c: number): string { return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`; }

/** 颜色插值（按通道·渲染面）。 */
export function lerpColor(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 0xff, (b >> 16) & 0xff, t));
  const g = Math.round(lerp((a >> 8) & 0xff, (b >> 8) & 0xff, t));
  const bl = Math.round(lerp(a & 0xff, b & 0xff, t));
  return (r << 16) | (g << 8) | bl;
}

export class Vfx2DLayer {
  private readonly emitters = new Map<EntityId, Emitter>();

  /** 活粒子总数（测试/预算观测）。 */
  get liveCount(): number {
    let n = 0;
    for (const e of this.emitters.values()) n += e.particles.length;
    return n;
  }

  /** 推进一帧；返回本帧后是否有东西要画。 */
  step(world: IWorld, dt: number): boolean {
    const comps = world.query('Vfx2D');
    if (comps.length === 0 && this.emitters.size === 0) return false;
    const alive = new Set<EntityId>();
    for (const [eid, m] of comps) {
      const v = m.get('Vfx2D') as Vfx2D | undefined;
      const tr = world.getComponent<Transform>(eid, 'Transform');
      if (!v || !tr) continue;
      alive.add(eid);
      let em = this.emitters.get(eid);
      if (!em) { em = { particles: [], acc: 0, rng: mulberry32(fnv1a32(eid)), seen: false }; this.emitters.set(eid, em); }
      const first = !em.seen; em.seen = true;
      const x = tr.x + (v.offsetX ?? 0), y = tr.y + (v.offsetY ?? 0);
      const count = v.count ?? DEF.count;
      switch (v.kind) {
        case 'pop': if (first) this.emit(em, v, x, y, count, false); break;
        case 'burst': if (v.trigger && hasSignal(world, eid, v.trigger)) this.emit(em, v, x, y, count, false); break;
        case 'ring': if (v.trigger && hasSignal(world, eid, v.trigger)) this.emit(em, v, x, y, 1, true); break;
        case 'stream':
        case 'trail': {
          const gate = !v.trigger || hasSignal(world, eid, v.trigger);
          if (gate) {
            em.acc += count * dt;
            const n = Math.floor(em.acc);
            if (n > 0) { em.acc -= n; this.emit(em, v, x, y, n, false, v.kind === 'trail'); }
          } else em.acc = 0;
          break;
        }
      }
      // 推进 + 回收（原地压缩）
      const g = v.gravity ?? DEF.gravity, drag = v.drag ?? DEF.drag;
      const ps = em.particles;
      let w = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.age += dt;
        if (p.age >= p.life) continue;
        if (!p.ring) {
          p.vy += g * dt;
          if (drag > 0) { const k = 1 - Math.min(1, drag * dt); p.vx *= k; p.vy *= k; }
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
        ps[w++] = p;
      }
      ps.length = w;
    }
    for (const k of this.emitters.keys()) if (!alive.has(k)) this.emitters.delete(k);
    return this.liveCount > 0;
  }

  private emit(em: Emitter, v: Vfx2D, x: number, y: number, n: number, ring: boolean, still = false): void {
    const max = v.max ?? DEF.max;
    const room = max - em.particles.length;
    if (room <= 0) return;
    if (n > room) n = room;
    const life = v.life ?? DEF.life, lifeVar = v.lifeVar ?? DEF.lifeVar;
    const speed = v.speed ?? DEF.speed, speedVar = v.speedVar ?? DEF.speedVar;
    const angle = v.angle ?? DEF.angle, spread = v.spread ?? DEF.spread;
    const rng = em.rng;
    for (let i = 0; i < n; i++) {
      const l = life * (1 + lifeVar * (rng() * 2 - 1));
      if (ring) { em.particles.push({ x, y, vx: speed, vy: 0, age: 0, life: l, ring: true }); continue; }
      const a = angle + spread * (rng() * 2 - 1);
      const s = still ? 0 : speed * (1 + speedVar * (rng() * 2 - 1));
      em.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: l, ring: false });
    }
  }

  /** 画（ctx 已置 world→device 基变换）。 */
  draw(ctx: CanvasRenderingContext2D, world: IWorld): void {
    if (this.emitters.size === 0) return;
    let curBlend = '';
    for (const [eid, em] of this.emitters) {
      if (em.particles.length === 0) continue;
      const v = world.getComponent<Vfx2D>(eid, 'Vfx2D');
      if (!v) continue;
      const blend = (v.blend ?? 'add') === 'add' ? 'lighter' : 'source-over';
      if (blend !== curBlend) { ctx.globalCompositeOperation = blend; curBlend = blend; }
      const c0 = v.color ?? DEF.color, c1 = v.colorEnd ?? c0;
      const s0 = v.size ?? DEF.size, s1 = v.sizeEnd ?? DEF.sizeEnd;
      const shape = v.shape ?? 'circle';
      for (const p of em.particles) {
        const t = clamp01(p.age / p.life);
        const col = hex(c1 === c0 ? c0 : lerpColor(c0, c1, t));
        ctx.globalAlpha = 1 - t;
        if (p.ring) {
          ctx.strokeStyle = col; ctx.lineWidth = s0;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.age * p.vx, 0, Math.PI * 2); ctx.stroke();
          continue;
        }
        const sz = lerp(s0, s1, t);
        if (sz <= 0) continue;
        if (shape === 'line') {
          const len = sz * 3, sp = Math.hypot(p.vx, p.vy) || 1;
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, sz * 0.5);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len); ctx.stroke();
        } else if (shape === 'square') {
          ctx.fillStyle = col; ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else {
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, sz / 2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

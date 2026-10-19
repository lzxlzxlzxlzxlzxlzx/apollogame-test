import type { World } from '@engine/core/world.js';
import { canonicalEntity, fnv1aHex } from './determinism.js';

// ═══════════════════════════════════════════════════════════════
//  增量世界 hash（P2c · engine-architecture-review-2026-09-02 §5 P2c · D1/D9）
//
//  病：`Engine.hash()` / lockstep 每拍 `hashSnapshot(world.snapshot())`——先 structuredClone 整个世界，再把全部实体
//  规范化成一个大字符串。世界 1000 个实体本拍只动 3 个，也要克隆 1000 个、规范化 1000 个。
//
//  现在：按**实体版本**（World.entityVersion·P1a 写入通道推进）缓存每个实体的规范片段；hash() 只重算版本变了的实体，
//  其余直接复用片段；片段按实体 id 升序用 ';' 相连后 FNV-1a——**与 hashSnapshot(world.snapshot()) 逐字节同值**
//  （老存档 / 既有 golden / 跨版本对端全部不受影响）。零克隆：直接读活组件表。
//  剩余 O(n) 的只有「拼串 + FNV 扫一遍字节」（纯 charCode 循环·1000 实体 ≈ 100KB ≈ 亚毫秒）；真正贵的
//  「克隆 + 对象遍历 + 键排序 + JSON.stringify」只发生在脏实体上。
//  正确性依赖：凡改了组件内容的路径都推进实体版本——SystemView（写申报）· World.getComponent 本体（保守记脏）·
//  add/remove/consume/create/destroy/restore。只读方（渲染器/服务）走 readView/peek 不推进版本，否则每帧全脏。
//  实证钉在 world-hash.test.ts：随机操作序列逐步对拍 hashWorld ≡ hashSnapshot(snapshot)。
// ═══════════════════════════════════════════════════════════════

interface Frag { ver: number; frag: string }

export class WorldHasher {
  private cache = new Map<string, Frag>();
  /** 统计（测试/观测）：上次 hash() 重算了几个实体片段、总实体数。 */
  readonly stats = { recomputed: 0, entities: 0, calls: 0 };

  constructor(private readonly world: World) {}

  hash(): string {
    const ids = this.world.getAllEntities().sort();
    const next = new Map<string, Frag>();
    const parts: string[] = [];
    let recomputed = 0;
    for (const id of ids) {
      const ver = this.world.entityVersion(id);
      const hit = this.cache.get(id);
      let frag: string;
      if (hit && hit.ver === ver) {
        frag = hit.frag;
      } else {
        const comps = this.world.componentsOf(id)!;
        frag = canonicalEntity(id, comps as Iterable<[string, unknown]>);
        recomputed++;
      }
      next.set(id, { ver, frag });
      if (frag) parts.push(frag);
    }
    this.cache = next; // 被销毁的实体自然掉出缓存
    this.stats.recomputed = recomputed;
    this.stats.entities = ids.length;
    this.stats.calls++;
    return fnv1aHex(parts.join(';'));
  }
}

const hashers = new WeakMap<World, WorldHasher>();

/** 某世界的增量 hash（每个 World 一份缓存·同值于 hashSnapshot(world.snapshot())）。 */
export function hashWorld(world: World): string {
  let h = hashers.get(world);
  if (!h) {
    h = new WorldHasher(world);
    hashers.set(world, h);
  }
  return h.hash();
}

/** 取世界的 hasher（观测 stats 用）。 */
export function hasherOf(world: World): WorldHasher {
  hashWorld(world);
  return hashers.get(world)!;
}

/**
 * 调度指纹（P2d · D2b）：有序系统 id 列表 + tickRate 的 FNV-1a。lockstep 握手时交换：两端调度不同（能力集/版本/
 * tickRate 不同）→ 开局即拒，而不是跑几分钟后 hash 才报 desync。
 */
export function scheduleFingerprint(world: World, tickRate: number): string {
  return fnv1aHex(`${world.getSortedSystems().map((s) => s.id).join(',')}@${tickRate}`);
}

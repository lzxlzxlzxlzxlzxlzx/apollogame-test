// ═══════════════════════════════════════════════════════════════
//  engine/math/hash —— 确定性 32 位哈希（FNV-1a）。net/determinism 有一份字符串版（快照 hash·不动它）；
//  flow-field-core 的分桶键有一份整数混合版（本地 mix）——这里给通用形，flow-field 改为调用（逐位同值）。
// ═══════════════════════════════════════════════════════════════

export const FNV_OFFSET = 0x811c9dc5;
export const FNV_PRIME = 0x01000193;

/** 把一个整数混进 FNV-1a 状态（h 初值用 FNV_OFFSET）。返回新状态（uint32）。 */
export function fnvMixInt(h: number, n: number): number {
  h ^= n | 0;
  return Math.imul(h, FNV_PRIME) >>> 0;
}

/** 字符串 FNV-1a（按 UTF-16 码元）→ uint32。 */
export function fnv1a32(s: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

/** 整数序列 FNV-1a → uint32（分桶键/摘要用）。 */
export function hashInts(ints: ArrayLike<number>): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < ints.length; i++) h = fnvMixInt(h, ints[i]);
  return h;
}

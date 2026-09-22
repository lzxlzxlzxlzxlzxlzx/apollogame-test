import type { CapabilityDefinition, ComponentSchema } from '@engine/core/define-capability.js';
import { sig } from '@engine/core/schema.js';

// ═══════════════════════════════════════════════════════════════
//  capability-catalog —— 把引擎能力的**自描述元数据**(describe + provides 字段)聚成一份
//  LLM 可读的能力目录。这是"引擎自描述"纲领落到 AI 生成管线的关键：
//
//  生成游戏的 System Prompt 不该手维护一份能力清单（必然漂移、加新能力得手改 prompt——违反
//  "最弱 LLM 也能产对数据"那把尺子）。改为从 ALL_CAPABILITIES 自动派生：任何能力（hitbox/prefab/
//  未来的）一登记进注册表，就自动对生成器可见，零 prompt 维护。单一真相 = 能力的 describe。
//
//  确定性/纯函数：只读 describe 元数据，无副作用。供 zerocraft.py 生成 prompt、studio、文档共用。
// ═══════════════════════════════════════════════════════════════

/**
 * ① 索引面：`id — 一句话`。**两阶段检索的第一阶段**（独立审查 2026-09-12 打回）：
 * 全量目录实测 9 万多字符，整份塞进生成请求会吃光弱模型的上下文，而绝大多数请求只用得上十来件。
 *
 * **为什么这个函数住在这里而不是住在 CLI 里**（第二轮打回的正确意见）：首版只在
 * `scripts/dump-capability-catalog.mjs` 里写了一份，于是「省上下文」这件事只有命令行享受得到——
 * 产品路径（浏览器 `buildCapabilityCatalog` 全量 → POST 给服务端）一个字节都没省。
 * 同一个判据必须只有一份实现，两边都 import 它，才不会一边修好、另一边照旧。
 */
export function buildCapabilityIndex(caps: readonly CapabilityDefinition[]): string {
  const lines = ['# 能力索引（只有名字与一句话·挑完再要细节）', ''];
  for (const c of [...caps].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const sum = (c.describe?.summary || '').split('。')[0].slice(0, 64);
    lines.push(`- \`${c.id}\` — ${sum}`);
  }
  return lines.join('\n') + '\n';
}

export interface CatalogOptions {
  withExamples?: boolean; // 含 describe.examples（教 AI 数据形状，信号最高；缺省 true）
  withWhenToUse?: boolean; // 含 whenToUse（缺省 true）
}

// 一个组件的字段签名：Comp{f1:type, f2:type}（type 含 'assetKey' 等，提示 AI 该填清单 key）。
function componentSig(type: string, fields: Record<string, { type: string }> | undefined, schema?: ComponentSchema['schema']): string {
  // P1c：带组合子 schema 的组件打真实形状（枚举值/嵌套具名类型），而不是 'string' 占位——LLM 看到 kind 的合法值集。
  if (schema && schema.k === 'obj') {
    return `${type}${sig(schema)}`;
  }
  const fs = Object.entries(fields ?? {})
    .map(([f, s]) => `${f}:${s.type}`)
    .join(', ');
  return `${type}{${fs}}`;
}

/** 把若干能力聚成 LLM 可读目录（每能力：id/名/摘要 + 提供的组件字段 + 何时用 + 示例）。 */
export function buildCapabilityCatalog(caps: readonly CapabilityDefinition[], opts: CatalogOptions = {}): string {
  const withExamples = opts.withExamples ?? true;
  const withWhenToUse = opts.withWhenToUse ?? true;
  const out: string[] = [];
  for (const c of caps) {
    const d = c.describe;
    out.push(`- ${c.id} (${d.name}): ${d.summary}`);
    const provides = Object.entries(c.components?.provides ?? {});
    if (provides.length) {
      out.push(`    provides: ${provides.map(([t, s]) => componentSig(t, s.fields, s.schema)).join(' · ')}`);
    }
    if (withWhenToUse && d.whenToUse) out.push(`    when: ${d.whenToUse}`);
    if (withExamples && d.examples?.length) out.push(`    e.g.: ${d.examples.join(' ｜ ')}`);
  }
  return out.join('\n');
}

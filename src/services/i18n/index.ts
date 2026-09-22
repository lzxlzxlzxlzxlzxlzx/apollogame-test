import type { UIDataSource } from '@ui/components/bindings.js';

// ═══════════════════════════════════════════════════════════════
//  services/i18n —— 多语言字符串表（owner 2026-09-09 令补齐·底层评审 §7 第一档）
//
//  此前引擎零 i18n：game-a / game-b / game-c / game108 各自养一份 `strings.ts`（`{en, zh}` 表 + `t(lang,key)`），
//  game108 文件头自己写着「第三例·该抽共用能力」。本文件就是那份共用能力：
//    · 表 = 纯数据 `{ 'menu.start': { en: 'Start', zh: '开始' } }`（最弱 LLM 也能照抄改值）
//    · `t(key, params)` = 固定查表 + `{name}` 插值；缺 key → 返回 key 本身（可见的坏数据·不静默）；缺语言 → 回退表首个语言
//    · `withStrings(dataSource, strings)`：UI 数据源装饰器——LayoutNode 里 `bind: { value: '@t/menu.start' }` 即显示译文，
//      **UI 基座零改动**（走既有 `UIDataSource.value` 通道）。参数化用 `'@t/top.round?n=3'`。
//  确定性：纯查表·零 locale API（toLocaleString 之类不进这里·数字格式化归 UI 的 Label.format）。
// ═══════════════════════════════════════════════════════════════

export type StringTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface Strings {
  /** 当前语言。 */
  readonly lang: string;
  /** 切换语言（不在表里的语言 → 忽略并返回 false）。 */
  setLang(lang: string): boolean;
  /** 查表 + `{name}` 插值；缺 key → 原样返回 key。 */
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
  has(key: string): boolean;
  /** 表里出现过的全部语言（首个 = 回退语言）。 */
  readonly langs: readonly string[];
  readonly keys: readonly string[];
}

const PARAM = /\{([A-Za-z0-9_]+)\}/g;

/** 插值：`{n}` → params.n；缺参数保留原样。 */
export function interpolate(text: string, params?: Readonly<Record<string, string | number>>): string {
  if (!params) return text;
  return text.replace(PARAM, (m, name: string) => (name in params ? String(params[name]) : m));
}

export function createStrings(table: StringTable, lang?: string): Strings {
  const keys = Object.keys(table);
  const langSet: string[] = [];
  for (const k of keys) for (const l of Object.keys(table[k])) if (!langSet.includes(l)) langSet.push(l);
  let cur = lang !== undefined && langSet.includes(lang) ? lang : (langSet[0] ?? 'en');
  return {
    get lang() { return cur; },
    langs: langSet,
    keys,
    setLang(l) { if (!langSet.includes(l)) return false; cur = l; return true; },
    has: (k) => k in table,
    t(k, params) {
      const entry = table[k];
      if (!entry) return k;
      const text = entry[cur] ?? entry[langSet[0]!] ?? k;
      return interpolate(text, params);
    },
  };
}

const T_PREFIX = '@t/';

/** 解析 `@t/key?a=1&b=x` → { key, params }；非 `@t/` 前缀 → undefined。 */
export function parseTRef(id: string): { key: string; params?: Record<string, string> } | undefined {
  if (!id.startsWith(T_PREFIX)) return undefined;
  const body = id.slice(T_PREFIX.length);
  const q = body.indexOf('?');
  if (q < 0) return { key: body };
  const params: Record<string, string> = {};
  for (const pair of body.slice(q + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) params[pair] = '';
    else params[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return { key: body.slice(0, q), params };
}

/** UI 数据源装饰器：`value('@t/…')` 走字符串表，其余透传给原数据源。 */
export function withStrings(ds: UIDataSource, strings: Strings): UIDataSource {
  return {
    ...ds,
    value: (id) => {
      const ref = parseTRef(id);
      if (ref) return strings.t(ref.key, ref.params);
      return ds.value?.(id);
    },
  };
}

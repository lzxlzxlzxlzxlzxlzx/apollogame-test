import { describe, it, expect } from 'vitest';
import { createStrings, interpolate, parseTRef, withStrings } from './index.js';

// services/i18n：纯查表 + 插值；缺 key 返回 key（可见坏数据）；缺语言回退首语言；UI 数据源装饰器 `@t/` 通道。

const TABLE = {
  'menu.start': { en: 'Start', zh: '开始' },
  'top.round': { en: 'Round {n}', zh: '第 {n} 回合' },
  'only.en': { en: 'English only' },
} as const;

describe('createStrings', () => {
  it('查表·切语言·缺 key 原样·缺语言回退首语言', () => {
    const s = createStrings(TABLE, 'zh');
    expect(s.lang).toBe('zh');
    expect(s.t('menu.start')).toBe('开始');
    expect(s.t('only.en')).toBe('English only');
    expect(s.t('nope.key')).toBe('nope.key');
    expect(s.setLang('en')).toBe(true);
    expect(s.t('menu.start')).toBe('Start');
    expect(s.setLang('fr')).toBe(false);
    expect(s.lang).toBe('en');
    expect(s.langs).toEqual(['en', 'zh']);
    expect(s.has('menu.start')).toBe(true);
    expect(createStrings(TABLE).lang).toBe('en'); // 未指定 → 表首语言
    expect(createStrings(TABLE, 'fr').lang).toBe('en');
  });

  it('插值：{n} 代入·缺参保留·数字转串', () => {
    const s = createStrings(TABLE, 'zh');
    expect(s.t('top.round', { n: 3 })).toBe('第 3 回合');
    expect(s.t('top.round')).toBe('第 {n} 回合');
    expect(interpolate('{a}-{b}', { a: 'x' })).toBe('x-{b}');
  });
});

describe('withStrings · UI 数据源装饰器', () => {
  it("value('@t/key?n=3') 走表；其余透传；parseTRef 解析", () => {
    const base = { value: (id: string) => (id === 'name' ? 'A' : undefined), flag: () => true };
    const ds = withStrings(base, createStrings(TABLE, 'zh'));
    expect(ds.value?.('@t/menu.start')).toBe('开始');
    expect(ds.value?.('@t/top.round?n=7')).toBe('第 7 回合');
    expect(ds.value?.('name')).toBe('A');
    expect(ds.value?.('other')).toBeUndefined();
    expect(ds.flag?.('x')).toBe(true); // 其它通道原样
    expect(parseTRef('plain')).toBeUndefined();
    expect(parseTRef('@t/a.b?x=1&y=')).toEqual({ key: 'a.b', params: { x: '1', y: '' } });
  });
});

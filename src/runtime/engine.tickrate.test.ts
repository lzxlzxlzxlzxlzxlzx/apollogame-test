import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { timerCapability } from '@atom-skills/index.js';

// P2d · tickRate 是玩法数据：蓝图 meta.tickRate 优先于宿主构造选项（能力全按 tick 计时·换频率 = 换玩法）。
describe('Engine · tickRate 来自蓝图 meta', () => {
  it('缺省 60；构造选项可改；蓝图 meta.tickRate 覆盖构造选项', () => {
    expect(new Engine().tickRate).toBe(60);
    const e = new Engine({ tickRate: 30 });
    expect(e.tickRate).toBe(30);
    e.load({ capabilities: [timerCapability], entities: {}, meta: { tickRate: 20 } });
    expect(e.tickRate).toBe(20);
    const e2 = new Engine({ tickRate: 30 });
    e2.load({ capabilities: [timerCapability], entities: {} });
    expect(e2.tickRate).toBe(30); // 蓝图没说 → 宿主选项
  });
});

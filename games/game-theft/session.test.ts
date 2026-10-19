import { describe, expect, it } from 'vitest';
import { DEFAULT_THEFT_CONFIG } from './config.js';
import { THEFT_PRESS_ACTION, THEFT_REVEAL_ACTION, THEFT_WITHDRAW_ACTION, TheftGameSession } from './session.js';

describe('game-theft 宿主薄适配', () => {
  it('只记录原始 QTE action，不预算精准度', () => {
    const session = new TheftGameSession(DEFAULT_THEFT_CONFIG);
    session.enqueueAction(THEFT_PRESS_ACTION); session.tick();
    expect(session.inputs).toEqual([{ seq: 0, tick: 2, action: 'qte-press' }]);
    expect(session.state().qteAttempts).toBe(1);
  });

  it('只把严格十进制槽位参数透传给 capability', () => {
    const session = new TheftGameSession(DEFAULT_THEFT_CONFIG);
    session.enqueueAction(THEFT_PRESS_ACTION); session.tick();
    session.enqueueAction(THEFT_REVEAL_ACTION, { arg: '2x' });
    session.enqueueAction(THEFT_REVEAL_ACTION, { arg: '2' });
    expect(session.inputs.at(-1)).toMatchObject({ action: 'reveal', slot: 2 });
  });

  it('撤退产生确定性回执，未知 action fail-closed', () => {
    const session = new TheftGameSession(DEFAULT_THEFT_CONFIG);
    session.enqueueAction('theft.unknown'); session.enqueueAction(THEFT_WITHDRAW_ACTION); session.tick();
    expect(session.inputs).toEqual([{ seq: 0, tick: 2, action: 'withdraw' }]);
    expect(session.receipt()?.status).toBe('withdrew');
  });
});

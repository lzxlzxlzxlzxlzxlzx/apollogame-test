// 宿主薄层：只把 LayoutNode action 翻译为 RiskRevealInput；判定全部在 capability。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type {
  RiskRevealAction,
  RiskRevealInput,
  RiskRevealReceipt,
  RiskRevealWheel,
} from '@zerocraft/engine/engine/protocol/components.js';
import { buildTheftBlueprint, THEFT_SESSION_ENTITY } from './blueprint.js';
import { DEFAULT_THEFT_CONFIG, type TheftGameConfig } from './config.js';

export const THEFT_PRESS_ACTION = 'theft.qte.press';
export const THEFT_REVEAL_ACTION = 'theft.reveal';
export const THEFT_WITHDRAW_ACTION = 'theft.withdraw';

type PlayerTheftAction = Exclude<RiskRevealAction, 'start'>;
const ACTIONS: Readonly<Record<string, PlayerTheftAction>> = Object.freeze({
  [THEFT_PRESS_ACTION]: 'qte-press',
  [THEFT_REVEAL_ACTION]: 'reveal',
  [THEFT_WITHDRAW_ACTION]: 'withdraw',
});

export interface TheftInputLogEntry {
  readonly seq: number;
  readonly tick: number;
  readonly action: PlayerTheftAction;
  readonly slot?: number;
}

export class TheftGameSession {
  readonly engine = new Engine();
  readonly config: TheftGameConfig;
  readonly inputs: TheftInputLogEntry[] = [];
  private nextSeq = 0;

  constructor(config: TheftGameConfig = DEFAULT_THEFT_CONFIG) {
    this.config = config;
    this.engine.load(buildTheftBlueprint(config));
    this.submit('start');
    this.tick();
  }

  /** LayoutNode ActionSink 接口；仅将十进制槽位参数转成协议整数，未知/坏参数 fail-closed。 */
  enqueueAction(name: string, value?: { arg?: string }): void {
    const action = ACTIONS[name];
    if (!action) return;
    let slot: number | undefined;
    if (action === 'reveal') {
      if (!value?.arg || !/^\d+$/.test(value.arg)) return;
      slot = Number(value.arg);
      if (!Number.isSafeInteger(slot)) return;
    }
    this.submit(action, slot);
    this.inputs.push({ seq: this.inputs.length, tick: this.engine.world.getVersion() + 1, action, ...(slot === undefined ? {} : { slot }) });
  }

  tick(): void { this.engine.world.tick(); }

  state(): RiskRevealWheel {
    return this.engine.world.getComponent<RiskRevealWheel>(THEFT_SESSION_ENTITY, 'RiskRevealWheel')!;
  }

  receipt(): RiskRevealReceipt | undefined {
    return this.engine.world.getComponent<RiskRevealReceipt>(THEFT_SESSION_ENTITY, 'RiskRevealReceipt');
  }

  private submit(action: RiskRevealAction, slot?: number): number {
    const seq = this.nextSeq++;
    const id = `theft-input:${seq}`;
    this.engine.world.createEntity(id);
    this.engine.world.addComponent(id, {
      type: 'RiskRevealInput', sessionId: this.config.sessionId, action, seq,
      ...(slot === undefined ? {} : { slot }),
    } as RiskRevealInput);
    return seq;
  }
}

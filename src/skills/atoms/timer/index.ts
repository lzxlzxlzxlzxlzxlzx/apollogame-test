import { defineCapability } from '@engine/core/define-capability.js';
import { advanceTimer } from '@engine/math/tick.js';
import type { Timer, TimerDone } from '@engine/protocol/components.js';

export const timerCapability = defineCapability({
  id: 'e1-timer',
  version: '1.0.0',

  describe: {
    name: 'timer',
    summary: '倒计时/间隔计时器，按 tick 计数；到时发出 TimerDone 事件。',
    semantic: ['time', 'countdown', 'interval'],
    whenToUse:
      '需要"过了多久 / 到了吗"的任何场景：冷却、生命周期、动画帧推进、周期回血、AI 巡逻切向。World 无 dt，故按 tick 计数。',
    examples: [
      '冷却：Timer{ id:"skill-cd", duration:60, loop:false } → TimerDone → flag(ready)',
      '动画：Timer{ id:"anim", duration:6, loop:true } → 每 6 tick 推一帧',
      '生命周期：Timer{ id:"life", duration:120 } → TimerDone → destroy',
    ],
  },

  components: {
    provides: {
      Timer: {
        category: 'config',
        describe:
          '计时器状态。elapsed 每 tick +1，到 duration 发 TimerDone；loop 则归零重来。每实体每 type 唯一，一实体一 Timer，多计时器用多实体。',
        fields: {
          id: { type: 'string', describe: '计时器语义标识（如 "skill-cd"、"life"）' },
          elapsed: { type: 'number', describe: '已经过的 tick 数' },
          duration: { type: 'number', describe: '触发所需的 tick 数（>= 1）' },
          loop: { type: 'boolean', describe: '到时是否归零重新计时' },
        },
      },
      TimerDone: {
        category: 'event',
        describe: '计时完成事件，在完成那一 tick 发出，由下游系统消费（lifetime / cooldown / animation）。',
        fields: {
          timerId: { type: 'string', describe: '完成的计时器 id，与 Timer.id 对应' },
        },
      },
    },
    reads: ['Timer'],
    writes: ['Timer', 'TimerDone'],
    consumes: [],
  },

  config: {
    id: {
      type: 'string',
      default: 'timer',
      describe: '计时器标识',
      question: '这个计时器叫什么名字？',
      ui: { control: 'input' },
    },
    duration: {
      type: 'number',
      default: 60,
      describe: '触发所需 tick 数',
      question: '多少 tick 后触发？',
      ui: { control: 'slider', min: 1, max: 600, step: 1 },
    },
    loop: {
      type: 'boolean',
      default: false,
      describe: '是否循环',
      question: '到时是否循环重来？',
      ui: { control: 'toggle' },
    },
  },

  systems: [
    {
      id: 'timer-advance',
      reads: ['Timer'],
      writes: ['Timer', 'TimerDone'],
      consumes: [],
      execute(world) {
        // BUG-003 修复：生产者自清——先移除上一拍的 TimerDone（一拍生命周期，仿 event-when 清 Signal）。
        // 此前由消费者 consume 全局删除，多消费者（lifetime+animation）时先跑者删光、后者饿死丢事件。
        // 改为生产者清 + 消费者用 reads → 同一 TimerDone 可被多家共读，互不抢占。
        for (const [id] of world.query('TimerDone')) world.removeComponent(id, 'TimerDone');
        for (const [entityId] of world.query('Timer')) {
          const timer = world.getComponent<Timer>(entityId, 'Timer');
          if (!timer) continue;
          // 步进本体 = engine/math/tick.advanceTimer（唯一的一份·逐字同语义：停表 / 到点 / loop 归零）。
          if (advanceTimer(timer)) {
            const done: TimerDone = { type: 'TimerDone', timerId: timer.id };
            world.addComponent(entityId, done);
          }
        }
      },
    },
  ],
});

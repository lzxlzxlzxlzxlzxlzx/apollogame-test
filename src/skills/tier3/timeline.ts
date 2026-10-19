import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld } from '@engine/core/types.js';
import type { Timeline, TimelineCue, TimelinePlayback, Signal, SpawnRequest } from '@engine/protocol/components.js';
import { buildConditionLookup, type ConditionLookup } from '@skills/tier2/condition.js';
import { applyWrite, ctxOf } from '@engine/logic/index.js';

// ═══════════════════════════════════════════════════════════════
//  timeline —— 演出时间线（REQ-CAP 下沉）。sim 侧**确定性 tick 调度器**：把「回合开场三连 cue」「转场时序」
//  这类『在第 N tick 发生什么』的编排从散落的 Timer/EventWhen/Effect 实体里收敛成一份 Timeline 数据。
//
//  分工铁律（owner）：**timeline 管「何时」，tween 管「怎么动」**，互不越权。cue 只做四种闭集动作
//  （signal / flag / resource / spawn），表现层（UI/渲染）订阅 cue 发的信号自行演——handler 里绝不塞
//  自由演出逻辑（信号铁律）。绝不走墙钟（Date.now）：游标 t 按 tick 推进，随 snapshot 走 → lockstep/录放安全。
//
//  播放：收到 playOnSignal → t=0、从头播；每 tick 发齐 at≤t 的 cue，播完发 `timeline:done:<id>`（loop 则回 t=0）。
//  快进：收到 skipOnSignal → **一次 tick 内按序补发全部剩余 cue**，终态与逐 tick 播放**完全一致**（回放安全）。
//  瞬时事件（signal/spawn）发在**新建实体**上（唯一 id，seq 单调）；下一 tick 本系统开头销毁 → 无泄漏。
//  确定性：cue 按 at 升序、同 at 按书写序 tie-break；无 Math.random / 无墙钟 / 遍历序不影响结果。
// ═══════════════════════════════════════════════════════════════

// 触发一条 cue 的 do 动作。signal/spawn 发在新建瞬时实体上（记入 pb.emitted 供下一 tick 回收）。
function fireCue(world: IWorld, cue: TimelineCue, owner: string, tlId: string, pb: TimelinePlayback, lookup: ConditionLookup): void {
  const d = cue.do;
  switch (d.kind) {
    case 'signal': {
      const id = `tl:${tlId}#${pb.seq++}`;
      world.createEntity(id);
      world.addComponent(id, { type: 'Signal', name: d.signal, source: owner, ...(d.arg !== undefined ? { arg: d.arg } : {}) } as Signal);
      pb.emitted.push(id);
      break;
    }
    // flag / resource 走规则内核 applyWrite（P2a）：按 id 全局路由·目标不存在则不动·唯一的一份 clamp。
    case 'flag': {
      applyWrite(ctxOf(world, lookup), { to: { flag: d.flagId }, value: d.value });
      break;
    }
    case 'resource': {
      applyWrite(ctxOf(world, lookup), { to: { res: d.resourceId }, op: d.op, value: d.amount });
      break;
    }
    case 'spawn': {
      const id = `tl:${tlId}#${pb.seq++}`;
      world.createEntity(id);
      world.addComponent(id, { type: 'SpawnRequest', templateId: d.templateId, x: d.x, y: d.y } as SpawnRequest); // prefab 展开并回收（size 1）
      pb.emitted.push(id);
      break;
    }
  }
}

// 播完发 `timeline:done:<id>`（瞬时实体，同上回收）。
function emitDone(world: IWorld, owner: string, tlId: string, pb: TimelinePlayback): void {
  const id = `tl:${tlId}#${pb.seq++}`;
  world.createEntity(id);
  world.addComponent(id, { type: 'Signal', name: `timeline:done:${tlId}`, source: owner } as Signal);
  pb.emitted.push(id);
}

export const timelineCapability = defineCapability({
  id: 't3-timeline',
  version: '1.0.0',

  describe: {
    name: 'timeline',
    summary:
      '演出时间线：确定性 tick 调度器。Timeline{cues:[{at,do}],playOnSignal,skipOnSignal?,speed?,loop?}；收到 playOnSignal 从头播，每 tick 发齐 at≤游标的 cue（signal/flag/resource/spawn 四闭集动作），播完发 timeline:done:<id>。skipOnSignal 一 tick 内补发全部剩余 cue（终态与逐 tick 一致）。',
    semantic: ['tier3', 'sequence', 'cutscene', 'scheduler'],
    whenToUse:
      '编排「第 N tick 发生什么」的演出时序（回合开场三连 cue、转场、开场动画节拍）。timeline 管「何时」发信号/写 Flag/写 Resource/发 SpawnRequest；表现层订阅信号、tween 管「怎么动」。绝不在 handler 塞自由逻辑（信号铁律）。',
    examples: [
      "回合开场三连 cue：Timeline{ id:'round_intro', playOnSignal:'round_start', cues:[ {at:0,do:{kind:'flag',flagId:'ui_lock',value:true}}, {at:0,do:{kind:'signal',signal:'show_banner',arg:'第 3 回合'}}, {at:12,do:{kind:'signal',signal:'deal_dice'}}, {at:30,do:{kind:'flag',flagId:'ui_lock',value:false}} ] } → 播完发 timeline:done:round_intro",
      "转场：Timeline{ id:'scene_wipe', playOnSignal:'go_battle', skipOnSignal:'skip_intro', cues:[ {at:0,do:{kind:'signal',signal:'wipe_in'}}, {at:20,do:{kind:'resource',resourceId:'scene',amount:2,op:'set'}}, {at:24,do:{kind:'spawn',templateId:'battlefield',x:0,y:0}}, {at:40,do:{kind:'signal',signal:'wipe_out'}} ] }（点「跳过」→ 一 tick 内补发全部剩余 cue，直达战斗）",
    ],
  },

  components: {
    provides: {
      Timeline: {
        category: 'config',
        describe: '演出编排（数据）：cues[{at:tick, do:signal/flag/resource/spawn}] + playOnSignal 起播 + skipOnSignal 快进 + speed/loop。',
        fields: {
          id: { type: 'string', describe: '时间线标识（播完发 timeline:done:<id>）' },
          cues: { type: 'string', describe: '编排数组 [{at:tick, do:{kind:signal|flag|resource|spawn, ...}}]（系统按 at 升序发）' },
          playOnSignal: { type: 'string', describe: '收到此名 Signal → 从头播放（t=0）' },
          skipOnSignal: { type: 'string', describe: '收到此名 Signal → 一 tick 内按序补发全部剩余 cue（终态与逐 tick 一致）' },
          speed: { type: 'number', describe: '每 tick 游标推进量（缺省 1）' },
          loop: { type: 'boolean', describe: '播完是否回 t=0 重播（缺省 false）' },
        },
      },
      TimelinePlayback: {
        category: 'config',
        describe: '运行态（系统写）：t 游标 / playing 在播 / cursor 下一 cue 下标 / seq 发射 id 计数 / emitted 上一 tick 瞬时实体（下一 tick 回收）。',
        fields: {
          t: { type: 'number', describe: '播放游标（tick）' },
          playing: { type: 'boolean', describe: '是否在播' },
          cursor: { type: 'number', describe: '下一个待发 cue 的（排序后）下标' },
          seq: { type: 'number', describe: '瞬时发射实体唯一 id 计数器（单调）' },
          emitted: { type: 'string[]', describe: '上一 tick 发射的瞬时实体 id（下一 tick 开头销毁）' },
        },
      },
    },
    reads: ['Timeline', 'TimelinePlayback', 'Signal', 'Flag', 'Resource', 'Cooldowns', 'Timer', 'StringVar'], // Timer/StringVar：条件树 kind:'timer'/'string' 经 engine/logic 读（P1a 严格模式漏报·game-f 慢车道 2026-09-10 抓出）
    writes: ['TimelinePlayback', 'Signal', 'SpawnRequest', 'Flag', 'Resource'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'timeline',
      // 在信号产出者之后跑：① 看得见本 tick 的 playOnSignal/skipOnSignal；② 自己发的 Signal 不被 event-when 的全局清扫误删（同 keybind/caster 纪律）。
      runsAfter: ['event-when', 'keybind', 'clickable'],
      reads: ['Timeline', 'TimelinePlayback', 'Signal', 'Flag', 'Resource', 'Cooldowns', 'Timer', 'StringVar'], // Timer/StringVar：条件树 kind:'timer'/'string' 经 engine/logic 读（P1a 严格模式漏报·game-f 慢车道 2026-09-10 抓出）
      writes: ['TimelinePlayback', 'Signal', 'SpawnRequest', 'Flag', 'Resource'],
      consumes: [],
      execute(world: IWorld) {
        const timelines = world.query('Timeline');
        if (timelines.length === 0) return;

        // ① 先回收上一 tick 全部时间线的瞬时实体（signal/spawn），**再**采集信号集——否则本系统上一 tick
        //    自己发的 cue 信号（无 event-when 全局清扫时）会污染本 tick 的 play/skip 触发判定。
        for (const [eid] of timelines) {
          const pb = world.getComponent<TimelinePlayback>(eid, 'TimelinePlayback');
          if (pb) { for (const id of pb.emitted) world.destroyEntity(id); pb.emitted = []; }
        }

        // 本 tick 在场的信号名（起播/快进控制）。
        const signals = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) signals.add(s.name);
        }
        const lookup = buildConditionLookup(world); // flag/resource 写路径（按 id 全局路由）

        for (const [eid] of timelines) {
          const tl = world.getComponent<Timeline>(eid, 'Timeline')!;
          let pb = world.getComponent<TimelinePlayback>(eid, 'TimelinePlayback');
          if (!pb) {
            pb = { type: 'TimelinePlayback', t: 0, playing: false, cursor: 0, seq: 0, emitted: [] };
            world.addComponent(eid, pb);
          }

          // cue 确定性排序：at 升序、同 at 按书写序（原下标）tie-break。
          const order = tl.cues.map((c, i) => ({ c, i })).sort((a, b) => a.c.at - b.c.at || a.i - b.i).map((x) => x.c);

          // ② 起播控制：playOnSignal → 从头（每次触发都重播）。
          if (signals.has(tl.playOnSignal)) {
            pb.playing = true;
            pb.t = 0;
            pb.cursor = 0;
          }

          // ③ 快进：skipOnSignal → 一 tick 内按序补发全部剩余 cue，随即收尾（终态与逐 tick 一致）。
          if (tl.skipOnSignal !== undefined && signals.has(tl.skipOnSignal) && pb.playing) {
            while (pb.cursor < order.length) { fireCue(world, order[pb.cursor], eid, tl.id, pb, lookup); pb.cursor++; }
            pb.playing = false;
            emitDone(world, eid, tl.id, pb);
            continue;
          }

          if (!pb.playing) continue;

          // ④ 发齐 at≤当前游标的 cue。
          while (pb.cursor < order.length && order[pb.cursor].at <= pb.t) { fireCue(world, order[pb.cursor], eid, tl.id, pb, lookup); pb.cursor++; }

          // ⑤ 收尾 / 推进游标。
          if (pb.cursor >= order.length) {
            if (tl.loop) { pb.t = 0; pb.cursor = 0; } // 回到起点，下一 tick 从头重发
            else { pb.playing = false; emitDone(world, eid, tl.id, pb); }
          } else {
            pb.t += tl.speed ?? 1;
          }
        }
      },
    },
  ],
});

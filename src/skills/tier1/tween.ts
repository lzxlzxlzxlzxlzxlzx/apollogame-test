import { defineCapability } from '@engine/core/define-capability.js';
import { ease as easeBy } from '@engine/math/ease.js';
import type { IWorld } from '@engine/core/types.js';
import type { Tween, Transform, Color } from '@engine/protocol/components.js';

// tween —— B 轴"连续"柱：数值随时间朝目标缓动。
//
// 定步长：每帧 elapsed += 1，t = elapsed/duration ∈ [0,1]，value = from + (to-from)*ease(t)，
// 直接写到同实体上的目标字段。duration<=0 视为立即到 to。到点置 done=true 并锁定在 to。
// 缓动全用多项式（不碰 sin/cos）。**目标限定为不被 Condition 读的表现/软逻辑字段**
// （Transform.{x,y,rotation,scaleX,scaleY} / Color.alpha）——浮点插值与现有物理同属 IEEE 确定性类，
// 但不喂给 Condition 比较的逻辑数值（如 Resource.current），避免跨端 1 ULP 差异造成阈值帧错位（Gemini Q6）。
// 逻辑数值渐变请用整数分步（timer + ResourceModify）。
// 用途：立绘淡入(Color.alpha)、立绘滑入/镜头缓动(Transform.x/y)。

// 曲线本体抽到 engine/math/ease（B 补齐·函数体逐字同 → 零行为变化）；本地名保留给下文调用。
const ease = (t: Tween['easing'], x: number): number => easeBy(t, x);

// 硬编码点号访问的单态写入：避免 comp[field]=value 的动态下标让 V8 放弃 JIT 内联（Reviewer #5）。
function writeField(world: IWorld, eid: string, target: Tween['target'], value: number): void {
  switch (target) {
    case 'Transform.x': {
      const c = world.getComponent<Transform>(eid, 'Transform');
      if (c) c.x = value;
      break;
    }
    case 'Transform.y': {
      const c = world.getComponent<Transform>(eid, 'Transform');
      if (c) c.y = value;
      break;
    }
    case 'Transform.rotation': {
      const c = world.getComponent<Transform>(eid, 'Transform');
      if (c) c.rotation = value;
      break;
    }
    case 'Transform.scaleX': {
      const c = world.getComponent<Transform>(eid, 'Transform');
      if (c) c.scaleX = value;
      break;
    }
    case 'Transform.scaleY': {
      const c = world.getComponent<Transform>(eid, 'Transform');
      if (c) c.scaleY = value;
      break;
    }
    case 'Color.alpha': {
      const c = world.getComponent<Color>(eid, 'Color');
      if (c) c.alpha = value;
      break;
    }
  }
}

export const tweenCapability = defineCapability({
  id: 't1-tween',
  version: '1.0.0',

  describe: {
    name: 'tween',
    summary: '数值随时间朝目标缓动：每帧推进 elapsed，按 easing 把同实体上的目标字段从 from 插到 to。',
    semantic: ['tier1', 'kinematic', 'interpolate', 'animation'],
    whenToUse:
      '需要某个表现字段平滑过渡时（淡入淡出 Color.alpha、滑入/镜头 Transform.x/y）。挂 Tween{target,from,to,duration,easing}；定步长。注意：不驱动被 Condition 读的逻辑数值（Resource.current 等），那类用整数分步。',
    examples: [
      '立绘淡入：Tween{ target:"Color.alpha", from:0, to:1, duration:30, easing:"easeOut" }',
      '立绘滑入：Tween{ target:"Transform.x", from:-100, to:0, duration:24, easing:"easeInOut" }',
      '镜头缓动：Tween{ target:"Transform.y", from:0, to:120, duration:18, easing:"easeInOut" }',
      '巡逻/移动平台往复：Tween{ target:"Transform.x", from:100, to:400, duration:120, easing:"easeInOut", loop:"pingpong" }',
      '呼吸缩放（3 次）：Tween{ target:"Transform.scaleY", from:1, to:1.1, duration:40, easing:"easeInOut", loop:"pingpong", loops:6 }',
    ],
  },

  components: {
    provides: {
      Tween: {
        category: 'config',
        describe: '一段缓动：把同实体上的 target 字段在 duration 个 tick 内从 from 插值到 to。',
        fields: {
          target: { type: 'string', describe: '目标字段（Transform.x/y/rotation/scaleX/scaleY、Color.alpha）' },
          from: { type: 'number', describe: '起始值' },
          to: { type: 'number', describe: '目标值' },
          elapsed: { type: 'number', describe: '已过 tick 数（初始 0，每帧 +1）' },
          duration: { type: 'number', describe: '总 tick 数（<=0 立即到 to）' },
          easing: { type: 'string', describe: 'linear | easeIn | easeOut | easeInOut' },
          done: { type: 'boolean', describe: '是否已结束（初始 false）' },
          loop: { type: 'string', describe: '到点后：none(停,默认) | restart(归零重跑) | pingpong(交换 from/to 再归零)' },
          loops: { type: 'number', describe: '循环程数（restart/pingpong 有效）；缺省=无限' },
          keep: { type: 'boolean', describe: '播完是否保留 Tween 组件（缺省 true=保留供回放/倒带；false=播完 removeComponent）' },
        },
      },
    },
    reads: ['Tween'],
    writes: ['Transform', 'Color', 'Tween'], // Tween：播完 keep=false 时 removeComponent（P1a 严格模式补齐·此前漏报）
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'tween',
      reads: ['Tween'],
      writes: ['Transform', 'Color', 'Tween'], // Tween：播完 keep=false 时 removeComponent（P1a 严格模式补齐·此前漏报）
      consumes: [],
      execute(world) {
        for (const [eid] of world.query('Tween')) {
          const tw = world.getComponent<Tween>(eid, 'Tween')!;
          // REQ-F-057：keep 重放保留——done 实体零开销跳过（不再每帧空赋值），等运行时倒带（elapsed=0/done=false）。
          if (tw.done) continue;
          // BUG-005：duration<=0（无效授权数据）即时到终值并结束，绝不进入"每帧到点→交换/归零"的 loop 抖动死循环。
          if (tw.duration <= 0) {
            writeField(world, eid, tw.target, tw.to);
            tw.done = true;
            if (!tw.keep) world.removeComponent(eid, 'Tween');
            continue;
          }
          tw.elapsed += 1;
          if (tw.elapsed >= tw.duration) {
            const loop = tw.loop ?? 'none';
            // 本程视觉到达终值。
            writeField(world, eid, tw.target, tw.to);
            // 末程（none，或循环计数到最后一程）：锁终值、置 done；keep=保留组件供重放（REQ-F-057），
            // 否则移除（避免"僵尸"每帧空赋值，Reviewer #2——keep 的零开销由顶部 done 跳过保证）。
            if (loop === 'none' || (tw.loops !== undefined && tw.loops <= 1)) {
              tw.done = true;
              if (!tw.keep) world.removeComponent(eid, 'Tween');
              continue;
            }
            // 还有循环：消耗一程计数（缺省无限不计），pingpong 交换 from/to，归零重跑。snapshot 友好、确定性不变。
            if (tw.loops !== undefined) tw.loops -= 1;
            if (loop === 'pingpong') {
              const tmp = tw.from;
              tw.from = tw.to;
              tw.to = tmp;
            }
            tw.elapsed = 0;
          } else {
            const raw = tw.duration <= 0 ? 1 : tw.elapsed / tw.duration;
            const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
            writeField(world, eid, tw.target, tw.from + (tw.to - tw.from) * ease(tw.easing, t));
          }
        }
      },
    },
  ],
});

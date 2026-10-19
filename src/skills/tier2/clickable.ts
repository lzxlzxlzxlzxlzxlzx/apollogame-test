import { defineCapability } from '@engine/core/define-capability.js';
import type { Signal, InputQueue } from '@engine/protocol/components.js';
import { collectClickableTargets, pickClickableTarget } from '@engine/protocol/clickable-hit-test.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

// clickable —— 通用「可点击实体」：指针命中 → 配置好的 Signal（REQ-C-002，多游戏共需的输入→逻辑桥）。
//
// 缺省实体挂 Clickable{action, phase?}+Transform+Shape；可选 hitMaskKey+Sprite 改走预烘焙轮廓。
//   ① 读单例 InputQueue 的指针事件（**世界坐标**——逆投影已由输入采集层 PointerInputSource 在本地、入网前完成）。
//   ② 直接用该世界坐标做命中（sim 内不读相机/视口 → 多端不会因分辨率/相机差异算出不同坐标，lockstep 安全，Gemini 致命级修正）。
//   ③ 旧实体做 AABB；mask 实体按 Sprite 绘制投影查二值位，取**最上层**（zOrder 最大，并列取 id 最小）。
//   ④ 在命中实体上产出 Signal{name:action, source:命中实体}。
//
// 这样「点购买按钮→Signal→craft-recipe 扣料」「点格子→Signal→match3 选中/交换」「点选项→Signal→对话推进」
// 全是纯数据接线，没有任何游戏写命中测试代码。下游照常 query('Signal') 按名消费。
//
// 信号生命周期：本系统每 tick 先清掉挂在 Clickable 实体上的旧 Signal，再按本帧命中重标（自包含、幂等）。
// 与 event-when 协作：event-when（Update 早段）会全局先清后标自己的 Signal，故 clickable 用 runsAfter
// 排在它之后，避免本帧新命中的 Signal 被 event-when 的全局清扫误删；effect-apply（Commit）随后一并消费。
//
// 确定性：只读 InputQueue（已是世界坐标）+ 几何比较，**sim 内不读相机/视口** → 多端不会因分辨率/相机差异
// 算出不同命中（原"跨端指针一致性待验证项"由此关闭：逆投影上移 PointerInputSource 采集期，入网前完成）。
export const clickableCapability = defineCapability({
  id: 't2-clickable',
  version: '1.1.0',

  describe: {
    name: 'clickable',
    summary: '指针命中实体 → Signal；缺省 AABB，可选预烘焙二值 hit-mask 实形命中，仍按 zOrder/id 裁决。',
    semantic: ['tier2', 'input', 'event'],
    whenToUse:
      '想让「点某个世界实体」产生一个信号而不写命中测试代码时。挂 Clickable{action,phase?}；下游 query Signal 按名消费（接 effect-apply / craft-recipe / match3 / 对话选项）。',
    examples: [
      '合成按钮：Clickable{ action:"craft_sword" } → 点中发 Signal"craft_sword" → craft-recipe 扣料',
      '三消格子：Clickable{ action:"cell" } → 点中发 Signal"cell"（source=该格实体）→ match3 选中/交换',
      '抬起触发：Clickable{ action:"release", phase:"up" } → 仅指针抬起命中时发',
    ],
  },

  components: {
    provides: {
      Clickable: {
        category: 'config',
        describe: '声明「指针命中本实体 Shape 时产出 Signal{name:action}」。phase 指定触发相位（缺省 down）。',
        fields: {
          action: { type: 'string', describe: '命中时产出的 Signal.name' },
          onlyFlag: { type: 'string', describe: '可选·相位门：设了且全局 Flag 非真 → 点击不产信号（模式化点击）' },
          phase: { type: 'string', describe: "触发的指针相位 'down'|'up'（缺省 'down'）" },
          hitMaskKey: { type: 'assetKey', assetType: 'hit-mask', describe: '可选预烘焙二值命中遮罩 key；缺/坏/版本不符拒收，不回退 AABB' },
        },
      },
    },
    reads: ['Clickable', 'Transform', 'Shape', 'Sprite', 'InputQueue', 'Flag', 'DebugTrace'],
    writes: ['Signal'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'clickable',
      // 与 event-when 同在 Update：排其后，使本帧命中的 Signal 不被 event-when 的全局清扫误删。
      // REQ-F-059 onlyFlag 门读全局 Flag：排在 Update 段 Flag 写者（flow/zone/self-rule）**之后**=读本拍
      // 相位（更新鲜且链条死端安全——clickable 唯一下游是 Signal 消费者，不会回流到 Flag 写者；
      // 反向 runsBefore 会与 flow→self-rule 既有显式边合围成环，实测踩过）。effect-apply 在 Commit 相位，
      // 跨相位天然有序无需声明。
      runsAfter: ['event-when', 'flow', 'zone-occupancy', 'self-rule'],
      reads: ['Clickable', 'Transform', 'Shape', 'Sprite', 'InputQueue', 'Flag', 'DebugTrace'],
      writes: ['Signal'],
      consumes: [],
      execute(world) {
        // ① 清掉上一帧挂在 Clickable 实体上的 Signal（自包含；event-when 在场时本步幂等）。
        for (const [eid] of world.query('Clickable', 'Signal')) world.removeComponent(eid, 'Signal');

        // ② 取单例 InputQueue。
        let queue: InputQueue | undefined;
        for (const [e] of world.query('InputQueue')) {
          queue = world.getComponent<InputQueue>(e, 'InputQueue');
          break;
        }
        if (!queue || !queue.actions.some((event) => event.x !== undefined && event.y !== undefined)) return;

        // ③ 与只读表现投影共用同一目标收集/几何/层级裁决，onlyFlag 与 mask 缺失仍 fail-closed。
        const targets = collectClickableTargets(world);

        // ④ 逐个指针事件：输入自带世界坐标 → 命中最上层 → 发 Signal。
        const trace = findDebugTrace(world);
        let traceCount = 0;
        for (const ev of queue.actions) {
          if (ev.x === undefined || ev.y === undefined) continue;
          const phase = ev.phase ?? 'down';
          const wp = { x: ev.x, y: ev.y }; // 世界坐标（PointerInputSource 已在采集期逆投影）

          const best = pickClickableTarget(targets, wp.x, wp.y, phase, (eid, reason) => {
            if (!trace || traceCount >= 3) return;
            appendTrace(trace, trace.tick ?? 0, 'clickable', 'reject', eid, reason);
            traceCount++;
          });
          if (best) {
            world.addComponent(best.eid, { type: 'Signal', name: best.click.action, source: best.eid } as Signal);
            if (trace && traceCount < 3) {
              appendTrace(trace, trace.tick ?? 0, 'clickable', 'commit', best.eid, best.click.action);
              traceCount++;
            }
          }
        }
      },
    },
  ],
});

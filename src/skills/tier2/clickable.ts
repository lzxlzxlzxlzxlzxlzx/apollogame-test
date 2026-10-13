import { defineCapability } from '@engine/core/define-capability.js';
import type { Transform, Shape, Sprite, Signal, InputQueue, Clickable, Flag } from '@engine/protocol/components.js';
import { parseHitMaskSpec } from '@engine/protocol/hit-mask.js';
import { planSpriteDraw } from '@engine/protocol/sprite-layout.js';
import { HOST_MASK_PREFIX, resolveHostHitMask } from '@engine/protocol/host-hit-mask-catalog.js';
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
        if (!queue || queue.actions.length === 0) return;

        // 全局 Flag 表（REQ-F-059 onlyFlag 门用；一次收集，O(flags)）。
        const flags = new Map<string, boolean>();
        for (const [fid] of world.query('Flag')) {
          const f = world.getComponent<Flag>(fid, 'Flag');
          if (f) flags.set(f.id, f.active);
        }
        // ③ 预收集可点击实体（带 Transform + Shape）；onlyFlag 非真者整体不参与命中。
        const targets: Array<{ eid: string; t: Transform; s?: Shape; sprite?: Sprite; z: number; click: Clickable }> = [];
        for (const [eid] of world.query('Clickable', 'Transform')) {
          const click = world.getComponent<Clickable>(eid, 'Clickable')!;
          if (click.onlyFlag && !flags.get(click.onlyFlag)) continue; // 门关：不可点（读上一拍 Flag）
          const t = world.getComponent<Transform>(eid, 'Transform')!;
          const s = world.getComponent<Shape>(eid, 'Shape');
          if (!s && !click.hitMaskKey) continue;
          const spr = world.getComponent<Sprite>(eid, 'Sprite');
          targets.push({ eid, t, s, sprite: spr, z: spr?.zOrder ?? 0, click });
        }

        // ④ 逐个指针事件：输入自带世界坐标 → 命中最上层 → 发 Signal。
        const trace = findDebugTrace(world);
        let traceCount = 0;
        for (const ev of queue.actions) {
          if (ev.x === undefined || ev.y === undefined) continue;
          const phase = ev.phase ?? 'down';
          const wp = { x: ev.x, y: ev.y }; // 世界坐标（PointerInputSource 已在采集期逆投影）

          let best: (typeof targets)[number] | undefined;
          for (const tg of targets) {
            if (phase !== (tg.click.phase ?? 'down')) continue;
            let hit = false;
            if (tg.click.hitMaskKey) {
              const mask = tg.click.hitMaskKey.startsWith(HOST_MASK_PREFIX)
                ? resolveHostHitMask((world as typeof world & { root?: object }).root ?? world, tg.click.hitMaskKey) : tg.click.hitMask;
              const result = maskedHit(wp.x, wp.y, tg.t, tg.sprite, mask);
              hit = result === 'hit';
              if (result !== 'hit' && result !== 'outside' && trace && traceCount < 3) {
                appendTrace(trace, trace.tick ?? 0, 'clickable', 'reject', tg.eid, result);
                traceCount++;
              }
            } else if (tg.s) {
              const { hw, hh } = halfExtents(tg.t, tg.s);
              hit = Math.abs(wp.x - tg.t.x) <= hw && Math.abs(wp.y - tg.t.y) <= hh;
            }
            if (hit) {
              if (!best || tg.z > best.z || (tg.z === best.z && tg.eid < best.eid)) best = tg;
            }
          }
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

/** 世界坐标经实体逆变换与 Sprite 共用绘制计划映射回预烘焙逻辑像素。 */
function maskedHit(x: number, y: number, t: Transform, sprite: Sprite | undefined, value: unknown): 'hit' | 'outside' | 'transparent' | 'invalid-mask' {
  const mask = parseHitMaskSpec(value);
  if (!mask || !sprite || sprite.textureKey !== mask.sourceTextureKey
    || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t.x) || !Number.isFinite(t.y)
    || t.rotation !== 0 || !Number.isFinite(t.scaleX) || !Number.isFinite(t.scaleY)
    || t.scaleX === 0 || t.scaleY === 0
    || (sprite.width !== undefined || sprite.height !== undefined || sprite.fit !== undefined)
      && (!(sprite.width! > 0) || !(sprite.height! > 0) || !['cover', 'contain'].includes(sprite.fit ?? '')))
    return 'invalid-mask';

  const dx = x - t.x;
  const dy = y - t.y;
  // v1 仅支持零旋转：sim 不引入跨平台非正确舍入三角函数；旋转图像 fail-closed。
  const lx = dx / t.scaleX;
  const ly = dy / t.scaleY;
  const plan = planSpriteDraw(sprite, { sx: 0, sy: 0, sw: mask.width, sh: mask.height });
  const d = plan.destination;
  if (lx < d.x || ly < d.y || lx >= d.x + d.width || ly >= d.y + d.height) return 'outside';
  const mx = Math.floor(plan.source.x + (lx - d.x) * plan.source.width / d.width);
  const my = Math.floor(plan.source.y + (ly - d.y) * plan.source.height / d.height);
  if (mx < 0 || my < 0 || mx >= mask.width || my >= mask.height) return 'outside';
  return mask.rows[my][mx] === '1' ? 'hit' : 'transparent';
}

// AABB 半宽/半高（含缩放）。box=width/height；circle=radius（轴对齐近似）；polygon=顶点包围盒。
function halfExtents(t: Transform, s: Shape): { hw: number; hh: number } {
  let hw = 0;
  let hh = 0;
  if (s.kind === 'box') {
    hw = (s.width ?? 0) / 2;
    hh = (s.height ?? 0) / 2;
  } else if (s.kind === 'circle') {
    hw = s.radius ?? 0;
    hh = hw;
  } else if (s.kind === 'polygon' && s.vertices) {
    for (let i = 0; i + 1 < s.vertices.length; i += 2) {
      hw = Math.max(hw, Math.abs(s.vertices[i]));
      hh = Math.max(hh, Math.abs(s.vertices[i + 1]));
    }
  }
  return { hw: hw * Math.abs(t.scaleX), hh: hh * Math.abs(t.scaleY) };
}

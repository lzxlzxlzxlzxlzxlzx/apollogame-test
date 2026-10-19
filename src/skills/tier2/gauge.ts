import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Gauge, Resource, Hierarchy, Shape } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  gauge —— Resource 比例 → 条形 Shape 投影（REQ-F-029：实时血条/蓝条/读条/护盾，通用表现层）。
//
//  每 tick 对每个挂 Gauge 的条实体：解析目标 Resource → 写自身
//    Shape.width      = clamp01((current-min)/(max-min)) * Gauge.width   （条长 = 资源比例）
//    Hierarchy.localX = (Gauge.leftX ?? -width/2) + Shape.width/2        （左锚：左端钉死，从右端缩）
//  条实体 = 纯数据挂件：Hierarchy{parentId:宿主,localY:头顶} + Shape{box,height} + Color{绿/蓝} + Gauge。
//  跟随/销毁零额外代码：hierarchy-resolve 带着走、hierarchy-cascade 随宿主死。渲染器零改动。
//
//  载体裁决（REQ-F-029 提案修正）：
//  · 不写 Transform.scaleX（原提案 A）——hierarchy-resolve(PostResolve) 每帧 c.scaleX=p.scaleX*localScaleX
//    重写子 Transform（双 writer 打架），且渲染 box 中心 pivot、缩放是对称收缩，做不出"左端钉死"。
//  · 不做渲染器 Bar 组件（原提案 B）——资源寻址/父子寻径是 sim 语义，进渲染器 = 每个后端
//    (canvas/ascii/未来视频) 重复实现 + 无头环境测不了 + 破坏 renderable"引擎无关纯数据"契约。
//  · Shape.width + Hierarchy.localX 是装配期之外无人逐帧写的输入端数据 → 无并发 writer。
//
//  资源寻址：fromParent=true 读 Hierarchy.parentId 宿主实体的 Resource（共享 id 'hp'、hitbox 局部
//  路由场景，全局取会取错单位）；缺省 = 先自身后全局首个同 id（与 ResourceModify 的 R11 auto 一致）。
//  定序（REQ-F-031 修正）：phase **PostResolve** —— gauge 是终态表现投影。曾放 Update，但 gauge
//  写 Shape 被 overlap-detect(Update) 读，而 overlap→trigger→hitbox→resource-apply 传递回写
//  Resource(gauge 读) → Update 内闭成 5 元环（game-f 战斗图实测抛环）。跨相位后与 Update 系统
//  无边：读到本帧**最终** Resource（伤害已结算），写 Shape 时碰撞早已读完；同相 runsBefore
//  hierarchy-resolve 让 localX 同帧投影成世界坐标。Update 内 Shape 读者(overlap/clickable)读到
//  上一帧条宽——条不参战、不可点，无语义影响。
//  确定性：纯 IEEE +-*/ 与比较（与 camera-follow 同类）；宽度进 snapshot/hash，跨端一致。
// ═══════════════════════════════════════════════════════════════

export const gaugeCapability = defineCapability({
  id: 't2-gauge',
  version: '1.0.0',

  describe: {
    name: 'gauge',
    summary:
      'Resource 比例条：每 tick 把目标资源比例写成自身 Shape.width（左锚补偿 Hierarchy.localX，从右端缩）。血条/蓝条/读条/护盾通用；条=宿主的纯数据子实体，渲染器零改动。',
    semantic: ['tier2', 'gauge', 'ui', 'presentation', 'resource'],
    whenToUse:
      '任何"随资源实时变化的条"：血条/蓝条/体力/施法读条/护盾。给宿主加一个子实体：Hierarchy{parentId:宿主,localY:悬浮高度} + Shape{kind:"box",height:条高} + Color{tint:颜色} + Gauge{resourceId,width,fromParent?}。宿主 hp 是共享 id（如 "hp"）则 fromParent:true；全局唯一 id（如 "mp_xx"）则缺省。',
    examples: [
      '血条：子实体 Gauge{resourceId:"hp",fromParent:true,width:40} + Shape{kind:"box",height:4} + Color{tint:0x33cc33} + Hierarchy{parentId:棋子,localY:-26}',
      '蓝条：Gauge{resourceId:"mp_zhugeliang",width:40} + Color{tint:0x3366ff}（mp 唯一 id，全局路由）',
    ],
  },

  components: {
    provides: {
      Gauge: {
        category: 'config',
        describe:
          'Resource 比例条（血/蓝/读条/护盾）：gauge 系统每 tick 把资源比例投影成自身 Shape.width，并左锚补偿 Hierarchy.localX（左端钉死从右端缩）。挂在作为宿主子体的条实体上。',
        fields: {
          resourceId: { type: 'string', describe: '跟踪的 Resource.id' },
          fromParent: { type: 'boolean', describe: 'true=读 Hierarchy.parentId 宿主实体上的 Resource（共享 id 如 "hp"）；缺省=先自身后全局按 id 首个（R11 auto 同款）' },
          width: { type: 'number', describe: '满值时条宽(px)' },
          leftX: { type: 'number', describe: '条左端相对宿主的固定 x 偏移（左锚）。缺省 -width/2（满条时居中于宿主）' },
        },
      },
    },
    reads: ['Gauge', 'Resource', 'Hierarchy'],
    writes: ['Shape', 'Hierarchy'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'gauge',
      // REQ-F-031：终态表现投影 → PostResolve（Update 内会经 overlap→trigger→hitbox→resource-apply 闭环）。
      phase: SystemPhase.PostResolve,
      // 同相显式钉死：先算条宽/锚位，hierarchy-resolve 再投影世界坐标（组件拓扑本可推出，声明自文档化）。
      runsBefore: ['hierarchy-resolve'],
      reads: ['Gauge', 'Resource', 'Hierarchy'],
      writes: ['Shape', 'Hierarchy'],
      consumes: [],
      execute(world: IWorld) {
        // 全局 id → Resource 首个匹配：走 World.byId 索引（B-3·创建序首个·与旧懒建 Map 同义）。
        const globalRes = (id: string): Resource | undefined => { const e = world.byId('Resource', 'id', id); return e === undefined ? undefined : world.getComponent<Resource>(e, 'Resource'); };
        for (const [eid] of world.query('Gauge')) {
          const g = world.getComponent<Gauge>(eid, 'Gauge')!;
          const shape = world.getComponent<Shape>(eid, 'Shape');
          const h = world.getComponent<Hierarchy>(eid, 'Hierarchy');
          if (!shape || !h) continue; // 条必须是"有几何的挂件"：缺 Shape/Hierarchy → 数据未就绪，不动不抛

          // 资源寻址：宿主实体 / 先自身后全局（R11 auto 同款）。
          let res: Resource | undefined;
          if (g.fromParent) {
            res = h.parentId ? world.getComponent<Resource>(h.parentId, 'Resource') : undefined;
          } else {
            res = world.getComponent<Resource>(eid, 'Resource');
            if (!res || res.id !== g.resourceId) res = globalRes(g.resourceId);
          }
          if (!res || res.id !== g.resourceId) continue; // 资源缺失/对不上 → 本拍不动

          const span = res.max - res.min;
          const raw = span > 0 ? (res.current - res.min) / span : 0;
          const ratio = raw < 0 ? 0 : raw > 1 ? 1 : raw; // clamp01（饱和，越界数据不外溢成负宽）
          shape.width = ratio * g.width;
          h.localX = (g.leftX ?? -g.width / 2) + shape.width / 2; // 中心=左端+半宽 → 左端恒在 leftX
        }
      },
    },
  ],
});

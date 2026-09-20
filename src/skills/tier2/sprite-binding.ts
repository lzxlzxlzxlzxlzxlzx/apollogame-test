import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { SpriteBinding, Resource, Hierarchy, Sprite, Color, Frame, State, Flag } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  sprite-binding —— Resource 数字 → 外观投影（text-binding/gauge 的姊妹件，家族第三员）。
//
//  每 tick 对每个挂 SpriteBinding 的实体：解析目标 Resource → 按下标取该阶的外观，写自身
//    Sprite.textureKey = skins[i]     （阶 → 皮肤槽·S6 换皮后的真图路）
//    Color.tint        = tints[i]     （阶 → 素坯染色·**资产未就绪时可立刻看见**）
//    Frame.index       = frames[i]    （阶 → 精灵帧号·单张 sheet 分帧的场景）
//    其中 i = clamp(Resource.current, 0, len-1)。
//
//  ── 为什么需要它（本件补的是一个**真缺口**，不是锦上添花）─────────────────────────
//  渲染器**早就**支持逐帧精灵：`canvas-renderer.ts:87` 与 `drawSprite` 一直在读 `Frame.index` 并传给
//  `assets.resolve(textureKey, frameIndex)`；`renderable.ts:21` 也早收了 `frame?: Frame`。
//  但**没有任何一件在写它**——`Frame` 自诞生起就是个没有生产者的组件：作者按契约填 `Frame{index:0}`
//  之后再没人动过它 → 「生长阶」这类**状态驱动的换帧**只能靠游戏层逐帧手写（那违反"零游戏层 system 代码"）。
//  本件把那条**投影**补上：与 gauge 补 `Shape.width`、text-binding 补 `Text.content` 是同一件事、同一纪律。
//  另：`Color` 同样没有"随状态走"的通路（`Color` 是静态组件，Effect kind 闭集里也没有一条写外观）——
//  故本件同时投影 tint，使**无美术资产**时也能看见状态（渲染器 `chooseRenderMode` 在 sprite 未就绪时
//  退化为占位方块，其填充色正是 `Color.tint`，见 `canvas-renderer.ts:83`）。这就是"素坯期"的本钱。
//
//  ── 为什么是三支平行数组（而不是一个 `stages: {skin,tint,frame}[]`）──────────────────
//  `defineCapability` 的 `FieldType` 是**闭集** `number|string|boolean|EntityId|string[]|number[]|assetKey`
//  ——**没有嵌套对象**。三支平行数组既落在闭集内（可被能力目录/弱 LLM 描述与填写），又比嵌套对象少一层
//  认知负担。三者**各自独立可选**：只给 `tints` 就是纯素坯换色；只给 `skins` 就是纯换图。
//  长度不必相等（各自按自己的长度夹取）——这一条是刻意的：S6 上真图时往往只补 `skins`，不动别支。
//
//  寻址与 gauge/text-binding **完全同款**（认知经济）：fromParent=true 读 Hierarchy.parentId 宿主实体的
//  Resource（共享 id 场景，如每格各有一份同名的 'stage'）；缺省=先自身后全局首个同 id。
//  定序：phase **PostResolve**（终态表现投影纪律，同 gauge F-031 / text-binding）——读到本拍最终 Resource。
//  确定性：`skins/tints/frames` 全是蓝图里的常量，`i` 是整数夹取，**纯查表·零浮点·零随机**
//  ⇒ `Sprite`/`Color`/`Frame` 均**不进** NON_DETERMINISTIC（见 `src/net/determinism.ts:35`），
//  即本件写的值**进 snapshot/hash**——与 gauge 宽度、text-binding 文案同纪律。故本件**必须**保持纯函数：
//  绝不可在此引入随机、时间、或跨端不保证逐位一致的计算。
//
//  为什么不用 Effect 做这件事（裁决留档，防后人改回去）：Effect kind 是**闭集**
//  （`effect-apply.ts:81`：set-flag/modify-resource/set-state/set-sensor/set-visible/destroy/*-tagged/reset-timer），
//  加一条 `set-sprite` 是**改闭集**——影响全库每个消费 Effect 的校验与穷举，且 Effect 是**离散事件**语义，
//  而"外观跟随某个 Resource 的当前值"是**持续投影**语义（资源被别的路改，外观也得跟着变）。
//  投影归投影（本件/gauge/text-binding），事件归事件（Effect）——这不是偏好，是两类语义的正确归属。
// ═══════════════════════════════════════════════════════════════

//  ── 合成下标（δ 轴·owner 2026-09-18 裁「δ 全轴」）────────────────────────────────
//  单轴（只有 resourceId）覆盖不了**两轴同时要表达**的场景：一格地有「生命周期」与「生长阶」
//  两个事实，而**一实体一类组件只有一个槽**——`Resource` 槽被生长阶占着，生命周期在 `State`、
//  「今日已浇」在 `Flag`，三者不在同一个槽里。故本件把下标做成**混合进制**：
//
//      row = states ? states.indexOf(State.current) : 0      （行·State 轴）
//      row = flagId ? row*2 + (Flag.active ? 1 : 0) : row     （最低位·Flag 轴）
//      col = stride > 1 ? clamp(Resource.current, 0, stride-1) : 0
//      i   = row*stride + col                                  （再按各支数组长度夹取）
//
//  读起来就是「第几行第几列」——作者按二维表填 `tints`，不必理解进制。
//  **各自独立可选**（同三支的纪律）：只给 `states` 就是「按状态分档换色」；只给 `flagId` 就是
//  「开/关两态换色」；都不给=**单轴旧行为**（`i = Resource.current`，逐字未变，存量零影响）。
//
//  缺件的处置（与「资源缺失/对不上→本拍不动」同一条纪律，不另立规矩）：
//   · `states` 给了但当前 State.current 不在表里（如 game109 那个只活在单拍内的瞬态 `busy`）→ 跳过本拍。
//     刻意**不**退化成第 0 行：宁可这一拍保持上一次的长相，也不让格子闪一下错的颜色。
//   · `flagId` 给了但实体（或宿主）没有对应 id 的 Flag → 跳过本拍。
//   · `stride > 1` 才需要 Resource；`stride <= 1` 时**不读资源**（纯按行着色不该被一份无关资源卡住）。

/** 下标夹取：越界饱和到两端（负数→0，超长→len-1）。纯整数，零浮点。 */
function clampIndex(i: number, len: number): number {
  const n = Math.trunc(i); // 防非整数下标（Resource.current 理论上应为整数，此处兜底不抛）
  return n < 0 ? 0 : n >= len ? len - 1 : n;
}

/** 合成下标（纯整数）。返回 undefined = 本拍不动（缺件，见文件头「缺件的处置」）。 */
function composeIndex(b: SpriteBinding, st: string | undefined, flagOn: boolean | undefined, resVal: number | undefined): number | undefined {
  // 单轴旧行为：两轴都没给 → 逐字保持 `i = Resource.current`（存量零影响）。
  if (!b.states && !b.flagId) return resVal;
  let row = 0;
  if (b.states) {
    if (st === undefined) return undefined;
    const r = b.states.indexOf(st);
    if (r < 0) return undefined; // 状态不在表里（瞬态/未知）→ 保持上一次长相
    row = r;
  }
  if (b.flagId) {
    if (flagOn === undefined) return undefined; // 找不到对应 Flag → 本拍不动
    row = row * 2 + (flagOn ? 1 : 0);
  }
  const stride = b.stride === undefined ? 1 : Math.trunc(b.stride);
  if (stride <= 1) return row; // 只按行着色：不读资源
  if (resVal === undefined) return undefined;
  const col = clampIndex(resVal, stride);
  return row * stride + col;
}

export const spriteBindingCapability = defineCapability({
  id: 't2-sprite-binding',
  version: '1.1.0',

  describe: {
    name: 'sprite-binding',
    summary:
      '把「组件当前状态」投影到外观：下标取该阶的皮肤槽/染色/帧号，写成自身 Sprite.textureKey + Color.tint + Frame.index（三支平行数组·各自可选）。下标可单轴（Resource）也可**按行×列合成**（行=State，最低位=Flag，列=Resource）——一实体一类组件只有一个槽，两轴不在同一个槽里时靠合成表达。生长阶/分档换色/形态切换通用；text-binding 管文字、gauge 管条、本件管长相。',
    semantic: ['tier2', 'render', 'presentation', 'sprite', 'resource', 'state'],
    whenToUse:
      '任何"随状态实时变样子"的东西：作物生长阶（stage 0..N → 各阶皮肤/色）、生命周期换色（荒/翻/播）、开关两态换色、建筑升级外观、单位血量变色、形态分档、精灵帧动画。实体挂 Sprite{...} + SpriteBinding{...}。要两轴时给 states（行）+ stride（列容量）与可选 flagId（最低位）。每格各持一份同名资源时 fromParent:true 指向宿主那格。',
    examples: [
      '作物生长阶（单轴）：地块实体 SpriteBinding{resourceId:"stage", skins:["crop/0","crop/1","crop/2"]}',
      '素坯换色（无美术资产也能看见）：SpriteBinding{resourceId:"stage", tints:[0x6b4b2a, 0x8a6a45, 0xd97a3a]}',
      '血量变色：SpriteBinding{resourceId:"hp", fromParent:true, tints:[0xcc3333, 0xdd8833, 0x33cc33]}',
      '两轴（生命周期×是否浇水→一格一色）：SpriteBinding{states:["wild","tilled","sown"], flagId:"watered", tints:[荒干,荒湿,翻干,翻湿,播干,播湿]}',
      '两轴（生命周期×生长阶）：SpriteBinding{states:["wild","tilled","sown"], stride:4, tints:[12 格表]}',
    ],
  },

  components: {
    provides: {
      SpriteBinding: {
        category: 'config',
        describe:
          '组件状态 → 外观投影：sprite-binding 系统每拍算出下标 i，取 skins[i]/tints[i]/frames[i] 写成自身 Sprite.textureKey / Color.tint / Frame.index。三支各自可选、长度各自独立。下标可单轴（resourceId）或按行×列合成（states 为行、flagId 为最低位、stride 为列容量）——不给 states/flagId 时即单轴旧行为。',
        fields: {
          resourceId: { type: 'string', describe: '跟踪的 Resource.id（合成模式下 stride>1 时才读）' },
          fromParent: { type: 'boolean', describe: 'true=读 Hierarchy.parentId 宿主实体上的 Resource/State/Flag（每格各持一份同名资源时用）；缺省=先自身后全局按 id 首个（R11 auto，同 gauge/text-binding）' },
          states: { type: 'string[]', describe: '行轴：State.current 的取值表，indexOf 得行号。缺省=第 0 行（单轴）。当前值不在表里→本拍不动' },
          flagId: { type: 'string', describe: '最低位轴：该 Flag.active 为真时行号 = 行*2+1。缺省=不参与。找不到该 Flag→本拍不动' },
          stride: { type: 'number', describe: '列容量（每行几档）；缺省 1=只按行着色（此时不读资源）。>1 时下标 = 行*stride + clamp(Resource.current,0,stride-1)' },
          skins: { type: 'string[]', describe: '下标→皮肤槽（textureKey）。缺省=不动 Sprite' },
          tints: { type: 'number[]', describe: '下标→素坯染色 0xRRGGBB；资产未就绪时渲染器回退用它填占位方块。缺省=不动 Color' },
          frames: { type: 'number[]', describe: '下标→精灵帧号（单张 sheet 分帧）；缺省=不动 Frame（实体须已有 Frame 组件）' },
        },
      },
    },
    reads: ['SpriteBinding', 'Resource', 'Hierarchy', 'State', 'Flag'],
    writes: ['Sprite', 'Color', 'Frame'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'sprite-binding',
      // 终态表现投影纪律（同 gauge F-031 / text-binding）：PostResolve 读本拍最终 Resource。
      // Sprite/Color/Frame 皆无 sim 读者（渲染器每帧末才 collect）→ 零定序边、零环。
      phase: SystemPhase.PostResolve,
      reads: ['SpriteBinding', 'Resource', 'Hierarchy', 'State', 'Flag'],
      writes: ['Sprite', 'Color', 'Frame'],
      consumes: [],
      execute(world: IWorld) {
        let globalRes: Map<string, Resource> | null = null;
        const globalLookup = (): Map<string, Resource> => {
          if (!globalRes) {
            globalRes = new Map();
            for (const [rid] of world.query('Resource')) {
              const r = world.getComponent<Resource>(rid, 'Resource')!;
              if (!globalRes.has(r.id)) globalRes.set(r.id, r);
            }
          }
          return globalRes;
        };

        for (const [eid] of world.query('SpriteBinding')) {
          const b = world.getComponent<SpriteBinding>(eid, 'SpriteBinding')!;
          const sprite = world.getComponent<Sprite>(eid, 'Sprite');
          const color = world.getComponent<Color>(eid, 'Color');
          const frame = world.getComponent<Frame>(eid, 'Frame');
          // 三支都没有可写的落点 → 数据未就绪：不动不抛（同 gauge「缺 Shape/Hierarchy 就跳过」）。
          if (!sprite && !color && !frame) continue;

          // 寻址三轴同款：fromParent=true → 读 Hierarchy.parentId 宿主实体；缺省 → 先自身后全局（R11 auto 同款）。
          // （State/Flag 与 Resource 是同一套寻址，不另立规矩；`State`/`Flag` 只有唯一槽位，
          //   故不像 Resource 那样还要按 id 比对——一实体一类组件只存一个，这由引擎契约保证。）
          const host = b.fromParent ? world.getComponent<Hierarchy>(eid, 'Hierarchy')?.parentId : undefined;
          const src = host ?? eid;

          let res: Resource | undefined;
          if (b.fromParent) {
            res = host ? world.getComponent<Resource>(host, 'Resource') : undefined;
          } else {
            res = world.getComponent<Resource>(eid, 'Resource');
            if (!res || res.id !== b.resourceId) res = globalLookup().get(b.resourceId);
          }
          const resOk = !!res && res.id === b.resourceId;
          // 资源什么时候是必须的：单轴（唯一的下标源）· 或合成模式要列（stride>1）。
          // 只按行着色（stride<=1）时不读资源——纯行表不该被一份无关资源卡住。
          const needRes = (b.states === undefined && b.flagId === undefined) || (b.stride ?? 1) > 1;
          if (needRes && !resOk) continue; // 资源缺失/对不上：本拍不动

          const st = b.states ? world.getComponent<State>(src, 'State')?.current : undefined;
          let flagOn: boolean | undefined;
          if (b.flagId) {
            const f = world.getComponent<Flag>(src, 'Flag');
            flagOn = f && f.id === b.flagId ? f.active : undefined;
          }
          const resVal = resOk ? res!.current : undefined;

          const i = composeIndex(b, st, flagOn, resVal);
          if (i === undefined) continue; // 缺件 → 本拍不动（见文件头「缺件的处置」）

          if (sprite && b.skins && b.skins.length > 0) {
            const k = b.skins[clampIndex(i, b.skins.length)];
            if (k !== undefined) sprite.textureKey = k;
          }
          if (color && b.tints && b.tints.length > 0) {
            const t = b.tints[clampIndex(i, b.tints.length)];
            if (t !== undefined) color.tint = t;
          }
          if (frame && b.frames && b.frames.length > 0) {
            const f = b.frames[clampIndex(i, b.frames.length)];
            if (f !== undefined) frame.index = f;
          }
        }
      },
    },
  ],
});

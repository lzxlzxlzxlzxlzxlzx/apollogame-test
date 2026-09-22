import { defineCapability } from '@engine/core/define-capability.js';
import type { Component, IWorld } from '@engine/core/types.js';
import type { ConditionExpr, State, Text, Flag, Resource, ResourceModify, RandomSeed, InputQueue } from '@engine/protocol/components.js';
import { findByComponentId, getComponentById, worldSeed } from '@engine/core/query.js';
import { evaluateCondition } from '@skills/tier2/index.js';
import { randomInt } from '@skills/atoms/random/index.js';

// ═══════════════════════════════════════════════════════════════
//  dialogue —— 通用「叙事/对话运行器」共享模块（Tier 3 解释器型机制；R15）。
//
//  数据驱动旗舰：把原 game-b/dialogue-runner.ts（游戏专属代码）泛化为引擎通用 capability。
//  关键变化：**对话脚本不再是闭包注入的代码常量，而是世界里的一份数据组件 DialogueScript**。
//  任何 VN/RPG/Galgame 只喂一棵声明式对话图（JSON）+ 一个 State 游标，运行器读图驱动 state/text/effect。
//
//  为什么需要一个「解释器」而非现成 Condition→Event→Effect：
//    - effect-apply 只能 set-state 到**固定值**，做不到「跳到当前节点的 next」（next 是逐节点的数据依赖转移）；
//    - 无系统能「按 State.current 查脚本表 → 写 Text.content」（表驱动文本）。
//  对话运行器是这类「读数据图、推进游标、驱动派生状态」的图遍历解释器的第一个（周期表缺失的一格）。
//
//  数据流（与原 runner 等价，债已还清）：
//    DialogueAdvance（line 节点）→ State.current = node.next
//    DialogueAdvance（check 节点，R17）→ 掷 RandomSeed 骰 → score≥difficulty ? successNext : failNext（施对应 effects）
//    DialogueChoose{index}（choice 节点）→ 校验 option.requires（条件树）→ 按 id 全局写 ResourceModify
//      + 置 Flag + State.current = option.next
//    每 tick → 按（可能已更新的）State.current 把当前节点文本写进 Text.content
//
//  定序（R10/R11）：诚实声明 reads:['State','Resource','Flag']，runsBefore:['resource-apply','state-sync']
//  打破 RMW 伪环；ResourceModify 按 resourceId 全局路由（resource-apply 结算）。确定性：只读/写确定状态。
// ═══════════════════════════════════════════════════════════════

// ── 对话脚本数据 schema（引擎的叙事数据契约；游戏只填这份 JSON）──────────────────
export interface DialogueEffect {
  resource: string; // 目标 Resource 的 id（按 id 全局路由）
  amount: number;
}
export interface DialogueChoiceOption {
  text: string;
  effects?: DialogueEffect[];
  setFlag?: string; // 目标 Flag 的 id
  next: string;
  requires?: ConditionExpr; // 出现/可选的条件门（检定/阈值解锁）
}
// check 节点（R17）：确定性骰子检定。同 line/choice 一样是图里的一种节点——
//   score = resource(attribute) + floor(resource(bonusFrom)/bonusDiv) + roll(1..dice)
//   score ≥ difficulty → successNext（施 successEffects），否则 failNext（施 failEffects）。
//   骰子用世界里的 RandomSeed（mulberry32 确定性 PRNG），进 snapshot 即可重放出同一结果。
export interface DialogueCheck {
  kind: 'check';
  speaker?: string;
  emotion?: string;
  prompt?: string;
  attribute: string; // 基础分来源 Resource 的 id
  difficulty: number; // 通过阈值
  dice?: number; // 掷 1..dice（含），默认 20（d20）
  bonusFrom?: string; // 可选修正来源 Resource 的 id（如好感）
  bonusDiv?: number; // bonus = floor(resource(bonusFrom)/bonusDiv)，默认 1
  successNext: string;
  failNext: string;
  successEffects?: DialogueEffect[];
  failEffects?: DialogueEffect[];
}
export type DialogueNode =
  | { kind: 'line'; speaker: string; emotion?: string; text: string; next: string | null }
  | { kind: 'choice'; speaker?: string; emotion?: string; prompt?: string; options: DialogueChoiceOption[] }
  | DialogueCheck;
export type DialogueGraph = Record<string, DialogueNode>;

export const DIALOGUE_FSM = 'dialogue';

// UI 经 R3 确定性输入接缝（QueuedInputSource.enqueueAction）发来的对话动作名。
// 走单例 InputQueue（tick 边界注入），而非 demo 里直接 world.addComponent 改世界——
// 后者是 mid-frame 副作用、绕过输入接缝、录放不确定（R16 标注的临时 hack）。
export const DIALOGUE_ACTION_ADVANCE = 'dialogue.advance';
export const DIALOGUE_ACTION_CHOOSE = 'dialogue.choose'; // 携带 x = 选项下标

// ── 组件 ──────────────────────────────────────────────────────────────────
// 对话脚本（数据）：一棵声明式节点图 + 关联的状态机 id。挂在对话实体上（与 State/Text 同实体）。
export interface DialogueScript extends Component {
  readonly type: 'DialogueScript';
  fsmId: string; // 关联的对话状态机 id（= 同实体 State.fsmId）
  nodes: DialogueGraph; // 节点图（line/choice）
}
// 推进到下一节点的请求（read-then-consume）。
export interface DialogueAdvance extends Component {
  readonly type: 'DialogueAdvance';
}
// 选择某选项的请求（read-then-consume）。
export interface DialogueChoose extends Component {
  readonly type: 'DialogueChoose';
  index: number;
}

// 当前节点渲染成文本（line=「说话人：台词」；choice/check=「说话人 + 提示」）。
export function renderNodeText(node: DialogueNode): string {
  if (node.kind === 'line') return `${node.speaker}：${node.text}`;
  return `${node.speaker ?? ''}${node.prompt ?? ''}`;
}

// 选项是否可选：无 requires 恒真；有则按条件树求值（检定/阈值/flag 门控通用）。
export function optionAvailable(world: IWorld, opt: DialogueChoiceOption): boolean {
  return opt.requires === undefined || evaluateCondition(world, opt.requires);
}

// 便捷：按 id 取某资源当前值（UI 属性面板/测试读用）。
export function resourceValue(world: IWorld, id: string): number | undefined {
  return getComponentById<Resource>(world, 'Resource', 'id', id)?.current;
}

// 把一组 DialogueEffect 落成 ResourceModify（按 id 全局路由，挂到目标资源各自实体；choice/check 共用）。
function applyEffects(world: IWorld, effects: DialogueEffect[] | undefined): void {
  for (const e of effects ?? []) {
    const target = findByComponentId(world, 'Resource', 'id', e.resource);
    if (target) {
      world.addComponent(target, { type: 'ResourceModify', resourceId: e.resource, amount: e.amount } as ResourceModify);
    }
  }
}

// 取世界里的 RandomSeed（约定单例，挂在 world 实体）。无则 check 退化为无方差（roll=0）。
function findSeed(world: IWorld): RandomSeed | undefined {
  return worldSeed(world); // 统一取法（B-3）
}

// 从单例 InputQueue 读本 tick 的对话输入动作（R3 接缝；UI 经 enqueueAction 注入，applyRawActions 落进队列）。
// advance / choose(index) 与显式 DialogueAdvance/DialogueChoose 组件等价——两条路都能触发，互不排斥。
// 队列每 tick 被运行时整体覆写，故动作只在注入的那一 tick 可见、被消费一次（无重复推进）。
function readDialogueActions(world: IWorld): { advance: boolean; chooseIndex?: number } {
  for (const [e] of world.query('InputQueue')) {
    const q = world.getComponent<InputQueue>(e, 'InputQueue');
    if (!q) break;
    let advance = false;
    let chooseIndex: number | undefined;
    for (const a of q.actions) {
      if (a.phase !== 'action') continue;
      if (a.key === DIALOGUE_ACTION_ADVANCE) advance = true;
      // 选项下标：优先读 x（显式带参动作）；缺省时回退读 arg（数字串）——
      // 因为正准的 ui/components mountUI ActionSink 经 enqueueAction(name,{arg}) 传参（arg 是字符串），
      // 不走 x。让对话能力同时认 arg，使任何「按钮发 action+actionArg 信号」的数据 UI 开箱即用（无需游戏写 handler）。
      else if (a.key === DIALOGUE_ACTION_CHOOSE) {
        if (a.x !== undefined) chooseIndex = a.x;
        else if (a.arg !== undefined && a.arg !== '') {
          const n = Number(a.arg);
          if (Number.isInteger(n)) chooseIndex = n;
        }
      }
    }
    return { advance, chooseIndex };
  }
  return { advance: false };
}

// check 节点结算（纯逻辑，便于单测）：返回是否通过 + 实际点数（确定性，roll 已掷）。
export function resolveCheck(world: IWorld, node: DialogueCheck, roll: number): { pass: boolean; score: number } {
  const base = resourceValue(world, node.attribute) ?? 0;
  const bonus = node.bonusFrom ? Math.floor((resourceValue(world, node.bonusFrom) ?? 0) / (node.bonusDiv ?? 1)) : 0;
  const score = base + bonus + roll;
  return { pass: score >= node.difficulty, score };
}

export const dialogueCapability = defineCapability({
  id: 't3-dialogue',
  version: '1.1.0',

  describe: {
    name: 'dialogue',
    summary: '数据驱动对话/叙事运行器：读 DialogueScript 节点图 + State 游标，推进节点、渲染当前行、选择结算（含 requires 条件门控 + effects/flag）+ check 确定性骰子检定分支。',
    semantic: ['tier3', 'narrative', 'dialogue', 'interpreter'],
    whenToUse:
      'VN/乙游/RPG 对话循环。给对话实体挂 DialogueScript{fsmId,nodes} + State + Text。UI 触发推进/选择有两条等价路径：直接发 DialogueAdvance/DialogueChoose 组件，或经 R3 输入接缝 enqueueAction("dialogue.advance"/"dialogue.choose",{x:index})（确定性，走 tick 边界，录放一致）。整个剧情 = 一棵 JSON 节点图（数据），无游戏专属代码。check 节点需世界里有一个 RandomSeed（确定性骰子）。',
    examples: [
      '推进：line 节点 + DialogueAdvance → State.current = node.next',
      '选择：DialogueChoose{index} → 校验 requires → ResourceModify(好感) + Flag + 跳转 option.next',
      '检定：check 节点 + DialogueAdvance → roll(RandomSeed)+attr+bonus≥difficulty ? successNext : failNext（失败走另一条故事，非 Game Over）',
      '渲染：每 tick 按 State.current 把当前节点文本写进 Text.content',
    ],
  },

  components: {
    provides: {
      DialogueScript: {
        category: 'config',
        describe: '声明式对话节点图（数据）+ 关联状态机 id。nodes 为 {nodeId: line|choice|check} 的图。',
        fields: {
          fsmId: { type: 'string', describe: '关联的对话状态机 id（= 同实体 State.fsmId）' },
          nodes: { type: 'string', describe: '节点图 Record<nodeId, DialogueNode>（line: speaker/text/next；choice: options[{text,effects?,setFlag?,next,requires?}]；check: attribute/difficulty/dice?/bonusFrom?/bonusDiv?/successNext/failNext/successEffects?/failEffects?）' },
        },
      },
      DialogueAdvance: { category: 'event', describe: '请求推进到下一对话节点（line 节点跳 next；check 节点掷骰结算分支）', fields: {} },
      DialogueChoose: {
        category: 'event',
        describe: '请求选择某个选项（choice 节点用）',
        fields: { index: { type: 'number', describe: '选项下标' } },
      },
    },
    reads: ['DialogueScript', 'State', 'Resource', 'Flag', 'RandomSeed', 'InputQueue'],
    writes: ['State', 'Text', 'Flag', 'ResourceModify', 'RandomSeed'],
    consumes: ['DialogueAdvance', 'DialogueChoose'],
  },

  config: {},

  systems: [
    {
      id: 'dialogue',
      reads: ['DialogueScript', 'State', 'Resource', 'Flag', 'RandomSeed', 'InputQueue'],
      writes: ['State', 'Text', 'Flag', 'ResourceModify', 'RandomSeed'],
      consumes: ['DialogueAdvance', 'DialogueChoose'],
      // R10：显式定序打破 RMW 伪环——本系统读 Resource/State 又产 ResourceModify、改 State，
      // 须排在 resource-apply（应用修改）与 state-sync（发切换事件）之前。
      runsBefore: ['resource-apply', 'state-sync'],
      execute(world: IWorld) {
        // 本 tick 的 UI 输入动作（R3 接缝，全局单例）。约定单一活动对话；多对话机时同一动作作用于各机。
        const input = readDialogueActions(world);
        // 对话实体 = 同时挂 DialogueScript + State 且 fsmId 一致的实体（支持多对话机各跑各的脚本）。
        for (const [eid] of world.query('DialogueScript', 'State')) {
          const script = world.getComponent<DialogueScript>(eid, 'DialogueScript')!;
          const st = world.getComponent<State>(eid, 'State')!;
          if (st.fsmId !== script.fsmId) continue;
          const nodes = script.nodes;
          const node = nodes[st.current];
          if (!node) continue;

          // ① 处理输入事件（显式组件 或 R3 InputQueue 动作，二者等价）→ 改 State.current
          const advancing = world.hasComponent(eid, 'DialogueAdvance') || input.advance;
          if (advancing && node.kind === 'line' && node.next) {
            st.current = node.next;
          } else if (advancing && node.kind === 'check') {
            // 确定性骰子检定：roll(1..dice) + base + bonus ≥ difficulty ? successNext : failNext。
            // roll 从世界 RandomSeed 取（推进序列，进 snapshot → 重放结果一致）。
            const seed = findSeed(world);
            const roll = seed ? randomInt(seed, 1, (node.dice ?? 20) + 1) : 0;
            const { pass } = resolveCheck(world, node, roll);
            applyEffects(world, pass ? node.successEffects : node.failEffects);
            st.current = pass ? node.successNext : node.failNext;
          }
          const chooseComp = world.getComponent<DialogueChoose>(eid, 'DialogueChoose');
          const chooseIndex = chooseComp ? chooseComp.index : input.chooseIndex;
          if (chooseIndex !== undefined && node.kind === 'choice') {
            const opt = node.options[chooseIndex];
            if (opt && optionAvailable(world, opt)) {
              // 各效果指向不同资源=不同实体，天然不互相覆盖；无孤儿实体（一实体一组件的约束见 R14）。
              applyEffects(world, opt.effects);
              if (opt.setFlag) {
                const fl = getComponentById<Flag>(world, 'Flag', 'id', opt.setFlag);
                if (fl) fl.active = true;
              }
              st.current = opt.next;
            }
          }

          // ② 按（可能已更新的）current 渲染 Text
          const shown = nodes[st.current];
          const txt = world.getComponent<Text>(eid, 'Text');
          if (shown && txt) txt.content = renderNodeText(shown);
        }
      },
    },
  ],
});

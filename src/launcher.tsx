import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { StudioInspector } from './studio/StudioInspector.js';
import { AssetLibrary } from './studio/AssetLibrary.js';
import { SHELL } from './ui/shell-theme.js';
import { resolveArtRefs } from './assembly/resolve-art-refs.js';
import { artlibRecords, type LibraryRecord } from '@assets/index.js';
import type { ArtLibIndex } from '@assets/artlib.js';
import { buildCapabilityCatalog } from './assembly/capability-catalog.js';
import { ALL_CAPABILITIES } from './assembly/capability-registry.js';
import {
  metaToGameEntry, libSlug, providerStatus, LIB_ID_PREFIX,
  type GameEntry, type LibraryEntry, type ProviderInfo,
} from './studio/library-model.js';
import {
  DataCartridgeRunner, LibraryShelf, LibActionBar, VersionHistoryOverlay, StatusLight, BenchOverlay,
} from './studio/DataCartridgeRunner.js';
import { CreationWizard, type WizardMode } from './studio/CreationWizard.js';
import { DesignStudio, EntryChoice, ContinueChoice } from './studio/DesignStudio.js';
import { ArtLedgerPanel, ArtGamePicker } from './studio/ArtLedgerPanel.js';
import { GamePipelinePanel } from './studio/GamePipelinePanel.js';
import { SettingsPanel } from './studio/SettingsPanel.js';

// （2026-07-16 纯结构拆分·token 优化）轮播/DevTools/游戏运行时/API 助手拆至 ./launcher/*，行为不变。
import { API, apiCall } from './launcher/api.js';
import { useKeyframes, CartridgeCarousel } from './launcher/carousel.js';
import { DevTools } from './launcher/devtools.js';
import { GameRunner, BareListRetry } from './launcher/game-runner.js';
import { ProfileCard } from './launcher/profile-card.js';

// ══════════════════════════════════════
//  Game Registry
// ══════════════════════════════════════

// 平台打包白名单（build 期 env·D2）：VITE_GAMES_ALLOWLIST="id1,id2,…" 时只留清单内 id；
// 缺省/空串=全量（零回归——普通 dev/build 不设此 env，行为不变）。只影响下面这份**运行时渲染表**，
// 不改字面量数组本身在源文件里的文本形状——main_entry/games_list.py 仍按原文件正则读到全量 15 个
// （工坊内部工具照旧看得到全部内置游戏元信息），此过滤只砍客户端货架实际渲染出的卡片，即打包
// 产物真正暴露给玩家的入口。GAMES_ALLOWLIST 为 null 即零过滤（filter 回调恒真）。
const GAMES_ALLOWLIST: Set<string> | null = (() => {
  const raw = (import.meta.env.VITE_GAMES_ALLOWLIST as string | undefined ?? '').trim();
  return raw ? new Set(raw.split(',').map((s) => s.trim()).filter(Boolean)) : null;
})();

// GAMES 不拆走：main_entry/games_list.py 以正则从 src/launcher.tsx 解析本表（内置卡片元信息单一真相·只读）。
export const GAMES: GameEntry[] = [
  {
    id: 'game-105',
    title: 'Game 105: 心动叠叠塔',
    subtitle: '真物理叠叠塔 · 双人轮流抽块',
    description: '从 18 层、54 块交叉积木塔中抽取木条。碰撞、抽离与倒塌均由真实物理决定；不提供安全度、成功率或风险预测。',
    color: '#f3e7ef',
    accentColor: '#d85582',
    icon: '💗',
    status: 'playable',
  },
  {
    id: 'game108',
    title: 'Game 108: 拳律 Rule of Three',
    subtitle: '公开蓄力槽 · 猜拳心理战',
    description:
      '六条蓄力槽摊在台面上——你往哪一手存力所有人都看得见，然后你可以出别的。T1 蓄力(公开) → T2 出招(隐藏·同时) → T3 对决，克制关系定胜负、蓄力只决定赢了打多少(10/20/30/40)；出过的手清零，满蓄被克 = 一次赔掉三回合。判定表本身是数据，遗物能当场凿改它。超休闲操作 × 轻 roguelite 深度。',
    color: '#0f1620',
    accentColor: '#ff7a3c',
    icon: '✊',
    status: 'playable',
  },
  {
    id: 'game102',
    title: 'Game 102: 色流工坊 Pixel Pour',
    subtitle: '3D 体素雕刻 · 转面喂炮揭雕像',
    description:
      '3D 体素立方自动转面（6 面 5 秒循环）；你只调度 3 门自动炮的颜色（总 5 色·三炮互斥），对齐转到面前那面的颜色→自动开火剥掉彩色外料；剥到阈值露出里面隐藏的金色雕像=过关，装错色自动浪费弹→某色弹尽而外料未清=负。无瞄准/无狂按·纯颜色调度（Pixel Flow 魂）。体素 voxelTex 归批实例化（P3D 大规模渲染）·GTAO/碎片落盘·render-only 手感原型。',
    color: '#0a2038',
    accentColor: '#2e6cf6',
    icon: '🧊',
    status: 'playable',
  },
  {
    id: 'game-e',
    title: 'Game E: Balatro-like',
    subtitle: '小丑牌 · 卡牌构建',
    description: '选最多 5 张 → 真引擎认牌型 + 逐张筹码 + 小丑有序加乘 = 分数砸 Boss。牌面取自 cards.png 切图、小丑真美术。计分全由 poker-hand/effect-apply 通用能力涌现，零游戏专属系统。',
    color: '#1a1020',
    accentColor: '#f59e0b',
    icon: '🃏',
    status: 'playable',
  },
  {
    id: 'game-f',
    title: 'Game F: Pixel Three Kingdoms',
    subtitle: '像素三分天下 · 自走棋',
    description: '三国自走棋切片：蜀(红) vs 魏(蓝) 全自动对战——棋子索敌、走位、普攻互砍、团灭判胜。AI/普攻/战斗全由通用能力（aggro/steering/caster/hitbox/mortal）涌现，零自走棋专属代码。三国感靠命名+势力分色，美术走 DCSS 换皮。',
    color: '#2a1f12',
    accentColor: '#e0a83e',
    icon: '♟️',
    status: 'playable',
  },
  {
    id: 'game-g',
    title: 'Game G: Fateflip Poker',
    subtitle: '翻命扑克 · 实时三路掷命',
    description: '拟人扑克的实时三路行军博弈：布局阶段铺底牌 → 手牌实时派上/中/下、读秒暂停 → 兵一格格慢慢爬、过门线显形 → 最前两张相邻「命运一掷」（点数+经营+士气=战力 → 胜率区间 → 掷点定生死，可读）→ 突破敌 3 血大本营先破者胜。outcome-first：胜负规则定、可回放；大厅忠实港绿呢牌桌双皮。',
    color: '#10212a',
    accentColor: '#22d3ee',
    icon: '🎴',
    status: 'playable',
  },
  {
    id: 'game-i',
    title: 'Game I: UI Gallery',
    subtitle: '控件测试场 · 数据驱动 UI',
    description: '它不做玩法——「玩法」就是玩 UI。把引擎 15 个数据驱动控件按「容器与布局 / 数据展示 / 输入与交互」三页铺成可玩画廊：换皮（三套 UITheme 令牌）、事件日志实时看信号流。画廊本体 100% LayoutNode 纯数据，渲染走 renderNode、挂载走 mountUI，零重造控件。以后游戏的 UI 都从这套底座搭。',
    color: '#0f1722',
    accentColor: '#7fc7e8',
    icon: '🎛️',
    status: 'playable',
  },
  {
    id: 'game-z',
    title: 'Game Z: 盒庭 Diorama',
    subtitle: '3D 微缩盒庭 · Captain Toad 风渲染线',
    description: '不做玩法（先放一边）——它是引擎「3D 盒庭」渲染线的底座：草地台 + 抬升石台站着 Toad + 金阶梯 + 终点宝石 + 蘑菇，全是 Transform3D（真三维位姿·地面 XZ + Y 高度）+ Mesh3D（体块）的纯数据；一个 Camera3D 单例把场景切进盒庭模式——引擎 ThreeRenderer 按 yaw/pitch 轨道取景、柔和接触阴影、暖白主光 + 冷蓝补光、哑光材质。换一组数字即换一个盒庭，零手写 Three.js。后续长出：移轴景深 / 模型导入 / 可旋转交互 / 玩法。',
    color: '#0b1020',
    accentColor: '#9ccc65',
    icon: '🧊',
    status: 'playable',
  },
  {
    id: 'game-d',
    title: 'Game D: 骰途 Dice & Dungeons',
    subtitle: '双人骰子 Roguelike · 3D 场景骨架',
    description: '「所有战斗都用掷骰子解决」的双人合作 Roguelike——两人各带骰池、一关一关往前闯，过关三选一拿 buff（哈迪斯式），骰子凑不够掏宝物消耗品救场，打穿一层拿局外永久解锁，全灭重开。当前=场景骨架：无限程序化房间流（分层 + 每层 2 战斗 + 1 BOSS）串成往上推进的地牢，近俯视一屏一战场、房间流式生成/卸载；精装管线（暖冷光 + 移轴景深 + 泛光 + 软影 + 天空盒）让美术不糙。战斗/骰子/敌人后续接入（见 docs/design/game-d/combat-design.md）。',
    color: '#140e1f',
    accentColor: '#c084fc',
    icon: '🎲',
    status: 'playable',
  },
  {
    id: 'game-b',
    title: 'Game B: 雀宴',
    subtitle: '和风日麻陪打 · 俯视 3D 牌桌',
    description:
      '俯视 3D 和风雀庄陪打局：角色卡带主角与金钱入局，与三位姨太打一圈东风战日麻，直击脱衣轻演出，结果带回局外。当前=S3 骨架：3D 桌+136 牌山实例+占位牌面手牌（CC0 贴面）+主机位 Camera3D+席位卡 HUD 壳（LayoutNode·sakura 主题）——全引擎 render-only 组件纯数据，零手写 Three.js。麻将核/AI/脱衣结算=S4 接入（docs/design/game-b/gdd.md）。',
    color: '#241a26',
    accentColor: '#e8899e',
    icon: '🀄',
    status: 'playable',
  },
  {
    id: 'game-a',
    title: 'Game A: 掼蛋夜宴',
    subtitle: '淮安掼蛋 · 二次元私宅夜局',
    description:
      '四人两副牌传统掼蛋（淮安标准全套）——2v2 对家爬级过 A、快局金钱/服饰罚、三位二次元姨太 AI 同桌。判型/压制序/逢人配=引擎 t3-hand-pattern 纯数据 config（游戏层零判型代码），牌库/手牌=t2-card-pile，run 状态=Resource，盘间流程=t3-flow，UI 全 LayoutNode，牌面=PD 货架 vendor 本地库。当前=S3 骨架：牌桌世界装载空跑、108 牌库/级数/服饰/钱包资源就位；发牌与出牌循环、BT 对手 AI 于玩法关（S4）接入。',
    color: '#2a0f11',
    accentColor: '#f0c96a',
    icon: '🏮',
    status: 'playable',
  },
  {
    id: 'game-c',
    title: 'Game C: 六人德州',
    subtitle: '标准德州扑克 · 夜宴牌房',
    description:
      '单人 vs 五位姨太行为树 AI 的六人桌标准德州扑克（现金局）：恒定盲注手手对局，筹码告急典当衣物续命、剥光才出局；AI 难度=读牌误差%（简单档禁读·不作弊发牌）。摊牌比较/下注圈边池=game-c 确定性 TS 模块（owner 批 TS 口径·M1 逻辑核 50 测钉死），洗牌=w1-random 种子 PRNG，典当=t2-craft-recipe 每件一条配方，UI 全 LayoutNode（夜宴主题皮·art-data-manual 1:1）。当前=S5 素坯：牌桌屏挂载（翻牌圈定格投影+座位环+行动条+衣柜面板）；AI/3D 牌房/筹码物理=M2/M3 接入。',
    color: '#160e0a',
    accentColor: '#f0c96a',
    icon: '🃏',
    status: 'playable',
  },
  {
    id: 'game-103',
    title: 'Game 103: 幸存者核心',
    subtitle: '俯视割草 Roguelite · 吸血鬼幸存者式',
    description:
      '俯视 2D 单摇杆走位、武器全自动开火的吸血鬼幸存者式割草 Roguelite（参照 Survivor.io / Vampire Survivors）：唯一操作=走位，武器自动索敌开火，击杀掉经验、攒满升级变强，从被群追到清屏，限时活满即胜。走位/自动开火/敌群追击/接触伤害/经验拾取/等级/边界/相机跟随/胜负全由通用能力（controllable/motion-apply/aggro/steering/self-rule/launch/hitbox/mortal/over-time/event-when/effect/camera-follow/flow）涌现，零幸存者专属系统代码。当前=M1 灰盒：走位+单武器自动开火+单敌群+经验拾取升级（固定强化占位）+接触伤害死亡+相机跟随+胜负。升级三选一 draft/武器进化/波次 director=编排能力待 Lead 签 S2 接入。',
    color: '#0a1a24',
    accentColor: '#4aa8ff',
    icon: '🧟',
    status: 'playable',
  },
  {
    id: 'game101',
    title: 'Game 101:《海港绯闻》',
    subtitle: '海港合并 × 追剧 · Merge & Story 复刻',
    description:
      '回到海港小城汐味馆，一边把餐厅经营起来、一边在合并小游戏里解压、一边追一部狗血海港连续剧——点生成器（耗体力）→ 合并物品（merge-2）→ 交付订单 → 攒星星推进剧情与装修。当前=M1a 灰盒玩法核：merge-rule 每链每级 need:2 确定性合并、prefab 物品库、四资源（体力/金币/星星/经验）、over-time 体力涓流恢复——全数据驱动、零专属系统代码。棋盘物品=链色×等级亮度灰盒占位（美术皮肤槽就绪即换装）。生成器/订单/气泡（§2.5 缺口 G1/G2/G3）待 Lead 裁 REQ-101-01 下沉引擎能力后接线；HUD/拖放/剧情=M1b+。',
    color: '#2a1c12',
    accentColor: '#f0a35e',
    icon: '⚓',
    status: 'playable',
  },
  {
    id: 'game211',
    title: 'Game 211: 翻命扑克 · 战斗重做',
    subtitle: 'game-g fork · 实时物理自动战斗（在建）',
    description:
      'game-g《翻命扑克》的战斗重做分支（owner 2026-08-07：不动 game-g、fork 出来改）。元层原样继承——52 历史名将 / 天罡 / 地支 / 52 关战役 / 经济 / 六屏大厅全部照旧；**只换战斗**：回合制三路掷命 → 实时、物理驱动、自动交战的 RTS 式战场（玩家操作收在战前布阵 + 战中投技能，不微操单位）。当前=忠实 fork 基线（战斗仍是旧回合制核，等物理线 A/B 裁决后整块替换）。能力总览见 games/game211/design/capability-plan.md。',
    color: '#101c2a',
    accentColor: '#7c9cff',
    icon: '⚔️',
    status: 'playable',
  },
];

// 客户端货架实际渲染表（下方 Launcher 组件 + CartridgeCarousel 消费这份，不消费 GAMES 本身）：
// GAMES 保持原始字面量类型标注不变（正则解析 + 字面量 status 联合类型收窄都靠它），过滤单独在
// 派生表上做，两不相扰。GAMES_ALLOWLIST 为 null 时 .filter 回调恒真，等价于 VISIBLE_GAMES===GAMES
// 的全量（零回归）。
export const VISIBLE_GAMES: GameEntry[] = GAMES.filter(
  (g) => GAMES_ALLOWLIST === null || GAMES_ALLOWLIST.has(g.id),
);

// ══════════════════════════════════════
//  Main Launcher
// ══════════════════════════════════════

export function Launcher() {
  useKeyframes();
  // 「正在玩哪个游戏」进 URL（?game=id）：游戏选择若只是 React 状态，任何全页 reload
  // （HMR 失联恢复 / 依赖再优化 / 手动刷新）都会把人弹回主页——这正是「点游戏几秒后跳回主页」
  // 系列 bug 的放大器（根因之一 stdout pipe 阻塞已修，此处把"导航被 reload 清零"永久防住）。
  const [launched, setLaunchedState] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.search).get('game');
    return q && VISIBLE_GAMES.some((g) => g.id === q && g.status === 'playable') ? q : null;
  });
  // Workshop ▶ 直达（REQ-WORKSHOP 续·owner 07-11）：?game=lib:<slug> 直启卡带；from=workshop 时返回=回创作台。
  const fromWorkshop = React.useMemo(
    () => new URLSearchParams(window.location.search).get('from') === 'workshop', []);
  // bare=1（owner 07-11「直接启动游戏，别经过旧工作台」）：本页只当游戏运行器用——
  // 装载期显示 splash，绝不渲染货架/DevTools 等旧工作台界面。
  const bareMode = React.useMemo(
    () => new URLSearchParams(window.location.search).get('bare') === '1', []);
  const backToWorkshop = useCallback(() => { window.location.href = `${API}/workshop/`; }, []);
  const pendingLibLaunch = React.useRef<string | null>(
    (() => { const q = new URLSearchParams(window.location.search).get('game'); return q && q.startsWith(LIB_ID_PREFIX) ? q : null; })());
  const setLaunched = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('game', id);
    else url.searchParams.delete('game');
    window.history.replaceState(null, '', url);
    setLaunchedState(id);
  }, []);
  const [studio, setStudio] = useState(false);
  const [artlib, setArtlib] = useState(false);

  // 玩家模式（?mode=player）：面向 To-C 用户——隐藏内置 GAMES 与 DevTools，卡带架数据源=用户游戏库。
  const playerMode = React.useMemo(
    () => new URLSearchParams(window.location.search).get('mode') === 'player', []);

  // 用户游戏库（library）：**launcher 统一拉取的单一数据源**（返修 Lead 缺陷 #1：此前玩家模式
  // 由 LibraryShelf 自拉、launcher 另存一份永远为空的 libEntries → LAUNCH 查不到条目静默无反应；
  // 收成一份状态后玩家/开发两模式同源）。null=加载中；libRefresh 变更即重拉（装样例/回滚后刷新）。
  const [libEntries, setLibEntries] = useState<LibraryEntry[] | null>(null);
  const [libRefresh, setLibRefresh] = useState(0);
  const [libRunner, setLibRunner] = useState<{ slug: string; entry: GameEntry } | null>(null);
  // 版本历史浮层（从架上操作条打开·spec ③ ⟲）。
  const [libHistory, setLibHistory] = useState<{ slug: string } | null>(null);
  // 体检浮层（M4·架上操作条 🩺 打开）：五轴分 + 总分 + 及格线。
  const [libBench, setLibBench] = useState<{ slug: string; title: string } | null>(null);
  // 美术台账浏览墙（REQ-DEMO-T2·库卡带「🎨 美术台账」打开）：浏览+点名三式替换+换皮。
  const [artLedger, setArtLedger] = useState<{ slug: string; title: string; kind?: 'builtin' | 'library' } | null>(null);
  const [artPicker, setArtPicker] = useState(false); // 🎨 美术平台入口=先选游戏目录（owner review ③）
  // 🏭 生产流程板（owner 07-10「N 步拆分·每步 review」）：同一游戏选择器进入，逐游戏八阶段双验看板。
  const [pipePicker, setPipePicker] = useState(false);
  const [pipeGame, setPipeGame] = useState<{ slug: string; title: string; kind?: 'builtin' | 'library' } | null>(null);
  // 设置面板（M3·状态灯点开）：BYO key + 测试连接。
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 玩家档案卡（REQ-C-104·👤 点开）：名字 + 预设头像 → localStorage["apollo.playerProfile"]，游戏侧只读消费。
  const [profileOpen, setProfileOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  // 顶栏 API 状态灯：读现有 providers 端点，任一**云** provider 配了 key → 绿，否则琥珀（local 不计·见 providerStatus）。
  //   config 里配了云 key 也算已连接——get_available_providers/get_api_key 已把 config 计入（优先级 config>env>.env），
  //   故设置页保存后 bump providersRefresh 重拉即更新状态灯（M3 增强，无需前端另判 config）。
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [providersRefresh, setProvidersRefresh] = useState(0);
  // M2 创作向导（两模式共用·⚡ 快速模式）：create=新建 / revise=继续创作某盘卡带。
  const [wizard, setWizard] = useState<{ mode: WizardMode; slug?: string; name?: string } | null>(null);
  // 设计先行流：新建入口双选卡（🗣 设计 / ⚡ 快速）+ 设计工作台 + 继续创作双选（改设计 / 快改数值）。
  const [entryChoice, setEntryChoice] = useState(false);
  const [designStudio, setDesignStudio] = useState<{ slug?: string; name?: string } | null>(null);
  const [continueChoice, setContinueChoice] = useState<{ slug: string; name: string } | null>(null);
  // 保存新卡带后请求轮播选中它（`lib:<slug>`）。
  const [selectSlug, setSelectSlug] = useState<string | null>(null);
  // 能力目录（从引擎 ALL_CAPABILITIES 自动派生）：向导生成请求随之送出，注入系统词。派生一次即可。
  const catalog = React.useMemo(() => buildCapabilityCatalog(ALL_CAPABILITIES), []);

  useEffect(() => {
    apiCall('/api/generate/providers')
      .then((d) => setProviders(Array.isArray(d) ? d : []))
      .catch(() => setProviders([]));
  }, [providersRefresh]);

  // 库列表：两模式统一在此拉（玩家模式喂 LibraryShelf，dev 模式追加在内置卡带之后）。
  useEffect(() => {
    apiCall('/api/library')
      .then((list) => setLibEntries(Array.isArray(list) ? list : []))
      .catch(() => setLibEntries([]));
  }, [libRefresh]);

  // 空库态「装入官方示例卡带」：POST 后刷新列表。
  const [installMsg, setInstallMsg] = useState<string | null>(null); // 装示例回执（owner 2026-07-10：失败绝不静默）
  const installSample = useCallback(async () => {
    setInstalling(true);
    setInstallMsg(null);
    try {
      const r = await fetch(`${API}/api/library/install-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: 'all' }), // 全套官方示例（幂等·此位留给精选好游戏——owner 2026-07-10）
      }).then((x) => x.json() as Promise<{ success?: boolean; installed?: string[]; skipped?: string[]; error?: string }>);
      if (r.success) setInstallMsg(`✓ 新装 ${r.installed?.length ?? 0} 张${(r.skipped?.length ?? 0) > 0 ? `（${r.skipped!.length} 张已在架）` : ''}：${[...(r.installed ?? [])].join(' / ') || '无新增'}`);
      else setInstallMsg(`✕ ${r.error ?? '安装失败'}`);
    } catch {
      setInstallMsg('✕ 创作服务未启动——请用 python3 zerocraft.py 启动（它会一并拉起页面服务），别只跑 npm run dev');
    }
    setInstalling(false);
    setLibRefresh((k) => k + 1);
  }, []);

  // 素材库记录（AI 选材解析用）：启动时拉一次索引，失败不阻塞（art: 引用原样留 → 渲染占位）。
  const artRecordsRef = React.useRef<LibraryRecord[] | null>(null);
  useEffect(() => {
    fetch('/assets/FreeArtLib/index.json')
      .then((r) => r.json())
      .then((j) => { artRecordsRef.current = artlibRecords(j as ArtLibIndex); })
      .catch(() => { artRecordsRef.current = null; });
  }, []);

  // manifest 原始 JSON → 过 art: 选材解析（确定性 rankRecords top-1，留痕 console 供审计）。
  // openInStudio 与数据卡带运行共用同一段（复用现成 artRecords 加载逻辑）。
  const resolveArt = useCallback((raw: unknown): unknown => {
    const records = artRecordsRef.current;
    if (!records) return raw;
    const { manifest: resolved, resolutions } = resolveArtRefs(raw, records);
    if (resolutions.length > 0) {
      console.info('[art-resolve] AI 选材解析（query → id；同 query 永远同结果）：',
        resolutions.map((r) => `${r.entity}.${r.component}.${r.field}: "${r.query}" → ${r.id ?? '∅ 无命中(原样保留)'}${r.candidates.length > 1 ? `（候选: ${r.candidates.join(', ')}）` : ''}`));
    }
    return resolved;
  }, []);

  // 「继续创作」（两模式同流·REQ-WORKSHOP A 退役旧 GameCreator）：
  // 有设计稿 → 双选（改设计 / 快改数值）；无设计稿 → 直接 M2 revise。
  const continueCreate = useCallback((entry: GameEntry) => {
    setLibRunner(null);
    const slug = libSlug(entry.id);
    if (!slug) return; // 只有库卡带有「继续创作」（内置卡带走源码）
    if (entry.hasDesign) setContinueChoice({ slug, name: entry.title });
    else setWizard({ mode: 'revise', slug, name: entry.title });
  }, []);

  // 向导 / 设计工作台保存成功 → 关面板、刷卡带架、请求选中新卡带 + 「下一步 → 🏭」引导条（REQ-WORKSHOP C1 导流）。
  const [savedNext, setSavedNext] = useState<{ slug: string } | null>(null);
  const onWizardSaved = useCallback((slug: string) => {
    setWizard(null);
    setDesignStudio(null);
    setSelectSlug(`${LIB_ID_PREFIX}${slug}`);
    setSavedNext({ slug });
    setLibRefresh((k) => k + 1);
  }, []);
  // 轮播跳转完成 → 清 selectSlug（一次性，之后刷架不再强跳）。
  const clearSelect = useCallback(() => setSelectSlug(null), []);

  // 库条目 → 卡带 GameEntry（玩家模式独占轮播；dev 模式追加在内置之后）。
  const libGameEntries = React.useMemo(() => (libEntries ?? []).map(metaToGameEntry), [libEntries]);


  // 打开某盘库卡带（直接携带 entry，不再查另一份状态——缺陷 #1 的修法）。
  const openLibCartridge = useCallback((entry: GameEntry) => {
    const slug = libSlug(entry.id);
    if (slug) setLibRunner({ slug, entry });
  }, []);
  // ?game=lib:<slug> 直启卡带（Workshop ▶ 跳转用）：库列表就绪后消化一次。
  useEffect(() => {
    const want = pendingLibLaunch.current;
    if (!want) return;
    const entry = libGameEntries.find((g) => g.id === want);
    if (entry) { pendingLibLaunch.current = null; openLibCartridge(entry); }
  }, [libGameEntries, openLibCartridge]);


  // 卡带启动分流（默认 LAUNCH 按钮 / 键盘 Enter 走这里）：库卡带 → 运行器；内置 game-* → GameRunner。
  const onLaunchCartridge = useCallback((id: string) => {
    const libEntry = libGameEntries.find((g) => g.id === id);
    if (libEntry) { openLibCartridge(libEntry); return; }
    setLaunched(id);
  }, [libGameEntries, openLibCartridge, setLaunched]);

  // 选中 library 卡带 → 四键操作条（spec ③）；内置卡带 → null（默认 LAUNCH 大按钮）。
  const renderLaunchArea = useCallback((selected: GameEntry): React.ReactNode | null => {
    const slug = libSlug(selected.id);
    if (!slug) return null;
    return (
      <LibActionBar
        entry={selected}
        onStart={() => openLibCartridge(selected)}
        onContinue={() => continueCreate(selected)}
        onHistory={() => setLibHistory({ slug })}
        onBench={() => setLibBench({ slug, title: selected.title })}
        onLedger={() => setArtLedger({ slug, title: selected.title, kind: 'library' })}
        onPipeline={() => setPipeGame({ slug, title: selected.title, kind: 'library' })}
        onExport={() => window.open(`${API}/api/library/${slug}/export`, '_blank')}
      />
    );
  }, [openLibCartridge, continueCreate]);

  const statusLight = providerStatus(providers ?? []);

  if (studio) {
    return <StudioInspector onBack={() => setStudio(false)} />;
  }

  if (artlib) {
    return <AssetLibrary onBack={() => setArtlib(false)} />;
  }

  if (artLedger) {
    return <ArtLedgerPanel slug={artLedger.slug} title={artLedger.title} kind={artLedger.kind} onBack={() => setArtLedger(null)} onChanged={() => setLibRefresh((n) => n + 1)} />;
  }

  if (artPicker) {
    return <ArtGamePicker onBack={() => setArtPicker(false)} onPick={(g) => { setArtPicker(false); setArtLedger(g); }} />;
  }

  if (pipeGame) {
    // S6 进美术平台不清 pipeGame：artLedger 分支在前，台账 ← 返回即回到生产板（返回栈·REQ-WORKSHOP C1 ⑦）。
    return <GamePipelinePanel slug={pipeGame.slug} title={pipeGame.title} onBack={() => setPipeGame(null)} onOpenArt={() => setArtLedger(pipeGame)} />;
  }

  if (pipePicker) {
    return <ArtGamePicker onBack={() => setPipePicker(false)} onPick={(g) => { setPipePicker(false); setPipeGame(g); }} />;
  }

  if (launched) {
    return <GameRunner gameId={launched} onBack={() => { if (fromWorkshop) { backToWorkshop(); return; } setLaunched(null); }} />;
  }

  if (libRunner) {
    return (
      <DataCartridgeRunner
        slug={libRunner.slug}
        entry={libRunner.entry}
        api={API}
        resolveArt={resolveArt}
        onBack={() => { if (fromWorkshop) { backToWorkshop(); return; } setLibRunner(null); }}
      />
    );
  }

  if (bareMode) {
    // 纯运行模式装载页（自诊版·07-11「永远卡住」排障）：明示在等哪条腿；库列表 15s 未就绪=明报不干等。
    const want = pendingLibLaunch.current;
    const bad = (libEntries !== null && want !== null && !libGameEntries.some((g) => g.id === want))
      || (want === null && !launched);  // 既非卡带亦非内置=URL 参数不对
    const waitingList = libEntries === null;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', background: SHELL.appBg, color: SHELL.sub, fontFamily: SHELL.fontUi, fontSize: 14 }}>
        {bad ? (
          <>
            <div>{want === null ? '启动参数不完整（缺游戏标识）' : `卡带不存在或已删除：${want}`}</div>
            <button onClick={backToWorkshop} style={{ padding: '8px 20px', borderRadius: 8, background: SHELL.jadeWash, color: SHELL.jade, border: `1px solid ${SHELL.jadeLine}`, cursor: 'pointer', fontFamily: SHELL.fontUi }}>← 回创作台</button>
          </>
        ) : (
          <>
            <div>🎮 正在装载游戏…</div>
            <div style={{ fontSize: 11, color: SHELL.faint, fontFamily: 'ui-monospace,Menlo,monospace' }}>
              目标 {want ?? '(内置)'} · 库列表{waitingList ? '拉取中（创作服务 :4000）' : `已到 ${libGameEntries.length} 张`}
            </div>
            {waitingList && (
              <BareListRetry onStuck={() => { /* 15s 未就绪由子组件显示明报 */ }} onRetry={() => setLibRefresh((k) => k + 1)} onBack={backToWorkshop} />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: SHELL.appBg, // ZeroCraft Kit 玄铁贴图底（owner 2026-06-25·替原 pageBg 纯渐变）
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '36px 20px',
      fontFamily: SHELL.fontUi,
    }}>
      {/* 顶栏（右上角）：👤 玩家档案 + API 状态灯（M3 可点击→设置面板）。 */}
      <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setProfileOpen(true)}
          title="玩家档案：设主角名字 + 头像（游戏启动时以此身份呈现）"
          aria-label="玩家档案"
          style={{
            padding: '6px 12px', borderRadius: 999, cursor: 'pointer', outline: 'none',
            background: SHELL.violetWash, color: SHELL.violet, border: `1px solid ${SHELL.violetLine}`,
            fontSize: 12, fontWeight: 600, letterSpacing: 0.5, fontFamily: SHELL.fontUi,
          }}
        >
          👤 档案
        </button>
        <StatusLight tone={statusLight.tone} label={statusLight.label} onClick={() => setSettingsOpen(true)} />
      </div>

      {/* Header —— 壳层统一基调（清幽·高雅·秩序）：阔字距铭牌 + 青瓷×黛紫渐变字 + 发丝线分隔 */}
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div style={{ fontSize: 11, letterSpacing: 6, color: SHELL.faint, marginBottom: 8 }}>
          Z E R O C R A F T &nbsp;P R E V I E W
        </div>
        <h1 style={{
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: 2,
          background: `linear-gradient(135deg, ${SHELL.jade}, ${SHELL.violet})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: 0,
        }}>
          {playerMode ? '我的游戏架' : 'Game Library'}
        </h1>
        <div style={{ width: 180, height: 1, background: `linear-gradient(90deg, transparent, ${SHELL.lineStrong}, transparent)`, margin: '14px auto 0' }} />
        {!playerMode && installMsg && <div style={{ marginTop: 8, fontSize: 12, color: installMsg.startsWith('✓') ? SHELL.ok : SHELL.danger }}>{installMsg}</div>}
        {/* dev 工具入口仅开发模式显示（玩家模式=纯净创作台） */}
        {!playerMode && (
          <>
            <button
              onClick={installSample}
              disabled={installing}
              style={{
                marginTop: 14,
                marginRight: 10,
                padding: '7px 18px',
                background: SHELL.jadeWash,
                color: SHELL.jade,
                border: `1px solid ${SHELL.jadeLine}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1,
                cursor: 'pointer',
                outline: 'none',
                opacity: installing ? 0.5 : 1,
              }}
            >
              {installing ? '⏳ 装入中…' : '📦 装入官方示例'}
            </button>
            <button
              onClick={() => setArtPicker(true)}
              style={{
                marginTop: 14,
                padding: '7px 18px',
                background: SHELL.violetWash,
                color: SHELL.violet,
                border: `1px solid ${SHELL.violetLine}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              🎨 美术平台
            </button>
            <button
              onClick={() => setPipePicker(true)}
              title="逐游戏八阶段生产看板：每步机器门（真跑·证据带内容指纹）+人门（review 落账）——治 LLM 长流程漂移"
              style={{
                marginTop: 14,
                marginLeft: 10,
                padding: '7px 18px',
                background: SHELL.violetWash,
                color: SHELL.violet,
                border: `1px solid ${SHELL.violetLine}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              🏭 生产流程
            </button>
            <button
              onClick={() => setArtlib(true)}
              style={{
                marginTop: 14,
                marginLeft: 10,
                padding: '7px 18px',
                background: SHELL.jadeWash,
                color: SHELL.jade,
                border: `1px solid ${SHELL.jadeLine}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              🗃 资源库
            </button>
            <button
              onClick={() => setEntryChoice(true)}
              title="新建游戏（设计先行 / 快速生成）——旧 GameCreator 已退役，两模式同流"
              style={{
                marginTop: 14,
                marginLeft: 10,
                padding: '7px 18px',
                background: SHELL.jadeWash,
                color: SHELL.jade,
                border: `1px solid ${SHELL.jadeLine}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              ＋ 新建游戏
            </button>
            <button
              onClick={() => setStudio(true)}
              title="数据透视器：内置游戏装配/组件/系统逐帧检视"
              style={{
                marginTop: 14,
                marginLeft: 10,
                padding: '7px 18px',
                background: SHELL.violetWash,
                color: SHELL.violet,
                border: `1px solid ${SHELL.violetLine}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              🔬 透视器
            </button>
          </>
        )}
        {/* ⇄ Workshop（对外展示壳·owner 07-10：未来主界面，过渡期两入口互切对比） */}
        <div style={{ marginTop: 10 }}>
          <a
            href={`${API}/workshop/`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, letterSpacing: 1, color: SHELL.faint, textDecoration: 'none' }}
          >
            ⇄ Workshop 工作台（python zerocraft.py workshop）
          </a>
        </div>
      </div>

      {/* Game Carousel —— 玩家模式：库卡带架（空态=欢迎+新建）；dev 模式：内置 + 库卡带追加 */}
      {playerMode ? (
        <LibraryShelf
          entries={libEntries}
          installing={installing}
          onNewGame={() => setEntryChoice(true)}
          onInstallSample={installSample}
          renderCarousel={() => (
            <CartridgeCarousel games={libGameEntries} onLaunch={onLaunchCartridge} renderLaunchArea={renderLaunchArea} selectId={selectSlug ?? undefined} onSelected={clearSelect} />
          )}
        />
      ) : (
        <CartridgeCarousel games={[...VISIBLE_GAMES, ...libGameEntries]} onLaunch={onLaunchCartridge} renderLaunchArea={renderLaunchArea} selectId={selectSlug ?? undefined} onSelected={clearSelect} />
      )}

      {/* 玩家模式·非空架：显式「＋ 新建游戏」入口（空架时 EmptyShelf 已有大卡位·此处不重复） */}
      {playerMode && libEntries && libEntries.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <button
            onClick={() => setEntryChoice(true)}
            style={{
              padding: '10px 24px', borderRadius: 9,
              background: SHELL.jadeWash, color: SHELL.jade,
              border: `1px solid ${SHELL.jadeLine}`,
              fontSize: 14, fontWeight: 600, letterSpacing: 0.5,
              cursor: 'pointer', outline: 'none', fontFamily: SHELL.fontUi,
            }}
          >
            ＋ 新建游戏
          </button>
        </div>
      )}

      {/* 保存成功引导条（REQ-WORKSHOP C1 ⑦ 导流）：入库后给「下一步 → 🏭 生产板」一条明路。 */}
      {savedNext && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginTop: 16,
          padding: '10px 18px', borderRadius: 9,
          background: SHELL.jadeWash, border: `1px solid ${SHELL.jadeLine}`,
          color: SHELL.jade, fontSize: 13, fontFamily: SHELL.fontUi,
        }}>
          <span>✓ 已入库 <b>{libGameEntries.find((g) => libSlug(g.id) === savedNext.slug)?.title ?? savedNext.slug}</b></span>
          <button
            onClick={() => {
              const title = libGameEntries.find((g) => libSlug(g.id) === savedNext.slug)?.title ?? savedNext.slug;
              setSavedNext(null);
              setPipeGame({ slug: savedNext.slug, title, kind: 'library' });
            }}
            style={{
              padding: '5px 14px', borderRadius: 7, cursor: 'pointer', outline: 'none',
              background: SHELL.violetWash, color: SHELL.violet, border: `1px solid ${SHELL.violetLine}`,
              fontSize: 12, fontWeight: 600, fontFamily: SHELL.fontUi,
            }}
          >
            下一步 → 🏭 生产板（八关走查）
          </button>
          <button
            onClick={() => setSavedNext(null)}
            aria-label="关闭引导"
            style={{ background: 'none', border: 'none', color: SHELL.dim, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* 版本历史浮层（架上操作条 ⟲ 打开；回滚成功 → 刷新库列表） */}
      {libHistory && (
        <VersionHistoryOverlay
          api={API}
          slug={libHistory.slug}
          onClose={() => setLibHistory(null)}
          onRolledBack={() => setLibRefresh((k) => k + 1)}
        />
      )}

      {/* 体检浮层（M4·架上操作条 🩺 打开）：五轴分 + 总分 + 及格线 70。 */}
      {libBench && (
        <BenchOverlay
          api={API}
          slug={libBench.slug}
          title={libBench.title}
          onClose={() => setLibBench(null)}
        />
      )}

      {/* 设置面板（M3·状态灯点开）：BYO key + model + 测试连接。保存后重拉 providers 更新状态灯。 */}
      {settingsOpen && (
        <SettingsPanel
          api={API}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setProvidersRefresh((k) => k + 1)}
        />
      )}

      {/* 玩家档案卡（REQ-C-104·👤 点开）：名字 + 预设头像 → localStorage，游戏侧只读 getPlayerProfile 消费。 */}
      {profileOpen && (
        <ProfileCard onClose={() => setProfileOpen(false)} />
      )}

      {/* 新建入口双选卡（🗣 设计一个游戏 推荐 / ⚡ 快速生成）。 */}
      {entryChoice && (
        <EntryChoice
          onDesign={() => { setEntryChoice(false); setDesignStudio({}); }}
          onQuick={() => { setEntryChoice(false); setWizard({ mode: 'create' }); }}
          onClose={() => setEntryChoice(false)}
        />
      )}

      {/* 继续创作双选（已有 design 的卡带）：改设计 / 快改数值(M2 revise)。 */}
      {continueChoice && (
        <ContinueChoice
          name={continueChoice.name}
          onEditDesign={() => { const c = continueChoice; setContinueChoice(null); setDesignStudio({ slug: c.slug, name: c.name }); }}
          onQuickRevise={() => { const c = continueChoice; setContinueChoice(null); setWizard({ mode: 'revise', slug: c.slug, name: c.name }); }}
          onClose={() => setContinueChoice(null)}
        />
      )}

      {/* 设计工作台（设计先行流主件·全屏）：讨论 → 分解 → 对齐 → 定稿 → 原型。保存 → 刷架 + 选中新卡带。 */}
      {designStudio && (
        <DesignStudio
          api={API}
          providers={providers ?? []}
          catalog={catalog}
          resolveArt={resolveArt}
          initialSlug={designStudio.slug}
          initialName={designStudio.name}
          onClose={() => setDesignStudio(null)}
          onSaved={onWizardSaved}
          onDirty={() => setLibRefresh((k) => k + 1)}
        />
      )}

      {/* M2 创作向导（右滑面板·玩家模式·⚡ 快速模式）：新建 create / 继续创作 revise。保存 → 刷架 + 选中新卡带。 */}
      {wizard && (
        <CreationWizard
          api={API}
          mode={wizard.mode}
          slug={wizard.slug}
          initialName={wizard.name}
          providers={providers ?? []}
          catalog={catalog}
          resolveArt={resolveArt}
          onClose={() => setWizard(null)}
          onSaved={onWizardSaved}
        />
      )}

      {/* Dev Tools —— 玩家模式隐藏 */}
      {!playerMode && (
      <div style={{ width: '100%', maxWidth: 880 }}>
        <DevTools />
      </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 'auto',
        paddingTop: 32,
        textAlign: 'center',
        color: SHELL.faint,
        fontSize: 11,
        letterSpacing: 2,
      }}>
        {/* 口径铁律：页脚不手抄数字/版本号（机读真相见 docs/llm-onboarding.md §0） */}
        ZeroCraft Preview · 数据驱动 · Deterministic Lockstep
      </div>
    </div>
  );
}


// ══════════════════════════════════════
//  Mount
// ══════════════════════════════════════

// #app 存在才挂载（index.html 恒有）；无 #app（如无头集成测试 import 本模块）→ 零副作用，
// 让测试能渲染导出的 <Launcher /> 走真实接线（返修 Lead 要求的 launcher 层集成测试的前提）。
const appEl = document.getElementById('app');
if (appEl) createRoot(appEl).render(<Launcher />);

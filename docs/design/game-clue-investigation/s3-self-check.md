# S3 骨架关施工自检

日期：2026-10-12  
范围：仅 S3；不包含 S4 玩法闭环、LayoutNode UI、美术、音频或 DokiWorld dist。

## 产物

- `library/game-clue-investigation/manifest.json`：schema 1 纯 JSON manifest；显式声明 8 个既有 capability，建立 1440×900 场景骨架、七个稳定调查对象、必要线索计数、对象查看/收录 Flag 与离散流程状态表。
- `library/game-clue-investigation/meta.json`：卡带自动发现所需的展示元数据。
- `games/game-clue-investigation/s3-skeleton.test.ts`：S3 定向机器自检；测试不是运行时解释器，游戏规则仍为纯数据。

本关刻意没有接入 `Sprite`、`hitMaskKey`、宿主 URL 或像素字节。S2 已交付的动态 PNG/mask 桥将在后续宿主装配阶段把验证后的临时 key 投影进 World；S3 不用未登记占位资产制造“引用已闭合”的假象。当前 AABB Shape 只承担灰盒骨架，测试明确禁止把它冒称为 S4 最终热点。

## 机器实证

### Manifest 真门

命令：

```powershell
cmd /c "npx vite-node scripts/manifest-check.mjs < library\game-clue-investigation\manifest.json"
```

结果：退出码 `0`。

```json
{"ok":true,"inferredCapabilities":false,"capabilities":["a1-transform","c1-shape","l2-color","i1-input-capture","f1-resource","f2-flag","t2-clickable","t3-flow"],"warnings":[]}
```

该权威脚本已真实执行 `parseManifestDetailed → Engine.load → world.tick() × 2`。

### 定向测试

命令：

```powershell
npx vitest run games/game-clue-investigation/s3-skeleton.test.ts --reporter=verbose
```

结果：退出码 `0`；`1` 个测试文件、`4/4` 测试通过。覆盖：

1. 严格解析与引用告警归零；
2. 真引擎 load + 空跑 2 tick；
3. 七对象与 `required-collected=0 / required-total=2 / scene-idle` 骨架；
4. 两次独立装载的 2 tick hash 一致。

### 静态卫生

- `npx eslint games/game-clue-investigation/s3-skeleton.test.ts --max-warnings 0`：退出码 `0`。
- `node scripts/docs-ref-guard.mjs`：退出码 `0`，`DOCS-REF: PASS`。
- 对 `manifest.json` 与 `meta.json` 执行原生 `JSON.parse`：退出码 `0`，`JSON: PASS`。

### 能力审计

命令：

```powershell
node scripts/game-skill-audit.mjs game-clue-investigation
```

结果：退出码 `0`，`RATCHET: PASS`，未覆盖红旗为零。扫描器报告“零能力接入/无美术台账”黄色：前者是因为它只统计 `games/**` TypeScript capability import，未读取 `library/**/manifest.json` 的 8 个显式 capability；后者属于 S6 美术阶段。本关不通过添加游戏层 TypeScript 或提前创建美术台账来消除黄色。

## 告警处理

- 首轮同时声明 `j1-state` 与 `t3-flow` 时，系统图输出 `flow ↔ state-sync` 组件推断环告警；虽退出码为 0，但语义未被保证。S3 无需双份状态，因此删除冗余 `State` 投影与 `j1-state`，复跑后 stderr 安静、`warnings:[]`。
- 沙箱内 `vite-node` / Vitest 首次因 Windows `realpath EPERM` 未启动；在获批的沙箱外短生命周期进程复跑后得到上述真实结果。未启动任何应用服务。

## 结论

**S3 施工自检 PASS，可送非施工者独立复查。**

本结论仅覆盖 S3“manifest 可解析、引用闭合、真引擎装载与空跑 2 tick、确定性”的机器范围；不宣称 S4 可玩、视觉对齐或 Owner 人门通过。

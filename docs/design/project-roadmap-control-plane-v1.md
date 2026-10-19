# 项目路线图控制台 v1

> 状态：owner 已选择方案 B（独立于逐游戏 S1--S8 pipeline 的项目级控制台）。
> 目标：用一份小型、可审计的 JSON 记录一个项目跨引擎、内容、素材、生成、发布的推进；它不替代游戏生产流水线、需求池或 Git 记录。

## 1. 边界与判断

**接受。** 现有 `GamePipelinePanel` 的 S1--S8 是“一个游戏生产包”的阶段证据，`docs/workflow/requests.md` 是有限槽位的引擎需求池；两者都不适合承担“模拟经营引擎这一长期项目”的全局目标、依赖与 owner 决策。把项目路线图另立为轻量数据对象，能避免把状态散落在聊天和文档里。

本版本刻意不做排期、工时、用户帐号、多人协作或数据库。控制台是本地项目文件的可视化和受约束编辑器，不是 Jira 替代品。

## 2. 单一真相与文件位置

每个项目使用一份：

```text
docs/projects/<project-id>/project-roadmap.json
```

`project-id` 使用小写 kebab-case；初始化只在文件不存在时创建，绝不覆盖已有路线图。项目创建入口成功返回项目标识后必须调用同一初始化器。已有项目可由控制台“注册已有项目”显式初始化，禁止扫描目录后静默生成。

项目路线图只引用既有设计、测试、截图、工单和产物；它不复制其内容。游戏专属 S1--S8 仍由原 `game-pipeline` 负责，路线图可把“首个可试玩 Little Valley”作为一条里程碑并链接其证据。

## 3. `zerocraft.project-roadmap.v1` 数据契约

```json
{
  "schemaVersion": "zerocraft.project-roadmap.v1",
  "project": {
    "id": "simlife-engine",
    "title": "模拟经营游戏引擎",
    "summary": "……",
    "status": "active"
  },
  "milestones": [
    {
      "id": "life-host-playable",
      "title": "首个可试玩 Life Host",
      "track": "试玩",
      "description": "……",
      "status": "review",
      "dependsOn": ["world-contract"],
      "acceptance": ["键盘可移动", "完成一条农作流程"],
      "evidence": [
        { "kind": "document", "ref": "docs/design/game-simlife/…", "label": "设计" },
        { "kind": "test", "ref": "src/…test.ts", "label": "回归测试" }
      ],
      "gates": {
        "selfCheck": "pass",
        "review": "pending",
        "owner": "required"
      }
    }
  ]
}
```

字段约束：

- 根字段、`project`、`milestones` 为闭集；未知字段、重复 id、空字符串、无效路径和自依赖均拒绝。
- `project.status`：`active | blocked | archived`；里程碑 `status`：`planned | active | blocked | review | done`。
- `track` 是由项目自由命名的非空标签；`dependsOn` 是同文件里程碑 id，依赖图必须无环。
- `evidence.kind`：`document | test | artifact | review | issue`；`ref` 为仓内相对路径或受限 URL，展示时按普通文本处理，禁止执行。
- `gates.selfCheck` 与 `gates.review`：`pending | pass | fail`；`gates.owner`：`not-required | pending | approved | changes-requested | required`。`not-required` 是自动闭环项；其余值均表示 owner 人门。`required` 是初始化/编辑时的声明态，进入 `review` 后在 UI 中显示为“待 owner 决策”。
- `done` 的合法前提：所有依赖 `done`、至少一条 evidence、`selfCheck=pass`、`review=pass`，且 owner 为 `not-required` 或 `approved`。否则校验器拒绝写入。

## 4. 推进规则（给人和 agent 共用）

控制台提供一个纯函数计算 `nextActionable`：状态为 `planned` 或 `active`，且所有依赖已 `done` 的项。owner gate 是终审门，不阻断 agent 在进入 `review` 前的施工或返修：即使 owner 为 `required` 或 `changes-requested`，满足上述条件的项仍是候选；`review` 与 `done` 永远不是候选。排序按 JSON 中的声明顺序，绝不依赖墙钟。

agent 的自动行为只能是：

1. 项目任务开始时读取路线图，并从 `nextActionable` 选择已指派/与当前任务相符的项；
2. 有实际产物后追加 evidence，并把 `active` 推到 `review`；
3. 自检失败时标为 `blocked` 或保留 `active` 并写明失败证据；
4. 对 `owner=not-required` 的自动闭环项，在独立复查 `pass`、自检 `pass`、证据和依赖均齐备后，服务端会在一次合法保存中将 `review` 自动收束为 `done`；agent 不能直接提交 `done`。
5. 对 owner 人门，绝不代替 owner 设置 `owner=approved`，也不跳过 review 把项写成 `done`。

Owner 可在控制台创建、编辑、排序、解除阻塞、批准/退回里程碑。owner 人门的“通过”必须由专用服务端操作原子地校验依赖、证据、自检和独立复查，并同时写入 `approved + done`；“退回”写入 `changes-requested + active`。任何编辑先经 schema 校验，写入采用临时文件加原子替换；失败保留旧文件。

在 `AGENTS.md` 加一条简短总则：涉及已注册项目的实现、规划、验收或派工前读取该项目路线图；更新必须遵循上述 gate，不能把“agent 已写代码”视为 owner 通过。新增 `.agents/skills/project-roadmap/SKILL.md`，让被明确要求“创建/推进/查看项目路线图”的 agent 获得同一流程；它不得改变游戏的 S1--S8 人门。

## 5. 5173 控制台体验

放在既有 ZeroCraft Launcher/Studio 壳中，提供顶级入口“项目控制台”。不要修改 `src/ui/**` 基座；复用 Studio 的产品壳和主题令牌。

页面至少有：

1. 项目列表：标题、项目状态、完成/总数、下一项；
2. 项目详情：按 `track` 分组的里程碑列表，状态、依赖、门禁、证据链接、下一步原因；
3. 轻量编辑：新建/编辑里程碑、状态和依赖、追加证据、owner 通过/退回；保存失败显示具体 schema 诊断，绝不静默吞掉；
4. 空态：说明“注册已有项目”会新建空 JSON，已有项目不会被覆盖。

初版不要求拖拽看板；声明顺序即展示顺序，先确保推进逻辑可用和信息可读。

## 6. 服务与初始化

在 `main_entry` 建立单一 `project_roadmap` 存储/校验模块与安全 API，不让 React 直接拼文件路径：

- `GET /api/projects`：读取已注册路线图摘要；
- `POST /api/projects`：显式注册新项目，校验 id，文件不存在才初始化；
- `GET /api/projects/<id>/roadmap`：读取完整路线图；
- `PUT /api/projects/<id>/roadmap`：全量替换，先解析并校验转移合法性后原子写入；
- `POST /api/projects/<id>/roadmap/owner-decision`：owner 人门的 `approve | return` 原子终审；
- 所有 id/path traversal、无效 JSON、重复 id、依赖环和非法 `done` 均返回结构化诊断且不写文件。

把已有“新建项目”的成功路径接入 idempotent initializer；若该入口只创建普通 library cartridge，初始化的项目 id 与 cartridge slug 一致。不得将模拟经营 Life 的物化路径错误复用到 library 入口。

## 7. 验收与非目标

必须覆盖：契约解析、依赖环、非法状态转移、`done` 门禁、nextActionable、初始化不覆盖、API 路径安全和页面空态/成功态/校验错误态。测试不得启动开发服务、不得写数据库；若需要 HTTP 覆盖，使用临时目录的测试服务器/现有测试夹具。

本版本完成后，由 Lead 在同一控制台登记 `simlife-engine` 为首个项目，初始里程碑依据已存在的 simlife 设计/测试/资产流水线实际状态填写；不把未验收事项伪标为 done。

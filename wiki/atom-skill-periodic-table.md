# ZeroCraft Preview — 原子 Skill 清单 v6 (游戏元素周期表)

> ⚠ **历史文档（口径已过期）**：原子数/能力数/游戏清单/测试数以机读真相为准（`docs/llm-onboarding.md` §0）。本文仅存考古价值，新 session/新 LLM 勿以此为教材。
> **原子/能力的机读清单 = `src/assembly/capability-registry.gen.ts`**（生成物·每能力一行 id + provides·`npm run gen:registry` 重生成）；本表没有的 controllable / overlap-detect-3d / navmesh-bake / collision-resolve-3d 以它为准。底层缺什么的评审见 `docs/design/engine-base-tier-review-2026-09-06.md`。

> **判定标准：能用其他原子的组合描述 → 不是原子。每个原子回答一个且仅一个问题。**
>
> v6 变更：四引擎交叉验证（Bevy / Unity DOTS / Godot / Phaser）。
> 新增 L6 text（3/4 引擎验证为核心渲染原语）和 W2 spatial-query（所有引擎提供的世界级服务）。
> 确认 tilemap 为资产格式、pathfinding 为算法服务、CCD 为 D1 系统增强——均不加入原子表。
>
> 交叉验证详见 `wiki/v6-cross-engine-validation.md`
>
> 审核状态: v6 待审核

---

## 核心原子表 (24 实体级 + 2 世界级 = 26)

### 空间与层级 — "它在哪？它朝哪？多大？谁是它的父节点？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| A1 | **transform** | `Transform { x, y, rotation, scaleX, scaleY }` | 实体在世界的位置、朝向和大小？ |
| A2 | **hierarchy** | `Hierarchy { parentId, localX, localY, localRotation, localScaleX, localScaleY }` | 实体挂在谁下面？本地偏移多少？ |

> transform 回归单一组件——绝大多数实体需要完整空间状态，拆分带来的 query 开销不值得。纯位置需求（触发器等）只填 x/y，rotation 和 scale 使用默认值。
> hierarchy 从 relation 独立——空间继承是高频操作，localOffset 数据使父子变换计算零额外 query。

### 运动 — "它怎么动？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| B1 | **velocity** | `Velocity { vx, vy, angular }` | 实体当前的运动方向、速度和角速度？ |
| B2 | **acceleration** | `Acceleration { ax, ay }` | 实体的速度在怎么变？ |
| B3 | **mass** | `Mass { value }` | 实体有多重？（0=不可移动） |

> velocity.angular——旋转速度是独立自由度（旋转飞行物、自旋特效）。
> mass 不是 resource 的特化——无 current/max 结构，参与碰撞响应的计算方式完全不同。

### 形状 — "它占多大地方？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| C1 | **shape** | `Shape { kind: 'box'｜'circle', width?, height?, radius? }` | 实体的碰撞/占位几何形状？ |

> 基础几何体用 kind 区分。如未来需要多边形，另加 shape-complex 原子，不膨胀此原子。

### 碰撞 — "它碰到了什么？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| D1 | **overlap-detect** | `Overlap { entityA, entityB, normalX, normalY, depth }` | 哪两个实体重叠了？法线和穿透深度？ |

> 纯检测，纯事实。响应（推开、弹性、触发）全部是消费者，归组合层。

### 时间 — "过了多久？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| E1 | **timer** | `Timer { id, elapsed, duration, loop }`, `TimerDone { timerId }` | 倒计时/间隔走到哪了？到了吗？ |

### 数值 — "它有多少？开还是关？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| F1 | **resource** | `Resource { id, current, min, max }`, `ResourceModify { resourceId, amount }` | 某种有上下限的数值？ |
| F2 | **flag** | `Flag { id, active }` | 某个条件开还是关？ |

> counter 不再是原子——它是 resource 在 Tier 1 的涌现形态：`Resource { id, min: -Infinity, max: Infinity }` 即为无上限累加值。
> 或在 Tier 1 定义 counter 宏：`counter = resource(min=-∞, max=+∞)`，语义等价但不占原子位。
> resource.min——允许非零下限（温度不低于 -50），使 resource 足够通用以覆盖 counter 场景。

### 标识 — "它是谁？跟谁有关？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| G1 | **tag** | `Tag { flags: Bitmask }` | 实体属于哪些分类？ |
| G2 | **relation** | `Relation { kind, targetId }` | 实体跟谁有什么逻辑关系？（targeting、owned-by） |
| G3 | **owner**（2026-09-08 补） | `Owner { ownerId, team }` | 它属于谁？站哪边？ |
| G4 | **group**（2026-09-08 补） | `Group { id, members[], capacity? }` | 它装着哪些实体？什么顺序？最多几个？ |

> tag 用 Bitmask——60Hz 下位运算 O(1)。
> relation 只处理非空间逻辑关联，空间父子由 hierarchy(A2) 承担。

### 控制 — "它是否参与世界？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| H1 | **visibility** | `Visibility { visible, active }` | 实体是否可见？是否参与系统运算？ |

> visible 控制渲染跳过，active 控制逻辑跳过。
> 不能用 flag 替代——flag 是游戏逻辑层面的开关，visibility 是引擎基础设施层面的开关。

### 输入 — "外部说了什么？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| I1 | **input-capture** | `RawInput { source, key?, x?, y?, phase? }` | 这帧有什么外部原始信号？ |
| I2 | **action-map** | `Action { name, value }` | 原始信号对应什么语义动作？ |

### 状态 — "它处于什么模式？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| J1 | **state** | `State { fsmId, current, previous }`, `StateChanged { fsmId, from, to }` | 实体在某个状态机的当前离散状态？ |

> fsmId 支持多状态机并存——同一实体可有行为状态(idle/attack)和动画状态(walk/jump)。

### 生命周期 — "它存在吗？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| K1 | **spawn** | `SpawnRequest { templateId, x, y }` | 需要创建一个新实体。 |
| K2 | **destroy** | `DestroyRequest { entityId }` | 需要移除一个实体。 |

### 感知 — "玩家看到/听到什么？"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| L1 | **sprite** | `Sprite { textureKey, anchorX, anchorY, zOrder }` | 实体用什么图？渲染层级？ |
| L2 | **color** | `Color { tint, alpha }` | 实体当前的颜色/透明度？ |
| L3 | **frame** | `Frame { index, total }` | 精灵的当前帧？ |
| L4 | **sound** | `Sound { clipId, volume, loop }` | 播放什么声音？ |
| L5 | **camera** | `Camera { zoom, offsetX, offsetY, rotation, viewportW, viewportH }` | 观察窗口参数？世界到屏幕的映射基准？ |
| L6 | **text** | `Text { content, fontSize, fontFamily, anchor, lineSpacing }` | 显示什么文字？ |

> sprite.zOrder——2D 渲染排序是基础需求。
> camera 增加 offsetX/Y + rotation——摄像机震动、平移、旋转效果的数据来源。
> camera 实体同时挂 Transform 组件确定世界位置，Camera 组件只描述投影参数。
> text 是独立渲染原语——Bevy(Text2d)、Godot(Label)、Phaser(Text) 均为一等公民。伤害飘字、对话气泡、UI 文本不可或缺。不是 Sprite 的特化（渲染管线不同）。

### 世界级 — "世界本身的属性"

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| W1 | **random** | `RandomSeed { seed, sequence }` | 可控随机数。确定性重放的基石。 |
| W2 | **spatial-query** | `SpatialIndex { cellSize, type: 'grid'｜'quadtree' }` | 空间查询服务：射线、范围、最近邻。 |

> random / spatial-query 不是实体级组件，而是世界级服务。挂在特殊的"world"实体上，所有系统可读。
> spatial-query 回答"A 到 B 之间有什么？离我最近的 N 个是谁？"——overlap-detect 无法回答的问题。
> Unity DOTS 通过 PhysicsWorldSingleton 服务调用实现，Godot 通过 RayCast2D 节点实现。AI 视线、自动索敌不可或缺。

---

## 核心原子总数：26 (24 实体级 + 2 世界级)

```
空间/层级: A1 transform      A2 hierarchy
运动:      B1 velocity       B2 acceleration  B3 mass
形状:      C1 shape
碰撞:      D1 overlap-detect
时间:      E1 timer
数值:      F1 resource       F2 flag
标识:      G1 tag            G2 relation
控制:      H1 visibility
输入:      I1 input-capture  I2 action-map
状态:      J1 state
生命周期:  K1 spawn          K2 destroy
感知:      L1 sprite  L2 color  L3 frame  L4 sound  L5 camera  L6 text
世界级:    W1 random  W2 spatial-query
```

---

## 扩展原子 (可选，按需引入)

### 扩展 A: 骨骼动画

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| X1 | **skeletal-pose** | `SkeletalPose { skeletonAssetId, boneTransforms }` | 当前帧骨骼姿态快照（纯数据，不含时间轴） |

> 原子性成立——无法由 frame + sprite 组合。动画播放逻辑在 System 层驱动此快照更新。
> 2D 小游戏通常不需要，3D 或 Spine 动画项目引入。

### 扩展 B: 叙事

| # | Atom | Component | 回答的问题 |
|---|------|-----------|-----------|
| X2 | **socket** | `Socket { boneId, offsetTransform, acceptTags: Bitmask }` | 纸娃娃/精准挂载的拓扑锚点 |
| X3 | **string-variable** | `StringVariable { keyId, value, locId }` | 非数值的语义数据（对话文本、角色名、LLM prompt 片段） |

> 换装/女性向/对话系统刚需。核心原子表只有 number 和 boolean 容器，缺少 string 容器。

### 扩展 C: AIGP 旁路

> AI 视频生成专用层。游离于 60Hz 核心 ECS 之外，通过 Camera 层 Adapter 异步劫持。
> 不污染核心原子表，详见独立设计文档。

| # | Component | 用途 |
|---|-----------|------|
| X4 | `ShadowDictionary { condition → promptFragment }` | ECS 状态到 Prompt 的翻译表 |
| X5 | `SemanticMaterial { basePrompt, dynamicModifiers, negativePrompt }` | 取代 Texture 的"高维语义外衣" |
| X6 | `ConditioningMask { maskType, intensity }` | Shape/SkeletalPose → ControlNet 空间约束 |
| X7 | `LatentAnchor { seed, referenceEmbeddingId }` | 角色特征锚点，防止帧间"换脸" |

---

## UI 层处理

UI **不是原子**。通过 **ui-binding 机制** 处理（属于 Tier 2 组合层）：

```
ui-binding = resource/flag + 渲染层 React 组件

实体不知道自己的 HP 会被显示为血条——
它只有 resource(id='hp', current=50, min=0, max=100)。
UI 层通过 binding 声明读取这个 resource 并投影为 Bar/Text/任意 UI。
```

---

## 涌现分层 (按数据流方向定义)

### Tier 1 — 直接结算 (Kinematic)

无状态的数值应用。A 写了 X，B 读 X 算出 Y，完毕。

| 组合 | 公式 | 数据流 |
|------|------|--------|
| counter | resource(min=-∞, max=+∞) | resource 的无上限特化 |
| motion-apply | transform.xy += velocity | velocity → transform |
| rotation-apply | transform.rotation += velocity.angular | velocity.angular → transform |
| accel-apply | velocity += acceleration | acceleration → velocity |
| animation | frame.index++ per timer | timer → frame |
| lifetime | timer done → destroy | timer → destroy |
| hierarchy-resolve | hierarchy.local + parent.transform → child.transform | hierarchy + transform → transform |

### Tier 2 — 规则与约束 (Resolution)

涉及条件判断或状态修改。需要读检测结果后决定怎么做。

| 组合 | 公式 | 数据流 |
|------|------|--------|
| collision-separate | overlap → 按 mass 比推开 transform | overlap + mass → transform |
| collision-bounce | overlap → 按 mass 反转 velocity | overlap + mass → velocity |
| grounded-check | overlap + tag(ground) → flag(grounded) | overlap + tag → flag |
| trigger-zone | overlap + tag(trigger) → event | overlap + tag → flag/event |
| cooldown | timer → flag(ready) | timer → flag |
| resource-regen | timer → resource.current++ | timer → resource |
| ui-binding | resource → React overlay | resource → UI (非 ECS) |
| gravity | mass → acceleration.ay | mass → acceleration |
| friction | velocity → acceleration(反向) | velocity → acceleration |
| damage-number | resource-modify → spawn + text + velocity(上飘) + lifetime | resource + text + spawn |
| range-detect | spatial-query(radius) → relation(target) | spatial-query → relation |

### Tier 3 — 系统级玩法 (Mechanics)

跨实体的复合逻辑。多个 Tier 2 串联成完整的游戏机制。

| 组合 | 来源 |
|------|------|
| health-system | resource(hp) + resource-modify + ui-binding |
| shield-absorb | resource(shield) + resource-modify 拦截链 |
| poison-dot | timer + resource-modify(周期) |
| invincible-frame | timer + flag(block damage) |
| knockback | timer + velocity(覆写) |
| pickup-item | trigger-zone + destroy + resource-modify |
| platformer-jump | action-map + flag(grounded) + velocity |
| projectile | spawn + velocity + lifetime + overlap-detect + destroy |
| auto-target | spatial-query(nearest) + tag(enemy) + relation(target) |
| dialog-popup | trigger-zone + text + state(dialog) |

### Tier 4 — 心智与黑盒 (Behaviors)

包含状态机或决策逻辑。对 LLM 来说是"一句话能描述的行为"。

| 组合 | 来源 |
|------|------|
| ai-patrol | state + timer + velocity(方向切换) |
| ai-chase | state + spatial-query(nearest) + relation(target) + transform + velocity |
| ai-attack-pattern | state + timer(cooldown) + spawn(弹幕) |
| dialogue | trigger-zone + state + input + string-variable |
| anim-state-machine | state + transition-rules + animation |

---

## Macro 机制

> "Claude 面对 Tier 4 时，是用预制件还是每次从原子推演？"

**答案：Macro 层——预编译的 Tier 2/3 组合，供 AI 快速调用。**

```
核心原子 (26)        ← 不可变的基础真理
扩展原子 (7)         ← 按需引入
  ↓
Macro Library        ← 预编译的 Tier 2/3 "积木块"
  ├─ physics-body    = transform + velocity + acceleration + mass + shape
  ├─ health-system   = resource(hp) + resource-modify + ui-binding
  ├─ platformer-move = input → action → velocity + gravity + grounded
  ├─ projectile      = spawn + velocity + lifetime + overlap + destroy
  ├─ counter         = resource(min=-∞, max=+∞)
  └─ ...
  ↓
Tier 4 行为          ← Claude 用 Macro 组装，不回到原子
  ↓
Assembly 蓝图        ← 最终游戏
```

---

## 涌现验证

| 游戏类型 | 使用的核心原子 (26个中) |
|---------|----------------------|
| **平台跳跃** | transform, hierarchy, velocity, acceleration, mass, shape, overlap-detect, timer, resource, flag, tag, input-capture, action-map, state, spawn, destroy, sprite, color, frame, sound, camera, text (22/26) |
| **弹幕射击** | transform, velocity, acceleration, shape, overlap-detect, timer, resource, flag, tag, input-capture, action-map, spawn, destroy, sprite, frame, sound, camera, text, random, spatial-query (20/26) |
| **回合制 RPG** | transform, hierarchy, resource, flag, tag, relation, input-capture, action-map, state, sprite, color, frame, sound, camera, timer, text, random (17/26) |
| **换装/女性向** | transform, hierarchy, resource, flag, tag, relation, input-capture, action-map, state, sprite, color, frame, sound, camera, text + **扩展: socket, string-variable** (15+2/26+7) |
| **AI 视频生成** | transform, state, timer, camera, random + **扩展: skeletal-pose, shadow-dictionary, semantic-material, conditioning-mask, latent-anchor** (5+5/26+7) |

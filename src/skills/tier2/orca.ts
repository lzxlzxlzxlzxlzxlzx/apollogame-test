/*
 * ORCA（Optimal Reciprocal Collision Avoidance）—— **移植自 RVO2 Library**。
 *
 * SPDX-FileCopyrightText: 2008 University of North Carolina at Chapel Hill
 * SPDX-License-Identifier: Apache-2.0
 *
 * 原作者：Jur van den Berg, Stephen J. Guy, Jamie Snape, Ming C. Lin, Dinesh Manocha
 * 原始出处：<https://gamma.cs.unc.edu/RVO2/> · 源码 <https://github.com/snape/RVO2>（`src/Agent.cc`）
 * 按 Apache-2.0 第 4 条要求声明**本文件是修改过的版本**，修改点见下方「与原码的差异」。
 *
 * ══ 为什么要它（owner 2026-08-24 拍板「可以上」）══
 * 软分离（Reynolds 那层）是**软承诺**：允许瞬时重叠，靠力把人弹开。ORCA 给的强得多：
 * 每个单位解一个二维线性规划，在"所有邻居都同样讲道理"的假设下取**最接近期望速度的可行速度**。
 *
 * ⚠ **别把它说成「timeHorizon 拍内保证不碰」**（首版文档就是这么写的，独立复查实测打掉）：
 * 那句话的前提是**线性规划有可行解**。人一多、迎面对撞时它经常没有——落到 `linearProgram3`
 * 的「最不违反」就是**真的压进去**。实测（5v5 迎面对穿·半径和 0.70·把整队起始位置沿 y 扫一族）：
 *   纯流场 0.047~0.100（直接对穿） · 软分离 0.061~0.128 · **ORCA 0.644~0.701**
 * 也就是说 ORCA 把穿模从「~90%」压到「最坏 8%」，**但不是 0**，且最坏点出现在**中场对撞**
 * （不是已知的终点拥挤）。准确的口径是：**逐拍重解的速度层约束 + 无解时取最不违反**——
 * 强，但不是保证。无解的次数会记进 DebugTrace 的「无可行解 N」。
 *
 * ⚠ **那 8% 不是"物理下限"，是当前 `ORCA_TIME_HORIZON = 8` 下的值**（三复查纠正我上一版的
 * "固有边界"结论——我当时写「16/24 与 8 逐位相同」，复查复现不出来，我自己重跑也复现不出来）。
 * 同场景实扫（中场最差 / 终点最差）：
 *   H8 0.644 / 0.700 · H12 0.651 / **0.318** · H16 **0.692** / 0.700 · H20 0.686 / **0.169** · H24 0.682 / 0.632
 * 即：**非单调，而且为中场调大它会把终点段调塌**。缺省取 8 = 两段都不塌的保守点；
 * 真要调 → 在你自己的场景上**中场与终点一起量**（交 Demo 拿观感定，别在源码里拍脑袋）。
 * 三者不是一回事，也不互相替代：
 *   · 流场   → 期望速度 prefVelocity（**走位仍由流场定·owner 红线不变**）
 *   · ORCA   → 把期望速度改成「尽量不会撞」的那个（改动量最小）
 *   · 软分离 → 另一种更便宜、更"涌流"的选择（不保证不碰）
 * RVO2 官方示例里 prefVelocity 就是「朝目标的方向 × 速度」——与我们把流场方向喂进去完全同形。
 *
 * ══ 与原码的差异（逐条·Apache-2.0 要求标注修改）══
 * ① **不含障碍物（Obstacle）那半段**：原码前半截构造多边形障碍的 ORCA 线；本仓的静态障碍
 *    已经由流场的 `blocked` 格解决（单位根本不会被引向墙里），故 `numObstLines = 0`。
 * ② **不含 KdTree**：邻居由流场自带的网格分桶提供（同一张网格·见 flow-field.ts），
 *    但**保留原码的邻居选取语义**：按距离平方升序取最近的 `maxNeighbors` 个。
 * ③ C++ 的 `float`(32 位) → JS `number`(64 位双精度)。算法与运算顺序逐行照原样，
 *    精度更高；本仓的确定性要求是"同输入同输出"，不是"与 C++ 逐位相同"。
 * ④ 结构上把 `Agent` 类拆成纯函数（本仓 sim 层不放可变对象·便于点名测试与确定性对账）。
 * ⑤ **邻域半径不是独立参数**：原码 `neighborDist` 与 `timeHorizon` 各填各的（官方示例 15 对 10）；
 *    本仓由 `timeHorizon × speed × ORCA_RANGE_SLACK + radius` 推导（见 flow-field.ts）。
 *    独立复查实测过一个漏网场景：迎面高速接近的邻居 4.15 拍后必撞，却因为在 9.0 之外被挡在门外。
 *    **试过按相对速度加倍余量，实测更糟**（密集对撞从最近 0.70004 压到 0.5423 = 过约束 → LP 无可行解 → LP3）；
 *    故保持不加倍，把这条偏离与代价一起记在 `ORCA_RANGE_SLACK` 的注释里。
 * ⑥ **`timeStep` 恒为 1**：本引擎一拍就是一个时间单位（同 `Steering.speed` 的「单位/tick」口径），
 *    不存在原码里那个可变 dt。已重叠时的脱离速度因此是「一拍脱离」。
 * ⑦ **补了原码没有的两处**（都由独立复查实测逼出来·各带点名用例）：
 *    · **完全同位**（相对位置与相对速度都是 0）→ 原码 `w/|w|` 得 NaN，而 NaN 约束会在
 *      `linearProgram2` 的 `det(...) > 0` 里恒假、被**静默丢弃** ⇒ 两个单位永远分不开。见 `DEGENERATE`。
 *    · **不还礼的邻居**（没开 ORCA 的单位：纯流场/软分离）→ 原码假设「所有人都同样讲道理」，各让一半；
 *      对方压根不算 ORCA 时那一半没人让 ⇒ 强承诺静默变成半个承诺。见 `OrcaAgent.reciprocal`。
 */

/** 原码 `RVO_EPSILON`（`src/Vector2.cc`）。 */
import { cross, dot as vdot, len, len2 } from '@engine/math/vec2.js';

export const RVO_EPSILON = 0.00001;

export interface Vec2 { x: number; y: number }
/** 原码 `Line`：一条有向直线（point 上一点·direction 单位方向）。可行域 = 直线**左侧**半平面。 */
export interface OrcaLine { point: Vec2; direction: Vec2 }
/** 参与避让的一个单位（只读快照）。 */
export interface OrcaAgent {
  x: number; y: number; vx: number; vy: number; radius: number;
  /**
   * 稳定下标（本仓 = 单位在 agents 数组里的位置·按实体 id 排序）。**只在退化分支里用**：
   * 拿它定谁往左谁往右，保证双方算出来的脱离方向严格相反（互惠不破），
   * 且与遍历顺序、Map 序、浮点误差全都无关。
   *
   * ⚠ **必填**（独立复查逼出来的）：首版给了 `?? 0` 的缺省，于是任何忘了传的调用方
   * 会让两边都拿到同一个方向 ⇒ 同向平移、永不分开 = 那条 P0 原样复活。
   * 这是导出的公开面，缺省值在这里就是陷阱——宁可让编译器拦住。
   */
  idx: number;
  /**
   * 这个邻居**自己也在跑 ORCA 吗**。ORCA 的 `u/2` 建立在「双方都让一半」上；
   * 邻居若是纯流场/软分离单位（不还礼），我必须**独自让满**，否则强承诺静默降成半个。
   * 缺省 `true` = 原码语义（原码里所有 agent 都跑 ORCA）。
   */
  reciprocal?: boolean;
}

/** 退化分支的计数（只为留痕与测试·不参与判定）。 */
export interface OrcaStats { degenerate: number; oneSided: number; infeasible: number }

/**
 * 完全同位时的脱离方向（见文件头差异⑦）。取 +x 轴而不是随便一个方向，是因为它必须
 * **可复现**：下标小的往 +x、大的往 −x，双方严格相反。
 */
export const DEGENERATE: Vec2Const = { x: 1, y: 0 };
interface Vec2Const { readonly x: number; readonly y: number }

const det = (a: Vec2, b: Vec2): number => cross(a.x, a.y, b.x, b.y);
const dot = (a: Vec2, b: Vec2): number => vdot(a.x, a.y, b.x, b.y);
const absSq = (a: Vec2): number => len2(a.x, a.y);
const norm = (a: Vec2): Vec2 => { const m = len(a.x, a.y); return { x: a.x / m, y: a.y / m }; };

/**
 * 原码 `linearProgram1`：在**第 lineNo 条直线上**求解——把可行区间夹到 [tLeft,tRight]，
 * 再取离 optVelocity 最近的点。返回 false = 该直线与前面的约束（或最大速度圆）无交集。
 */
export function linearProgram1(
  lines: readonly OrcaLine[], lineNo: number, radius: number,
  optVelocity: Vec2, directionOpt: boolean, result: Vec2,
): boolean {
  const dotProduct = dot(lines[lineNo].point, lines[lineNo].direction);
  const discriminant = dotProduct * dotProduct + radius * radius - absSq(lines[lineNo].point);

  if (discriminant < 0) return false;            // 最大速度圆把这条线整条否掉

  const sqrtDiscriminant = Math.sqrt(discriminant);
  let tLeft = -dotProduct - sqrtDiscriminant;
  let tRight = -dotProduct + sqrtDiscriminant;

  for (let i = 0; i < lineNo; i++) {
    const denominator = det(lines[lineNo].direction, lines[i].direction);
    const numerator = det(lines[i].direction, {
      x: lines[lineNo].point.x - lines[i].point.x,
      y: lines[lineNo].point.y - lines[i].point.y,
    });

    if (Math.abs(denominator) <= RVO_EPSILON) {  // 两线（近乎）平行
      if (numerator < 0) return false;
      continue;
    }

    const t = numerator / denominator;
    if (denominator >= 0) tRight = Math.min(tRight, t);   // 第 i 条从右边界住
    else tLeft = Math.max(tLeft, t);                      // 从左边界住
    if (tLeft > tRight) return false;
  }

  if (directionOpt) {
    if (dot(optVelocity, lines[lineNo].direction) > 0) {
      result.x = lines[lineNo].point.x + tRight * lines[lineNo].direction.x;
      result.y = lines[lineNo].point.y + tRight * lines[lineNo].direction.y;
    } else {
      result.x = lines[lineNo].point.x + tLeft * lines[lineNo].direction.x;
      result.y = lines[lineNo].point.y + tLeft * lines[lineNo].direction.y;
    }
  } else {
    const t = dot(lines[lineNo].direction, {
      x: optVelocity.x - lines[lineNo].point.x,
      y: optVelocity.y - lines[lineNo].point.y,
    });
    const tt = t < tLeft ? tLeft : t > tRight ? tRight : t;
    result.x = lines[lineNo].point.x + tt * lines[lineNo].direction.x;
    result.y = lines[lineNo].point.y + tt * lines[lineNo].direction.y;
  }
  return true;
}

/**
 * 原码 `linearProgram2`：先取"无约束时的最优"（期望速度，超速则钳到圆上），
 * 逐条检查约束；一旦不满足就在那条线上重解。返回**第一条解不动的线号**（全满足则返回 lines.length）。
 */
export function linearProgram2(
  lines: readonly OrcaLine[], radius: number, optVelocity: Vec2,
  directionOpt: boolean, result: Vec2,
): number {
  if (directionOpt) {
    result.x = optVelocity.x * radius; result.y = optVelocity.y * radius;
  } else if (absSq(optVelocity) > radius * radius) {
    const n = norm(optVelocity);
    result.x = n.x * radius; result.y = n.y * radius;
  } else {
    result.x = optVelocity.x; result.y = optVelocity.y;
  }

  for (let i = 0; i < lines.length; i++) {
    if (det(lines[i].direction, { x: lines[i].point.x - result.x, y: lines[i].point.y - result.y }) > 0) {
      const tempX = result.x; const tempY = result.y;
      if (!linearProgram1(lines, i, radius, optVelocity, directionOpt, result)) {
        result.x = tempX; result.y = tempY;
        return i;
      }
    }
  }
  return lines.length;
}

/**
 * 原码 `linearProgram3`：**无可行解时的兜底**（人挤得太死，所有约束凑不出可行速度）。
 * 逐条把"违反得最狠"的约束当目标，在投影出来的新约束集上求"最不违反"的速度——
 * 也就是**尽量少撞**而不是求完美。
 *
 * ⚠ **别把它理解成「保住速度」**（首版注释与首版用例名都这么写，独立复查实测证伪）：
 * 它优化的是**最大违反量**，跟速度大小没关系——四面被围的那个场景里，LP3 给的是 `(0,0)`
 * （站住不动最不违反），撤掉 LP3 反而拿到 `(1,0)`（LP2 的失败落点·撞得更狠）。
 * 判据因此只有一条：**LP3 的结果违反量 ≤ LP2 落点的违反量**，`orca.test.ts` 按这条断言。
 */
export function linearProgram3(
  lines: readonly OrcaLine[], numObstLines: number, beginLine: number, radius: number, result: Vec2,
): void {
  let distance = 0;

  for (let i = beginLine; i < lines.length; i++) {
    if (det(lines[i].direction, { x: lines[i].point.x - result.x, y: lines[i].point.y - result.y }) > distance) {
      const projLines: OrcaLine[] = lines.slice(0, numObstLines).map((l) => ({ point: { ...l.point }, direction: { ...l.direction } }));

      for (let j = numObstLines; j < i; j++) {
        const determinant = det(lines[i].direction, lines[j].direction);
        let point: Vec2;

        if (Math.abs(determinant) <= RVO_EPSILON) {
          if (dot(lines[i].direction, lines[j].direction) > 0) continue;   // 同向平行：跳过
          point = {                                                        // 反向平行：取中点
            x: 0.5 * (lines[i].point.x + lines[j].point.x),
            y: 0.5 * (lines[i].point.y + lines[j].point.y),
          };
        } else {
          const k = det(lines[j].direction, {
            x: lines[i].point.x - lines[j].point.x, y: lines[i].point.y - lines[j].point.y,
          }) / determinant;
          point = { x: lines[i].point.x + k * lines[i].direction.x, y: lines[i].point.y + k * lines[i].direction.y };
        }

        const direction = norm({ x: lines[j].direction.x - lines[i].direction.x, y: lines[j].direction.y - lines[i].direction.y });
        projLines.push({ point, direction });
      }

      const tempX = result.x; const tempY = result.y;
      if (linearProgram2(projLines, radius, { x: -lines[i].direction.y, y: lines[i].direction.x }, true, result) < projLines.length) {
        // 原码注：理论上不会发生（结果按定义已在可行域内）；真发生就是浮点误差，保留原值。
        result.x = tempX; result.y = tempY;
      }
      distance = det(lines[i].direction, { x: lines[i].point.x - result.x, y: lines[i].point.y - result.y });
    }
  }
}

/**
 * 原码 `Agent::computeNewVelocity` 的**智能体部分**（障碍部分见文件头差异①）。
 *
 * @param self       自己（位置/当前速度/半径）
 * @param neighbors  邻居快照（**须已按距离平方升序**·同原码 `insertAgentNeighbor` 的语义）
 * @param pref       期望速度（本仓 = 流场方向 × speed）
 * @param maxSpeed   速度上限（= speed）
 * @param timeHorizon 前瞻时间：多久之内保证不撞（越大越早避让、越"礼让"）
 * @param timeStep   一拍的时长（已经撞上时用它算脱离速度）
 */
export function orcaVelocity(
  self: OrcaAgent, neighbors: readonly OrcaAgent[], pref: Vec2,
  maxSpeed: number, timeHorizon: number, timeStep: number,
  stats?: OrcaStats,
): Vec2 {
  const lines: OrcaLine[] = [];
  const invTimeHorizon = 1 / timeHorizon;

  for (const other of neighbors) {
    const relativePosition = { x: other.x - self.x, y: other.y - self.y };
    const relativeVelocity = { x: self.vx - other.vx, y: self.vy - other.vy };
    const distSq = absSq(relativePosition);
    const combinedRadius = self.radius + other.radius;
    const combinedRadiusSq = combinedRadius * combinedRadius;

    let direction: Vec2;
    let u: Vec2;

    if (distSq > combinedRadiusSq) {
      /* 尚未碰撞 */
      const w = { x: relativeVelocity.x - invTimeHorizon * relativePosition.x, y: relativeVelocity.y - invTimeHorizon * relativePosition.y };
      const wLengthSq = absSq(w);
      const dotProduct = dot(w, relativePosition);

      if (dotProduct < 0 && dotProduct * dotProduct > combinedRadiusSq * wLengthSq) {
        /* 投影到截止圆上 */
        const wLength = Math.sqrt(wLengthSq);
        const unitW = { x: w.x / wLength, y: w.y / wLength };
        direction = { x: unitW.y, y: -unitW.x };
        const k = combinedRadius * invTimeHorizon - wLength;
        u = { x: k * unitW.x, y: k * unitW.y };
      } else {
        /* 投影到侧腿上 */
        const leg = Math.sqrt(distSq - combinedRadiusSq);
        if (det(relativePosition, w) > 0) {
          direction = {
            x: (relativePosition.x * leg - relativePosition.y * combinedRadius) / distSq,
            y: (relativePosition.x * combinedRadius + relativePosition.y * leg) / distSq,
          };
        } else {
          direction = {
            x: -(relativePosition.x * leg + relativePosition.y * combinedRadius) / distSq,
            y: -(-relativePosition.x * combinedRadius + relativePosition.y * leg) / distSq,
          };
        }
        const dv = dot(relativeVelocity, direction);
        u = { x: dv * direction.x - relativeVelocity.x, y: dv * direction.y - relativeVelocity.y };
      }
    } else {
      /* 已经撞上了：按**一拍**的截止圆算脱离速度 */
      const invTimeStep = 1 / timeStep;
      const w = { x: relativeVelocity.x - invTimeStep * relativePosition.x, y: relativeVelocity.y - invTimeStep * relativePosition.y };
      const wLength = Math.sqrt(absSq(w));
      // **退化分支**（文件头差异⑦·原码没有）：`w` 是零向量时 `w/|w|` 是 NaN，而 NaN 约束在
      // `linearProgram2` 的 `det(NaN) > 0` 里恒假、被**静默丢弃** ⇒ 两个单位钉在一起永远分不开
      // （独立复查实测：两个 Transform 写同一坐标的单位 60 拍两心距恒 0.000000，连 NaN 都看不见）。
      //
      // ⚠ 触发面**不只是"完全同位"**（第二轮复查指出首版注释把它说窄了）：`w = 相对速度 −
      // 相对位置/timeStep`，所以「已重叠、且相对速度恰好等于相对位置/timeStep」同样归零。
      // 因此兜底方向**优先用相对位置**（那才是真正的"离开对方"方向），只有连相对位置都是零
      // （= 真·完全同位，没有任何几何信息可用）才退到按下标定的左右。
      const unitW = wLength > RVO_EPSILON
        ? { x: w.x / wLength, y: w.y / wLength }
        : (() => {
            if (stats) stats.degenerate++;
            const rpLen = Math.sqrt(distSq);
            if (rpLen > RVO_EPSILON) {
              return { x: -relativePosition.x / rpLen, y: -relativePosition.y / rpLen };  // 背对对方
            }
            const sign = (self.idx <= other.idx) ? 1 : -1;
            return { x: DEGENERATE.x * sign, y: DEGENERATE.y * sign };
          })();
      direction = { x: unitW.y, y: -unitW.x };
      const k = combinedRadius * invTimeStep - wLength;
      u = { x: k * unitW.x, y: k * unitW.y };
    }

    // **各让一半**（reciprocal 的由来）：line.point = 自己的速度 + u/2。
    // ⚠ 邻居**不还礼**时（没开 ORCA 的纯流场/软分离单位）必须独自让满，否则那一半没人让，
    // 「timeHorizon 内保证不撞」这句强承诺就静默变成半句（独立复查实测：ORCA 队对穿纯流场队
    // 最近两心距 0.1000，而半径和是 0.70）。
    const share = other.reciprocal === false ? 1 : 0.5;
    if (share === 1 && stats) stats.oneSided++;
    lines.push({ point: { x: self.vx + share * u.x, y: self.vy + share * u.y }, direction });
  }

  const result: Vec2 = { x: 0, y: 0 };
  const lineFail = linearProgram2(lines, maxSpeed, pref, false, result);
  if (lineFail < lines.length) {
    if (stats) stats.infeasible++;
    linearProgram3(lines, 0, lineFail, maxSpeed, result);
  }
  return result;
}

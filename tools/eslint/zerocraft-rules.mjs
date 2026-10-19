// tools/eslint/zerocraft-rules.mjs —— ZeroCraft 本地 ESLint 插件（P0 治理围栏 · engine-architecture-review-2026-09-02 §5 P0）
//
// 取代三个 regex 守卫（engine-random-guard / test-hygiene-check 的两条随机与墙钟 / game-skill-audit 的 innerHTML）
// 的 AST 版本：正则被 `Math['random']()`、`const {random} = Math`、`globalThis.Math`、同行 `"http://x"` 假注释
// 全部绕过（深审 A1 + 2026-09-02 探针实证）；AST 规则按节点判，注释天然不算，写法变体逐一覆盖。
//
// 规则（全部只报错不修·豁免一律行内 `// eslint-disable-next-line zerocraft/<rule> -- <理由>`，理由必填）：
//   zerocraft/no-unseeded-random    Math.random（含计算属性/解构/globalThis·window·self 取 Math）+ crypto.*
//   zerocraft/no-transcendental     Math.sin/cos/tan/atan2/exp/log/pow/hypot/cbrt…（IEEE 不保证正确舍入·跨引擎可异）
//   zerocraft/no-wall-clock         Date.now / new Date() / performance.now
//   zerocraft/no-timers             setTimeout(延时≠0) / setInterval / requestAnimationFrame / sleep(（零延时让步不算）
//   zerocraft/no-external-io        fetch( / new WebSocket / XMLHttpRequest / createServer( / .listen(
//   zerocraft/no-html-injection     innerHTML= / outerHTML=（`= ''` 清空除外）/ insertAdjacentHTML( / document.write( / createContextualFragment(
//
// 哪个面开哪些规则见 eslint.config.mjs。本文件零依赖、纯 ESM，可被 vitest 直接 import 做规则单测。

const TRANSCENDENTAL = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'hypot', 'cbrt',
]);
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);

/** `obj.prop` / `obj['prop']` 的静态属性名（计算属性非字面量 → null）。 */
function propName(node) {
  if (!node.computed) return node.property.type === 'Identifier' ? node.property.name : null;
  if (node.property.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  if (node.property.type === 'TemplateLiteral' && node.property.expressions.length === 0) return node.property.quasis[0].value.cooked;
  return null;
}

/** 剥掉 TS 断言/非空/括号包装：`(Math as any)[k]`、`Math!.random`、`(<any>Math).random` 都要看到里面的 Math。 */
function unwrap(node) {
  while (node && (node.type === 'TSAsExpression' || node.type === 'TSNonNullExpression' || node.type === 'TSTypeAssertion'
    || node.type === 'TSSatisfiesExpression' || node.type === 'ParenthesizedExpression')) node = node.expression;
  return node;
}

/** 是否是 `Math` 这个全局（含 `globalThis.Math` / `window['Math']`）。 */
function isMathObject(node) {
  node = unwrap(node);
  if (node.type === 'Identifier') return node.name === 'Math';
  if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && GLOBAL_OBJECTS.has(node.object.name)) {
    return propName(node) === 'Math';
  }
  return false;
}
function isGlobalNamed(node, name) {
  node = unwrap(node);
  if (node.type === 'Identifier') return node.name === name;
  if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && GLOBAL_OBJECTS.has(node.object.name)) {
    return propName(node) === name;
  }
  return false;
}

/** 通用：对 `Math.<x>` 的所有访问形态（成员/计算成员/解构/动态计算）报 pick(x)。 */
function mathRule(meta, pick, dynamicMsg) {
  return {
    meta: { type: 'problem', docs: { description: meta }, schema: [], messages: { hit: '{{msg}}' } },
    create(ctx) {
      const report = (node, msg) => ctx.report({ node, messageId: 'hit', data: { msg } });
      return {
        MemberExpression(node) {
          if (!isMathObject(node.object)) return;
          const p = propName(node);
          if (p === null) { if (node.computed) report(node, dynamicMsg); return; }
          const msg = pick(p);
          if (msg) report(node, msg);
        },
        VariableDeclarator(node) {
          if (!node.init || !isMathObject(node.init) || node.id.type !== 'ObjectPattern') return;
          for (const prop of node.id.properties) {
            if (prop.type === 'RestElement') { report(prop, dynamicMsg); continue; }
            const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'Literal' ? String(prop.key.value) : null;
            if (key === null) { report(prop, dynamicMsg); continue; }
            const msg = pick(key);
            if (msg) report(prop, msg);
          }
        },
      };
    },
  };
}

const noUnseededRandom = (() => {
  const base = mathRule(
    '引擎 sim 面禁裸 Math.random——一切随机走 atoms/random 的种子 PRNG（RandomSeed），否则破 lockstep/录放/快照 hash',
    (p) => (p === 'random' ? '裸 Math.random：改用 atoms/random 种子 PRNG（RandomSeed + nextRandom）' : null),
    'Math 的动态属性访问会绕过随机守卫：写成 Math.<名字> 静态形式',
  );
  return {
    ...base,
    create(ctx) {
      const inner = base.create(ctx);
      return {
        ...inner,
        MemberExpression(node) {
          inner.MemberExpression(node);
          if (isGlobalNamed(node.object, 'crypto')) {
            ctx.report({ node, messageId: 'hit', data: { msg: 'crypto.* 是不可复现随机源：sim 面禁用（要 id 走种子 PRNG 或由宿主注入）' } });
          }
        },
      };
    },
  };
})();

const noTranscendental = mathRule(
  '引擎 sim 面禁浮点超越函数——ES 规范只保证 + - × ÷ √ 正确舍入，sin/cos/pow/hypot 跨 JS 引擎可差 1 ULP → lockstep 分叉',
  (p) => (TRANSCENDENTAL.has(p) ? `Math.${p} 非正确舍入：sim 路径改整数/多项式/sqrt(dx*dx+dy*dy)，或 authoring 期一次性算好存进数据（行内豁免注明 authoring-only）` : null),
  'Math 的动态属性访问会绕过超越函数守卫：写成 Math.<名字> 静态形式',
);

const noWallClock = {
  meta: { type: 'problem', docs: { description: '禁墙钟：Date.now / new Date() / performance.now（sim 只认整数 tick·测试用 fake timers）' }, schema: [], messages: { hit: '{{msg}}' } },
  create(ctx) {
    const report = (node, msg) => ctx.report({ node, messageId: 'hit', data: { msg } });
    return {
      MemberExpression(node) {
        const p = propName(node);
        if (p === 'now' && (isGlobalNamed(node.object, 'Date') || isGlobalNamed(node.object, 'performance'))) {
          report(node, `${isGlobalNamed(node.object, 'Date') ? 'Date' : 'performance'}.now 是墙钟：sim 用 tick 计数；宿主/测试由外部注入 now()`);
        }
      },
      NewExpression(node) {
        if (isGlobalNamed(node.callee, 'Date') && node.arguments.length === 0) report(node, 'new Date() 读墙钟：由外部注入时间');
      },
    };
  },
};

const noTimers = {
  meta: { type: 'problem', docs: { description: '禁真时间等待：setTimeout / setInterval / requestAnimationFrame / sleep(（测试用 vi.useFakeTimers·sim 不等墙钟）' }, schema: [], messages: { hit: '{{msg}}' } },
  create(ctx) {
    const NAMES = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'sleep']);
    return {
      CallExpression(node) {
        const c = node.callee;
        const name = c.type === 'Identifier' ? c.name
          : c.type === 'MemberExpression' && c.object.type === 'Identifier' && GLOBAL_OBJECTS.has(c.object.name) ? propName(c)
          : null;
        if (!name || !NAMES.has(name)) return;
        // `setTimeout(fn)` / `setTimeout(fn, 0)` 是让出一个宏任务（React act 冲刷惯用法），不是等墙钟——放行；延时非 0 字面量一律咬。
        if (name === 'setTimeout' && (node.arguments.length < 2 || (node.arguments[1].type === 'Literal' && node.arguments[1].value === 0))) return;
        ctx.report({ node, messageId: 'hit', data: { msg: `${name}( 是真时间等待：测试用 vi.useFakeTimers（文件级豁免须注明）；sim 面不得等墙钟` } });
      },
    };
  },
};

const noExternalIo = {
  meta: { type: 'problem', docs: { description: '禁外部 IO 直连：fetch / WebSocket / XMLHttpRequest / createServer / .listen（测试 stub 掉）' }, schema: [], messages: { hit: '{{msg}}' } },
  create(ctx) {
    const report = (node, msg) => ctx.report({ node, messageId: 'hit', data: { msg } });
    return {
      CallExpression(node) {
        const c = node.callee;
        if (c.type === 'Identifier' && (c.name === 'fetch' || c.name === 'createServer')) report(node, `${c.name}( 直连外部：测试里 stub（vi.stubGlobal('fetch', …)）`);
        if (c.type === 'MemberExpression' && propName(c) === 'listen') report(node, '.listen( 起真端口：测试不得开真网络');
        if (c.type === 'MemberExpression' && isGlobalNamed(c.object, 'globalThis') && propName(c) === 'fetch') report(node, 'fetch( 直连外部：测试里 stub');
      },
      NewExpression(node) {
        if (isGlobalNamed(node.callee, 'WebSocket')) report(node, 'new WebSocket 直连外部：测试用假信道');
        if (isGlobalNamed(node.callee, 'XMLHttpRequest')) report(node, 'XMLHttpRequest 直连外部：测试里 stub');
      },
    };
  },
};

const noHtmlInjection = {
  meta: { type: 'problem', docs: { description: '禁 HTML 字符串注入：innerHTML= / outerHTML= / insertAdjacentHTML( / document.write( / createContextualFragment(（UI 铁律：走 LayoutNode 纯数据·textContent）' }, schema: [], messages: { hit: '{{msg}}' } },
  create(ctx) {
    const report = (node, msg) => ctx.report({ node, messageId: 'hit', data: { msg } });
    return {
      AssignmentExpression(node) {
        if (node.left.type !== 'MemberExpression') return;
        const p = propName(node.left);
        if (p !== 'innerHTML' && p !== 'outerHTML') return;
        // `el.innerHTML = ''` 是清空不是注入（等价 replaceChildren()）——放行；任何非空值一律咬。
        if (node.right.type === 'Literal' && node.right.value === '') return;
        report(node, `${p}= 是 HTML 注入口：内容走 textContent / LayoutNode 数据（UI 铁律）`);
      },
      CallExpression(node) {
        const c = node.callee;
        if (c.type !== 'MemberExpression') return;
        const p = propName(c);
        if (p === 'insertAdjacentHTML' || p === 'createContextualFragment') report(node, `${p}( 是 HTML 注入口：走 LayoutNode 数据`);
        if (p === 'write' && isGlobalNamed(c.object, 'document')) report(node, 'document.write( 是 HTML 注入口');
      },
    };
  },
};

export const rules = {
  'no-unseeded-random': noUnseededRandom,
  'no-transcendental': noTranscendental,
  'no-wall-clock': noWallClock,
  'no-timers': noTimers,
  'no-external-io': noExternalIo,
  'no-html-injection': noHtmlInjection,
};

export default { meta: { name: 'zerocraft', version: '1.0.0' }, rules };

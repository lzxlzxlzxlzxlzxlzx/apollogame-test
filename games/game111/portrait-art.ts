// game111 —— 立绘占位（**程序化·矢量·可被真美术顶掉**）。
//
// 为什么需要它（实测·不是审美偏好）：`portrait` 控件缺 `art` 时会回落成「名字首字」，
// 而那个首字的颜色在渲染侧被**烤死**成 `t.dim`，底是 `linear-gradient(t.bg2, t.bg0)`
// （`src/ui/components/render.ts:1254`）。在 house 暗皮 `apolloOnyx` 上实测 `ratio=2.46`，
// ui-audit 判硬失败。这不是数据面能调的——已报 PUI（REQ-111-UI-03）。
//
// 接美术管线的口径（`docs/playbooks/art-pipeline.md`）：
// 「程序化背景要能替换 → 有生成图用图·无则回退程序化·兜底不丢」。本文件就是那个**回退**：
// 真美术到位后，`skinMap['npc-<id>-portrait']` 有值即优先取它，这里的 SVG 自动让位。
// 占位本身满足「最低标准=成形矢量图」：看得出是一个人，不是灰块。
import { NPCS } from './world-data.js';

/** 每个 NPC 一组配色（纯数据·非随机）。深底 + 亮主色，保证首字/剪影对比充足。 */
const PALETTE: Readonly<Record<string, { bg: string; ink: string }>> = {
  nao: { bg: '#1d2b1f', ink: '#8fe0a8' },
  mor: { bg: '#2b1f2e', ink: '#f0a6e0' },
  gud: { bg: '#2b2415', ink: '#ffd166' },
  tai: { bg: '#152430', ink: '#7fd4ff' },
  ala: { bg: '#301a1a', ink: '#ff9d7a' },
};
const FALLBACK = { bg: '#1a2a3c', ink: '#e7edf3' };

/**
 * 一张 NPC 占位立绘（data: URI 的 SVG）。
 * 构图 = 深色底 + 亮色肩颈剪影 + 首字，**看得出是个人**（art-pipeline 红线：灰块/字框不合法）。
 * 纯函数、无随机、无墙钟 → 同一个 id 永远同一张图（进不进 hash 都安全；它只走表现层）。
 */
export function portraitArt(npcId: string): string {
  const npc = NPCS.find((n) => n.id === npcId);
  const c = PALETTE[npcId] ?? FALLBACK;
  const initial = (npc?.name ?? '？').slice(0, 1);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="192" viewBox="0 0 144 192">`,
    `<rect width="144" height="192" fill="${c.bg}"/>`,
    // 肩颈剪影：一个圆头 + 一段梯形肩，确保「像个人」。
    `<circle cx="72" cy="74" r="34" fill="${c.ink}" opacity="0.22"/>`,
    `<path d="M18 192 Q18 132 72 132 Q126 132 126 192 Z" fill="${c.ink}" opacity="0.22"/>`,
    // 首字压在剪影上，用亮主色（对比来自 bg 与 ink 的明度差，非 t.dim）。
    `<text x="72" y="92" font-size="54" font-weight="700" text-anchor="middle"`,
    ` font-family="Noto Sans SC, sans-serif" fill="${c.ink}">${initial}</text>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

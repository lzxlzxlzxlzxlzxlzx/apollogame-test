import type { AssetDescriptor, AssetLoader } from '@zerocraft/engine/assets/index.js';
import { ImageAssetLoader } from '@zerocraft/engine/assets/index.js';
import type { CardPresentation } from '../../../games/game-card-reveal/blueprint.js';
import type { SettlementPack } from './contract.js';

/** B exception: app-local, render-only snapshot of DokiWorlds' settlement faces. */
export class SettlementVisualLoader implements AssetLoader {
  private readonly surfaces = new Map<string, HTMLCanvasElement>();
  private readonly images = new ImageAssetLoader();

  registerSurface(src: string, surface: HTMLCanvasElement): void { this.surfaces.set(src, surface); }
  forgetSurface(src: string): void { this.surfaces.delete(src); }
  load(descriptor: AssetDescriptor): ReturnType<AssetLoader['load']> {
    if (descriptor.kind === 'texture' && descriptor.src.startsWith('settlement:')) {
      const surface = this.surfaces.get(descriptor.src);
      if (!surface) return Promise.reject(new Error(`Missing settlement surface ${descriptor.src}`));
      return Promise.resolve({ handle: { image: surface }, width: surface.width, height: surface.height });
    }
    return this.images.load(descriptor);
  }
}

function canvas(width: number, height: number): { surface: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const surface = document.createElement('canvas');
  surface.width = width; surface.height = height;
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('Settlement 2D compositor unavailable.');
  return { surface, ctx };
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function sizeOf(image: CanvasImageSource): { width: number; height: number } {
  if (image instanceof HTMLImageElement) return { width: image.naturalWidth, height: image.naturalHeight };
  if (image instanceof HTMLCanvasElement) return { width: image.width, height: image.height };
  return { width: 1, height: 1 };
}
function drawFit(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, w: number, h: number, fit: 'cover' | 'contain'): void {
  const size = sizeOf(image);
  if (!size.width || !size.height) return;
  const scale = fit === 'cover' ? Math.max(w / size.width, h / size.height) : Math.min(w / size.width, h / size.height);
  const dw = size.width * scale, dh = size.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function lines(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, limit: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const char of value) {
    if (char === '\n') { if (line) out.push(line); line = ''; if (out.length >= limit) break; continue; }
    if (ctx.measureText(line + char).width > maxWidth && line) {
      out.push(line); line = char;
      if (out.length >= limit) break;
    } else line += char;
  }
  if (line && out.length < limit) out.push(line);
  return out;
}
function rarityKey(value: string): 'common' | 'rare' | 'epic' | 'legendary' {
  return value === 'rare' || value === 'epic' || value === 'legendary' ? value : 'common';
}
const RARITY = { common: '#bfc4bf', rare: '#9ccbdc', epic: '#c8addf', legendary: '#ead19e' } as const;
const RARITY_ZH = { common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' } as const;
const RARITY_EN = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' } as const;
const KIND_ZH = { event: '事件', skill: '技能', item: '道具' } as const;
const KIND_EN = { event: 'Event', skill: 'Skill', item: 'Item' } as const;

/** Native sealed pack is 260px wide at aspect .686; this is its 400×600 animation surface. */
export function composeSettlementPack(pack: SettlementPack, count: number, cover?: CanvasImageSource, logo?: CanvasImageSource): HTMLCanvasElement {
  const { surface, ctx } = canvas(400, 600);
  ctx.save(); rounded(ctx, 4, 4, 392, 592, 22); ctx.clip();
  const base = ctx.createLinearGradient(0, 0, 400, 600);
  base.addColorStop(0, '#30291d'); base.addColorStop(0.75, '#0c1516'); base.addColorStop(1, '#080c0e');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 400, 600);
  if (cover) drawFit(ctx, cover, 0, 0, 400, 600, 'cover');
  const shade = ctx.createLinearGradient(0, 200, 0, 600);
  shade.addColorStop(0, 'rgba(5,7,12,0.08)'); shade.addColorStop(1, 'rgba(5,7,12,0.88)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 400, 600);
  const top = ctx.createLinearGradient(0, 0, 0, 132);
  top.addColorStop(0, 'rgba(231,200,149,0.35)'); top.addColorStop(1, 'rgba(231,200,149,0.08)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, 400, 132);
  ctx.strokeStyle = 'rgba(231,200,149,0.65)'; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(0, 132); ctx.lineTo(400, 132); ctx.stroke(); ctx.setLineDash([]);
  if (logo) drawFit(ctx, logo, 36, 455, 328, 80, 'contain');
  else {
    ctx.fillStyle = '#f6e6c4'; ctx.textAlign = 'center'; ctx.font = '600 29px Georgia, serif';
    lines(ctx, pack.title, 330, 2).forEach((line, index) => ctx.fillText(line, 200, 485 + index * 34));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; rounded(ctx, 146, 546, 108, 31, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(231,200,149,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#f3dcb0'; ctx.textAlign = 'center'; ctx.font = '18px system-ui, sans-serif'; ctx.fillText(`${count} 张卡`, 200, 568);
  ctx.restore();
  ctx.strokeStyle = 'rgba(231,200,149,0.8)'; ctx.lineWidth = 3; rounded(ctx, 2, 2, 396, 596, 23); ctx.stroke();
  ctx.strokeStyle = 'rgba(231,200,149,0.35)'; ctx.lineWidth = 1; rounded(ctx, 9, 9, 382, 582, 17); ctx.stroke();
  return surface;
}

export function splitSettlementPack(front: HTMLCanvasElement): Readonly<{ top: HTMLCanvasElement; body: HTMLCanvasElement }> {
  const top = canvas(front.width, front.height); top.ctx.drawImage(front, 0, 0); top.ctx.clearRect(0, 100, front.width, front.height - 100);
  const body = canvas(front.width, front.height); body.ctx.drawImage(front, 0, 0); body.ctx.clearRect(0, 0, front.width, 100);
  return { top: top.surface, body: body.surface };
}

function portrait(card: CardPresentation, image: CanvasImageSource | undefined, locale: 'zh-CN' | 'en'): HTMLCanvasElement {
  const { surface, ctx } = canvas(260, 390);
  ctx.save(); rounded(ctx, 2, 2, 256, 386, 12); ctx.clip();
  ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, 260, 390);
  if (image) drawFit(ctx, image, 0, 0, 260, 390, 'cover');
  else {
    const fallback = ctx.createRadialGradient(170, 130, 0, 170, 130, 280);
    fallback.addColorStop(0, '#51415c'); fallback.addColorStop(0.6, '#172e39'); fallback.addColorStop(1, '#0a1019');
    ctx.fillStyle = fallback; ctx.fillRect(0, 0, 260, 390);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, 390);
  shade.addColorStop(0, 'rgba(3,7,14,0.70)'); shade.addColorStop(0.4, 'rgba(3,7,14,0)');
  shade.addColorStop(0.6, 'rgba(3,7,14,0.60)'); shade.addColorStop(1, 'rgba(3,7,14,0.96)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 260, 390);
  const rarity = rarityKey(card.rarity ?? 'common');
  ctx.strokeStyle = RARITY[rarity]; ctx.lineWidth = 2; rounded(ctx, 2, 2, 256, 386, 12); ctx.stroke();
  ctx.globalAlpha = 0.55; ctx.lineWidth = 1; rounded(ctx, 8, 8, 244, 374, 9); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = `${RARITY[rarity]}66`; ctx.beginPath(); ctx.moveTo(18, 57); ctx.lineTo(242, 57); ctx.stroke();
  ctx.fillStyle = RARITY[rarity]; ctx.textAlign = 'left'; ctx.font = '12px system-ui, sans-serif';
  const kind = locale === 'zh-CN' ? KIND_ZH[card.kind ?? 'event'] : KIND_EN[card.kind ?? 'event'];
  const rarityLabel = locale === 'zh-CN' ? RARITY_ZH[rarity] : RARITY_EN[rarity];
  ctx.fillText(`${kind} · ${rarityLabel}`, 18, 42, 224);
  ctx.fillStyle = '#fff0d3'; ctx.font = '600 23px Georgia, serif';
  const title = lines(ctx, card.name ?? card.alt ?? '', 224, 2);
  title.forEach((line, index) => ctx.fillText(line, 18, (title.length > 1 ? 310 : 335) + index * 25));
  ctx.fillStyle = '#d7d5d0'; ctx.font = '12px system-ui, sans-serif';
  const description = lines(ctx, card.description || card.worldTitle || '', 224, 1)[0];
  if (description) ctx.fillText(description, 18, 365, 224);
  ctx.restore();
  return surface;
}

function landscape(card: CardPresentation, image: CanvasImageSource | undefined, locale: 'zh-CN' | 'en'): HTMLCanvasElement {
  const { surface, ctx } = canvas(390, 260);
  const accent = card.kind === 'skill' ? '#a855f7' : '#06b6d4';
  ctx.save(); rounded(ctx, 5, 5, 380, 250, 16); ctx.clip();
  const base = ctx.createRadialGradient(110, 130, 5, 110, 130, 320);
  base.addColorStop(0, card.kind === 'skill' ? '#15101c' : '#0a1218'); base.addColorStop(1, '#050508');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 390, 260);
  ctx.fillStyle = accent + '18'; ctx.beginPath(); ctx.ellipse(105, 130, 95, 75, 0, 0, Math.PI * 2); ctx.fill();
  if (image) drawFit(ctx, image, 30, 45, 130, 170, 'contain');
  ctx.restore();
  const rim = ctx.createLinearGradient(0, 0, 390, 260);
  rim.addColorStop(0, '#fffdf7'); rim.addColorStop(0.38, '#f0d78c'); rim.addColorStop(0.72, '#c9a227'); rim.addColorStop(1, '#5c4512');
  ctx.strokeStyle = rim; ctx.lineWidth = 3; rounded(ctx, 5, 5, 380, 250, 16); ctx.stroke();
  ctx.strokeStyle = 'rgba(232,201,106,0.28)'; ctx.lineWidth = 1; rounded(ctx, 14, 14, 362, 232, 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(175, 38); ctx.lineTo(175, 222); ctx.stroke();
  ctx.fillStyle = '#f7f3eb'; ctx.textAlign = 'left'; ctx.font = '600 19px Georgia, serif';
  lines(ctx, card.name ?? card.alt ?? '', 180, 2).forEach((line, index) => ctx.fillText(line, 192, 87 + index * 23));
  const rarity = rarityKey(card.rarity ?? 'common');
  const kind = locale === 'zh-CN' ? KIND_ZH[card.kind ?? 'item'] : KIND_EN[card.kind ?? 'item'];
  const rarityLabel = locale === 'zh-CN' ? RARITY_ZH[rarity] : RARITY_EN[rarity];
  ctx.fillStyle = RARITY[rarity]; ctx.font = '12px system-ui, sans-serif'; ctx.fillText(`${kind}   ${rarityLabel}`, 192, 142, 180);
  ctx.strokeStyle = 'rgba(232,201,106,0.4)'; ctx.beginPath(); ctx.moveTo(192, 155); ctx.lineTo(368, 155); ctx.stroke();
  ctx.fillStyle = '#aeb4bf'; ctx.font = '12px system-ui, sans-serif';
  lines(ctx, card.description || card.worldTitle || '', 176, 2).forEach((line, index) => ctx.fillText(line, 192, 179 + index * 17));
  return surface;
}

export function composeSettlementCard(card: CardPresentation, image: CanvasImageSource | undefined, locale: 'zh-CN' | 'en'): HTMLCanvasElement {
  return card.kind === 'skill' || card.kind === 'item' ? landscape(card, image, locale) : portrait(card, image, locale);
}

/** Display-only image loading. No pixel readback, so signed images need not be exported. */
export function loadSettlementImage(url: string, timeoutMs = 3500): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const timer = window.setTimeout(() => finish(new Error('Settlement image timed out.')), timeoutMs);
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true; window.clearTimeout(timer);
      image.onload = null; image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Settlement image unavailable.'));
    image.src = url;
  });
}

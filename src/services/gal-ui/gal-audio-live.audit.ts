// Original WAV fixtures, actual browser media playback, and product composition with memory-only KV.
import { IndexedDbKV } from '../storage/indexeddb-kv.js';
import { IndexedDbSavePort } from '../save/indexeddb-save-port.js';
import { loadGalProfile, saveGalProfile, unlock } from '../gal-profile/gal-profile.js';
import { hashWithOrder } from '@net/determinism.js';
import { resolveGalUiArt } from './gal-ui-art.js';
import { mountGalBrowserGame, type GalBrowserGameHandle } from './gal-browser-game-host.js';
import { galAudioTestPackage, galAudioTestInitial } from './gal-audio-test-fixture.js';

class MemoryAuditKV extends IndexedDbKV {
  readonly data = new Map<string, string>();
  fail = false;
  override async get(key: string): Promise<string | null> { return this.data.get(key) ?? null; }
  override async putMany(entries: ReadonlyArray<readonly [string, string]>, deletes: ReadonlyArray<string> = []): Promise<void> {
    if (this.fail) throw new Error('audio audit write failure');
    for (const [key, value] of entries) this.data.set(key, value);
    for (const key of deletes) this.data.delete(key);
  }
  override async listKeys(prefix: string): Promise<string[]> { return [...this.data.keys()].filter(key => key.startsWith(prefix)); }
  override async close(): Promise<void> { /* no database was opened */ }
}
function originalWav(frequency: number): string {
  const rate = 8000, samples = rate * 20;
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const tag = (at: number, text: string) => Array.from(text).forEach((char, index) => { bytes[at + index] = char.charCodeAt(0); });
  tag(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) view.setInt16(44 + index * 2,
    Math.round(Math.sin(index * frequency * 2 * Math.PI / rate) * 4000), true);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 4096) binary += String.fromCharCode(...bytes.subarray(offset, offset + 4096));
  return `data:audio/wav;base64,${btoa(binary)}`;
}
const pkg = galAudioTestPackage(), kv = new MemoryAuditKV();
const urls: Record<string, string> = Object.fromEntries(['theme', 'first', 'second', 'bell']
  .map((id, index) => [`audio:${id}`, originalWav(220 + index * 110)]));
if (location.search.includes('missing=voice')) delete urls['audio:first'];
const played: HTMLMediaElement[] = [];
const nativePlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function() { played.push(this); return nativePlay.call(this); };
const globals = window as typeof window & { __galAudioUiUrls?: Record<string, string> };
let mounted: GalBrowserGameHandle;
async function mount(): Promise<void> {
  mounted = await mountGalBrowserGame({ container: document.getElementById('root')!, pkg,
    initial: galAudioTestInitial, dbName: 'gal-audio-audit-memory-only', kv, previewKv: kv,
    contentUrls: urls, uiArt: resolveGalUiArt(globals.__galAudioUiUrls ?? {}), now: () => 1000 });
}
const profile = new IndexedDbSavePort({ kv, ls: null });
void mount().then(() => Object.assign(window, { __galAudioAudit: {
  page: () => mounted.host.uiState.page, ref: () => mounted.host.view.story.refKey,
  prefs: () => mounted.host.view.preferences, feedback: () => mounted.host.uiState.feedback,
  status: () => mounted.host.audioStatus,
  media: () => played.map(element => ({ id: Object.keys(urls).find(key => urls[key] === element.src),
    loop: element.loop, paused: element.paused, volume: element.volume, ready: element.readyState,
    time: element.currentTime })),
  failWrite: (fail: boolean) => { kv.fail = fail; },
  hash: () => hashWithOrder(mounted.host.world.snapshot(), mounted.host.world.snapshotOrder()),
  profileJson: async () => JSON.stringify(await loadGalProfile(profile, pkg)),
  unlockReplay: async () => {
    await saveGalProfile(profile, pkg, unlock(await loadGalProfile(profile, pkg), pkg, 'memory', 'memory'), 1001);
    await mounted.host.refreshView();
  },
  reopen: async () => { await mounted.close(); await mount(); },
  close: () => mounted.close(),
} })).catch(error => Object.assign(window, { __galAudioAuditError: String(error) }));

import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.DOKI_DEMO_ROOT;
if (!root) throw new Error('DOKI_DEMO_ROOT is required');
const base = process.env.DOKI_DEMO_URL ?? 'http://127.0.0.1:5174/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve('docs/design/game-rhetoric-duel/self-check/w5-shots');
await mkdir(out, { recursive: true });

const freeRoam = await import(pathToFileURL(join(root, 'src/free-roam/index.ts')).href);
const raw = JSON.parse(await readFile(join(root, 'src/generated/fanren_qiyuan.pack.json'), 'utf8'));
raw.manifest.continuous_cards.enabled = false;
raw.manifest.ability_system.enabled = false;
const registry = freeRoam.createContentRegistry(raw);
const state = freeRoam.createInitialFreeRoamState(registry, freeRoam.createPlayerFromProfession(registry, 'profession_mortal_boy'), 7);
if (state.daily) state.daily.enabled = false;
state.currentRoomId = 'room_outer';
state.quests.quest_outer_trial = { status: 'active', node: 'node_bout' };
state.encounters.encounter_trial_bout = { status: 'active' };
const key = freeRoam.saveStorageKey('fanren_qiyuan');
const value = JSON.stringify(freeRoam.createSaveEnvelope(state));

const browser = await chromium.launch({ executablePath: edge });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
try {
  await page.addInitScript(({ storageKey, saved }) => localStorage.setItem(storageKey, saved), { storageKey: key, saved: value });
  await page.goto(`${base}?campaign=fanren_qiyuan`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '继续旅程' }).click();
  await page.getByTestId('marker-npc_sun_laizi').click();
  await page.getByRole('button', { name: '交谈', exact: true }).click();
  await page.getByTestId('conversation-input').fill('点破孙癞子的底细，让他知难而退');
  await page.getByTestId('conversation-input').press('Enter');
  const conflict = page.getByTestId('card-conflict');
  await conflict.waitFor({ state: 'visible', timeout: 15_000 });
  await conflict.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-testid="card-conflict"]')?.getAttribute('data-phase') === 'ready');
  await page.screenshot({ path: resolve(out, 'demo-ready.png'), fullPage: false });
} finally {
  await browser.close();
}

console.log(`RHETORIC_DEMO_EVIDENCE=${resolve(out, 'demo-ready.png')}`);

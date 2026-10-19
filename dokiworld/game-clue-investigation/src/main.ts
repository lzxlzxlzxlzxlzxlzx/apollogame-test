import { createAppClient } from 'dokiworlds-app-sdk';
import baseManifest from '../../../library/game-clue-investigation/manifest.json';
import { parseManifestDetailedAsync } from '../../../src/assembly/manifest-async.js';
import { runBlueprintInto } from '../../../src/studio/cart-run-core.js';
import { createHostVisualAssetManager, HostVisualSession, projectHostVisual } from '../../../src/assets/host-visual-bridge.js';
import { buildFormalManifest, hostVisualInput, imageDescriptors } from './scene-data.js';
import { isLoopbackDebugOrigin, makeInvestigationOutput, parseInvestigationInput } from './contracts.js';
import { LoopbackPngAssetLoader } from './loopback-png-loader.js';

const APP_ID = 'game-clue-investigation';
const INPUT_CONTRACT = 'doki.game.clue-investigation-input';
const INPUT_VERSION = 1;
const OUTPUT_CONTRACT = 'doki.game.clue-investigation-result';
const OUTPUT_VERSION = 1;
const stage = document.querySelector<HTMLElement>('#stage');
const status = document.querySelector<HTMLElement>('#status');
if (!stage || !status) throw new Error('DokiWorld app frame is incomplete');

const app = createAppClient({ appId: APP_ID, targetOrigin: '*' });
const disconnect = app.connect();
let stopRunner: (() => void) | undefined;
let manager: ReturnType<typeof createHostVisualAssetManager> | undefined;
let hostSession: InstanceType<typeof HostVisualSession> | undefined;
let terminalStarted = false;
let completeStarted = false;
let exitStarted = false;
let integrityFault = false;
let collectedOrder: string[] = [];
let previousCollected: Set<string> | undefined;

void app.whenReady({ timeoutMs: 10_000 }).then(async (envelope) => {
  if (envelope.contract !== INPUT_CONTRACT || envelope.version !== INPUT_VERSION) {
    throw new TypeError('收到的输入合同与 App Manifest 不一致。');
  }
  if (isEmptyObject(envelope.data)) {
    status.textContent = 'Preview 已连接：空 data 仅验证 App 握手，不请求宿主图片、不启动可结算调查，也不会返回结果。';
    return;
  }
  const data = parseInvestigationInput(envelope, { allowLoopbackHttp: isLoopbackDebugOrigin() });
  status.textContent = '正在验证现场图片、PNG 像素蒙版与调查数据…';
  await startFormalInvestigation(data);
  status.textContent = '调查现场已就绪。首次收录全部必要线索后，才会向宿主提交一次结果。';
}).catch((error: unknown) => {
  console.error('[game-clue-investigation] app initialization rejected', error);
  status.textContent = `调查配置或资源无效：${error instanceof Error ? error.message : '未知错误'}。本局不会产生结果。`;
  app.requestExit();
});

async function startFormalInvestigation(data: ReturnType<typeof parseInvestigationInput>): Promise<void> {
  const stageElement = stage!;
  const imageLoader = new LoopbackPngAssetLoader(window.location.origin);
  const assetManager = createHostVisualAssetManager(imageLoader);
  manager = assetManager;
  const descriptors = imageDescriptors(data, data.requestId);
  const registered = [
    { kind: 'texture' as const, key: descriptors.backgroundKey, src: descriptors.background.imageUrl,
      width: descriptors.background.pixelWidth, height: descriptors.background.pixelHeight, colorSpace: 'srgb' as const },
    ...descriptors.evidence.map(({ key, image }) => ({ kind: 'texture' as const, key, src: image.imageUrl,
      width: image.pixelWidth, height: image.pixelHeight, colorSpace: 'srgb' as const })),
  ];
  for (const descriptor of registered) assetManager.register(descriptor);
  try {
    await Promise.all(registered.map(async (descriptor) => {
      const loaded = await assetManager.load(descriptor.key);
      if (loaded.width !== descriptor.width || loaded.height !== descriptor.height) {
        throw new Error(`${descriptor.key}: 解码尺寸与合同声明不符`);
      }
    }));
    const preparedSession = await HostVisualSession.prepare(assetManager, data.requestId,
      hostVisualInput(data, (id, image) => imageLoader.hostVisualUrl(id, image.imageUrl)));
    hostSession = preparedSession.session;
    const projected = preparedSession.visuals.map((visual) => ({
      id: visual.id,
      ...projectHostVisual(visual, 1440, 900, `investigate.${visual.id}`),
    }));
    const runtimeManifest = buildFormalManifest(baseManifest, data, data.requestId,
      preparedSession.visuals, projected, descriptors.backgroundKey);
    const parsed = await parseManifestDetailedAsync(runtimeManifest);
    const clueIds = data.objects.filter((item) => item.kind === 'clue').map((item) => item.objectId);
    const terminal = {
      flowIds: ['investigation'],
      flagIds: clueIds.map((id) => `collected.${id}`),
      onSnapshot: (snapshot: { flows: readonly { id: string; current: string }[]; flags: readonly { id: string; active: boolean }[] }) => {
        observeSnapshot(snapshot, data, clueIds);
      },
    };
    stopRunner = runBlueprintInto(stageElement, parsed.blueprint, { w: 1440, h: 900 }, parsed.presentation,
      assetManager, { hostVisualSession: preparedSession.session, terminal });
    terminalStarted = true;
  } catch (error) {
    if (!terminalStarted) {
      hostSession?.dispose();
      hostSession = undefined;
      assetManager.clear();
    }
    throw error;
  }
}

function observeSnapshot(
  snapshot: { flows: readonly { id: string; current: string }[]; flags: readonly { id: string; active: boolean }[] },
  data: ReturnType<typeof parseInvestigationInput>,
  clueIds: readonly string[],
): void {
  const flow = snapshot.flows.find((item) => item.id === 'investigation')?.current;
  const current = new Set(snapshot.flags.filter((flag) => flag.active && flag.id.startsWith('collected.'))
    .map((flag) => flag.id.slice('collected.'.length)));
  if (flow === 'resetting') {
    collectedOrder = [];
    previousCollected = current;
    integrityFault = false;
    return;
  }
  if (previousCollected === undefined) {
    if (current.size) integrityFault = true;
    previousCollected = current;
  } else {
    const added = [...current].filter((id) => !previousCollected!.has(id));
    if (added.length > 1) integrityFault = true; // order cannot be proven if a tick mutates several first-collection flags.
    for (const id of added) if (clueIds.includes(id) && !collectedOrder.includes(id)) collectedOrder.push(id);
    previousCollected = current;
  }
  if (flow === 'cancelled' && !exitStarted) {
    exitStarted = true;
    status!.textContent = '调查已取消，不会向宿主提交业务结果。';
    app.requestExit();
    return;
  }
  if (flow !== 'completed' || completeStarted) return;
  completeStarted = true;
  if (integrityFault || current.size !== collectedOrder.length || collectedOrder.some((id) => !clueIds.includes(id))) {
    status!.textContent = '无法证明线索的首次收录顺序，本局已安全停止，不会提交结果。';
    app.requestExit();
    return;
  }
  try {
    const output = makeInvestigationOutput(data, collectedOrder);
    const submission = { contract: OUTPUT_CONTRACT, version: OUTPUT_VERSION, data: output.data };
    void app.complete(submission).then((result) => {
      if (result === 'accepted') status!.textContent = '调查结果已由宿主接受。';
      else status!.textContent = '宿主未接受本次结果；App 不会重复提交或自行结算。';
    }).catch((error: unknown) => {
      console.error('[game-clue-investigation] completion was not confirmed', error);
      status!.textContent = '宿主未确认本次结果；App 不会重复提交。请由宿主按 requestId 查询状态。';
    });
  } catch (error) {
    console.error('[game-clue-investigation] completed state failed output validation', error);
    status!.textContent = '调查终态与输出合同不一致；本局不会提交结果。';
    app.requestExit();
  }
}

function isEmptyObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0;
}

window.addEventListener('pagehide', () => {
  stopRunner?.();
  stopRunner = undefined;
  if (!terminalStarted) hostSession?.dispose();
  manager?.clear();
  disconnect();
  app.dispose();
}, { once: true });

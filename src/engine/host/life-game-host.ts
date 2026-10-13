import { compileAndParseLifeGamePackage } from '../../assembly/life-package-compile.js';
import { parseLifeHostDescriptor, type LifeHostDescriptorV1 } from '../../authoring/life-host-descriptor-core.js';
import {
  compileLifeVisualCatalog, createArtAssets, loadGameArtInto, parseAssetSlotManifest,
  type AssetManager, type AssetSlotManifest, type LifeVisualCatalog,
} from '../../assets/index.js';
import { CanvasRenderer, compileLifeWorldVisualCatalog, type LifeWorldVisualCatalog, type WorldUi2DPresentation } from '../../renderer/index.js';
import type { LifeGamePackage } from '../protocol/life-sim.js';
import { Engine } from '../../runtime/engine.js';
import { type StoragePort } from '../../services/storage/index.js';
import { mountUI } from '../../ui/components/index.js';
import { STARTER_THEME } from '../../ui/starters/index.js';
import { QueuedInputSource } from '../../net/host/index.js';
import { mountHost, type HostSkeleton, type MountHostOptions } from './mount-host.js';
import { createRunLoop, type RunLoop } from './run-loop.js';
import { buildLifeStandardHud } from './life-hud.js';
import { installLifeKeyboard, type LifeKeyboardBinding } from './life-input.js';
import {
  buildLifeInteractionOptions, buildLifeInteractionPresentation, LIFE_INTERACTION_ACTIVATE_ACTION,
  createLifeInteractionTraceSink, LifeInteractionController, type LifeInteractionAction, type LifeInteractionOption,
} from './life-interaction.js';
import { selectLifeHostView, type LifeHostViewModel } from './life-presenter.js';
import { LifeHostAutosave, LifeHostSaveAdapter, type LifeHostRestoreResult } from './life-save.js';
import { lifePackageViewportProfileId, resolveLifeViewportProfile } from '../protocol/life-viewport-profile.js';

export interface LifeGameHostContext { readonly exit?: () => void; readonly storage?: StoragePort }
export interface LifeGameHostInput {
  readonly descriptor: unknown;
  readonly lifePackage: unknown;
  readonly assetSlots: unknown;
  readonly storage?: StoragePort;
  readonly host?: LifeGameHostContext;
  /** Controlled loader hook for tests/native shells. It receives only the sanitized slug and AssetManager. */
  readonly loadArt?: (assets: AssetManager, artSlug: string) => Promise<boolean>;
}

export interface LifeGameCoreSession {
  readonly descriptor: LifeHostDescriptorV1;
  readonly assetSlots: AssetSlotManifest;
  readonly visualCatalog: LifeVisualCatalog;
  readonly worldVisualCatalog: LifeWorldVisualCatalog;
  readonly engine: Engine;
  readonly input: QueuedInputSource;
  readonly assets: AssetManager;
  feedback: Record<string, string>;
}

export interface PersistentLifeGameSession {
  readonly session: LifeGameCoreSession;
  readonly saves?: LifeHostSaveAdapter;
  readonly autosave?: LifeHostAutosave;
  readonly restoreResult: LifeHostRestoreResult | 'not-configured';
}

export interface MountedLifeGame extends PersistentLifeGameSession {
  readonly renderer: CanvasRenderer;
  readonly shell: HostSkeleton;
  flushAutosave(): Promise<void>;
}

export interface LifeGameMountHandle {
  /** Resolves only after optional restore completed and the run loop was mounted. */
  readonly ready: Promise<MountedLifeGame>;
  dispose(): void;
}

function parseHostInput(input: LifeGameHostInput): {
  descriptor: LifeHostDescriptorV1;
  assetSlots: AssetSlotManifest;
  visualCatalog: LifeVisualCatalog;
  worldVisualCatalog: LifeWorldVisualCatalog;
  blueprint: ReturnType<typeof compileAndParseLifeGamePackage>['blueprint'];
} {
  // All three trust boundaries run before mountHost mutates the container.
  const descriptor = parseLifeHostDescriptor(input.descriptor);
  if (lifePackageViewportProfileId(input.lifePackage) !== descriptor.viewport.profile) {
    throw new Error(`Life package camera profile must equal descriptor viewport profile ${descriptor.viewport.profile}`);
  }
  const compiled = compileAndParseLifeGamePackage(input.lifePackage);
  const assetSlots = parseAssetSlotManifest(input.assetSlots);
  if (assetSlots.game !== descriptor.slug) throw new Error(`AssetSlotManifest game must equal descriptor slug ${descriptor.slug}`);
  return { descriptor, assetSlots, visualCatalog: compileLifeVisualCatalog(assetSlots), worldVisualCatalog: compileLifeWorldVisualCatalog(input.lifePackage as LifeGamePackage), blueprint: compiled.blueprint };
}

/** Headless/testable core creation. No DOM, storage, network or persistent side effect. */
export function createLifeGameSession(input: LifeGameHostInput, assets: AssetManager = createArtAssets()): LifeGameCoreSession {
  const parsed = parseHostInput(input);
  return createParsedLifeGameSession(parsed, assets);
}

function createParsedLifeGameSession(parsed: ReturnType<typeof parseHostInput>, assets: AssetManager): LifeGameCoreSession {
  const queued = new QueuedInputSource('life:player');
  const engine = new Engine({ input: queued });
  engine.load(parsed.blueprint);
  // Prime derived activity/projection components before the first host paint.
  engine.world.tick();
  return { ...parsed, engine, input: queued, assets, feedback: {} };
}

async function createPersistentParsedLifeGameSession(
  parsed: ReturnType<typeof parseHostInput>, input: LifeGameHostInput, assets: AssetManager,
): Promise<PersistentLifeGameSession> {
  const session = createParsedLifeGameSession(parsed, assets);
  const storage = input.storage ?? input.host?.storage;
  if (!storage) return { session, restoreResult: 'not-configured' };
  const saves = new LifeHostSaveAdapter(session.descriptor, session.engine.world, storage);
  const restoreResult = await saves.restore(session.engine.world);
  // Restore swaps the persisted authority into the already-primed world. Give the normal
  // deterministic chain one post-restore tick so derived/runtime-only state (notably the Life
  // dialogue script/text rebuilt by t2-life-talk) exists before the host's immediate first paint.
  if (restoreResult === 'restored') session.engine.world.tick();
  return { session, saves, autosave: new LifeHostAutosave(saves, session.engine.world), restoreResult };
}

/** Optional persistence is explicit: no storage means a fresh world and no restore/write attempt. */
export async function createPersistentLifeGameSession(
  input: LifeGameHostInput,
  assets: AssetManager = createArtAssets(),
): Promise<PersistentLifeGameSession> {
  return createPersistentParsedLifeGameSession(parseHostInput(input), input, assets);
}

export function lifeHostLayout(descriptor: LifeHostDescriptorV1): MountHostOptions {
  const viewport = resolveLifeViewportProfile(descriptor.viewport.profile).host;
  return {
    fieldW: viewport.fieldW,
    fieldH: viewport.fieldH,
    topBarH: viewport.topBarH,
    ...(viewport.bottomBarH === 0 ? {} : { bottomBarH: viewport.bottomBarH }),
    viewportMode: viewport.mode,
    sceneBackground: '#183325',
    wrapperBackground: '#102017',
  };
}

/**
 * Shared Life browser host. The caller supplies data objects only; paths in the descriptor
 * are authoring identity and are never read as URLs or modules here.
 */
export function mountLifeGame(container: HTMLElement, input: LifeGameHostInput): LifeGameMountHandle {
  const parsed = parseHostInput(input); // fail-before-mount
  const assets = createArtAssets();
  let active = true;
  const shell = mountHost(container, lifeHostLayout(parsed.descriptor));
  let loop: RunLoop<LifeGameCoreSession & { readonly renderer: CanvasRenderer }> | undefined;
  let keyboardDispose: LifeKeyboardBinding | undefined;
  let topUi: ReturnType<typeof mountUI> | undefined;
  let autosaveDispose: (() => void) | undefined;
  let interaction = new LifeInteractionController();
  let interactionOptions: readonly LifeInteractionOption[] = [];
  let presentations: readonly WorldUi2DPresentation[] = [];
  let latestView: LifeHostViewModel | undefined;

  const enqueueInteraction = (actions: readonly LifeInteractionAction[]): void => {
    for (const action of actions) loop?.session?.input.enqueueAction(action.name, action.arg === undefined ? undefined : { arg: action.arg });
  };
  const repaintInteraction = (): void => { loop?.invalidate(); loop?.refresh(); };

  const ready = (async (): Promise<MountedLifeGame> => {
    const persistent = await createPersistentParsedLifeGameSession(parsed, input, assets);
    if (!active) throw new Error('Life host disposed before startup completed');
    interaction = new LifeInteractionController(createLifeInteractionTraceSink(persistent.session.engine.world));
    loop = createRunLoop<LifeHostViewModel, LifeGameCoreSession & { readonly renderer: CanvasRenderer }>({
      create: () => {
        const session = persistent.session;
        const viewport = resolveLifeViewportProfile(session.descriptor.viewport.profile).host;
        const playfieldHeight = Math.max(1, viewport.fieldH - viewport.topBarH - viewport.bottomBarH);
        const renderer = new CanvasRenderer({
          width: viewport.fieldW,
          height: playfieldHeight,
          background: '#183325',
          lifePreviewOptions: { cellSize: viewport.cellSize },
          assets,
          lifeVisualCatalog: session.visualCatalog,
          lifeWorldVisualCatalog: session.worldVisualCatalog,
          ...(viewport.mode === 'responsive'
            ? { viewport: { mode: 'responsive' as const, cameraFit: viewport.cameraFit } }
            : {}),
          worldUi2D: {
            host: shell.overlayHost, theme: STARTER_THEME, source: () => presentations,
            handlers: {
              [LIFE_INTERACTION_ACTIVATE_ACTION]: (optionId) => {
                if (!(latestView?.dialogueActive === true || !!latestView?.dialogue)) keyboardDispose?.releaseAll();
                enqueueInteraction(interaction.activate(interactionOptions, optionId));
                repaintInteraction();
              },
            },
          },
        });
        session.engine.attachRenderer(renderer, shell.playfieldHost);
        if (persistent.autosave) autosaveDispose = session.engine.subscribe(() => { persistent.autosave!.observe(session.engine.world); });
        return { ...session, renderer };
      },
      engineOf: (session) => session.engine,
      read: (session) => {
        const view = selectLifeHostView(session.engine.world, session.feedback);
        session.feedback = { ...view.results };
        return view;
      },
      sig: (view) => JSON.stringify(view),
      paint: (view) => {
        latestView = view;
        interactionOptions = buildLifeInteractionOptions(view);
        interaction.reconcile(view, interactionOptions);
        const presentation = buildLifeInteractionPresentation(view, interactionOptions, interaction.current);
        presentations = presentation ? [presentation] : [];
        const tree = buildLifeStandardHud(view, persistent.session.descriptor.hud);
        if (topUi) topUi.update(tree, STARTER_THEME);
        else topUi = mountUI(shell.topHost, tree, {}, STARTER_THEME, {
          enqueueAction: (name, arg) => { keyboardDispose?.releaseAll(); loop?.session?.input.enqueueAction(name, arg); },
        });
      },
      dispose: (session) => {
        autosaveDispose?.(); autosaveDispose = undefined;
        void persistent.autosave?.drain();
        session.renderer.destroy();
      },
    });
    loop.start();
    keyboardDispose = installLifeKeyboard(window, {
      enqueueAction: (name, arg) => loop?.session?.input.enqueueAction(name, arg),
      requestInteraction: () => { if (latestView?.canInteract) enqueueInteraction(interaction.interact(interactionOptions, latestView)); repaintInteraction(); },
      cycleInteraction: (delta) => { interaction.cycle(interactionOptions, delta); repaintInteraction(); },
      confirmInteraction: () => { enqueueInteraction(interaction.confirm(interactionOptions)); repaintInteraction(); },
      backInteraction: () => { interaction.back(interactionOptions); repaintInteraction(); },
      closeInteraction: () => { if (!(latestView?.dialogueActive === true || !!latestView?.dialogue)) interaction.close(); repaintInteraction(); },
    }, document);
    const loader = input.loadArt ?? ((manager: AssetManager, slug: string) => loadGameArtInto(manager, slug));
    void loader(assets, persistent.session.descriptor.artSlug).then(() => {
      if (!active) return;
      loop?.invalidate(); loop?.refresh();
    }).catch(() => { /* Render-only art is fail-soft; semantic previews remain active. */ });
    return {
      ...persistent,
      renderer: loop.session!.renderer,
      shell,
      flushAutosave: () => persistent.autosave?.drain() ?? Promise.resolve(),
    };
  })();

  return {
    ready,
    dispose() {
      if (!active) return;
      active = false;
      keyboardDispose?.(); keyboardDispose = undefined;
      interaction.close();
      loop?.stop(); loop = undefined;
      topUi?.(); topUi = undefined;
      shell.teardown();
    },
  };
}

import { World } from '@zerocraft/engine/engine/core/world.js';
import { createStoragePort, type StoragePort } from '@zerocraft/engine/services/storage/index.js';
import {
  LIFE_HOST_SAVE_SCHEMA, LifeHostAutosave, LifeHostSaveAdapter,
  deriveLifeHostSaveSlot, lifeHostCommitSignature, type LifeHostRestoreResult,
} from '../../src/engine/host/life-save.js';
import { LIFE_DEMO_HOST_DESCRIPTOR } from './host-descriptor.js';

export const LIFE_DEMO_SAVE_SLOT = deriveLifeHostSaveSlot(LIFE_DEMO_HOST_DESCRIPTOR);
export const LIFE_DEMO_SAVE_VERSION = LIFE_HOST_SAVE_SCHEMA;
export type LifeDemoRestoreResult = LifeHostRestoreResult;
export const lifeDemoCommitSignature = lifeHostCommitSignature;

/** Little Valley names only its descriptor; all policy and isolation live in the shared host adapter. */
export class LifeDemoSaveAdapter extends LifeHostSaveAdapter {
  constructor(world: World, port: StoragePort = createStoragePort()) {
    super(LIFE_DEMO_HOST_DESCRIPTOR, world, port);
  }
}

export class LifeDemoAutosave extends LifeHostAutosave {}

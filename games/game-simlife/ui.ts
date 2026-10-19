import { buildLifeStandardHud, buildLifeStandardUi } from '@zerocraft/engine/assembly/life-host/life-hud.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { LIFE_DEMO_HOST_DESCRIPTOR } from './host-descriptor.js';
import type { LifeDemoViewModel } from './view-model.js';

/** Existing game's authored descriptor HUD slice; the generic builder owns layout and actions. */
export const LIFE_DEMO_HUD = LIFE_DEMO_HOST_DESCRIPTOR.hud;

export const buildLifeDemoTopHud = (view: LifeDemoViewModel): LayoutNode => buildLifeStandardHud(view, LIFE_DEMO_HUD);
export const buildLifeDemoUi = (view: LifeDemoViewModel, worldInteraction?: LayoutNode | null): LayoutNode => buildLifeStandardUi(view, LIFE_DEMO_HUD, worldInteraction);

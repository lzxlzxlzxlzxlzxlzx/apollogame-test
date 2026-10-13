/** Little Valley compatibility surface; all behavior lives in the generic Life host. */
export {
  createLifeDialogueSource as createLifeDemoDialogueSource,
  lifeResultFeedback as lifeWarpFeedback,
  selectLifeHostView as selectLifeDemoView,
} from '../../src/engine/host/life-presenter.js';
export type { LifeHostViewModel as LifeDemoViewModel } from '../../src/engine/host/life-presenter.js';

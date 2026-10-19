/** Little Valley compatibility surface; all behavior lives in the generic Life host. */
export {
  createLifeDialogueSource as createLifeDemoDialogueSource,
  lifeResultFeedback as lifeWarpFeedback,
  selectLifeHostView as selectLifeDemoView,
} from '@zerocraft/engine/assembly/life-host/life-presenter.js';
export type { LifeHostViewModel as LifeDemoViewModel } from '@zerocraft/engine/assembly/life-host/life-presenter.js';

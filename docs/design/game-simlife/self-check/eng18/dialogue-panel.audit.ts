import { buildLifeInteractionNode, buildLifeInteractionOptions, LifeInteractionController } from '../../../../../src/engine/host/life-interaction.js';
import type { LifeHostViewModel } from '../../../../../src/engine/host/life-presenter.js';
import { mountUI } from '../../../../../src/ui/components/index.js';
import { STARTER_THEME } from '../../../../../src/ui/starters/index.js';

const view: LifeHostViewModel = {
  scene: 'fixture', x: 0, y: 0, date: 'Spring 1', slot: 'Morning', placeLabel: 'Town', canInteract: true,
  interactionSummary: 'Talk', inventory: [], allowedActions: [], nearby: [], nearbyWarps: [], affordances: [], results: {}, objective: 'Continue the conversation', relationships: [],
  dialogueActive: true, dialogueTarget: 'npc', dialogue: '旅人：这是一段足够长的对话内容，用来验证面板实底、换行、选项与帮助文字在窄视口中仍然清晰。', dialogueKind: 'choice',
  dialogueOptions: [{ index: 0, label: '继续听下去', available: true }, { index: 1, label: '稍后再决定', available: true }],
};
const options = buildLifeInteractionOptions(view);
const controller = new LifeInteractionController(); controller.reconcile(view, options);
const node = buildLifeInteractionNode(options, controller.current, view.dialogue);
if (!node) throw new Error('dialogue audit requires a visible panel');
mountUI(document.getElementById('root')!, node, {}, STARTER_THEME);

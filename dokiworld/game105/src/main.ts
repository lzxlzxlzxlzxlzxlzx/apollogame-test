import { createAppClient } from '@dokiworld/app-sdk';
import { createDialogueClientExtension } from '@dokiworld/app-sdk/dialogue';
import { createCharacterClientExtension } from '@dokiworld/app-sdk/character';
import { createPersonaClientExtension } from '@dokiworld/app-sdk/persona';
import { mount } from '@games/game-105/game-105.js';
import { buildHeartTowerGameResult } from './game-result.js';
import { deterministicReply } from './mock-dialogue.js';

const GAME_ID = 'game-105-heart-tower';
const INPUT_CONTRACT = { contract: 'doki.game.heart-tower-input', version: 1 };
const RESULT_ID = 'heart-tower-final';
const DIALOGUE_TIMEOUT_MS = 20_000;

const root = document.querySelector<HTMLElement>('#app');
const boot = document.querySelector<HTMLElement>('#boot');
if (!root || !boot) throw new Error('game105 app shell missing');

const app = createAppClient({
  appId: GAME_ID,
  modules: ['dialogue', 'character', 'persona', 'progress', 'resize', 'resume'],
});
const dialogue = createDialogueClientExtension(app, { timeoutMs: DIALOGUE_TIMEOUT_MS });
const character = createCharacterClientExtension(app);
const persona = createPersonaClientExtension(app);

let teardown: (() => void) | null = null;
let duplicateReplaySent = false;
let completed = false;

function hideBoot(): void {
  boot.style.display = 'none';
}

function personaForDialogue(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) return null;
  if (candidate.gender !== 'male' && candidate.gender !== 'female' && candidate.gender !== 'non-binary') return null;
  if (typeof candidate.age !== 'number' || !Number.isFinite(candidate.age)) return null;
  return {
    name: candidate.name,
    gender: candidate.gender,
    age: candidate.age,
    ...(typeof candidate.likes === 'string' && candidate.likes.trim() ? { likes: candidate.likes } : {}),
    ...(typeof candidate.description === 'string' && candidate.description.trim() ? { description: candidate.description } : {}),
  };
}

function launchGame(payload: {
  sessionId?: string;
  seed?: number;
  character?: Record<string, unknown> | null;
  playerPersona?: Record<string, unknown> | null;
  relationship?: Record<string, unknown> | null;
  returnPolicy?: string;
  debugDuplicateResult?: boolean;
}) {
  const fallbackCharacter = payload.character && typeof payload.character === 'object' ? payload.character : {};
  const fallbackPersona = payload.playerPersona && typeof payload.playerPersona === 'object' ? payload.playerPersona : {};
  Promise.allSettled([
    character.getCurrent(),
    typeof fallbackCharacter.id === 'string' ? persona.getSelected(String(fallbackCharacter.id)) : Promise.resolve({ persona: null }),
  ]).then(([characterResult, personaResult]) => {
    const currentCharacter = characterResult.status === 'fulfilled' ? characterResult.value.character : null;
    const currentPersona = personaResult.status === 'fulfilled' && personaResult.value.persona
      ? personaResult.value.persona
      : fallbackPersona;
    teardown?.();
    hideBoot();
    app.send('dokiworld-app-resize', { height: 720 });
    app.send('dokiworld-app-progress', { score: 0, maxScore: 100 });
    teardown = mount(root, {
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : null,
      seed: Number.isInteger(payload.seed) ? payload.seed : 105,
      companionName: typeof currentCharacter?.name === 'string'
        ? currentCharacter.name
        : (typeof fallbackCharacter.name === 'string' ? fallbackCharacter.name : '绮光'),
      playerPersonaName: typeof currentPersona?.name === 'string' ? currentPersona.name : '',
      resolveAIReply: async (request) => {
        const fallback = deterministicReply(request);
        try {
          const generated = await dialogue.generateDialogue({
            sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
            characterId: typeof currentCharacter?.id === 'string' ? currentCharacter.id : undefined,
            inputMode: 'behavior',
            playerInput: `${request.characterName}刚抽到「${CHANNEL_NAMES[request.card.channel]}」${request.kind === 'penalty' ? '收尾' : '互动'}卡：${request.card.prompt}。请用中文回应 1-2 句，不超过 80 个汉字。不要改变游戏结果。`,
            ...(personaForDialogue(currentPersona) ? { playerPersona: personaForDialogue(currentPersona) } : {}),
          });
          const text = generated?.utterances?.[0]?.segments?.find((segment) => segment?.type === 'dialogue')?.text;
          return typeof text === 'string' && text.trim()
            ? { text: text.trim(), mode: 'llm' as const }
            : { text: fallback, mode: 'template' as const };
        } catch {
          return { text: fallback, mode: 'template' as const };
        }
      },
      onComplete: ({ session, replyMode }) => {
        if (completed) return;
        completed = true;
        const output = buildHeartTowerGameResult(session, { replyMode });
        app.send('dokiworld-app-progress', { score: output.data.normalizedScore, maxScore: 100 });
        void app.complete(output, { resultId: RESULT_ID }).then(async () => {
          if (!payload.debugDuplicateResult || duplicateReplaySent) return;
          duplicateReplaySent = true;
          await app.complete(output, { resultId: RESULT_ID });
        });
      },
    });
  });
}

const CHANNEL_NAMES = {
  pink: '轻语',
  purple: '心动',
  blue: '默契',
  gold: '勇气',
};

if (window.parent === window) {
  hideBoot();
  teardown = mount(root);
} else {
  app.connect({
    onInit: async ({ input }) => {
      if (input.contract !== INPUT_CONTRACT.contract || input.version !== INPUT_CONTRACT.version) {
        throw new Error(`Unexpected input contract: ${input.contract}/${input.version}`);
      }
      completed = false;
      duplicateReplaySent = false;
      launchGame((input.data ?? {}) as Record<string, unknown>);
    },
    onPrepareExit: async () => ({
      isDirty: !completed,
      canSuspend: false,
    }),
    onExitDecision: async () => {
      teardown?.();
      teardown = null;
    },
  });
}

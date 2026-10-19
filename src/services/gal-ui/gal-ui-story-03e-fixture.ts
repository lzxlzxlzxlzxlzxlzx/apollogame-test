import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';

export function mountGal03e(variant: string, theme: string): void {
  const choice = variant === 'choice' || variant === 'rechoice';
  const text = variant === 'long'
    ? '夜色比约定的时间更早降临。温室的灯仍然亮着，她将那封没有署名的信放在桌边，问我是否还记得那年春天说过的话。风吹过玻璃窗，书页翻到最后一行，我们都没有立刻回答。'
    : choice ? '如果翻开它，你会先问什么？' : '夜色比约定的时间更早降临。温室的灯，还亮着。';
  const model = { ...auditModel, story: { ...auditModel.story,
    kind: choice ? 'choice' as const : 'line' as const, text,
    choices: choice ? auditModel.story.choices : [],
    read: variant === 'rechoice',
  } };
  mountUI(document.getElementById('root')!, buildGalSliceTree(model, auditState('story')),
    {}, theme === 'light' ? apolloToon : apolloOnyx);
  document.documentElement.dataset.galReady = 'true';
}

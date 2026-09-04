const CHANNEL_NAMES = {
  pink: '轻语',
  purple: '心动',
  blue: '默契',
  gold: '勇气',
};

export function deterministicReply({ characterName, playerPersonaName, card, kind, fallbackReply }) {
  if (!card) return fallbackReply;
  const player = playerPersonaName ? `${playerPersonaName}，` : '';
  if (kind === 'penalty') return `${player}${characterName}会把「${card.title}」认真收好。下一局，我们慢一点。`;
  return `${player}${characterName}把${CHANNEL_NAMES[card.channel]}这一块记下了。我们继续慢一点，好吗？`;
}

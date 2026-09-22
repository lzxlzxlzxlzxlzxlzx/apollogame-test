/** Local ApolloGame preview host for the independently built DokiWorld Loot Chest App. */
export function mount(container: HTMLElement): () => void {
  const frame = document.createElement('iframe');
  frame.title = '开启宝箱 · Loot Chest';
  frame.src = '/apps/game-loot-chest/index.html';
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent';
  frame.allow = 'fullscreen';
  container.replaceChildren(frame);
  return () => { frame.remove(); container.replaceChildren(); };
}

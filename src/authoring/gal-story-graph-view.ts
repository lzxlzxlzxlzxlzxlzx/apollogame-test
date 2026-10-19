export const STORY_BOX_W = 176;
export const STORY_BOX_H = 72;

export interface StoryGraphBox {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly subtitle: string;
  readonly kind: 'line-slot' | 'choice' | 'check' | 'jump' | 'ending';
}
export interface StoryGraphLink { readonly from: string; readonly to: string; readonly label: string }
export interface StoryGraphPicture {
  readonly width: number;
  readonly height: number;
  readonly boxes: readonly StoryGraphBox[];
  readonly links: readonly StoryGraphLink[];
}
export interface StoryGraphLabelBook {
  readonly options?: Readonly<Record<string, string>>;
  readonly endings?: Readonly<Record<string, string>>;
  readonly locations?: Readonly<Record<string, string>>;
}

interface RawNode { kind?: string; next?: RawRef; options?: { id?: string; next?: RawRef }[]; pass?: RawRef; fail?: RawRef; then?: RawRef; otherwise?: RawRef; endingId?: string; checkIntent?: string }
interface RawRef { chapterId?: string; nodeId?: string }
interface RawChapter { title?: string; start?: string; sceneId?: string; nodes?: Record<string, RawNode> }
interface RawGraph { entry?: RawRef; chapters?: Record<string, RawChapter>; sceneSlots?: { id?: string; locationId?: string }[] }

function refKey(ref: RawRef | undefined): string {
  return ref?.chapterId && ref.nodeId ? `${ref.chapterId}/${ref.nodeId}` : '';
}

function clip(text: string, max = 18): string {
  const value = text.trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function isGraph(data: unknown): data is RawGraph {
  if (!data || typeof data !== 'object') return false;
  const graph = data as RawGraph;
  return Boolean(graph.chapters && graph.entry?.chapterId && graph.entry.nodeId);
}

/** Turn a story-graph draft into columns. The entry is the first column; a choice splits the rows under it. */
export function layoutStoryGraph(data: unknown, labels: StoryGraphLabelBook = {}): StoryGraphPicture | null {
  if (!isGraph(data)) return null;
  const chapters = data.chapters ?? {};
  const sceneName = new Map((data.sceneSlots ?? []).map((slot) => [slot.id ?? '', labels.locations?.[slot.locationId ?? ''] || slot.locationId || '']));
  const nodes = new Map<string, { chapterId: string; nodeId: string; chapter: RawChapter; node: RawNode }>();
  for (const [chapterId, chapter] of Object.entries(chapters)) {
    for (const [nodeId, node] of Object.entries(chapter.nodes ?? {})) nodes.set(`${chapterId}/${nodeId}`, { chapterId, nodeId, chapter, node });
  }
  const entry = refKey(data.entry);
  if (!nodes.has(entry)) return null;
  const outgoing = (key: string): StoryGraphLink[] => {
    const item = nodes.get(key);
    if (!item) return [];
    const node = item.node;
    const link = (ref: RawRef | undefined, label: string): StoryGraphLink | null => {
      const to = refKey(ref);
      return to && nodes.has(to) ? { from: key, to, label } : null;
    };
    if (node.kind === 'choice') return (node.options ?? []).flatMap((option) => { const edge = link(option.next, clip(labels.options?.[option.id ?? ''] || option.id || '选项', 12)); return edge ? [edge] : []; });
    if (node.kind === 'check') return [link(node.pass, '通过'), link(node.fail, '未通过')].filter((edge): edge is StoryGraphLink => Boolean(edge));
    if (node.kind === 'jump') return [link(node.then, '然后'), link(node.otherwise, '否则')].filter((edge): edge is StoryGraphLink => Boolean(edge));
    if (node.kind === 'ending') return [];
    return [link(node.next, '')].filter((edge): edge is StoryGraphLink => Boolean(edge));
  };
  const lane = new Map<string, number>();
  lane.set(entry, 0);
  let nextLane = 1;
  const rank = new Map<string, number>();
  const seen: string[] = [];
  const queue = [entry];
  rank.set(entry, 0);
  seen.push(entry);
  for (let guard = 0; queue.length && guard < nodes.size * 4; guard += 1) {
    const key = queue.shift()!;
    const nextRank = (rank.get(key) ?? 0) + 1;
    const fresh = outgoing(key).filter((edge) => !rank.has(edge.to));
    fresh.forEach((edge, index) => {
      rank.set(edge.to, nextRank);
      seen.push(edge.to);
      queue.push(edge.to);
      if (index === 0) lane.set(edge.to, lane.get(key) ?? 0);
      else { lane.set(edge.to, nextLane); nextLane += 1; }
    });
  }
  let extra = Math.max(...rank.values()) + 1;
  for (const key of nodes.keys()) if (!rank.has(key)) { rank.set(key, extra); lane.set(key, nextLane); nextLane += 1; seen.push(key); extra += 1; }
  const links = [...nodes.keys()].flatMap((key) => outgoing(key));
  const incoming = new Map<string, string>();
  for (const link of links) if (link.label && !incoming.has(link.to)) incoming.set(link.to, link.label);
  const pad = 16;
  const rows = Math.max(...rank.values()) + 1;
  const lanes = Math.max(...lane.values()) + 1;
  const boxes: StoryGraphBox[] = seen.map((key) => {
    const item = nodes.get(key)!;
    const kind = item.node.kind === 'choice' || item.node.kind === 'check' || item.node.kind === 'jump' || item.node.kind === 'ending' ? item.node.kind : 'line-slot';
    const place = sceneName.get(item.chapter.sceneId ?? '') || '';
    const title = kind === 'ending' ? clip(labels.endings?.[item.node.endingId ?? ''] || item.node.endingId || '结局', 12)
      : kind === 'choice' ? '选择'
      : kind === 'check' ? clip(item.node.checkIntent || '检定', 12)
      : kind === 'jump' ? '跳转'
      : clip(item.chapter.title || item.nodeId, 12);
    const rawSubtitle = incoming.get(key) || (kind === 'ending' ? '结局' : kind === 'line-slot' ? place : item.chapter.title || '');
    return {
      key,
      x: pad + (lane.get(key) ?? 0) * (STORY_BOX_W + 36),
      y: pad + (rank.get(key) ?? 0) * (STORY_BOX_H + 36),
      title,
      subtitle: rawSubtitle === title ? '' : clip(rawSubtitle, 14),
      kind,
    };
  });
  const linksOnPicture = links.filter((link) => boxes.some((box) => box.key === link.from) && boxes.some((box) => box.key === link.to));
  return {
    width: pad * 2 + lanes * STORY_BOX_W + Math.max(0, lanes - 1) * 36,
    height: pad * 2 + rows * STORY_BOX_H + Math.max(0, rows - 1) * 36,
    boxes,
    links: linksOnPicture,
  };
}

export function storyGraphLabels(routes: unknown): StoryGraphLabelBook {
  if (!routes || typeof routes !== 'object') return {};
  const outline = routes as { forks?: { options?: { id?: string; intent?: string }[] }[]; endings?: { id?: string; outcome?: string }[]; locations?: { id?: string; name?: string }[] };
  const options: Record<string, string> = {};
  for (const fork of outline.forks ?? []) for (const option of fork.options ?? []) if (option.id && option.intent) options[option.id] = option.intent;
  const endings: Record<string, string> = {};
  for (const ending of outline.endings ?? []) if (ending.id && ending.outcome) endings[ending.id] = ending.outcome;
  const locations: Record<string, string> = {};
  for (const location of outline.locations ?? []) if (location.id && location.name) locations[location.id] = location.name;
  return { options, endings, locations };
}

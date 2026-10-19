import { authoringSteps, type AuthoringSession } from './gal-authoring-flow.js';
import { emptyAuthoringToolTrace, runAuthoringTool, type AuthoringToolTrace } from './gal-authoring-tools.js';

export interface AuthoringChatMessage { readonly role: 'user' | 'assistant'; readonly content: string; readonly images?: readonly string[] }
export interface AuthoringDirectory {
  readonly stepId: string;
  readonly steps: readonly { id: string; status: string }[];
  readonly materials: readonly { id: string; title: string; role: string; kind: string }[];
  readonly characters: readonly { id: string; name: string }[];
}

const MAX_ROUNDS = 6;

/** Ids and titles only. Bodies stay behind the tools. */
export function authoringDirectory(session: AuthoringSession): AuthoringDirectory {
  return {
    stepId: session.stepId,
    steps: authoringSteps(session).map((step) => ({ id: step.id, status: step.status })),
    materials: session.materials.map((item) => ({ id: item.id, title: item.title, role: item.role, kind: item.kind ?? 'text' })),
    characters: session.cast.map((item) => ({ id: item.id, name: item.name })),
  };
}

function parseAction(text: string): { kind: 'reply'; text: string } | { kind: 'tool'; name: string; args: Record<string, unknown> } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as { kind?: unknown; text?: unknown; name?: unknown; args?: unknown };
    if (value.kind === 'reply' && typeof value.text === 'string') return { kind: 'reply', text: value.text };
    if (value.kind === 'tool' && typeof value.name === 'string' && value.args !== null && typeof value.args === 'object' && !Array.isArray(value.args)) {
      return { kind: 'tool', name: value.name, args: value.args as Record<string, unknown> };
    }
    return null;
  } catch { return null; }
}

/** One user turn. The model sees the directory, then calls tools. A reply never approves the step. */
export async function runAuthoringChat(
  session: AuthoringSession,
  history: readonly AuthoringChatMessage[],
  userText: string,
  ask: (messages: readonly AuthoringChatMessage[]) => Promise<string>,
): Promise<{ session: AuthoringSession; history: AuthoringChatMessage[]; reply: string; notes: string[] }> {
  const notes: string[] = [];
  let current = session;
  let trace: AuthoringToolTrace = emptyAuthoringToolTrace();
  const transcript: AuthoringChatMessage[] = [...history, { role: 'user', content: userText }];
  const visible: AuthoringChatMessage[] = [...transcript];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const raw = await ask([
      { role: 'user', content: `目录\n${JSON.stringify(authoringDirectory(current))}` },
      ...transcript,
    ]);
    const action = parseAction(raw);
    if (!action) {
      notes.push('模型没有返回可用的 JSON');
      return { session: current, history: [...visible, { role: 'assistant', content: '这一轮没有改产物。请再试一次。' }], reply: '这一轮没有改产物。请再试一次。', notes };
    }
    if (action.kind === 'reply') {
      const reply = action.text.trim() || '已看过。产物还是待通过。';
      return { session: current, history: [...visible, { role: 'assistant', content: reply }], reply, notes };
    }
    const result = runAuthoringTool(current, trace, action.name, action.args);
    current = result.session;
    trace = result.trace;
    const output = result.output && typeof result.output === 'object' ? { ...(result.output as Record<string, unknown>) } : result.output;
    const image = output && typeof output === 'object' && typeof (output as { image?: unknown }).image === 'string' ? (output as { image: string }).image : '';
    if (output && typeof output === 'object') delete (output as { image?: string }).image;
    const packed = JSON.stringify({ issues: result.issues, output }).slice(0, 24000);
    transcript.push({ role: 'assistant', content: raw }, { role: 'user', content: `工具结果\n${packed}`, ...(image ? { images: [image] } : {}) });
    notes.push(result.issues[0]?.message ?? action.name);
  }
  return { session: current, history: [...visible, { role: 'assistant', content: '这一轮工具调用太长，已停住。产物没有自动通过。' }], reply: '这一轮工具调用太长，已停住。产物没有自动通过。', notes };
}

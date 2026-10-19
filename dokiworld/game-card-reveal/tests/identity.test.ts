import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_REVEAL_INPUT_CONTRACT, CARD_REVEAL_RESULT_CONTRACT, cardRevealOutput, inputFromContract, parseSettlementRevealInput, parseCardRevealOutput } from '../src/contract.js';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
describe('DokiWorld identity and docs', () => {
  it('keeps schema 3 identity, contracts and documentation path aligned', () => {
    const manifest = JSON.parse(read('../manifest.json'));
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.id).toBe('game-card-reveal');
    expect(manifest.entry).toBe('index.html');
    expect(manifest.context).toEqual({ requiredScopes: [], optionalScopes: [] });
    expect(manifest.runtime).toMatchObject({ protocol: 'dokiworld.app', protocolVersion: 2, input: { contract: CARD_REVEAL_INPUT_CONTRACT, version: 2 }, outputs: [{ contract: CARD_REVEAL_RESULT_CONTRACT, version: 1 }], modules: [] });
    expect(manifest.documentation['zh-cn'].path).toBe('docs/integration.zh-CN.md');
    expect(read('../docs/integration.zh-CN.md')).toContain('## 12. 上线前核对清单');
    expect(read('../src/main.ts')).toContain("appId: 'game-card-reveal'");
  });
  it('parses the exact data-only JSON example from chapter 3', () => {
    const doc = read('../docs/integration.zh-CN.md');
    const section = doc.split('## 3. APPS 调试面板')[1].split('## 4. 输入合同')[0];
    const match = /```json\s*([\s\S]*?)\s*```/.exec(section);
    expect(match).not.toBeNull();
    expect(parseSettlementRevealInput(JSON.parse(match![1])).cards.map((card) => card.id)).toEqual(['preview-clear']);
  });
  it('parses every JSON example in the 12-chapter document against real contracts', () => {
    const doc = read('../docs/integration.zh-CN.md');
    expect(doc).not.toMatch(/S4 尚|S5 接|placeholder:|尚不主动加载|仍待 S5/);
    const examples = [...doc.matchAll(/```json\s*([\s\S]*?)\s*```/g)].map((match) => JSON.parse(match[1]));
    expect(examples).toHaveLength(4);
    expect(parseSettlementRevealInput(examples[0]).cards).toHaveLength(1);
    expect(inputFromContract(examples[1]).cards).toHaveLength(1);
    expect(parseCardRevealOutput(examples[2])).toEqual(cardRevealOutput('preview-clear', 'natural'));
    expect(parseCardRevealOutput(examples[3])).toEqual(cardRevealOutput('preview-clear', 'skipped'));
  });
});

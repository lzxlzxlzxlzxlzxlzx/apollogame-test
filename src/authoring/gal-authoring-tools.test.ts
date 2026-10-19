import { describe, expect, it } from 'vitest';
import { emptyAuthoringSession, reviewAuthoringStep, setAuthoringCast, submitAuthoringData } from './gal-authoring-flow.js';
import { emptyAuthoringToolTrace, runAuthoringTool } from './gal-authoring-tools.js';
import { currentApprovedGalDraft } from './gal-draft-review.js';
import type { GalBrief } from './gal-draft-types.js';

const brief = (): GalBrief => ({ id: 'work', defaultLocale: 'zh-CN', locales: ['zh-CN'], target: { minutes: 10, routes: 1, endings: 1 }, genre: ['mystery'], audience: 'teen', themes: ['truth'], prohibitedContent: ['gore'], artDirection: { style: 'ink', palette: ['blue'], referenceIds: [] }, platforms: ['web'], constraints: [] });

function ready() {
  let session = emptyAuthoringSession();
  session = submitAuthoringData(session, brief(), 'brief').session;
  session = reviewAuthoringStep(session, 'approve', 'human').session;
  session = setAuthoringCast(session, [{ id: 'lin', name: '林', reference: '参考', source: 'new' }]).session;
  const traced = runAuthoringTool(session, emptyAuthoringToolTrace(), 'read_rules', {});
  const specified = runAuthoringTool(traced.session, traced.trace, 'read_spec', {});
  const stepped = runAuthoringTool(specified.session, specified.trace, 'read_step', { stepId: 'brief' });
  const character = runAuthoringTool(stepped.session, stepped.trace, 'read_character', { id: 'lin' });
  return character;
}

describe('GAL authoring tool directory', () => {
  it('rejects a candidate until the required reads have happened', () => {
    const session = emptyAuthoringSession();
    const early = runAuthoringTool(session, emptyAuthoringToolTrace(), 'submit_candidate', { summary: '改简报', data: brief() });
    expect(early.issues).toContainEqual(expect.objectContaining({ code: 'required' }));
    expect(currentApprovedGalDraft(early.session.ledger, early.session.projectId, 'brief')).toBeUndefined();
  });

  it('submits only the current step and does not approve it', () => {
    const readyCall = ready();
    const submitted = runAuthoringTool(readyCall.session, readyCall.trace, 'submit_candidate', { summary: '改简报', data: brief(), stepId: 'brief' });
    expect(submitted.issues).toEqual([]);
    expect(submitted.output).toEqual({ status: 'draft' });
    expect(currentApprovedGalDraft(submitted.session.ledger, submitted.session.projectId, 'brief')?.draftId).toBe('brief-1');
    const otherStep = runAuthoringTool(readyCall.session, readyCall.trace, 'submit_candidate', { stepId: 'bible', summary: '越步', data: {} });
    expect(otherStep.issues).toContainEqual(expect.objectContaining({ code: 'step' }));
    expect(otherStep.session.materials).toEqual(readyCall.session.materials);
  });

  it('tells the script step that unlockCg does not display a CG', () => {
    let session = ready().session;
    session = { ...session, stepId: 'script' };
    const spec = runAuthoringTool(session, emptyAuthoringToolTrace(), 'read_spec', {});
    expect(spec.output).toMatchObject({ stepId: 'script' });
    expect(JSON.stringify(spec.output)).toContain('unlockCg');
    expect(JSON.stringify(spec.output)).toContain('visible');
  });
});

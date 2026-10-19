const clone = (value) => structuredClone(value);
const entityFlag = (kind, objectId) => `${kind}.${objectId}`;
const selectedFlag = (objectId) => `selected.${objectId}`;
const conditionResource = (id, value) => ({ kind: 'resource', id, cmp: 'eq', value });
const conditionFlag = (id) => ({ kind: 'flag', id });
const conditionNotFlag = (id) => ({ kind: 'not', of: conditionFlag(id) });
const conditionAnd = (...of) => ({ kind: 'and', of });
const componentEntity = (component, data) => ({ [component]: data });
const textColor = (custom) => ({ custom });

function label(id, text, x, y, width, height, options = {}) {
  return {
    type: 'Label', id, props: { text, size: options.size ?? 18, color: textColor(options.color ?? '#F4EEDF'),
      font: 'ui', bold: options.bold ?? false, ...(options.tracking !== undefined ? { tracking: options.tracking } : {}) },
    layout: { x, y, width, height, ...(options.allowOverlap ? { allowOverlap: true } : {}) },
    ...(options.visibleWhen ? { visibleWhen: options.visibleWhen } : {}),
  };
}

function button(id, text, action, x, y, width, height, visibleWhen) {
  return {
    type: 'Button', id, props: { label: text, kind: 'ghost', action, skin: '', labelSize: 16, labelWeight: 700,
      borderWidth: 2, focusRingVisual: { color: textColor('#139CA4'), width: 3, offset: 3 } },
    layout: { x, y, width, height, radius: 0, padding: { top: 9, right: 13, bottom: 9, left: 13 } },
    ...(visibleWhen ? { visibleWhen } : {}),
  };
}

function evidenceCard(item, prefix, includeCollectionControl, collectedFlag) {
  const selected = selectedFlag(item.objectId);
  const children = [
    label(`${prefix}-eyebrow-${item.objectId}`, 'EVIDENCE / 现场证物', 0, 0, 716, 18, { size: 13, color: '#123E43', tracking: 2.08 }),
    label(`${prefix}-title-${item.objectId}`, item.name, 0, 25, 716, 45, { size: 34, color: '#352617', bold: true }),
    {
      type: 'Panel', id: `${prefix}-image-slot-${item.objectId}`,
      props: { bg: { custom: 'radial-gradient(ellipse,#52696a,#19262a)' }, border: { width: 7, color: textColor('#7A6345') } },
      layout: { x: 0, y: 88, width: 716, height: 274, padding: 0, radius: 0 },
      children: [{ type: 'Image', id: `${prefix}-image-${item.objectId}`,
        props: { src: item.evidenceImage.imageUrl, alt: item.evidenceImage.alt, fit: 'cover', position: 'top' },
        layout: { x: 0, y: 0, width: 702, height: 260 } }],
    },
    label(`${prefix}-description-${item.objectId}`, item.description, 0, 381, 585, 56, { size: 18, color: '#1B211D' }),
  ];
  if (includeCollectionControl) {
    children.push(button(`${prefix}-collect-${item.objectId}`, '收录证物', 'clue.collect', 608, 430, 108, 47, `!${collectedFlag}`));
    children.push(label(`${prefix}-already-collected-${item.objectId}`, '已收录 · 再次查看', 580, 430, 136, 47,
      { size: 16, color: '#185D50', bold: true, visibleWhen: collectedFlag }));
  }
  return { type: 'Panel', id: `${prefix}-card-${item.objectId}`, props: { bare: true },
    layout: { width: 716, height: 484, padding: 0 }, children, visibleWhen: selected };
}

function replaceNode(ui, id, replacement) {
  const index = ui.children.findIndex((node) => node.id === id);
  if (index < 0) throw new Error(`base presentation is missing ${id}`);
  ui.children[index] = replacement;
}

function findById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findById(child, id);
    if (found) return found;
  }
  return undefined;
}

function updateStaticLabel(ui, id, value) {
  const node = ui.children.map((child) => findById(child, id)).find(Boolean);
  if (!node) throw new Error(`base presentation is missing label ${id}`);
  node.props.text = value;
}

function makeLedger(items, requiredCount) {
  const clues = items.filter((item) => item.kind === 'clue');
  const rows = clues.flatMap((item) => {
    const collected = entityFlag('collected', item.objectId);
    return [
      label(`ledger-clue-name-${item.objectId}`, `${item.name} · ${item.required ? '必要' : '可选'}`, 38, 0, 220, 25,
        { size: 13, color: '#BECBC9' }),
      label(`ledger-clue-pending-${item.objectId}`, '未收录', 266, 0, 70, 25,
        { size: 12, color: '#BECBC9', visibleWhen: `!${collected}` }),
      label(`ledger-clue-found-${item.objectId}`, '已收录', 266, 0, 70, 25,
        { size: 12, color: '#EED09A', bold: true, visibleWhen: collected }),
    ];
  });
  const rowNodes = [];
  for (let i = 0; i < clues.length; i++) {
    rowNodes.push({ type: 'Panel', id: `ledger-clue-row-${clues[i].objectId}`, props: { bare: true },
      layout: { width: 336, height: 25 }, children: [
        label(`ledger-clue-bullet-${clues[i].objectId}`, '•', 18, 0, 12, 25, { size: 14, color: '#EED09A' }),
        ...rows.slice(i * 3, i * 3 + 3),
      ] });
  }
  const height = 62 + clues.length * 25;
  return {
    type: 'Panel', id: 'clue-ledger', visibleWhen: 'records-open',
    props: { bg: { custom: '#0E1720DC' }, border: { width: 1, color: textColor('#8b7652') } },
    layout: { x: 42, y: 900 - height - 42, width: 360, height, padding: 12, radius: 8, direction: 'column', gap: 2 },
    children: [
      { type: 'Button', id: 'ledger-title', props: { label: `▾ 线索清单  ${requiredCount} 项必要`, kind: 'quiet', action: 'records.close',
        labelColor: textColor('#f1dfb8'), labelSize: 15, labelWeight: 700, skin: '' }, layout: { width: 205, height: 23, padding: 0, radius: 4 } },
      ...rowNodes,
    ],
  };
}

function makeFlavorPanel(base, items) {
  const original = base.presentation.ui.children.find((node) => node.id === 'flavor-archive');
  const continueButton = findById(original, 'flavor-continue');
  const children = items.filter((item) => item.kind === 'flavor').flatMap((item) => [
    label(`flavor-title-${item.objectId}`, `现场记录 · ${item.name}`, 69, 21, 1300, 24,
      { size: 18, color: '#EED09A', bold: true, tracking: 2.16, visibleWhen: selectedFlag(item.objectId) }),
    label(`flavor-description-${item.objectId}`, item.description, 69, 54, 1210, 50,
      { size: 19, color: '#F4EEDF', visibleWhen: selectedFlag(item.objectId) }),
  ]);
  children.push(continueButton);
  return { ...clone(original), children };
}

function makeClueModal(base, modalId, contentId, visibleWhen, items, collectedState) {
  const original = clone(base.presentation.ui.children.find((node) => node.id === modalId));
  if (!original) throw new Error(`base presentation is missing ${modalId}`);
  const container = { type: 'Panel', id: contentId, props: { bare: true }, layout: { width: 716, height: 484, padding: 0 },
    children: items.filter((item) => item.kind === 'clue').map((item) => evidenceCard(item,
      collectedState ? 'collection' : 'evidence', !collectedState, entityFlag('collected', item.objectId))) };
  original.children = [container];
  original.visibleWhen = visibleWhen;
  return original;
}

function makeCollectedModal(base, items) {
  const original = clone(base.presentation.ui.children.find((node) => node.id === 'clue-collected-modal'));
  if (!original) throw new Error('base presentation is missing clue-collected-modal');
  const stamp = findById(original, 'collection-stamp');
  const content = { type: 'Panel', id: 'collection-content-dynamic', props: { bare: true }, layout: { width: 716, height: 484, padding: 0 },
    children: [
      ...items.filter((item) => item.kind === 'clue').map((item) => evidenceCard(item, 'collection', false, entityFlag('collected', item.objectId))),
      ...(stamp ? [clone(stamp)] : []),
    ] };
  original.children = [content];
  return original;
}

function generatedKeybinding(key, signal, when) {
  return { KeyBinding: { key, signal, phase: 'action', when } };
}

export function buildFormalManifest(baseManifest, data, sessionId, preparedVisuals, projectedVisuals, backgroundKey) {
  const raw = clone(baseManifest);
  const entities = raw.entities;
  const projectById = new Map(projectedVisuals.map((item) => [item.id, item]));
  const preparedById = new Map(preparedVisuals.map((item) => [item.id, item]));
  const clueCount = data.objects.filter((item) => item.kind === 'clue' && item.required).length;
  const removeIds = new Set();
  for (const [eid, components] of Object.entries(entities)) {
    const key = components.KeyBinding?.key ?? '';
    const signal = components.Effect?.onSignal ?? '';
    if (eid.startsWith('object-') && eid !== 'scene-background'
      || eid.startsWith('viewed-') || eid.startsWith('collected-')
      || key.startsWith('investigate.') || key === 'clue.collect'
      || signal.startsWith('investigate.') || signal.startsWith('clue.collect.')) removeIds.add(eid);
  }
  for (const eid of removeIds) delete entities[eid];

  entities['scene-background'].Sprite.textureKey = backgroundKey;
  entities['required-collected'].Resource = { id: 'required-collected', current: 0, min: 0, max: clueCount };
  entities['required-total'].Resource = { id: 'required-total', current: clueCount, min: clueCount, max: clueCount };
  entities['selected-object'].Resource = { id: 'selected-object', current: 0, min: 0, max: data.objects.length };
  entities['complete-threshold'].EventWhen.when = { kind: 'resource', id: 'required-collected', cmp: 'gte', value: 0, vsResource: 'required-total' };

  const flow = entities['investigation-flow'].GameFlow;
  const states = new Map(flow.states.map((state) => [state.id, state]));
  const idle = states.get('scene-idle');
  idle.transitions = [
    { when: conditionFlag('exit-requested'), to: 'exit-confirm' },
    ...data.objects.map((item, index) => ({ when: conditionResource('selected-object', index + 1), to: item.kind === 'clue' ? 'clue-reveal' : 'flavor-result' })),
  ];
  states.get('flavor-result').transitions = [{ when: conditionResource('selected-object', 0), to: 'scene-idle' }];
  states.get('clue-reveal').transitions = [
    { when: conditionResource('selected-object', 0), to: 'scene-idle' },
    { when: conditionFlag('collection-committed'), to: 'clue-collected' },
  ];
  const collected = states.get('clue-collected');
  collected.transitions = [
    { after: 42, when: conditionFlag('complete-ready'), to: 'completed' },
    { after: 42, to: 'scene-idle', do: [{ kind: 'modify-resource', targetId: 'selected-object', op: 'set', value: 0 }] },
  ];
  const reset = states.get('resetting');
  reset.onEnter = reset.onEnter.filter((effect) => !/^collected\./.test(effect.targetId ?? '') && !/^viewed\./.test(effect.targetId ?? ''));
  for (const item of data.objects) {
    const isClue = item.kind === 'clue';
    const doneId = entityFlag(isClue ? 'collected' : 'viewed', item.objectId);
    reset.onEnter.push({ kind: 'set-flag', targetId: doneId, value: false });
    const index = data.objects.indexOf(item) + 1;
    const action = `investigate.${item.objectId}`;
    const signal = action;
    const worldEntity = `object-${item.objectId}`;
    const projected = projectById.get(item.objectId);
    const prepared = preparedById.get(item.objectId);
    if (!projected || !prepared) throw new Error(`HostVisualBridge projection missing ${item.objectId}`);
    entities[worldEntity] = {
      Transform: Object.fromEntries(Object.entries(clone(projected.transform)).filter(([key]) => key !== 'type')),
      Sprite: Object.fromEntries(Object.entries(clone(projected.sprite)).filter(([key]) => key !== 'type')),
      Shape: { kind: 'box', width: item.placement.width * 1440, height: item.placement.height * 900 },
      Color: { tint: 0xffffff, alpha: 1 },
      Clickable: { ...Object.fromEntries(Object.entries(clone(projected.clickable)).filter(([key]) => key !== 'type')), onlyFlag: 'interaction-enabled' },
      Flag: { id: doneId, active: false },
    };
    entities[`action-investigate-${item.objectId}`] = generatedKeybinding(action, signal, conditionFlag('interaction-enabled'));
    entities[`effect-select-${item.objectId}`] = { Effect: { onSignal: signal, kind: 'modify-resource', targetId: 'selected-object', op: 'set', value: index } };
    if (!isClue) entities[`effect-viewed-${item.objectId}`] = { Effect: { onSignal: signal, kind: 'set-flag', targetId: entityFlag('viewed', item.objectId), value: true } };
    if (isClue) {
      const collectSignal = `clue.collect.${item.objectId}`;
      entities[`action-collect-${item.objectId}`] = generatedKeybinding('clue.collect', collectSignal,
        conditionAnd(conditionResource('selected-object', index), conditionFlag('clue-reveal-open'), conditionNotFlag(doneId)));
      entities[`effect-collect-${item.objectId}`] = { Effect: { onSignal: collectSignal, kind: 'set-flag', targetId: doneId, value: true } };
      entities[`effect-commit-${item.objectId}`] = { Effect: { onSignal: collectSignal, kind: 'set-flag', targetId: 'collection-committed', value: true } };
      if (item.required) entities[`effect-count-${item.objectId}`] = { Effect: { onSignal: collectSignal, kind: 'modify-resource', targetId: 'required-collected', op: 'add', value: 1 } };
    }
  }

  const ui = raw.presentation.ui;
  const flags = Object.fromEntries(data.objects.map((item, index) => [selectedFlag(item.objectId),
    { kind: 'resource-equals', id: 'selected-object', value: index + 1 }]));
  raw.presentation.flags = { ...Object.fromEntries(Object.entries(raw.presentation.flags).filter(([name]) => !name.startsWith('selected.'))), ...flags };
  raw.presentation.focusTargets = data.objects.map((item) => ({ entity: `object-${item.objectId}`, label: `调查：${item.name}`,
    action: `investigate.${item.objectId}`, when: 'flow.idle', labelPlacement: 'above', labelGap: 8, labelSize: 14,
    tone: item.kind === 'clue' ? 'gold' : 'cyan' }));
  const oldTotal = findById(ui, 'progress-total');
  oldTotal.props.text = ` / ${clueCount}`;
  updateStaticLabel(ui, 'case-title', data.title);
  updateStaticLabel(ui, 'case-goal', `目标：${data.objective}`);
  updateStaticLabel(ui, 'completed-progress', `${clueCount} 项必要证物已归档。调查结果由宿主负责后续处理。`);
  replaceNode(ui, 'clue-ledger', makeLedger(data.objects, clueCount));
  replaceNode(ui, 'flavor-archive', makeFlavorPanel(raw, data.objects));
  replaceNode(ui, 'clue-reveal-modal', makeClueModal(raw, 'clue-reveal-modal', 'evidence-structure-dynamic', 'flow.reveal', data.objects, false));
  replaceNode(ui, 'clue-collected-modal', makeCollectedModal(raw, data.objects));
  raw.presentation.lists = {};
  return raw;
}

export function hostVisualInput(data, imageUrlFor = (_id, image) => image.imageUrl) {
  return data.objects.map((item) => ({ id: item.objectId, imageUrl: imageUrlFor(item.objectId, item.sceneImage),
    pixelWidth: item.sceneImage.pixelWidth, pixelHeight: item.sceneImage.pixelHeight, placement: item.placement, hitMask: item.hitMask }));
}

export function imageDescriptors(data, sessionId) {
  const backgroundKey = `host-background:${sessionId}`;
  const evidence = data.objects.filter((item) => item.kind === 'clue').map((item) => ({
    key: `host-evidence:${sessionId}:${item.objectId}`, image: item.evidenceImage,
  }));
  return { backgroundKey, background: data.background, evidence };
}

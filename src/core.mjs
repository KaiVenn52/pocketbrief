export const EXAMPLE = 'Pump B vibrates after restart. Isolate before inspection. Maya to check mounting bolts by Friday. Photo pending.';

export const SECTIONS = {
  observations: 'Observations',
  actions: 'Actions',
  questions: 'Open questions',
};
export const MAX_CARRYOVER_BYTES = 2_000_000;

export function sourceLines(text) {
  if (typeof text !== 'string' || text.trim().length < 5) {
    throw new Error('Add at least one meaningful field note.');
  }
  if (text.length > 12000) throw new Error('Keep field notes below 12,000 characters.');
  return text.split(/(?<=[.!?])\s+|\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: index + 1, text }));
}

function sourceItem(source) {
  return { text: source.text, sourceId: source.id, quote: source.text };
}

export function formatLocal(text) {
  const sources = sourceLines(text);
  const result = {
    observations: [],
    actions: [],
    questions: [],
    sources,
    mode: 'Local formatting',
    generatedAt: new Date().toISOString(),
  };
  for (const source of sources) {
    let section = 'observations';
    if (/\b(pending|unknown|confirm|unclear|missing)\b|\?/i.test(source.text)) {
      section = 'questions';
    } else if (/\b(to check|must|should|isolate|inspect|replace|call|repair|check|follow up)\b/i.test(source.text)) {
      section = 'actions';
    }
    result[section].push(sourceItem(source));
  }
  return result;
}

export function validateModelOutput(value, sources) {
  const unassigned = new Map(sources.map(source => [source.id, source]));
  const result = { sources };
  for (const field of Object.keys(SECTIONS)) {
    if (!Array.isArray(value?.[field])) throw new Error('Missing model section: ' + SECTIONS[field]);
    result[field] = value[field].map(id => {
      const source = unassigned.get(id);
      if (!source) throw new Error('A source reference was repeated or out of range.');
      unassigned.delete(id);
      return sourceItem(source);
    });
  }
  if (unassigned.size) throw new Error('The model left out part of the source notes.');
  return result;
}

export function startHandover(result, id, previous) {
  const tracked = ['actions', 'questions'].flatMap(section =>
    result[section].map(item => ({
      ...item,
      key: `${id}:${item.sourceId}`,
      handoverId: id,
      section,
    })),
  );
  const carried = previous?.tracked.filter(item => !item.resolution) ?? [];
  return { ...result, id, tracked: [...tracked, ...carried] };
}

export function resolveItem(handover, key, note) {
  const resolution = note.trim();
  if (!resolution) throw new Error('Describe how this item was resolved.');
  const item = handover.tracked.find(item => item.key === key);
  if (!item || item.resolution) return handover;
  return {
    ...handover,
    tracked: handover.tracked.map(item => item.key === key ? { ...item, resolution } : item),
  };
}

export function serializeCarryover(handover) {
  return JSON.stringify({
    version: 1,
    lastHandoverId: handover.id,
    items: handover.tracked.filter(item => !item.resolution)
      .map(({ handoverId, sourceId, section, text }) => ({ handoverId, sourceId, section, text })),
  }, null, 2);
}

export function readCarryover(data) {
  const document = JSON.parse(data);
  const id = document?.lastHandoverId;
  if (document?.version !== 1 || !Number.isSafeInteger(id) || id < 1 || id >= Number.MAX_SAFE_INTEGER - 1 ||
      !Array.isArray(document.items) || !document.items.length) {
    throw new Error('Choose a PocketBrief carryover file containing open items.');
  }
  const seen = new Set();
  const tracked = document.items.map(item => {
    const { handoverId, sourceId, section, text } = item ?? {};
    if (!Number.isSafeInteger(handoverId) || handoverId < 1 || handoverId > id ||
        !Number.isSafeInteger(sourceId) || sourceId < 1 || sourceId > 12000 ||
        !['actions', 'questions'].includes(section) ||
        typeof text !== 'string' || !text.trim() || text.length > 12000) {
      throw new Error('A carryover item is missing its original source or text.');
    }
    const key = `${handoverId}:${sourceId}`;
    if (seen.has(key)) throw new Error('The carryover file contains a duplicate item.');
    seen.add(key);
    return { key, handoverId, sourceId, section, text, quote: text };
  });
  return { id, tracked };
}

export function asMarkdown(result) {
  const lines = ['# Field handover', '', `Processing: ${result.mode}`, ''];
  if (result.id) lines.push(`Handover: ${result.id}`, '');
  for (const [section, title] of Object.entries(SECTIONS)) {
    lines.push('## ' + title);
    for (const item of result[section]) {
      const tracked = result.tracked?.find(i => i.handoverId === result.id && i.sourceId === item.sourceId);
      lines.push(`- ${item.text} [${item.sourceId}]`);
      if (tracked?.resolution) lines.push(`  - Resolution: ${tracked.resolution}`);
    }
    lines.push('');
  }
  const carried = result.tracked?.filter(item => item.handoverId !== result.id) ?? [];
  if (carried.length) {
    lines.push('## From earlier handovers');
    for (const item of carried) {
      lines.push(`- ${item.text} (handover ${item.handoverId}, source ${item.sourceId})`);
      lines.push(`  - ${item.resolution ? 'Resolution: ' + item.resolution : 'Still open'}`);
    }
    lines.push('');
  }
  lines.push('## Sources', ...result.sources.map(s => `[${s.id}] ${s.text}`), '');
  lines.push('Review actions with the responsible person before execution.');
  return lines.join('\n');
}

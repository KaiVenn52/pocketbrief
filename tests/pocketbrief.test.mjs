import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocal, validateModelOutput, EXAMPLE, sourceLines, asMarkdown, startHandover, resolveItem, serializeCarryover, readCarryover } from '../src/core.mjs';
test('local format preserves every note verbatim',()=>{const r=formatLocal(EXAMPLE);assert.equal(r.sources.length,4);assert.equal(r.actions.length,2);assert.equal(r.questions.length,1);assert.equal(r.observations.length,1);assert.equal([...r.observations,...r.actions,...r.questions].length,r.sources.length);});
test('empty or oversized notes are rejected',()=>{assert.throws(()=>sourceLines(''));assert.throws(()=>sourceLines('a'.repeat(12001)));});
test('model can classify sources but the handover displays the complete original text', () => {
  const sources = sourceLines(EXAMPLE);
  const result = validateModelOutput({ observations: [1], actions: [2, 3], questions: [4] }, sources);
  assert.equal(result.actions[0].text, 'Isolate before inspection.');
  assert.equal(result.questions[0].quote, sources[3].text);
});
test('outside, duplicate, invented and omitted sources are rejected', () => {
  const sources = sourceLines(EXAMPLE);
  const invalidItems = [99, 2, { sourceId: 1, text: 'Done.' }, '1'];
  for (const id of invalidItems) {
    assert.throws(() => validateModelOutput({ observations: [id], actions: [2, 3], questions: [4] }, sources));
  }
  assert.throws(() => validateModelOutput({ observations: [], actions: [2, 3], questions: [4] }, sources));
});
test('markdown includes source provenance',()=>assert.match(asMarkdown(formatLocal(EXAMPLE)),/\[1\] Pump B/));
test('unresolved items carry once with the original handover and source references', () => {
  const first = startHandover(formatLocal(EXAMPLE), 1);
  assert.throws(() => resolveItem(first, '1:2', ' '), /Describe/);
  const reviewed = resolveItem(first, '1:2', 'Isolation logged.');
  const second = startHandover(formatLocal('Pump C running.'), 2, reviewed);
  assert.deepEqual(second.tracked.map(item => item.key), ['1:3', '1:4']);
  assert.match(asMarkdown(second), /Photo pending\. \(handover 1, source 4\)/);
  assert.doesNotMatch(asMarkdown(second), /Isolate before inspection/);
  const closed = resolveItem(second, '1:4', 'Photo added to the shift log.');
  assert.match(asMarkdown(closed), /Resolution: Photo added to the shift log/);
  assert.deepEqual(startHandover(formatLocal('Pump D running.'), 3, closed).tracked.map(item => item.key), ['1:3']);
});
test('carryover files transfer only open items and keep references across sessions', () => {
  const first = startHandover(formatLocal(EXAMPLE), 1);
  const reviewed = resolveItem(first, '1:2', 'Isolation logged.');
  const file = serializeCarryover(reviewed);
  assert.doesNotMatch(file, /Isolation logged|Isolate before inspection|Pump B vibrates/);
  const imported = readCarryover(file);
  const next = startHandover(formatLocal('Pump C is running.'), imported.id + 1, imported);
  assert.deepEqual(next.tracked.map(item => item.key), ['1:3', '1:4']);
  assert.match(asMarkdown(next), /Photo pending\. \(handover 1, source 4\)/);
});
test('carryover files reject invalid references, duplicate entries and unsupported versions', () => {
  const valid = { handoverId: 1, sourceId: 3, section: 'questions', text: 'Photo pending.' };
  for (const document of [
    { version: 2, lastHandoverId: 1, items: [valid] },
    { version: 1, lastHandoverId: 1, items: [valid, valid] },
    { version: 1, lastHandoverId: 1, items: [{ ...valid, handoverId: 3 }] },
    { version: 1, lastHandoverId: 1, items: [{ ...valid, section: 'observations' }] },
  ]) {
    assert.throws(() => readCarryover(JSON.stringify(document)));
  }
});

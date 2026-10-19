import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSampleProject, mulberry32, SAMPLE_NOTE } from '../src/lib/sample.js';
import { validateState, observationDomains, SCHEMA, VERSION, INTENTS } from '../src/lib/model.js';
import { coverageGrid } from '../src/lib/metrics.js';
import { sampleDataFiles } from '../scripts/sample-data-files.mjs';

test('PRNG is deterministic', () => {
  const a = mulberry32(1); const b = mulberry32(1);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('sample project: 30 questions across all four intents, labelled illustrative', () => {
  const p = buildSampleProject();
  assert.equal(p.questions.length, 30);
  assert.deepEqual(INTENTS.map((i) => p.questions.filter((q) => q.intent === i).length), [8, 8, 7, 7]);
  assert.equal(p.illustrative, true);
  assert.match(p.name, /fictional/);
  assert.ok(p.brands.every((b) => /\(fictional\)/.test(b.name)));
  assert.ok(p.observations.every((o) => o.notes === SAMPLE_NOTE && /^Synthetic summary/.test(o.answerSummary)));
});

test('sample uses only reserved example.* domains', () => {
  const p = buildSampleProject();
  const domains = new Set([...p.brands.flatMap((b) => b.domains), ...p.observations.flatMap(observationDomains)]);
  assert.ok([...domains].every((d) => /(^|\.)example\.(com|org|net)$/.test(d)), [...domains].join(', '));
});

test('sample is deterministic, valid, and has a deliberate missing combination', () => {
  const p = buildSampleProject();
  assert.deepEqual(buildSampleProject(), p);
  assert.ok(validateState({ schema: SCHEMA, version: VERSION, projects: [p] }).ok);
  assert.equal(p.observations.length, 158);
  assert.deepEqual(coverageGrid(p.observations).missing, [{ platform: 'Assistant C', date: '2026-09-07' }]);
  assert.equal(p.observations.filter((o) => o.run === 2).length, 8);
});

test('sample-data files match the generator (run `npm run sample-data` after changing it)', () => {
  for (const [name, content] of Object.entries(sampleDataFiles())) {
    const onDisk = readFileSync(new URL(`../sample-data/${name}`, import.meta.url), 'utf8');
    assert.equal(onDisk, content, `${name} is out of date`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importQuestions, importObservations, describeReport } from '../src/lib/importers.js';
import { buildSampleProject } from '../src/lib/sample.js';
import { summarize } from '../src/lib/metrics.js';
import { createProject } from '../src/lib/model.js';
import { fixtureProject } from './fixtures.js';

const sampleFile = (name) => readFileSync(new URL(`../sample-data/${name}`, import.meta.url), 'utf8');

test('importQuestions adds valid rows, generates ids, skips duplicates and rejects bad intents', () => {
  const p = fixtureProject();
  const csv = 'question,intent,notes\n"Brand new question?",Purchase,n1\nbest tools for x,discovery,\n"Another, with comma",unknown,\n';
  const { project, report } = importQuestions(p, csv);
  assert.equal(report.added, 1);
  assert.equal(report.skipped, 1);
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /Row 4: Intent must be one of/);
  const added = project.questions.at(-1);
  assert.deepEqual([added.id, added.text, added.intent, added.notes], ['q04', 'Brand new question?', 'purchase', 'n1']);
  assert.equal(p.questions.length, 3, 'input project is not mutated');
  assert.equal(describeReport(report, 'question'), 'Imported 1 question, 1 duplicate skipped, 1 row rejected, 1 warning.');
});

test('importQuestions reports a fatal error for missing columns or empty files', () => {
  assert.match(importQuestions(fixtureProject(), 'text,kind\na,b\n').report.fatal, /Missing required column\(s\): question, intent/);
  assert.match(importQuestions(fixtureProject(), '').report.fatal, /empty/);
  assert.match(importQuestions(fixtureProject(), 'question,intent\n').report.fatal, /no data rows/);
  assert.match(importQuestions(fixtureProject(), 'question,intent\n"broken,discovery\n').report.fatal, /Unterminated/);
});

test('importObservations links questions by id or text, warns on unknown brands and bad URLs', () => {
  const p = fixtureProject();
  const csv = [
    'date,platform,run,question_id,question,brands_mentioned,cited_urls,cited_domains,answer_summary',
    '2026-03-01,C,1,q1,,Target Co (fictional); Mystery Brand,https://t.example.com/a not-a-url,review.example.org,Summary',
    '2026-03-01,C,1,,how does x work,TargetCo,,,Summary 2',
    '2026-03-01,C,1,,Unknown question?,,,,',
    '2026-03-01,C,1,,Brand-new question?,,,,',
    '2026-02-30,C,1,q2,,,,,bad date',
  ].join('\n');
  const { project, report } = importObservations(p, csv.replace('Brand-new question?,,,,', 'Brand-new question?,,,,'));
  assert.equal(report.added, 2);
  assert.equal(report.errors.length, 3);
  assert.ok(report.warnings.some((w) => /Mystery Brand/.test(w)));
  assert.ok(report.warnings.some((w) => /not-a-url/.test(w)));
  const [a, b] = project.observations.slice(-2);
  assert.deepEqual(a.brandsMentioned, ['T']);
  assert.deepEqual(a.citedUrls, ['https://t.example.com/a']);
  assert.deepEqual(a.citedDomains, ['review.example.org']);
  assert.equal(a.prompt, 'Best tools for X?');
  assert.equal(b.questionId, 'q3');
  assert.deepEqual(b.brandsMentioned, ['T']);
});

test('importObservations creates a missing question only when a valid intent is given', () => {
  const csv = 'date,platform,question,intent\n2026-03-01,C,Brand-new question?,purchase\n2026-03-01,C,Other new?,\n';
  const { project, report } = importObservations(fixtureProject(), csv);
  assert.equal(report.added, 1);
  assert.equal(report.errors.length, 1);
  assert.equal(project.questions.at(-1).text, 'Brand-new question?');
  assert.equal(project.questions.at(-1).intent, 'purchase');
});

test('importObservations skips duplicates of existing question/platform/date/run', () => {
  const csv = 'date,platform,question_id,run\n2026-01-01,A,q1,1\n2026-01-01,A,q1,2\n2026-01-01,A,q1,2\n';
  const { report } = importObservations(fixtureProject(), csv);
  assert.equal(report.added, 1);
  assert.equal(report.skipped, 2);
});

test('importObservations requires a question link column', () => {
  assert.match(importObservations(fixtureProject(), 'date,platform\n2026-01-01,A\n').report.fatal, /question_id or question/);
});

test('sample CSVs re-import into an empty project and reproduce the same metrics', () => {
  const sample = buildSampleProject();
  let p = { ...createProject({ name: 'Re-import test' }), brands: sample.brands };
  const q = importQuestions(p, sampleFile('sample-questions-synthetic.csv'));
  assert.equal(q.report.added, 30);
  assert.equal(q.report.errors.length, 0);
  p = q.project;
  const o = importObservations(p, sampleFile('sample-observations-synthetic.csv'));
  assert.equal(o.report.errors.length, 0);
  assert.equal(o.report.added, sample.observations.length);
  const before = summarize(sample.observations, sample.brands);
  const after = summarize(o.project.observations, o.project.brands);
  assert.deepEqual(after.targetMention, before.targetMention);
  assert.deepEqual(after.targetDomainCitation, before.targetDomainCitation);
  assert.deepEqual(after.share.rows.map((r) => r.num), before.share.rows.map((r) => r.num));
  assert.deepEqual(after.sources.map((r) => [r.domain, r.num, r.urls]), before.sources.map((r) => [r.domain, r.num, r.urls]));
});

test('templates import cleanly once their example brands exist', () => {
  let p = createProject({ name: 'Template test' });
  p = { ...p, brands: [{ id: 'b1', name: 'Brand One', role: 'target', domains: ['brandone.example.com'], aliases: [] }, { id: 'b2', name: 'Brand Two', role: 'competitor', domains: [], aliases: [] }] };
  const q = importQuestions(p, sampleFile('questions-template.csv'));
  assert.equal(q.report.added, 2);
  const o = importObservations(q.project, sampleFile('observations-template.csv'));
  assert.equal(o.report.added, 1);
  assert.deepEqual(o.project.observations[0].brandsMentioned, ['b1', 'b2']);
});

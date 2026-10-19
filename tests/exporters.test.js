import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observationsToCSV, questionsToCSV, metricsToCSV, markdownReport, METRIC_COLUMNS } from '../src/lib/exporters.js';
import { parseCSV, parseCSVObjects } from '../src/lib/csv.js';
import { importObservations } from '../src/lib/importers.js';
import { fixtureProject } from './fixtures.js';

test('observations CSV round-trips through the importer', () => {
  const p = fixtureProject();
  const csv = observationsToCSV(p);
  const rows = parseCSV(csv);
  assert.equal(rows.length, 7);
  const empty = { ...p, observations: [] };
  const { project, report } = importObservations(empty, csv);
  assert.equal(report.added, 6);
  assert.equal(report.errors.length, 0);
  const strip = (o) => ({ ...o, id: '' });
  assert.deepEqual(project.observations.map(strip), p.observations.map((o) => ({ ...strip(o), prompt: 'p', answerSummary: 's' })));
});

test('questions CSV has the template columns', () => {
  const rows = parseCSV(questionsToCSV(fixtureProject()));
  assert.deepEqual(rows[0], ['question_id', 'question', 'intent', 'notes']);
  assert.deepEqual(rows[1], ['q1', 'Best tools for X?', 'discovery', '']);
});

test('metrics CSV contains numerator, denominator, value and low-n flag per group', () => {
  const { headers, records } = parseCSVObjects(metricsToCSV(fixtureProject()));
  assert.deepEqual(headers, METRIC_COLUMNS);
  const find = (dim, value, metric, brand = '') => records.find((r) => r.data.group_dimension === dim && r.data.group_value === value && r.data.metric === metric && r.data.brand === brand)?.data;
  const overall = find('overall', 'all', 'target_brand_mention_rate');
  assert.deepEqual([overall.numerator, overall.denominator, overall.value, overall.value_pct, overall.low_n], ['3', '6', '0.5', '50.0%', 'yes']);
  assert.match(overall.data_label, /ILLUSTRATIVE/);
  const share = find('overall', 'all', 'brand_mention_share', 'Rival Two (fictional)');
  assert.deepEqual([share.numerator, share.denominator, share.value], ['2', '8', '0.25']);
  const src = find('overall', 'all', 'citation_source_frequency:review.example.org', '');
  assert.deepEqual([src.numerator, src.denominator, src.brand_role], ['3', '6', 'third-party']);
  const purchase = find('intent', 'purchase', 'target_brand_mention_rate');
  assert.deepEqual([purchase.denominator, purchase.value, purchase.value_pct], ['0', '', 'n/a']);
  const missing = find('platform_x_date', 'B @ 2026-02-01', 'observations');
  assert.equal(missing.low_n, 'missing');
});

test('metrics CSV respects scope filters', () => {
  const { records } = parseCSVObjects(metricsToCSV(fixtureProject(), { platforms: ['B'] }));
  const overall = records.find((r) => r.data.group_dimension === 'overall' && r.data.metric === 'target_brand_mention_rate').data;
  assert.deepEqual([overall.numerator, overall.denominator, overall.scope_filters], ['1', '1', 'platforms=B']);
});

test('markdown report includes disclaimer, n, definitions, missing data and comparisons', () => {
  const md = markdownReport(fixtureProject(), {}, new Date('2026-10-19T00:00:00Z'));
  assert.match(md, /Illustrative synthetic data/);
  assert.match(md, /Observations in scope \(n\): 6 across 3 question/);
  assert.match(md, /\| Target brand mention rate \| 50\.0% \| 3\/6 ⚠ low n \|/);
  assert.match(md, /Missing combinations \(not imputed\): B @ 2026-02-01/);
  assert.match(md, /\| B \| Target brand mention rate \| 100\.0% \(1\/1 ⚠ low n\) \| no data \| not comparable \| No observations for 2026-02-01\. \|/);
  assert.match(md, /## Metric definitions/);
  assert.match(md, /## Limitations/);
  const real = markdownReport({ ...fixtureProject(), illustrative: false, observations: [] });
  assert.doesNotMatch(real, /Illustrative synthetic data/);
  assert.match(real, /n\/a/);
});

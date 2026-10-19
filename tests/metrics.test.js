// Metric formulas checked against hand-computed values for tests/fixtures.js.
//
// Fixture (6 observations; brands T = target, C1, C2 = competitors):
//   o1 q1 A 2026-01-01  mentions T,C1     cites www.t.example.com (target) + review.example.org
//   o2 q2 A 2026-01-01  mentions C1       cites c1.example.com + review.example.org (domain only)
//   o3 q3 A 2026-01-01  mentions none     no citations
//   o4 q1 B 2026-01-01  mentions T        cites docs.t.example.com (domain only, target subdomain)
//   o5 q1 A 2026-02-01  mentions T,C1,C2  cites review.example.org twice (2 URLs)
//   o6 q2 A 2026-02-01  mentions C2       no citations
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rate, formatPct, formatPP, filterObservations, brandMentionRates, targetMentionRate, targetDomainCitationRate,
  anyCitationRate, mentionShare, citationSourceFrequency, runConsistency, summarize, breakdown, coverageGrid,
  compareGroups, comparisonTable, brandDomainCitationRates, LOW_N,
} from '../src/lib/metrics.js';
import { fixtureProject, obs } from './fixtures.js';

const p = fixtureProject();
const all = p.observations;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('rate returns null (n/a) for zero denominators and flags low n', () => {
  assert.deepEqual(rate(0, 0), { num: 0, den: 0, value: null, lowN: true });
  assert.equal(rate(5, 10).value, 0.5);
  assert.equal(rate(5, 10).lowN, false);
  assert.equal(rate(1, LOW_N - 1).lowN, true);
  assert.equal(formatPct(null), 'n/a');
  assert.equal(formatPct(1 / 3), '33.3%');
  assert.equal(formatPP(-0.5), '-50.0 pp');
  assert.equal(formatPP(1 / 12), '+8.3 pp');
  assert.equal(formatPP(0), '0.0 pp');
  assert.equal(formatPP(null), 'n/a');
});

test('brand mention rate = observations mentioning brand ÷ observations in scope', () => {
  const r = brandMentionRates(all, p.brands);
  assert.deepEqual(r.map((x) => [x.brand.id, x.num, x.den]), [['T', 3, 6], ['C1', 3, 6], ['C2', 2, 6]]);
  close(r[2].value, 2 / 6);
  assert.deepEqual([targetMentionRate(all, p.brands).num, targetMentionRate(all, p.brands).den], [3, 6]);
});

test('target-domain citation rate counts URLs and manual domains, including subdomains', () => {
  const r = targetDomainCitationRate(all, p.brands);
  assert.deepEqual([r.num, r.den], [2, 6]); // o1 (www.t.example.com) and o4 (docs.t.example.com)
  const per = brandDomainCitationRates(all, p.brands);
  assert.deepEqual(per.map((x) => x.num), [2, 1, 0]);
  assert.deepEqual([anyCitationRate(all).num, anyCitationRate(all).den], [4, 6]); // o1, o2, o4, o5
});

test('mention share = brand mentions ÷ all tracked-brand mentions', () => {
  const s = mentionShare(all, p.brands);
  assert.equal(s.total, 8);
  assert.deepEqual(s.rows.map((r) => [r.num, r.den]), [[3, 8], [3, 8], [2, 8]]);
  close(s.rows.reduce((a, r) => a + r.value, 0), 1);
  // duplicates within one observation count once; unknown ids are ignored
  const d = mentionShare([obs('x', 'q1', 'A', '2026-01-01', ['T', 'T', 'ghost'])], p.brands);
  assert.equal(d.total, 1);
  assert.equal(mentionShare([], p.brands).rows[0].value, null);
});

test('citation-source frequency counts each domain once per observation, plus URL counts', () => {
  const rows = citationSourceFrequency(all, p.brands);
  assert.deepEqual(rows.map((r) => [r.domain, r.num, r.urls, r.ownerType]), [
    ['review.example.org', 3, 3, 'third-party'],
    ['c1.example.com', 1, 1, 'competitor'],
    ['docs.t.example.com', 1, 0, 'target'],
    ['t.example.com', 1, 1, 'target'],
  ]);
  close(rows[0].value, 0.5);
  assert.equal(rows[2].ownerName, 'Target Co (fictional)');
});

test('empty scope gives n/a everywhere, never 0%', () => {
  const s = summarize([], p.brands);
  assert.equal(s.n, 0);
  assert.equal(s.targetMention.value, null);
  assert.equal(s.targetDomainCitation.value, null);
  assert.equal(s.anyCitation.value, null);
  assert.ok(s.mentionRates.every((r) => r.value === null));
  assert.deepEqual(s.sources, []);
  assert.equal(s.consistency.value, null);
});

test('no target brand defined gives 0 of n, not an error', () => {
  const brands = p.brands.filter((b) => b.role !== 'target');
  assert.equal(targetMentionRate(all, brands).num, 0);
  assert.equal(targetDomainCitationRate(all, brands).value, 0);
});

test('filterObservations applies platform, date and intent filters (empty = all)', () => {
  assert.equal(filterObservations(p, {}).length, 6);
  assert.equal(filterObservations(p, { platforms: ['B'] }).length, 1);
  assert.equal(filterObservations(p, { dates: ['2026-02-01'] }).length, 2);
  assert.deepEqual(filterObservations(p, { intents: ['discovery'] }).map((o) => o.id), ['o1', 'o4', 'o5']);
  assert.deepEqual(filterObservations(p, { platforms: ['A'], intents: ['comparison'] }).map((o) => o.id), ['o2', 'o6']);
});

test('breakdown by intent always lists all four intents', () => {
  const b = breakdown(p, all, 'intent');
  assert.deepEqual(b.map((g) => [g.value, g.summary.n]), [['discovery', 3], ['informational', 1], ['comparison', 2], ['purchase', 0]]);
  assert.equal(b[3].summary.targetMention.value, null);
});

test('coverage grid shows counts and lists missing combinations', () => {
  const g = coverageGrid(all);
  assert.deepEqual(g.rows, ['A', 'B']);
  assert.deepEqual(g.cols, ['2026-01-01', '2026-02-01']);
  assert.deepEqual(g.cells, [[3, 2], [1, 0]]);
  assert.deepEqual(g.missing, [{ platform: 'B', date: '2026-02-01' }]);
});

test('date comparison on matched questions (platform A)', () => {
  // A@01-01 has q1,q2,q3; A@02-01 has q1,q2 → shared {q1,q2}; o3 excluded.
  const r = compareGroups(p, all.filter((o) => o.platform === 'A'), { dimension: 'date', a: '2026-01-01', b: '2026-02-01' });
  assert.equal(r.sharedQuestions, 2);
  assert.deepEqual(r.excluded, { a: 1, b: 0 });
  const m = Object.fromEntries(r.metrics.map((x) => [x.key, x]));
  assert.deepEqual([m.targetMention.a.num, m.targetMention.a.den, m.targetMention.b.num, m.targetMention.b.den], [1, 2, 1, 2]);
  close(m.targetMention.delta, 0);
  close(m.targetDomainCitation.delta, -0.5); // 1/2 → 0/2
  close(m.anyCitation.delta, -0.5); // 2/2 → 1/2
  close(m.targetShare.a.value, 1 / 3); // o1 T,C1 + o2 C1
  close(m.targetShare.b.value, 1 / 4); // o5 T,C1,C2 + o6 C2
  close(m.targetShare.delta, -1 / 12);
  assert.ok(m.targetMention.comparable && m.targetMention.lowN);
});

test('unmatched comparison uses every observation on each side', () => {
  const r = compareGroups(p, all.filter((o) => o.platform === 'A'), { dimension: 'date', a: '2026-01-01', b: '2026-02-01', matchQuestions: false });
  const tm = r.metrics.find((x) => x.key === 'targetMention');
  assert.deepEqual([tm.a.num, tm.a.den, tm.b.num, tm.b.den], [1, 3, 1, 2]);
  close(tm.delta, 1 / 2 - 1 / 3);
});

test('comparison with a missing side is reported as not comparable', () => {
  const table = comparisonTable(p, all, { dimension: 'date', a: '2026-01-01', b: '2026-02-01', holdDim: 'platform' });
  const b = table.find((t) => t.hold === 'B').result;
  assert.ok(b.metrics.every((m) => !m.comparable && m.delta === null));
  assert.match(b.metrics[0].reason, /No observations for 2026-02-01/);
  const platforms = compareGroups(p, all, { dimension: 'platform', a: 'A', b: 'B' });
  assert.equal(platforms.sharedQuestions, 1); // only q1 was asked on B
  assert.ok(platforms.metrics[0].comparable);
});

test('run-to-run agreement only counts groups with repeated runs', () => {
  const runs = [
    obs('r1', 'q1', 'A', '2026-03-01', ['T'], [], [], 1),
    obs('r2', 'q1', 'A', '2026-03-01', ['T', 'C1'], [], [], 2), // agrees (target mentioned both runs)
    obs('r3', 'q2', 'A', '2026-03-01', ['T'], [], [], 1),
    obs('r4', 'q2', 'A', '2026-03-01', ['C1'], [], [], 2), // disagrees
    obs('r5', 'q3', 'A', '2026-03-01', [], [], [], 1), // single run: excluded
  ];
  const r = runConsistency(runs, p.brands);
  assert.deepEqual([r.num, r.den, r.value], [1, 2, 0.5]);
  assert.equal(runConsistency(all, p.brands).value, null);
});

test('both sides with data but no shared questions: values shown, not comparable', () => {
  const two = [obs('x1', 'q1', 'A', '2026-01-01', ['T']), obs('x2', 'q2', 'A', '2026-02-01', [])];
  const r = compareGroups(p, two, { dimension: 'date', a: '2026-01-01', b: '2026-02-01' });
  assert.equal(r.sharedQuestions, 0);
  const tm = r.metrics[0];
  assert.equal(tm.comparable, false);
  assert.equal(tm.delta, null);
  assert.match(tm.reason, /No questions were observed on both sides/);
  assert.deepEqual([tm.a.num, tm.a.den, tm.b.num, tm.b.den], [1, 1, 0, 1]);
});

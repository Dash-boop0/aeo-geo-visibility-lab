// Exporters: observations CSV, questions CSV, processed metrics CSV and a Markdown report.
// Pure functions, no DOM access.

import { toCSV } from './csv.js';
import { INTENT_LABELS } from './model.js';
import { OBSERVATION_COLUMNS, QUESTION_COLUMNS } from './importers.js';
import {
  summarize, breakdown, coverageGrid, comparisonTable, distinct, formatPct, formatPP, LOW_N, filterObservations,
} from './metrics.js';

const join = (list) => list.join('; ');

/** Observations CSV — same columns as the import template, so exports re-import cleanly. */
export function observationsToCSV(project, observations = project.observations) {
  const qById = new Map(project.questions.map((q) => [q.id, q]));
  const bById = new Map(project.brands.map((b) => [b.id, b]));
  const rows = [OBSERVATION_COLUMNS];
  for (const o of observations) {
    const q = qById.get(o.questionId) || {};
    rows.push([
      o.id, o.date, o.platform, o.run, o.questionId, q.text || '', q.intent || '', o.prompt, o.settings,
      o.answerSummary, join(o.brandsMentioned.map((id) => bById.get(id)?.name).filter(Boolean)),
      join(o.citedUrls), join(o.citedDomains), o.notes,
    ]);
  }
  return toCSV(rows);
}

export function questionsToCSV(project) {
  return toCSV([QUESTION_COLUMNS, ...project.questions.map((q) => [q.id, q.text, q.intent, q.notes])]);
}

export const METRIC_COLUMNS = [
  'data_label', 'scope_filters', 'group_dimension', 'group_value', 'metric', 'brand', 'brand_role',
  'numerator', 'denominator', 'value', 'value_pct', 'low_n',
];

function describeFilters(filters = {}) {
  const parts = [];
  if (filters.platforms?.length) parts.push(`platforms=${filters.platforms.join('|')}`);
  if (filters.dates?.length) parts.push(`dates=${filters.dates.join('|')}`);
  if (filters.intents?.length) parts.push(`intents=${filters.intents.join('|')}`);
  return parts.join('; ') || 'all observations';
}

const round = (v) => (v === null ? null : Math.round(v * 1e6) / 1e6);

function metricRows(label, scope, dim, value, s) {
  const out = [];
  const push = (metric, r, brand = null) => out.push([
    label, scope, dim, value, metric, brand ? brand.name : '', brand ? brand.role : '',
    r.num, r.den, round(r.value), r.value === null ? 'n/a' : formatPct(r.value), r.lowN ? 'yes' : 'no',
  ]);
  push('target_brand_mention_rate', s.targetMention);
  push('target_domain_citation_rate', s.targetDomainCitation);
  push('any_citation_rate', s.anyCitation);
  for (const r of s.mentionRates) push('brand_mention_rate', r, r.brand);
  for (const r of s.share.rows) push('brand_mention_share', r, r.brand);
  for (const r of s.domainCitationRates) push('brand_domain_citation_rate', r, r.brand);
  for (const r of s.sources) {
    out.push([label, scope, dim, value, `citation_source_frequency:${r.domain}`, r.ownerName, r.ownerType,
      r.num, r.den, round(r.value), formatPct(r.value), r.lowN ? 'yes' : 'no']);
  }
  return out;
}

/**
 * Processed metrics in long format: one row per (group, metric, brand) with numerator,
 * denominator, value and a low-n flag. Groups: overall, platform, date, intent, platform×date.
 */
export function metricsToCSV(project, filters = {}) {
  const obs = filterObservations(project, filters);
  const label = project.illustrative ? 'ILLUSTRATIVE SYNTHETIC DATA - not real AI results' : 'user-recorded observations';
  const scope = describeFilters(filters);
  const rows = [METRIC_COLUMNS];
  rows.push(...metricRows(label, scope, 'overall', 'all', summarize(obs, project.brands)));
  for (const dim of ['platform', 'date', 'intent']) {
    for (const g of breakdown(project, obs, dim)) rows.push(...metricRows(label, scope, dim, g.value, g.summary));
  }
  const grid = coverageGrid(obs);
  grid.rows.forEach((p, i) => grid.cols.forEach((d, j) => {
    if (grid.cells[i][j] === 0) {
      rows.push([label, scope, 'platform_x_date', `${p} @ ${d}`, 'observations', '', '', 0, '', null, 'n/a', 'missing']);
      return;
    }
    const sub = obs.filter((o) => o.platform === p && o.date === d);
    rows.push(...metricRows(label, scope, 'platform_x_date', `${p} @ ${d}`, summarize(sub, project.brands)));
  }));
  return toCSV(rows);
}

// ---------------------------------------------------------------- Markdown

const mdEscape = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const nNote = (r) => `${r.num}/${r.den}${r.lowN ? ' ⚠ low n' : ''}`;

function mdTable(headers, rows) {
  return [
    `| ${headers.map(mdEscape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(mdEscape).join(' | ')} |`),
  ].join('\n');
}

/** Markdown research report for the observations in scope. */
export function markdownReport(project, filters = {}, generatedAt = new Date()) {
  const obs = filterObservations(project, filters);
  const s = summarize(obs, project.brands);
  const lines = [];
  lines.push(`# AEO/GEO visibility report — ${project.name}`, '');
  if (project.illustrative) {
    lines.push('> **Illustrative synthetic data.** Every observation in this project was generated for demonstration.',
      '> These are NOT real AI-assistant answers or citations and must not be cited as evidence of any brand\'s visibility.', '');
  }
  lines.push(`- Generated: ${generatedAt.toISOString().slice(0, 10)} with AEO/GEO Visibility Research Lab`);
  lines.push(`- Scope: ${describeFilters(filters)}`);
  lines.push(`- Observations in scope (n): ${s.n} across ${s.questions} question(s)`);
  lines.push(`- Platforms: ${distinct(obs, 'platform').join(', ') || 'none'}; dates: ${distinct(obs, 'date').join(', ') || 'none'}`);
  lines.push(`- Rates with a denominator below ${LOW_N} are flagged "⚠ low n". "n/a" means the denominator is zero.`, '');
  if (project.description) lines.push(project.description, '');

  lines.push('## Headline metrics', '');
  lines.push(mdTable(['Metric', 'Value', 'Numerator/denominator'], [
    ['Target brand mention rate', formatPct(s.targetMention.value), nNote(s.targetMention)],
    ['Target-domain citation rate', formatPct(s.targetDomainCitation.value), nNote(s.targetDomainCitation)],
    ['Any-citation rate', formatPct(s.anyCitation.value), nNote(s.anyCitation)],
    ['Run-to-run agreement (target mention)', formatPct(s.consistency.value), nNote(s.consistency)],
  ]), '');

  lines.push('## Brand visibility', '');
  lines.push(mdTable(['Brand', 'Role', 'Mention rate', 'n', 'Mention share', 'Domain citation rate'],
    project.brands.map((b, i) => {
      const m = s.mentionRates[i]; const sh = s.share.rows[i]; const dc = s.domainCitationRates[i];
      return [b.name, b.role, formatPct(m.value), nNote(m), `${formatPct(sh.value)} (${nNote(sh)})`, `${formatPct(dc.value)} (${nNote(dc)})`];
    })), '');

  lines.push('## Citation sources (top 15 domains)', '');
  lines.push(s.sources.length
    ? mdTable(['Domain', 'Owner', 'Observations citing', 'Rate', 'Cited URLs'],
      s.sources.slice(0, 15).map((r) => [r.domain, r.ownerName ? `${r.ownerName} (${r.ownerType})` : 'third-party', String(r.num), `${formatPct(r.value)} (${nNote(r)})`, String(r.urls)]))
    : '_No citations recorded in scope._', '');

  for (const dim of ['platform', 'date', 'intent']) {
    lines.push(`## By ${dim}`, '');
    lines.push(mdTable([dim[0].toUpperCase() + dim.slice(1), 'n', 'Target mention rate', 'Target-domain citation rate', 'Any-citation rate'],
      breakdown(project, obs, dim).map((g) => [dim === 'intent' ? INTENT_LABELS[g.value] : g.value, String(g.summary.n),
        `${formatPct(g.summary.targetMention.value)} (${nNote(g.summary.targetMention)})`,
        `${formatPct(g.summary.targetDomainCitation.value)} (${nNote(g.summary.targetDomainCitation)})`,
        `${formatPct(g.summary.anyCitation.value)} (${nNote(g.summary.anyCitation)})`])), '');
  }

  const grid = coverageGrid(obs);
  lines.push('## Coverage (observations per platform × date)', '');
  if (grid.rows.length) {
    lines.push(mdTable(['Platform', ...grid.cols], grid.rows.map((p, i) => [p, ...grid.cells[i].map((c) => (c === 0 ? 'missing' : String(c)))])), '');
    lines.push(grid.missing.length
      ? `Missing combinations (not imputed): ${grid.missing.map((m) => `${m.platform} @ ${m.date}`).join('; ')}.`
      : 'No missing platform × date combinations.', '');
  } else lines.push('_No observations in scope._', '');

  const dates = distinct(obs, 'date');
  if (dates.length >= 2) {
    const [a, b] = [dates[0], dates[dates.length - 1]];
    lines.push(`## Change between ${a} and ${b} by platform (matched questions only)`, '');
    const table = comparisonTable(project, obs, { dimension: 'date', a, b, holdDim: 'platform' });
    lines.push(mdTable(['Platform', 'Metric', a, b, 'Change', 'Note'], table.flatMap(({ hold, result }) => result.metrics.map((m) => [
      hold, m.label,
      result.rawN.a ? `${formatPct(m.a.value)} (${nNote(m.a)})` : 'no data',
      result.rawN.b ? `${formatPct(m.b.value)} (${nNote(m.b)})` : 'no data',
      m.comparable ? formatPP(m.delta) : 'not comparable',
      m.comparable ? (m.lowN ? 'low n — treat as directional' : `${result.sharedQuestions} shared questions`) : m.reason,
    ]))), '');
  }

  lines.push('## Metric definitions', '');
  lines.push('- **Brand mention rate** = observations whose answer mentions the brand ÷ observations in scope.');
  lines.push('- **Target brand mention rate** = observations mentioning at least one target brand ÷ observations in scope.');
  lines.push('- **Target-domain citation rate** = observations citing ≥1 URL or domain on a target-brand domain (including subdomains) ÷ observations in scope.');
  lines.push('- **Mention share** = mentions of the brand ÷ all tracked-brand mentions in scope (each brand counted at most once per observation).');
  lines.push('- **Citation-source frequency** = observations citing the domain (once per observation) ÷ observations in scope; cited-URL counts shown alongside.');
  lines.push('- **Run-to-run agreement** = (question, platform, date) groups with ≥2 runs whose runs all agree on target mention ÷ such groups.', '');

  lines.push('## Limitations', '');
  lines.push('- AI answers vary from run to run, by account state, location and model version; one observation is a sample, not a ranking.');
  lines.push('- Observations are logged manually; summaries, brand mentions and citations reflect the logger\'s reading and may contain errors.');
  lines.push('- Results describe only this fixed question set and the platforms/dates recorded; they do not generalise to all buyer queries.');
  lines.push('- Differences flagged as low n, or computed on few shared questions, should be treated as directional only.');
  lines.push('');
  return lines.join('\n');
}


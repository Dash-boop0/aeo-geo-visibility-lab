// Compare: two dates or two platforms, on matched questions, with sample sizes and missing data.
import {
  filterObservations, compareGroups, comparisonTable, coverageGrid, distinct, formatPct, formatPP, LOW_N,
} from '../lib/metrics.js';
import { INTENTS } from '../lib/model.js';
import {
  esc, rateHTML, lowNBadge, emptyState, dataTable, options, intentLabel,
} from './util.js';

function ensureSelection(ctx, obs) {
  const c = ctx.ui.compare;
  if (!['date', 'platform'].includes(c.dimension)) c.dimension = 'date';
  const values = distinct(obs, c.dimension);
  if (!values.includes(c.a)) c.a = values[0] ?? '';
  if (!values.includes(c.b) || c.b === c.a) c.b = values.find((v) => v !== c.a) ?? '';
  const holdDim = c.dimension === 'date' ? 'platform' : 'date';
  if (c.hold && !distinct(obs, holdDim).includes(c.hold)) c.hold = '';
  return { values, holdDim };
}

export function render(ctx) {
  const p = ctx.project;
  const c = ctx.ui.compare;
  const intentScoped = filterObservations(p, { intents: c.intent ? [c.intent] : [] });
  if (!p.observations.length) {
    return `<h1 class="page-title">Compare</h1>${emptyState('Nothing to compare yet', 'Record observations on at least two dates or two platforms first.', '<a class="btn" href="#/observations">Go to observations</a>')}`;
  }
  const { values, holdDim } = ensureSelection(ctx, intentScoped);
  const holdValues = distinct(intentScoped, holdDim);
  const controls = `<form class="card controls" data-form="compare" aria-label="Comparison settings">
    <div class="field"><label for="cmp-dim">Compare</label>
      <select id="cmp-dim" name="dimension" data-change="compare">
        <option value="date"${c.dimension === 'date' ? ' selected' : ''}>Two dates</option>
        <option value="platform"${c.dimension === 'platform' ? ' selected' : ''}>Two platforms</option>
      </select></div>
    <div class="field"><label for="cmp-a">Baseline (A)</label><select id="cmp-a" name="a" data-change="compare">${options(values, c.a)}</select></div>
    <div class="field"><label for="cmp-b">Comparison (B)</label><select id="cmp-b" name="b" data-change="compare">${options(values, c.b)}</select></div>
    <div class="field"><label for="cmp-hold">${c.dimension === 'date' ? 'Platform' : 'Date'}</label>
      <select id="cmp-hold" name="hold" data-change="compare">${options(holdValues, c.hold, c.dimension === 'date' ? 'All platforms pooled' : 'All dates pooled')}</select></div>
    <div class="field"><label for="cmp-intent">Intent</label><select id="cmp-intent" name="intent" data-change="compare">
      <option value="">All intents</option>${INTENTS.map((i) => `<option value="${i}"${c.intent === i ? ' selected' : ''}>${intentLabel(i)}</option>`).join('')}</select></div>
    <label class="check"><input type="checkbox" name="match" data-change="compare"${c.match ? ' checked' : ''}> Matched questions only (recommended)</label>
  </form>`;

  if (values.length < 2) {
    return `<h1 class="page-title">Compare</h1>${controls}${emptyState(`Only one ${c.dimension} has data`,
      `A comparison needs observations on at least two ${c.dimension === 'date' ? 'dates' : 'platforms'}${c.intent ? ' for this intent' : ''}. Record another round, or switch the comparison type.`)}`;
  }

  const scoped = c.hold ? intentScoped.filter((o) => o[holdDim] === c.hold) : intentScoped;
  const r = compareGroups(p, scoped, { dimension: c.dimension, a: c.a, b: c.b, matchQuestions: c.match });
  const summary = `<p class="scope-line">A = <strong>${esc(c.a)}</strong>: ${r.rawN.a} observations${c.match ? `, ${r.usedN.a} used` : ''} ·
    B = <strong>${esc(c.b)}</strong>: ${r.rawN.b} observations${c.match ? `, ${r.usedN.b} used` : ''} ·
    ${r.sharedQuestions} question(s) observed on both sides${c.match && (r.excluded.a || r.excluded.b) ? ` · excluded as unmatched: ${r.excluded.a} (A), ${r.excluded.b} (B)` : ''}.</p>`;
  const rows = r.metrics.map((m) => [
    esc(m.label),
    r.rawN.a ? rateHTML(m.a) : '<span class="missing">no data</span>',
    r.rawN.b ? rateHTML(m.b) : '<span class="missing">no data</span>',
    m.comparable ? `<strong>${formatPP(m.delta)}</strong>` : '<span class="missing">not comparable</span>',
    m.comparable ? (m.lowN ? `${lowNBadge()} directional only` : '<span class="muted">ok</span>') : esc(m.reason),
  ]);

  const breakdownTitle = `By ${holdDim}: ${esc(c.a)} → ${esc(c.b)}`;
  const table = comparisonTable(p, intentScoped, { dimension: c.dimension, a: c.a, b: c.b, holdDim, matchQuestions: c.match });
  const bRows = table.flatMap(({ hold, result }) => result.metrics.slice(0, 2).map((m) => [
    esc(hold), esc(m.label),
    result.rawN.a ? `${formatPct(m.a.value)} <span class="n">${m.a.num}/${m.a.den}</span>` : '<span class="missing">no data</span>',
    result.rawN.b ? `${formatPct(m.b.value)} <span class="n">${m.b.num}/${m.b.den}</span>` : '<span class="missing">no data</span>',
    m.comparable ? `${formatPP(m.delta)}${m.lowN ? ` ${lowNBadge()}` : ''}` : `<span class="missing">not comparable</span> <span class="muted small">${esc(m.reason)}</span>`,
  ]));

  const grid = coverageGrid(intentScoped, p.observations);
  const gridTable = dataTable(['Platform', ...grid.cols.map(esc)], grid.rows.map((pl, i) => [esc(pl),
    ...grid.cells[i].map((n) => (n ? String(n) : '<span class="missing">missing</span>'))]));

  return `<h1 class="page-title">Compare</h1>
  ${controls}
  <section class="card" aria-live="polite">
    <h2>${esc(c.a)} vs ${esc(c.b)}${c.hold ? ` · ${esc(c.hold)}` : ''}${c.intent ? ` · ${esc(intentLabel(c.intent))}` : ''}</h2>
    ${summary}
    ${dataTable(['Metric', `A: ${esc(c.a)}`, `B: ${esc(c.b)}`, 'Change (B − A)', 'Note'], rows)}
    <p class="muted small">Change is in percentage points. A metric is only compared when both sides have data; with “matched questions only”, both sides use the same questions, so a change is not caused by a different question mix. Flags mark denominators under ${LOW_N}.</p>
  </section>
  <section class="card"><h2>${breakdownTitle}</h2>${dataTable([holdDim === 'platform' ? 'Platform' : 'Date', 'Metric', `A: ${esc(c.a)}`, `B: ${esc(c.b)}`, 'Change'], bRows)}</section>
  <section class="card"><h2>Coverage (platform × date)</h2>${gridTable}
    ${grid.missing.length ? `<p class="muted small">Missing: ${grid.missing.map((m) => `${esc(m.platform)} @ ${esc(m.date)}`).join('; ')}. These are never imputed.</p>` : ''}</section>`;
}

export const changes = {
  compare: (el, ctx) => {
    const c = ctx.ui.compare;
    if (el.name === 'match') c.match = el.checked;
    else c[el.name] = el.value;
    if (el.name === 'dimension') { c.a = ''; c.b = ''; c.hold = ''; }
    ctx.rerender({ keepFocus: el });
  },
};

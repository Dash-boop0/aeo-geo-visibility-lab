// Overview dashboard: scope filters, headline tiles, charts and breakdown tables.
import {
  filterObservations, summarize, breakdown, coverageGrid, distinct, formatPct, LOW_N,
} from '../lib/metrics.js';
import { INTENTS } from '../lib/model.js';
import {
  barChart, stackedBarChart, lineChart, legendHTML, OTHER_COLOR,
} from '../lib/charts.js';
import {
  esc, rateHTML, lowNBadge, brandColor, platformColor, emptyState, dataTable, intentLabel,
} from './util.js';

export function filterBar(ctx) {
  const p = ctx.project;
  const group = (key, label, values, fmt = (v) => v) => `
    <fieldset class="chips">
      <legend>${label}</legend>
      ${values.length ? values.map((v) => `<label class="chip"><input type="checkbox" data-change="filter" data-filter="${key}" value="${esc(v)}"${ctx.filters[key].includes(v) ? ' checked' : ''}> ${esc(fmt(v))}</label>`).join('') : '<span class="muted">none yet</span>'}
    </fieldset>`;
  const n = filterObservations(p, ctx.filters).length;
  const active = ctx.filters.platforms.length + ctx.filters.dates.length + ctx.filters.intents.length;
  return `<section class="card filters" aria-label="Scope filters">
    <div class="filters-grid">
      ${group('platforms', 'Platform', distinct(p.observations, 'platform'))}
      ${group('dates', 'Date', distinct(p.observations, 'date'))}
      ${group('intents', 'Intent', INTENTS, intentLabel)}
    </div>
    <p class="scope-line">Scope: <strong>${n}</strong> of ${p.observations.length} observations${active ? ' (filtered)' : ' (all)'}. Unticked groups include everything.
    ${active ? '<button type="button" class="link" data-action="clear-filters">Clear filters</button>' : ''}</p>
  </section>`;
}

function tile(label, r, hint) {
  return `<div class="tile"><div class="tile-label">${esc(label)}</div>
    <div class="tile-value">${r.value === null ? 'n/a' : formatPct(r.value)}</div>
    <div class="tile-sub">${r.num} of ${r.den}${r.den > 0 && r.lowN ? ` ${lowNBadge()}` : ''}</div>
    <div class="tile-hint">${esc(hint)}</div></div>`;
}

export function render(ctx) {
  const p = ctx.project;
  if (!p.observations.length) {
    return `<h1 class="page-title">Overview</h1>${emptyState('No observations yet',
      'Add brands and questions, then record observations by hand or import them from a CSV. The illustrative sample project shows what a filled-in study looks like.',
      '<a class="btn" href="#/observations">Record an observation</a><a class="btn secondary" href="#/data">Import CSV</a><button type="button" class="btn secondary" data-action="load-sample">Load illustrative sample</button>')}`;
  }
  const obs = filterObservations(p, ctx.filters);
  const s = summarize(obs, p.brands);
  const targets = p.brands.filter((b) => b.role === 'target');
  const targetIds = new Set(targets.map((b) => b.id));
  const targetShareNum = s.share.rows.filter((r) => targetIds.has(r.brand.id)).reduce((a, r) => a + r.num, 0);
  const targetShare = { num: targetShareNum, den: s.share.total, value: s.share.total ? targetShareNum / s.share.total : null, lowN: s.share.total < LOW_N };
  const noTarget = targets.length === 0
    ? '<p class="notice warn" role="note">No target brand is defined, so target metrics are 0. Mark your own brand as "target" under Brands.</p>' : '';

  const grid = coverageGrid(obs, p.observations);
  const gridTable = grid.rows.length ? dataTable(['Platform', ...grid.cols.map(esc)], grid.rows.map((pl, i) => [
    esc(pl), ...grid.cells[i].map((c) => (c === 0 ? '<span class="missing">missing</span>' : `${c}${c < LOW_N ? ` ${lowNBadge()}` : ''}`)),
  ]), { caption: 'Observations per platform × date in scope' }) : '';
  const missingNote = grid.missing.length
    ? `<p class="muted small">Missing combinations are shown as gaps, never as 0%: ${grid.missing.map((m) => `${esc(m.platform)} @ ${esc(m.date)}`).join('; ')}.</p>`
    : '<p class="muted small">Every platform × date combination in scope has data.</p>';

  const intentRows = breakdown(p, obs, 'intent').map((g) => [
    esc(intentLabel(g.value)), String(g.summary.n), rateHTML(g.summary.targetMention), rateHTML(g.summary.targetDomainCitation), rateHTML(g.summary.anyCitation),
  ]);

  return `<h1 class="page-title">Overview</h1>
  ${filterBar(ctx)}
  ${noTarget}
  ${obs.length === 0 ? emptyState('No observations match these filters', 'Untick a filter or clear them to widen the scope.', '<button type="button" class="btn secondary" data-action="clear-filters">Clear filters</button>') : `
  <section class="tiles" aria-label="Headline metrics">
    ${tile('Target brand mention rate', s.targetMention, 'Observations mentioning a target brand ÷ observations in scope')}
    ${tile('Target-domain citation rate', s.targetDomainCitation, 'Observations citing ≥1 target-domain source ÷ observations in scope')}
    ${tile('Target mention share', targetShare, 'Target mentions ÷ all tracked-brand mentions')}
    <div class="tile"><div class="tile-label">Observations in scope</div><div class="tile-value">${s.n}</div>
      <div class="tile-sub">${s.questions} questions · ${distinct(obs, 'platform').length} platforms · ${distinct(obs, 'date').length} dates</div>
      <div class="tile-hint">Run-to-run agreement: ${s.consistency.den ? `${formatPct(s.consistency.value)} (${s.consistency.num}/${s.consistency.den} repeated groups)` : 'n/a — no repeated runs'}</div></div>
  </section>

  <div class="grid-2">
    <section class="card">
      <h2>Brand mention rate</h2>
      <p class="muted small">Share of the ${s.n} observations in scope whose answer mentions each brand.</p>
      <div class="chart-slot" data-chart="mention"></div>
      <details><summary>Data table</summary>${dataTable(['Brand', 'Role', 'Mention rate'], s.mentionRates.map((r) => [esc(r.brand.name), esc(r.brand.role), rateHTML(r)]))}</details>
    </section>
    <section class="card">
      <h2>Mention share by platform</h2>
      <p class="muted small">Each brand's mentions ÷ all tracked-brand mentions in that group.</p>
      ${legendHTML(p.brands.map((b) => ({ name: b.name, color: brandColor(p, b.id) })))}
      <div class="chart-slot" data-chart="share"></div>
      <details><summary>Data table</summary>${dataTable(['Group', 'Brand', 'Mention share'], [['All in scope', s], ...breakdown(p, obs, 'platform').map((g) => [g.value, g.summary])]
        .flatMap(([label, sum]) => sum.share.rows.map((r) => [esc(label), esc(r.brand.name), rateHTML(r)])))}</details>
    </section>
    <section class="card">
      <h2>Target mention rate by date</h2>
      <p class="muted small">One line per platform. A platform with no data on a date has no point there.</p>
      ${legendHTML(distinct(obs, 'platform').map((pl) => ({ name: pl, color: platformColor(p, pl) })))}
      <div class="chart-slot" data-chart="trend"></div>
      <details><summary>Data table</summary>${dataTable(['Platform', 'Date', 'Target mention rate'],
        distinct(obs, 'platform').flatMap((pl) => distinct(obs, 'date').map((d) => {
          const sub = obs.filter((o) => o.platform === pl && o.date === d);
          return [esc(pl), esc(d), sub.length ? rateHTML(summarize(sub, p.brands).targetMention) : '<span class="missing">no data</span>'];
        })))}</details>
    </section>
    <section class="card">
      <h2>Top cited source domains</h2>
      <p class="muted small">Observations citing each domain (once per observation) ÷ observations in scope.</p>
      ${legendHTML([...p.brands.map((b) => ({ name: b.name, color: brandColor(p, b.id) })), { name: 'Third-party', color: OTHER_COLOR }])}
      <div class="chart-slot" data-chart="sources"></div>
      <details><summary>Data table (all domains)</summary>${s.sources.length ? dataTable(['Domain', 'Owner', 'Observations citing', 'Cited URLs'],
        s.sources.map((r) => [esc(r.domain), r.ownerName ? `${esc(r.ownerName)} <span class="muted">(${esc(r.ownerType)})</span>` : 'third-party', rateHTML(r), String(r.urls)])) : '<p class="muted">No citations in scope.</p>'}</details>
    </section>
  </div>

  <div class="grid-2">
    <section class="card"><h2>Coverage</h2>${gridTable}${missingNote}</section>
    <section class="card"><h2>By question intent</h2>${dataTable(['Intent', 'n', 'Target mention', 'Target-domain citation', 'Any citation'], intentRows)}
      <p class="muted small">Rates with fewer than ${LOW_N} observations are flagged low n.</p></section>
  </div>`}`;
}

/** Draw charts into their slots at the slot's current width. */
export function afterRender(ctx, root) {
  const p = ctx.project;
  if (!p || !p.observations.length) return;
  const obs = filterObservations(p, ctx.filters);
  if (!obs.length) return;
  const s = summarize(obs, p.brands);
  const slot = (name) => root.querySelector(`[data-chart="${name}"]`);
  const width = (el) => Math.max(280, el.clientWidth || 600);

  const m = slot('mention');
  if (m) {
    m.innerHTML = barChart({
      title: 'Brand mention rate',
      desc: s.mentionRates.map((r) => `${r.brand.name} ${formatPct(r.value)} (${r.num}/${r.den})`).join('; '),
      width: width(m),
      items: s.mentionRates.map((r) => ({ label: r.brand.name, value: r.value, num: r.num, den: r.den, lowN: r.lowN, color: brandColor(p, r.brand.id) })),
    });
  }
  const sh = slot('share');
  if (sh) {
    const groups = [['All in scope', s], ...breakdown(p, obs, 'platform').map((g) => [g.value, g.summary])];
    sh.innerHTML = stackedBarChart({
      title: 'Mention share by platform',
      desc: 'Share of tracked-brand mentions per brand, per platform.',
      width: width(sh),
      rows: groups.map(([label, sum]) => ({
        label,
        total: sum.share.total,
        segments: sum.share.rows.map((r) => ({ name: r.brand.name, value: r.value || 0, count: r.num, color: brandColor(p, r.brand.id) })),
      })),
    });
  }
  const tr = slot('trend');
  if (tr) {
    const dates = distinct(obs, 'date');
    tr.innerHTML = lineChart({
      title: 'Target mention rate by date and platform',
      desc: 'Missing platform/date combinations are not drawn.',
      width: width(tr),
      categories: dates,
      series: distinct(obs, 'platform').map((pl) => ({
        name: pl,
        color: platformColor(p, pl),
        points: dates.map((d) => {
          const sub = obs.filter((o) => o.platform === pl && o.date === d);
          const r = summarize(sub, p.brands).targetMention;
          return { x: d, value: sub.length ? r.value : null, num: r.num, den: r.den };
        }),
      })),
    });
  }
  const so = slot('sources');
  if (so) {
    const top = s.sources.slice(0, 8);
    so.innerHTML = top.length ? barChart({
      title: 'Top cited source domains',
      desc: top.map((r) => `${r.domain} ${formatPct(r.value)}`).join('; '),
      width: width(so),
      items: top.map((r) => {
        const owner = p.brands.find((b) => b.name === r.ownerName);
        return {
          label: r.domain, value: r.value, num: r.num, den: r.den, lowN: r.lowN,
          color: owner ? brandColor(p, owner.id) : OTHER_COLOR,
          tip: `${r.domain} (${r.ownerName || 'third-party'}): cited in ${r.num} of ${r.den} observations, ${r.urls} URL(s)`,
        };
      }),
    }) : '<p class="muted">No citations recorded in scope.</p>';
  }
}

export const actions = {
  'clear-filters': (el, ctx) => {
    ctx.filters.platforms = []; ctx.filters.dates = []; ctx.filters.intents = [];
    ctx.rerender();
    ctx.announce('Filters cleared.');
  },
};

export const changes = {
  filter: (el, ctx) => {
    const list = ctx.filters[el.dataset.filter];
    const i = list.indexOf(el.value);
    if (el.checked && i < 0) list.push(el.value);
    if (!el.checked && i >= 0) list.splice(i, 1);
    ctx.rerender({ keepFocus: el });
  },
};

// Data: CSV imports, exports (metrics CSV, observations CSV, questions CSV, Markdown report),
// JSON backup/restore, sample data and reset.
import { importQuestions, importObservations, describeReport } from '../lib/importers.js';
import { observationsToCSV, questionsToCSV, metricsToCSV, markdownReport } from '../lib/exporters.js';
import { filterObservations } from '../lib/metrics.js';
import { validateState } from '../lib/model.js';
import { esc } from './util.js';
import { filterBar } from './overview.js';

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';

export function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportHTML(rep) {
  if (!rep) return '';
  const list = (title, items, cls) => (items.length ? `<details${cls === 'bad' ? ' open' : ''}><summary>${title} (${items.length})</summary><ul class="small">${items.slice(0, 50).map((e) => `<li>${esc(e)}</li>`).join('')}${items.length > 50 ? `<li>…and ${items.length - 50} more</li>` : ''}</ul></details>` : '');
  return `<div class="notice ${rep.report.fatal || rep.report.errors.length ? 'bad' : 'good'}" role="status">
    <strong>${esc(rep.file)}:</strong> ${esc(describeReport(rep.report, rep.noun))}
    ${list('Rejected rows', rep.report.errors, 'bad')}${list('Warnings', rep.report.warnings, 'warn')}</div>`;
}

export function render(ctx) {
  const p = ctx.project;
  const n = filterObservations(p, ctx.filters).length;
  return `<h1 class="page-title">Data: import &amp; export</h1>
  <section class="card">
    <h2>Import CSV</h2>
    <p>Templates (with column notes) are in <a href="sample-data/README.md">sample-data/</a>:
      <a href="sample-data/questions-template.csv" download>questions-template.csv</a> ·
      <a href="sample-data/observations-template.csv" download>observations-template.csv</a> ·
      <a href="sample-data/sample-questions-synthetic.csv" download>sample-questions-synthetic.csv</a> ·
      <a href="sample-data/sample-observations-synthetic.csv" download>sample-observations-synthetic.csv</a>.</p>
    <div class="grid-2">
      <div class="field"><label for="imp-q">Questions CSV <span class="muted small">(question, intent; optional question_id, notes)</span></label>
        <input id="imp-q" type="file" accept=".csv,text/csv" data-change="import-questions"></div>
      <div class="field"><label for="imp-o">Observations CSV <span class="muted small">(date, platform, question_id or question; see template)</span></label>
        <input id="imp-o" type="file" accept=".csv,text/csv" data-change="import-observations"></div>
    </div>
    <p class="muted small">Imports go into the active project, <strong>${esc(p.name)}</strong>. Brands in <code>brands_mentioned</code> must already exist under Brands (matched by name or alias). Duplicates are skipped, never overwritten.</p>
    <div id="import-result" aria-live="polite">${reportHTML(ctx.ui.lastImport)}</div>
  </section>
  ${filterBar(ctx)}
  <section class="card">
    <h2>Export</h2>
    <p class="muted small">Metrics CSV and the Markdown report use the scope above (${n} observations).${p.illustrative ? ' Exports from the sample project are labelled as illustrative synthetic data.' : ''}</p>
    <div class="row gap wrap-row">
      <button type="button" class="btn" data-action="export-metrics">Processed metrics (CSV)</button>
      <button type="button" class="btn" data-action="export-report">Report (Markdown)</button>
      <button type="button" class="btn secondary" data-action="export-observations">All observations (CSV)</button>
      <button type="button" class="btn secondary" data-action="export-questions">Questions (CSV)</button>
    </div>
    <details><summary>Preview the Markdown report</summary><pre class="report-preview">${esc(markdownReport(p, ctx.filters))}</pre></details>
  </section>
  <section class="card">
    <h2>Backup, restore and reset</h2>
    <p class="muted small">Data lives only in this browser (localStorage). Back up regularly; a backup contains every project.</p>
    <div class="row gap wrap-row">
      <button type="button" class="btn" data-action="backup">Back up data (JSON)</button>
      <label class="btn secondary file-btn" for="restore-file">Restore from backup…</label>
      <input id="restore-file" class="sr-only" type="file" accept=".json,application/json" data-change="restore">
      <button type="button" class="btn secondary" data-action="load-sample">Load illustrative sample</button>
      <button type="button" class="btn danger" data-action="reset">Reset all data</button>
    </div>
  </section>`;
}

async function readFile(el) {
  const file = el.files && el.files[0];
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error('File is larger than 5 MB.');
  const text = await file.text();
  el.value = '';
  return { name: file.name, text };
}

function runImport(fn, noun) {
  return async (el, ctx) => {
    let f;
    try { f = await readFile(el); } catch (e) { ctx.announce(`Could not read file: ${e.message}`, 'error'); return; }
    if (!f) return;
    const { project, report } = fn(ctx.project, f.text);
    ctx.ui.lastImport = { file: f.name, report, noun };
    if (report.added > 0) ctx.commit(() => project, describeReport(report, noun));
    else { ctx.rerender(); ctx.announce(describeReport(report, noun), report.fatal || report.errors.length ? 'error' : 'ok'); }
  };
}

export const changes = {
  'import-questions': runImport(importQuestions, 'question'),
  'import-observations': runImport(importObservations, 'observation'),
  restore: async (el, ctx) => {
    let f;
    try { f = await readFile(el); } catch (e) { ctx.announce(`Could not read file: ${e.message}`, 'error'); return; }
    if (!f) return;
    let parsed;
    try { parsed = JSON.parse(f.text); } catch { ctx.announce('Restore failed: the file is not valid JSON.', 'error'); return; }
    const r = validateState(parsed);
    if (!r.ok) { ctx.announce(`Restore failed: ${r.errors[0]}`, 'error'); return; }
    if (!window.confirm(`Replace all current data with the ${r.state.projects.length} project(s) in ${f.name}?`)) return;
    ctx.commitState(() => r.state, `Restored ${r.state.projects.length} project(s) from ${f.name}.`);
  },
};

export const actions = {
  'export-metrics': (el, ctx) => {
    download(`${slugify(ctx.project.name)}-metrics.csv`, metricsToCSV(ctx.project, ctx.filters), 'text/csv;charset=utf-8');
    ctx.announce('Metrics CSV downloaded.');
  },
  'export-report': (el, ctx) => {
    download(`${slugify(ctx.project.name)}-report.md`, markdownReport(ctx.project, ctx.filters), 'text/markdown;charset=utf-8');
    ctx.announce('Markdown report downloaded.');
  },
  'export-observations': (el, ctx) => {
    download(`${slugify(ctx.project.name)}-observations.csv`, observationsToCSV(ctx.project), 'text/csv;charset=utf-8');
    ctx.announce('Observations CSV downloaded.');
  },
  'export-questions': (el, ctx) => {
    download(`${slugify(ctx.project.name)}-questions.csv`, questionsToCSV(ctx.project), 'text/csv;charset=utf-8');
    ctx.announce('Questions CSV downloaded.');
  },
  backup: (el, ctx) => {
    download(`aeo-geo-lab-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ctx.state, null, 2), 'application/json');
    ctx.announce('Backup downloaded.');
  },
};

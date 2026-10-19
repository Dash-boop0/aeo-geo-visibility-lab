// Observations: manual logging form, filterable table, edit and delete.
import {
  validateObservation, detectBrandMentions, observationDomains, observationKey, INTENTS,
} from '../lib/model.js';
import { distinct, citesBrandDomain } from '../lib/metrics.js';
import {
  esc, emptyState, options, intentLabel, brandColor,
} from './util.js';

function questionSelect(p, selected) {
  return `<option value="">Choose a question…</option>${INTENTS.map((i) => {
    const qs = p.questions.filter((q) => q.intent === i);
    if (!qs.length) return '';
    return `<optgroup label="${intentLabel(i)}">${qs.map((q) => `<option value="${esc(q.id)}"${q.id === selected ? ' selected' : ''}>${esc(q.id)} · ${esc(q.text)}</option>`).join('')}</optgroup>`;
  }).join('')}`;
}

function form(ctx) {
  const p = ctx.project;
  const editing = ctx.ui.editingObsId ? p.observations.find((o) => o.id === ctx.ui.editingObsId) : null;
  const d = editing || ctx.ui.obsDraft || {
    questionId: '', platform: '', date: new Date().toISOString().slice(0, 10), run: 1, prompt: '', settings: '',
    answerSummary: '', brandsMentioned: [], citedUrls: [], citedDomains: [], notes: '',
  };
  const errs = ctx.ui.obsErrors || [];
  return `<section class="card" id="obs-form-card">
    <h2>${editing ? `Edit observation ${esc(editing.id)}` : 'Record an observation'}</h2>
    <p class="muted small">Log exactly what you asked and what the assistant returned. Use the same prompt text every round so results stay comparable.</p>
    ${errs.length ? `<div class="notice bad" role="alert"><strong>Not saved:</strong><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    <form data-form="observation" novalidate>
      <div class="form-grid">
        <div class="field span-2"><label for="o-q">Question</label><select id="o-q" name="questionId" required data-change="obs-question">${questionSelect(p, d.questionId)}</select></div>
        <div class="field"><label for="o-platform">Platform label</label><input id="o-platform" name="platform" list="platform-list" required value="${esc(d.platform)}" placeholder="e.g. Assistant A" autocomplete="off">
          <datalist id="platform-list">${distinct(p.observations, 'platform').map((v) => `<option value="${esc(v)}">`).join('')}</datalist></div>
        <div class="field"><label for="o-date">Date observed</label><input id="o-date" name="date" type="date" required value="${esc(d.date)}"></div>
        <div class="field"><label for="o-run">Run #</label><input id="o-run" name="run" type="number" min="1" max="99" step="1" value="${esc(d.run)}"></div>
        <div class="field"><label for="o-settings">Settings (model, mode, locale…)</label><input id="o-settings" name="settings" value="${esc(d.settings)}" placeholder="e.g. default model, new chat, signed out, en-GB"></div>
        <div class="field span-2"><label for="o-prompt">Exact prompt</label><textarea id="o-prompt" name="prompt" rows="2" placeholder="Leave blank to use the question text">${esc(d.prompt)}</textarea></div>
        <div class="field span-2"><label for="o-summary">Answer summary</label><textarea id="o-summary" name="answerSummary" rows="3" placeholder="Brief neutral summary of the answer">${esc(d.answerSummary)}</textarea></div>
        <fieldset class="field span-2 chips"><legend>Brands mentioned in the answer</legend>
          ${p.brands.length ? p.brands.map((b) => `<label class="chip"><input type="checkbox" name="brandsMentioned" value="${esc(b.id)}"${d.brandsMentioned.includes(b.id) ? ' checked' : ''}><span class="swatch" style="background:${brandColor(p, b.id)}"></span>${esc(b.name)}</label>`).join('')
            : '<span class="muted">No brands yet — add them under <a href="#/brands">Brands</a>.</span>'}
          ${p.brands.length ? '<button type="button" class="btn small secondary" data-action="suggest-brands">Suggest from summary</button>' : ''}
        </fieldset>
        <div class="field"><label for="o-urls">Cited URLs (one per line)</label><textarea id="o-urls" name="citedUrls" rows="3" placeholder="https://source.example.org/page">${esc(d.citedUrls.join('\n'))}</textarea></div>
        <div class="field"><label for="o-domains">Cited domains without a link (one per line)</label><textarea id="o-domains" name="citedDomains" rows="3" placeholder="source.example.org">${esc(d.citedDomains.join('\n'))}</textarea></div>
        <div class="field span-2"><label for="o-notes">Notes</label><input id="o-notes" name="notes" value="${esc(d.notes)}"></div>
      </div>
      <div class="row gap">
        <button class="btn" type="submit">${editing ? 'Save changes' : 'Add observation'}</button>
        <button class="btn secondary" type="button" data-action="obs-cancel">${editing ? 'Cancel edit' : 'Clear form'}</button>
      </div>
    </form>
  </section>`;
}

function readForm(formEl) {
  const fd = new FormData(formEl);
  return {
    questionId: fd.get('questionId') || '',
    platform: fd.get('platform') || '',
    date: fd.get('date') || '',
    run: fd.get('run') || '',
    prompt: fd.get('prompt') || '',
    settings: fd.get('settings') || '',
    answerSummary: fd.get('answerSummary') || '',
    brandsMentioned: fd.getAll('brandsMentioned'),
    citedUrls: String(fd.get('citedUrls') || '').split(/\s+/).filter(Boolean),
    citedDomains: String(fd.get('citedDomains') || '').split(/\s+/).filter(Boolean),
    notes: fd.get('notes') || '',
  };
}

function filtered(ctx) {
  const p = ctx.project;
  const f = ctx.ui.obsFilter;
  const qById = new Map(p.questions.map((q) => [q.id, q]));
  const term = f.search.trim().toLowerCase();
  return p.observations.filter((o) => {
    const q = qById.get(o.questionId);
    if (f.platform && o.platform !== f.platform) return false;
    if (f.date && o.date !== f.date) return false;
    if (f.intent && q?.intent !== f.intent) return false;
    if (f.brand && !o.brandsMentioned.includes(f.brand)) return false;
    if (term) {
      const hay = `${o.id} ${q?.text} ${o.prompt} ${o.answerSummary} ${o.notes} ${o.citedUrls.join(' ')} ${o.citedDomains.join(' ')}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || a.platform.localeCompare(b.platform) || a.questionId.localeCompare(b.questionId) || a.run - b.run);
}

export function render(ctx) {
  const p = ctx.project;
  const f = ctx.ui.obsFilter;
  if (!p.questions.length) {
    return `<h1 class="page-title">Observations</h1>${emptyState('Add questions first',
      'Every observation answers one fixed buyer question. Add or import questions, then come back to log answers.',
      '<a class="btn" href="#/questions">Go to questions</a><a class="btn secondary" href="#/data">Import CSV</a>')}`;
  }
  const rows = filtered(ctx);
  const qById = new Map(p.questions.map((q) => [q.id, q]));
  const bById = new Map(p.brands.map((b) => [b.id, b]));
  const targets = p.brands.filter((b) => b.role === 'target');
  const limit = ctx.ui.obsLimit;
  const table = rows.length ? `<div class="table-wrap"><table class="obs-table">
    <caption class="sr-only">Observations</caption>
    <thead><tr><th scope="col">Date</th><th scope="col">Platform</th><th scope="col">Run</th><th scope="col">Question</th><th scope="col">Brands mentioned</th><th scope="col">Citations</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${rows.slice(0, limit).map((o) => {
      const q = qById.get(o.questionId);
      const domains = observationDomains(o);
      const targetCited = targets.some((t) => citesBrandDomain(o, t));
      return `<tr>
        <td class="nowrap">${esc(o.date)}</td><td class="nowrap">${esc(o.platform)}</td><td>${o.run}</td>
        <td><span class="qid">${esc(o.questionId)}</span> ${esc(q?.text || '')}<div class="muted small">${esc(o.answerSummary)}</div></td>
        <td>${o.brandsMentioned.length ? o.brandsMentioned.map((id) => `<span class="tag"><span class="swatch" style="background:${brandColor(p, id)}"></span>${esc(bById.get(id)?.name || id)}</span>`).join(' ') : '<span class="muted">none</span>'}</td>
        <td>${domains.length ? `${domains.length} domain${domains.length > 1 ? 's' : ''}${targetCited ? ' <span class="badge good">target cited</span>' : ''}<div class="muted small">${domains.map(esc).join(', ')}</div>` : '<span class="muted">none</span>'}</td>
        <td class="nowrap"><button type="button" class="btn small secondary" data-action="obs-edit" data-id="${esc(o.id)}" aria-label="Edit observation ${esc(o.id)}">Edit</button>
          <button type="button" class="btn small danger" data-action="obs-delete" data-id="${esc(o.id)}" aria-label="Delete observation ${esc(o.id)}">Delete</button></td></tr>`;
    }).join('')}</tbody></table></div>
    ${rows.length > limit ? `<p><button type="button" class="btn secondary" data-action="obs-more">Show ${Math.min(100, rows.length - limit)} more (${rows.length - limit} hidden)</button></p>` : ''}`
    : emptyState(p.observations.length ? 'No observations match' : 'No observations yet',
      p.observations.length ? 'Change the search or filters above.' : 'Use the form above, or import a CSV on the Data page.');

  return `<h1 class="page-title">Observations</h1>
  ${form(ctx)}
  <section class="card">
    <h2>Logged observations</h2>
    <div class="toolbar">
      <div class="field"><label for="of-search">Search</label><input id="of-search" type="search" data-input="obs-filter" name="search" value="${esc(f.search)}" placeholder="Question, summary, URL…"></div>
      <div class="field"><label for="of-platform">Platform</label><select id="of-platform" name="platform" data-change="obs-filter">${options(distinct(p.observations, 'platform'), f.platform, 'All platforms')}</select></div>
      <div class="field"><label for="of-date">Date</label><select id="of-date" name="date" data-change="obs-filter">${options(distinct(p.observations, 'date'), f.date, 'All dates')}</select></div>
      <div class="field"><label for="of-intent">Intent</label><select id="of-intent" name="intent" data-change="obs-filter"><option value="">All intents</option>${INTENTS.map((i) => `<option value="${i}"${f.intent === i ? ' selected' : ''}>${intentLabel(i)}</option>`).join('')}</select></div>
      <div class="field"><label for="of-brand">Brand mentioned</label><select id="of-brand" name="brand" data-change="obs-filter"><option value="">Any</option>${p.brands.map((b) => `<option value="${esc(b.id)}"${f.brand === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
    </div>
    <p class="scope-line" aria-live="polite">Showing ${Math.min(rows.length, limit)} of ${rows.length} matching (${p.observations.length} total).</p>
    ${table}
  </section>`;
}

export const actions = {
  'obs-edit': (el, ctx) => {
    ctx.ui.editingObsId = el.dataset.id; ctx.ui.obsErrors = []; ctx.ui.obsDraft = null;
    ctx.rerender();
    document.getElementById('obs-form-card')?.scrollIntoView({ block: 'start' });
    document.getElementById('o-q')?.focus();
  },
  'obs-cancel': (el, ctx) => {
    ctx.ui.editingObsId = null; ctx.ui.obsErrors = []; ctx.ui.obsDraft = null;
    ctx.rerender();
  },
  'obs-delete': (el, ctx) => {
    const id = el.dataset.id;
    if (!window.confirm(`Delete observation ${id}? This cannot be undone (unless you have a backup).`)) return;
    if (ctx.ui.editingObsId === id) ctx.ui.editingObsId = null;
    ctx.commit((p) => ({ ...p, observations: p.observations.filter((o) => o.id !== id) }), `Deleted observation ${id}.`);
  },
  'obs-more': (el, ctx) => { ctx.ui.obsLimit += 100; ctx.rerender(); },
  'suggest-brands': (el, ctx) => {
    const formEl = el.closest('form');
    const text = `${formEl.answerSummary.value}`;
    const ids = detectBrandMentions(text, ctx.project.brands);
    formEl.querySelectorAll('input[name="brandsMentioned"]').forEach((cb) => { if (ids.includes(cb.value)) cb.checked = true; });
    ctx.announce(ids.length ? `Ticked ${ids.length} brand(s) named in the summary. Check them before saving.` : 'No tracked brand names found in the summary.');
  },
};

export const changes = {
  'obs-filter': (el, ctx) => { ctx.ui.obsFilter[el.name] = el.value; ctx.ui.obsLimit = 100; ctx.rerender({ keepFocus: el }); },
  'obs-question': (el, ctx) => {
    const prompt = el.form.prompt;
    const q = ctx.project.questions.find((x) => x.id === el.value);
    if (q && !prompt.value.trim()) prompt.value = q.text;
  },
};

export const inputs = {
  'obs-filter': (el, ctx) => { ctx.ui.obsFilter[el.name] = el.value; ctx.ui.obsLimit = 100; ctx.rerender({ keepFocus: el }); },
};

export const forms = {
  observation: (formEl, ctx) => {
    const p = ctx.project;
    const input = readForm(formEl);
    const editing = ctx.ui.editingObsId;
    if (editing) input.id = editing;
    const r = validateObservation(input, p);
    if (r.ok) {
      const dup = p.observations.find((o) => o.id !== editing && observationKey(o) === observationKey(r.value));
      if (dup) r.errors.push(`Observation ${dup.id} already records this question on ${r.value.platform}, ${r.value.date}, run ${r.value.run}. Use a different run number for a repeat.`);
    }
    if (r.errors.length) {
      ctx.ui.obsErrors = r.errors; ctx.ui.obsDraft = { ...input, run: input.run || 1 };
      ctx.rerender();
      document.getElementById('obs-form-card')?.scrollIntoView({ block: 'start' });
      ctx.announce(`Observation not saved: ${r.errors[0]}`, 'error');
      return;
    }
    ctx.ui.obsErrors = []; ctx.ui.obsDraft = null; ctx.ui.editingObsId = null;
    const warn = r.warnings.length ? ` Note: ${r.warnings.join(' ')}` : '';
    ctx.commit((proj) => ({
      ...proj,
      observations: editing ? proj.observations.map((o) => (o.id === editing ? r.value : o)) : [...proj.observations, r.value],
    }), `${editing ? 'Updated' : 'Added'} observation ${r.value.id}.${warn}`);
  },
};

// App shell: state, routing, rendering and event delegation.
import { loadState, saveState, clearState, startEmptyChosen, rememberStartEmpty } from './store.js';
import { buildSampleProject, SAMPLE_PROJECT_ID } from './lib/sample.js';
import { createEmptyState } from './lib/model.js';
import { esc } from './ui/util.js';
import * as overview from './ui/overview.js';
import * as compare from './ui/compare.js';
import * as observations from './ui/observations.js';
import * as questions from './ui/questions.js';
import * as brands from './ui/brands.js';
import * as data from './ui/data.js';
import * as method from './ui/method.js';

const VIEWS = {
  overview: { label: 'Overview', mod: overview },
  compare: { label: 'Compare', mod: compare },
  observations: { label: 'Observations', mod: observations },
  questions: { label: 'Questions', mod: questions },
  brands: { label: 'Brands & project', mod: brands },
  data: { label: 'Data', mod: data },
  method: { label: 'Method', mod: method },
};

const merge = (key) => Object.assign({}, ...Object.values(VIEWS).map((v) => v.mod[key] || {}));
const ACTIONS = merge('actions');
const FORMS = merge('forms');
const CHANGES = merge('changes');
const INPUTS = merge('inputs');

const loaded = loadState();
let state = loaded.state;
let storageWarning = loaded.warning;
// First visit (nothing saved, sample not declined): open the illustrative sample so the dashboard is populated.
if (!loaded.found && !startEmptyChosen()) {
  const sample = buildSampleProject();
  state = { ...state, projects: [...state.projects, sample], activeProjectId: sample.id };
  if (!storageWarning) saveState(state);
}

function freshUi() {
  return {
    compare: { dimension: 'date', a: '', b: '', hold: '', intent: '', match: true },
    obsFilter: { search: '', platform: '', date: '', intent: '', brand: '' },
    obsLimit: 100,
    editingObsId: null, obsErrors: [], obsDraft: null,
    editingQuestionId: null, questionErrors: [], questionDraft: null,
    editingBrandId: null, brandErrors: [], brandDraft: null,
    lastImport: null,
  };
}

const ctx = {
  get state() { return state; },
  get project() { return state.projects.find((p) => p.id === state.activeProjectId) || null; },
  filters: { platforms: [], dates: [], intents: [] },
  ui: freshUi(),
  rerender: (opts) => render(opts),
  announce,
  commit(fn, message) {
    const id = state.activeProjectId;
    state = { ...state, projects: state.projects.map((p) => (p.id === id ? fn(p) : p)) };
    persist();
    render();
    if (message) announce(message);
  },
  commitState(fn, message) {
    state = fn(state);
    if (!state.projects.some((p) => p.id === state.activeProjectId)) state.activeProjectId = state.projects[0]?.id ?? null;
    resetView();
    persist();
    render();
    if (message) announce(message);
  },
  switchProject(id) {
    state = { ...state, activeProjectId: id };
    resetView();
    persist();
    render();
    announce(`Opened project "${ctx.project?.name}".`);
  },
};

function resetView() {
  ctx.filters = { platforms: [], dates: [], intents: [] };
  ctx.ui = freshUi();
}

function persist() {
  const err = saveState(state);
  if (err) { storageWarning = err; announce(err, 'error'); }
}

let statusTimer = null;
function announce(message, type = 'ok') {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = `status show ${type}`;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.className = 'status'; }, type === 'error' ? 9000 : 5000);
}

function route() {
  const r = location.hash.replace(/^#\/?/, '');
  return VIEWS[r] ? r : 'overview';
}

function renderHeader(current) {
  const nav = document.getElementById('tabs');
  nav.innerHTML = Object.entries(VIEWS).map(([key, v]) => `<a href="#/${key}"${key === current ? ' aria-current="page"' : ''}>${esc(v.label)}</a>`).join('');
  const picker = document.getElementById('project-picker');
  picker.innerHTML = state.projects.length
    ? `<label for="project-select" class="sr-only">Active project</label><select id="project-select" data-change="project-picker">${state.projects.map((p) => `<option value="${esc(p.id)}"${p.id === state.activeProjectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`
    : '';
  const banner = document.getElementById('banner');
  const p = ctx.project;
  const parts = [];
  if (p?.illustrative) {
    parts.push('<div class="sample-banner" role="note"><p class="sample-banner__text"><strong>Illustrative sample data.</strong> Ledgerly and its competitors are fictional, and every observation in this project is synthetic — generated for demonstration. These are <strong>not real AI-assistant results or citations</strong>.</p><button type="button" class="sample-banner__action" data-action="start-own">Start with your own data</button></div>');
  }
  if (storageWarning) parts.push(`<div class="sample-banner is-error" role="alert"><p class="sample-banner__text">${esc(storageWarning)}</p></div>`);
  banner.innerHTML = parts.join('');
}

function welcome() {
  return `<h1 class="page-title">Get started</h1>
  <section class="hero card">
    <h2>AEO/GEO Visibility Research Lab</h2>
    <p>Record how AI assistants answer a fixed set of buyer questions: which brands they mention and which sources they cite.
    Then measure brand mention rate, target-domain citation rate, mention share and citation sources — with sample sizes on every number.</p>
    <p class="muted">Everything stays in your browser. No accounts, no API keys, no scraping.</p>
    <div class="row gap wrap-row">
      <button type="button" class="btn" data-action="load-sample">Load illustrative sample project</button>
      <a class="btn secondary" href="#/method">Read the method</a>
    </div>
    <form data-form="new-project" class="row gap wrap-row" novalidate>
      <div class="field grow"><label for="np-name">Or start an empty project</label><input id="np-name" name="name" required maxlength="120" placeholder="e.g. Q4 visibility baseline"></div>
      <button class="btn secondary" type="submit">Create project</button>
    </form>
    <p class="muted small">Have a backup? <a href="#/data">Restore it on the Data page</a> after creating or loading any project, or use the button below.</p>
    <label class="btn secondary file-btn" for="restore-file-welcome">Restore from backup…</label>
    <input id="restore-file-welcome" class="sr-only" type="file" accept=".json,application/json" data-change="restore">
  </section>`;
}

function render({ keepFocus } = {}) {
  const current = route();
  const focusId = keepFocus?.id;
  const sel = keepFocus && 'selectionStart' in keepFocus ? [keepFocus.selectionStart, keepFocus.selectionEnd] : null;
  renderHeader(current);
  const main = document.getElementById('main');
  const view = VIEWS[current];
  document.title = `${view.label} · AEO/GEO Visibility Lab`;
  if (!ctx.project) {
    main.innerHTML = current === 'method' ? method.render(ctx) : welcome();
  } else {
    main.innerHTML = view.mod.render(ctx);
    if (view.mod.afterRender) view.mod.afterRender(ctx, main);
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (sel && el.setSelectionRange && sel[0] !== null) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ } }
    }
  }
}

// ------------------------------------------------------------------ global actions
ACTIONS['load-sample'] = (el, c) => {
  const exists = state.projects.some((p) => p.id === SAMPLE_PROJECT_ID);
  if (exists && !window.confirm('Replace the existing illustrative sample project with a fresh copy? Your changes to it will be lost.')) return;
  const sample = buildSampleProject();
  c.commitState((s) => ({ ...s, projects: [...s.projects.filter((p) => p.id !== SAMPLE_PROJECT_ID), sample], activeProjectId: sample.id }),
    `Loaded the illustrative sample: ${sample.questions.length} questions, ${sample.observations.length} synthetic observations.`);
  if (route() !== 'overview') location.hash = '#/overview';
};
ACTIONS['start-own'] = (el, c) => {
  rememberStartEmpty();
  c.commitState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== SAMPLE_PROJECT_ID) }),
    'Sample removed. Create a project or restore a backup to start with your own data.');
  if (route() !== 'overview' && route() !== 'method') location.hash = '#/overview';
};
ACTIONS.reset = (el, c) => {
  if (!window.confirm('Delete ALL projects and data stored in this browser? Download a backup first if you need one.')) return;
  clearState();
  rememberStartEmpty();
  c.commitState(() => createEmptyState(), 'All data deleted.');
};
CHANGES['project-picker'] = (el, c) => c.switchProject(el.value);

// ------------------------------------------------------------------ events
document.body.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, ctx); }
});
document.body.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = FORMS[form.dataset.form];
  if (fn) fn(form, ctx);
});
document.body.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) Promise.resolve(fn(el, ctx)).catch((err) => announce(`Something went wrong: ${err.message}`, 'error'));
});
let inputTimer = null;
document.body.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => INPUTS[el.dataset.input]?.(el, ctx), 180);
});

// Hover / focus tooltip for chart marks.
const tooltip = document.getElementById('tooltip');
function showTip(target, x, y) {
  tooltip.textContent = target.dataset.tip;
  tooltip.hidden = false;
  const pad = 12;
  const w = tooltip.offsetWidth;
  const h = tooltip.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, x + pad));
  const top = y - h - pad < 8 ? y + pad : y - h - pad;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) showTip(t, e.clientX, e.clientY); else tooltip.hidden = true;
});
document.addEventListener('focusin', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) { const r = t.getBoundingClientRect(); showTip(t, r.left + r.width / 2, r.top); } else tooltip.hidden = true;
});
document.addEventListener('scroll', () => { tooltip.hidden = true; }, { passive: true });

let resizeTimer = null;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    const view = VIEWS[route()];
    if (ctx.project && view.mod.afterRender) view.mod.afterRender(ctx, document.getElementById('main'));
  }, 150);
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); document.getElementById('main').focus({ preventScroll: true }); });
render();

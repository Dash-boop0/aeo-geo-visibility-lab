// Questions: fixed buyer-intent question set grouped by intent.
import { validateQuestion, nextQuestionId, removeQuestion, INTENTS } from '../lib/model.js';
import { targetMentionRate, distinct } from '../lib/metrics.js';
import { esc, emptyState, intentOptions, intentLabel, rateHTML } from './util.js';

export function render(ctx) {
  const p = ctx.project;
  const editing = ctx.ui.editingQuestionId ? p.questions.find((q) => q.id === ctx.ui.editingQuestionId) : null;
  const d = editing || ctx.ui.questionDraft || { text: '', intent: 'discovery', notes: '' };
  const errs = ctx.ui.questionErrors || [];
  const formHTML = `<section class="card" id="q-form-card">
    <h2>${editing ? `Edit question ${esc(editing.id)}` : 'Add a question'}</h2>
    ${errs.length ? `<div class="notice bad" role="alert"><strong>Not saved:</strong><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    <form data-form="question" novalidate>
      <div class="form-grid">
        <div class="field span-2"><label for="q-text">Question (asked word-for-word every round)</label><input id="q-text" name="text" required maxlength="500" value="${esc(d.text)}"></div>
        <div class="field"><label for="q-intent">Intent</label><select id="q-intent" name="intent">${intentOptions(d.intent)}</select></div>
        <div class="field"><label for="q-notes">Notes</label><input id="q-notes" name="notes" value="${esc(d.notes)}"></div>
      </div>
      <div class="row gap"><button class="btn" type="submit">${editing ? 'Save changes' : 'Add question'}</button>
        ${editing ? '<button class="btn secondary" type="button" data-action="q-cancel">Cancel edit</button>' : ''}
        <a class="btn secondary" href="#/data">Import questions CSV</a></div>
    </form>
    <p class="muted small">Intents: <strong>discovery</strong> (finding options), <strong>informational</strong> (how/what questions), <strong>comparison</strong> (brand vs brand, alternatives), <strong>purchase</strong> (pricing, plans, buying decisions).</p>
  </section>`;

  if (!p.questions.length) {
    return `<h1 class="page-title">Questions</h1>${formHTML}${emptyState('No questions yet', 'Add questions above or import a CSV with columns <code>question,intent</code>.')}`;
  }
  const groups = INTENTS.map((intent) => {
    const qs = p.questions.filter((q) => q.intent === intent);
    const rows = qs.map((q) => {
      const obs = p.observations.filter((o) => o.questionId === q.id);
      return `<tr><td class="qid">${esc(q.id)}</td><td>${esc(q.text)}${q.notes ? `<div class="muted small">${esc(q.notes)}</div>` : ''}</td>
        <td>${obs.length}</td><td>${obs.length ? esc(distinct(obs, 'platform').join(', ')) : '<span class="missing">not observed</span>'}</td>
        <td>${rateHTML(targetMentionRate(obs, p.brands))}</td>
        <td class="nowrap"><button type="button" class="btn small secondary" data-action="q-edit" data-id="${esc(q.id)}" aria-label="Edit question ${esc(q.id)}">Edit</button>
        <button type="button" class="btn small danger" data-action="q-delete" data-id="${esc(q.id)}" aria-label="Delete question ${esc(q.id)}">Delete</button></td></tr>`;
    }).join('');
    return `<section class="card"><h2>${intentLabel(intent)} <span class="count">${qs.length}</span></h2>
      ${qs.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">ID</th><th scope="col">Question</th><th scope="col">Obs.</th><th scope="col">Platforms</th><th scope="col">Target mention</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="muted">No ${intent} questions yet.</p>`}</section>`;
  }).join('');
  return `<h1 class="page-title">Questions <span class="count">${p.questions.length}</span></h1>${formHTML}${groups}`;
}

export const actions = {
  'q-edit': (el, ctx) => {
    ctx.ui.editingQuestionId = el.dataset.id; ctx.ui.questionErrors = []; ctx.ui.questionDraft = null;
    ctx.rerender();
    document.getElementById('q-form-card')?.scrollIntoView({ block: 'start' });
    document.getElementById('q-text')?.focus();
  },
  'q-cancel': (el, ctx) => { ctx.ui.editingQuestionId = null; ctx.ui.questionErrors = []; ctx.ui.questionDraft = null; ctx.rerender(); },
  'q-delete': (el, ctx) => {
    const id = el.dataset.id;
    const n = ctx.project.observations.filter((o) => o.questionId === id).length;
    if (!window.confirm(`Delete question ${id}${n ? ` and its ${n} observation(s)` : ''}? This cannot be undone.`)) return;
    if (ctx.ui.editingQuestionId === id) ctx.ui.editingQuestionId = null;
    ctx.commit((p) => removeQuestion(p, id), `Deleted question ${id}${n ? ` and ${n} observation(s)` : ''}.`);
  },
};

export const forms = {
  question: (formEl, ctx) => {
    const p = ctx.project;
    const editing = ctx.ui.editingQuestionId;
    const input = {
      id: editing || nextQuestionId(p.questions),
      text: formEl.text.value, intent: formEl.intent.value, notes: formEl.notes.value,
    };
    const r = validateQuestion(input, p.questions);
    if (!r.ok) {
      ctx.ui.questionErrors = r.errors; ctx.ui.questionDraft = input;
      ctx.rerender();
      ctx.announce(`Question not saved: ${r.errors[0]}`, 'error');
      return;
    }
    ctx.ui.questionErrors = []; ctx.ui.questionDraft = null; ctx.ui.editingQuestionId = null;
    ctx.commit((proj) => ({
      ...proj,
      questions: editing ? proj.questions.map((q) => (q.id === editing ? r.value : q)) : [...proj.questions, r.value],
    }), `${editing ? 'Updated' : 'Added'} question ${r.value.id}.`);
  },
};

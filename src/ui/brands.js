// Project settings, brands (target/competitor with domains) and project management.
import { validateBrand, removeBrand, createProject } from '../lib/model.js';
import { esc, emptyState, brandColor } from './util.js';

export function render(ctx) {
  const p = ctx.project;
  const editing = ctx.ui.editingBrandId ? p.brands.find((b) => b.id === ctx.ui.editingBrandId) : null;
  const d = editing
    ? { ...editing, domains: editing.domains.join(', '), aliases: editing.aliases.join('; ') }
    : (ctx.ui.brandDraft || { name: '', role: p.brands.some((b) => b.role === 'target') ? 'competitor' : 'target', domains: '', aliases: '' });
  const errs = ctx.ui.brandErrors || [];
  const brandRows = p.brands.map((b) => {
    const mentions = p.observations.filter((o) => o.brandsMentioned.includes(b.id)).length;
    return `<tr><td><span class="swatch" style="background:${brandColor(p, b.id)}"></span> ${esc(b.name)}</td>
      <td><span class="badge ${b.role === 'target' ? 'accent' : ''}">${esc(b.role)}</span></td>
      <td>${b.domains.length ? b.domains.map(esc).join('<br>') : '<span class="muted">none — domain citations cannot be matched</span>'}</td>
      <td>${b.aliases.map(esc).join(', ') || '<span class="muted">—</span>'}</td><td>${mentions}</td>
      <td class="nowrap"><button type="button" class="btn small secondary" data-action="brand-edit" data-id="${esc(b.id)}" aria-label="Edit ${esc(b.name)}">Edit</button>
      <button type="button" class="btn small danger" data-action="brand-delete" data-id="${esc(b.id)}" aria-label="Delete ${esc(b.name)}">Delete</button></td></tr>`;
  }).join('');

  const projectRows = ctx.state.projects.map((x) => `<tr><td>${esc(x.name)}${x.illustrative ? ' <span class="badge warn">illustrative</span>' : ''}${x.id === p.id ? ' <span class="badge accent">active</span>' : ''}</td>
    <td>${x.brands.length}</td><td>${x.questions.length}</td><td>${x.observations.length}</td>
    <td class="nowrap">${x.id === p.id ? '' : `<button type="button" class="btn small secondary" data-action="project-switch" data-id="${esc(x.id)}">Open</button> `}
    <button type="button" class="btn small danger" data-action="project-delete" data-id="${esc(x.id)}" aria-label="Delete project ${esc(x.name)}">Delete</button></td></tr>`).join('');

  return `<h1 class="page-title">Brands &amp; project</h1>
  <section class="card">
    <h2>Project details</h2>
    <form data-form="project" novalidate>
      <div class="form-grid">
        <div class="field"><label for="p-name">Project name</label><input id="p-name" name="name" required maxlength="120" value="${esc(p.name)}"></div>
        <div class="field"><label for="p-desc">Description / research question</label><input id="p-desc" name="description" maxlength="500" value="${esc(p.description)}"></div>
      </div>
      <button class="btn" type="submit">Save project details</button>
      ${p.illustrative ? '<p class="muted small">This is the illustrative sample project; its observations are synthetic and it is always labelled as such.</p>' : ''}
    </form>
  </section>
  <section class="card" id="brand-form-card">
    <h2>${editing ? `Edit ${esc(editing.name)}` : 'Add a brand'}</h2>
    ${errs.length ? `<div class="notice bad" role="alert"><strong>Not saved:</strong><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    <form data-form="brand" novalidate>
      <div class="form-grid">
        <div class="field"><label for="b-name">Brand name</label><input id="b-name" name="name" required maxlength="80" value="${esc(d.name)}"></div>
        <div class="field"><label for="b-role">Role</label><select id="b-role" name="role">
          <option value="target"${d.role === 'target' ? ' selected' : ''}>Target (your brand)</option>
          <option value="competitor"${d.role === 'competitor' ? ' selected' : ''}>Competitor</option></select></div>
        <div class="field"><label for="b-domains">Website domains (comma separated; subdomains match)</label><input id="b-domains" name="domains" value="${esc(d.domains)}" placeholder="brand.example.com"></div>
        <div class="field"><label for="b-aliases">Aliases (semicolon separated)</label><input id="b-aliases" name="aliases" value="${esc(d.aliases)}" placeholder="Short name; product name"></div>
      </div>
      <div class="row gap"><button class="btn" type="submit">${editing ? 'Save changes' : 'Add brand'}</button>
      ${editing ? '<button class="btn secondary" type="button" data-action="brand-cancel">Cancel edit</button>' : ''}</div>
    </form>
  </section>
  <section class="card">
    <h2>Tracked brands <span class="count">${p.brands.length}</span></h2>
    ${p.brands.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Brand</th><th scope="col">Role</th><th scope="col">Domains</th><th scope="col">Aliases</th><th scope="col">Mentions</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${brandRows}</tbody></table></div>`
      : emptyState('No brands yet', 'Add your own brand as the target, then each competitor you want to track.')}
  </section>
  <section class="card">
    <h2>Projects</h2>
    <div class="table-wrap"><table><thead><tr><th scope="col">Project</th><th scope="col">Brands</th><th scope="col">Questions</th><th scope="col">Observations</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${projectRows}</tbody></table></div>
    <form data-form="new-project" class="row gap wrap-row" novalidate>
      <div class="field grow"><label for="np-name">New project name</label><input id="np-name" name="name" required maxlength="120" placeholder="e.g. Q4 visibility baseline"></div>
      <button class="btn" type="submit">Create empty project</button>
    </form>
  </section>`;
}

export const actions = {
  'brand-edit': (el, ctx) => {
    ctx.ui.editingBrandId = el.dataset.id; ctx.ui.brandErrors = []; ctx.ui.brandDraft = null;
    ctx.rerender();
    document.getElementById('brand-form-card')?.scrollIntoView({ block: 'start' });
    document.getElementById('b-name')?.focus();
  },
  'brand-cancel': (el, ctx) => { ctx.ui.editingBrandId = null; ctx.ui.brandErrors = []; ctx.ui.brandDraft = null; ctx.rerender(); },
  'brand-delete': (el, ctx) => {
    const b = ctx.project.brands.find((x) => x.id === el.dataset.id);
    if (!b || !window.confirm(`Delete ${b.name}? It will also be removed from every observation's mention list.`)) return;
    if (ctx.ui.editingBrandId === b.id) ctx.ui.editingBrandId = null;
    ctx.commit((p) => removeBrand(p, b.id), `Deleted brand ${b.name}.`);
  },
  'project-switch': (el, ctx) => ctx.switchProject(el.dataset.id),
  'project-delete': (el, ctx) => {
    const x = ctx.state.projects.find((pr) => pr.id === el.dataset.id);
    if (!x || !window.confirm(`Delete project "${x.name}" and all its data? This cannot be undone.`)) return;
    ctx.commitState((s) => {
      const projects = s.projects.filter((pr) => pr.id !== x.id);
      return { ...s, projects, activeProjectId: s.activeProjectId === x.id ? (projects[0]?.id ?? null) : s.activeProjectId };
    }, `Deleted project "${x.name}".`);
  },
};

export const forms = {
  brand: (formEl, ctx) => {
    const editing = ctx.ui.editingBrandId;
    const input = {
      id: editing || undefined,
      name: formEl.name.value, role: formEl.role.value, domains: formEl.domains.value.replace(/,/g, ' '), aliases: formEl.aliases.value,
    };
    const r = validateBrand(input, ctx.project.brands);
    if (!r.ok) {
      ctx.ui.brandErrors = r.errors; ctx.ui.brandDraft = { ...input, domains: formEl.domains.value };
      ctx.rerender();
      ctx.announce(`Brand not saved: ${r.errors[0]}`, 'error');
      return;
    }
    ctx.ui.brandErrors = []; ctx.ui.brandDraft = null; ctx.ui.editingBrandId = null;
    ctx.commit((p) => ({ ...p, brands: editing ? p.brands.map((b) => (b.id === editing ? r.value : b)) : [...p.brands, r.value] }),
      `${editing ? 'Updated' : 'Added'} brand ${r.value.name}.`);
  },
  project: (formEl, ctx) => {
    const name = formEl.name.value.trim();
    if (!name) { ctx.announce('Project name is required.', 'error'); formEl.name.focus(); return; }
    ctx.commit((p) => ({ ...p, name, description: formEl.description.value.trim() }), 'Project details saved.');
  },
  'new-project': (formEl, ctx) => {
    const name = formEl.name.value.trim();
    if (!name) { ctx.announce('Enter a name for the new project.', 'error'); formEl.name.focus(); return; }
    const proj = createProject({ name });
    ctx.commitState((s) => ({ ...s, projects: [...s.projects, proj], activeProjectId: proj.id }), `Created project "${name}". Add brands next.`);
  },
};

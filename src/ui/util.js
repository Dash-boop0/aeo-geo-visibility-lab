// Small UI helpers shared by the views.
import { esc, colorAt } from '../lib/charts.js';
import { formatPct, LOW_N, distinct } from '../lib/metrics.js';
import { INTENTS, INTENT_LABELS } from '../lib/model.js';

export { esc };

/** Rate cell: value, numerator/denominator and a low-n badge. "n/a" when the denominator is 0. */
export function rateHTML(r, { showN = true } = {}) {
  if (!r) return '<span class="muted">n/a</span>';
  const v = r.value === null ? '<span class="muted">n/a</span>' : `<strong>${formatPct(r.value)}</strong>`;
  const n = showN ? ` <span class="n">${r.num}/${r.den}</span>` : '';
  return `${v}${n}${r.den > 0 && r.lowN ? ` ${lowNBadge()}` : ''}`;
}

export function lowNBadge() {
  return `<span class="badge warn" title="Fewer than ${LOW_N} observations in the denominator — treat as directional">⚠ low n</span>`;
}

export function brandColor(project, brandId) {
  return colorAt(project.brands.findIndex((b) => b.id === brandId));
}

/** Platform colours follow the platform's position in the whole project, so filters never repaint. */
export function platformColor(project, platform) {
  return colorAt(distinct(project.observations, 'platform').indexOf(platform));
}

export function intentOptions(selected, { includeAll = false } = {}) {
  return (includeAll ? '<option value="">All intents</option>' : '')
    + INTENTS.map((i) => `<option value="${i}"${i === selected ? ' selected' : ''}>${INTENT_LABELS[i]}</option>`).join('');
}

export function options(values, selected, allLabel) {
  return (allLabel ? `<option value="">${esc(allLabel)}</option>` : '')
    + values.map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

export function emptyState(title, body, actionsHTML = '') {
  return `<div class="empty-state"><h3>${esc(title)}</h3><p>${body}</p>${actionsHTML ? `<div class="row gap">${actionsHTML}</div>` : ''}</div>`;
}

export function dataTable(headers, rows, { caption = '', className = '' } = {}) {
  return `<div class="table-wrap"><table class="${className}">${caption ? `<caption>${esc(caption)}</caption>` : ''}`
    + `<thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function intentLabel(intent) {
  return INTENT_LABELS[intent] || intent;
}

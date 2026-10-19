// Data model, normalisation and validation. Pure functions, no DOM access.
//
// State shape (persisted to localStorage and JSON backups):
// {
//   schema: 'aeo-geo-visibility-lab', version: 1, activeProjectId,
//   projects: [{
//     id, name, description, illustrative (bool), createdAt,
//     brands:       [{ id, name, role: 'target'|'competitor', domains: [host], aliases: [text] }],
//     questions:    [{ id, text, intent, notes }],
//     observations: [{ id, questionId, platform, date: 'YYYY-MM-DD', run, prompt, settings,
//                      answerSummary, brandsMentioned: [brandId], citedUrls: [url],
//                      citedDomains: [host], notes }]
//   }]
// }

export const SCHEMA = 'aeo-geo-visibility-lab';
export const VERSION = 1;

export const INTENTS = ['discovery', 'informational', 'comparison', 'purchase'];
export const INTENT_LABELS = {
  discovery: 'Discovery',
  informational: 'Informational',
  comparison: 'Comparison',
  purchase: 'Purchase',
};
export const ROLES = ['target', 'competitor'];

let counter = 0;
/** Short unique id with a prefix. Uses crypto when available. */
export function uid(prefix = 'id') {
  counter += 1;
  const rand = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}${counter.toString(36)}`;
}

/** Split a list cell: semicolons, pipes or newlines. Trims and drops empties. */
export function splitList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (value === null || value === undefined) return [];
  return String(value).split(/[;|\n\r]+/).map((v) => v.trim()).filter(Boolean);
}

/** Split URLs: semicolons, pipes, newlines or whitespace. */
export function splitUrls(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (value === null || value === undefined) return [];
  return String(value).split(/[;|\s]+/).map((v) => v.trim()).filter(Boolean);
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Normalise a domain or URL-ish string to a bare lowercase hostname without "www.".
 * Returns null when the result is not a plausible hostname.
 */
export function normalizeDomain(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // protocol
  s = s.replace(/^[^@/]*@/, ''); // credentials
  s = s.split(/[/?#]/)[0]; // path, query, fragment
  s = s.replace(/:\d+$/, ''); // port
  s = s.replace(/\.$/, ''); // trailing dot
  s = s.replace(/^www\d*\./, '');
  return HOST_RE.test(s) ? s : null;
}

/** Parse an http(s) URL and return its normalised domain, or null if invalid. */
export function domainFromUrl(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return normalizeDomain(u.hostname);
  } catch {
    return null;
  }
}

/** True when `domain` equals `brandDomain` or is a subdomain of it. */
export function domainMatches(domain, brandDomain) {
  if (!domain || !brandDomain) return false;
  return domain === brandDomain || domain.endsWith(`.${brandDomain}`);
}

/** Unique set of domains an observation cites: domains of cited URLs + manually logged domains. */
export function observationDomains(obs) {
  const set = new Set();
  for (const url of obs.citedUrls || []) {
    const d = domainFromUrl(url);
    if (d) set.add(d);
  }
  for (const raw of obs.citedDomains || []) {
    const d = normalizeDomain(raw);
    if (d) set.add(d);
  }
  return [...set];
}

/** Which tracked brand (if any) owns a domain. Longest matching brand domain wins. */
export function domainOwner(domain, brands) {
  let best = null;
  let bestLen = -1;
  for (const b of brands) {
    for (const bd of b.domains || []) {
      if (domainMatches(domain, bd) && bd.length > bestLen) { best = b; bestLen = bd.length; }
    }
  }
  return best;
}

/** Strict YYYY-MM-DD calendar date check. */
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Normalised question text used for duplicate detection. */
export function questionKey(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[?.!\s]+$/, '').trim();
}

/** Parse an intent value case-insensitively. Returns null if unknown. */
export function parseIntent(value) {
  const v = String(value || '').trim().toLowerCase();
  return INTENTS.includes(v) ? v : null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Names a brand can be matched by: its name, its name without a "(…)" suffix, and aliases. */
export function brandMatchNames(brand) {
  const names = new Set();
  const name = String(brand.name || '').trim();
  if (name) names.add(name);
  const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (stripped) names.add(stripped);
  for (const a of brand.aliases || []) if (String(a).trim()) names.add(String(a).trim());
  return [...names];
}

/** Find a brand by name or alias (case-insensitive). */
export function findBrandByName(name, brands) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return brands.find((b) => brandMatchNames(b).some((m) => m.toLowerCase() === n)) || null;
}

/**
 * Suggest brand mentions found in free text (whole-word, case-insensitive).
 * This is an assistive suggestion for manual logging, not an automated judgement.
 */
export function detectBrandMentions(text, brands) {
  const t = String(text || '');
  return brands
    .filter((b) => brandMatchNames(b).some((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(n)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(t)))
    .map((b) => b.id);
}

// ---------------------------------------------------------------- validation

/** Validate and normalise a brand. Returns { ok, errors, value }. */
export function validateBrand(input, existingBrands = []) {
  const errors = [];
  const name = String(input.name || '').trim();
  if (!name) errors.push('Brand name is required.');
  if (name.length > 80) errors.push('Brand name must be 80 characters or fewer.');
  const role = ROLES.includes(input.role) ? input.role : null;
  if (!role) errors.push('Role must be "target" or "competitor".');
  const domains = [];
  for (const raw of splitUrls(input.domains)) {
    const d = normalizeDomain(raw);
    if (!d) errors.push(`"${raw}" is not a valid domain (example: brand.example.com).`);
    else if (!domains.includes(d)) domains.push(d);
  }
  const aliases = [...new Set(splitList(input.aliases))];
  const clash = existingBrands.find((b) => b.id !== input.id && b.name.trim().toLowerCase() === name.toLowerCase());
  if (name && clash) errors.push(`A brand named "${name}" already exists in this project.`);
  return {
    ok: errors.length === 0,
    errors,
    value: { id: input.id || uid('b'), name, role, domains, aliases },
  };
}

/** Validate and normalise a question. */
export function validateQuestion(input, existingQuestions = []) {
  const errors = [];
  const text = String(input.text || '').replace(/\s+/g, ' ').trim();
  if (!text) errors.push('Question text is required.');
  if (text.length > 500) errors.push('Question text must be 500 characters or fewer.');
  const intent = parseIntent(input.intent);
  if (!intent) errors.push(`Intent must be one of: ${INTENTS.join(', ')}.`);
  const key = questionKey(text);
  const dup = existingQuestions.find((q) => q.id !== input.id && questionKey(q.text) === key);
  if (text && dup) errors.push(`Duplicate of existing question ${dup.id}: "${dup.text}".`);
  return {
    ok: errors.length === 0,
    errors,
    value: { id: input.id || uid('q'), text, intent, notes: String(input.notes || '').trim() },
  };
}

/**
 * Validate and normalise an observation against a project.
 * Returns { ok, errors, warnings, value }. Invalid URLs/domains are errors so nothing is
 * silently dropped from manual entry (CSV import downgrades them to warnings).
 */
export function validateObservation(input, project, { lenient = false } = {}) {
  const errors = [];
  const warnings = [];
  const question = project.questions.find((q) => q.id === input.questionId);
  if (!question) errors.push('Choose a question from this project.');
  const platform = String(input.platform || '').trim();
  if (!platform) errors.push('Platform label is required (e.g. "Assistant A").');
  if (platform.length > 60) errors.push('Platform label must be 60 characters or fewer.');
  const date = String(input.date || '').trim();
  if (!isValidDate(date)) errors.push('Date must be a real calendar date in YYYY-MM-DD format.');
  let run = input.run === '' || input.run === undefined || input.run === null ? 1 : Number(input.run);
  if (!Number.isInteger(run) || run < 1 || run > 99) { errors.push('Run must be a whole number from 1 to 99.'); run = 1; }
  let prompt = String(input.prompt || '').trim();
  if (!prompt && question) {
    prompt = question.text;
    warnings.push('Prompt was blank, so the question text was used as the exact prompt.');
  }
  const answerSummary = String(input.answerSummary || '').trim();
  if (!answerSummary) warnings.push('Answer summary is blank.');

  const brandIds = new Set(project.brands.map((b) => b.id));
  const brandsMentioned = [...new Set((input.brandsMentioned || []).filter((id) => brandIds.has(id)))];

  const citedUrls = [];
  for (const raw of splitUrls(input.citedUrls)) {
    if (domainFromUrl(raw)) { if (!citedUrls.includes(raw)) citedUrls.push(raw); } else {
      (lenient ? warnings : errors).push(`"${raw}" is not a valid http(s) URL${lenient ? ' and was ignored' : ''}.`);
    }
  }
  const citedDomains = [];
  for (const raw of splitUrls(input.citedDomains)) {
    const d = normalizeDomain(raw);
    if (d) { if (!citedDomains.includes(d)) citedDomains.push(d); } else {
      (lenient ? warnings : errors).push(`"${raw}" is not a valid domain${lenient ? ' and was ignored' : ''}.`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    value: {
      id: input.id || uid('o'),
      questionId: input.questionId,
      platform,
      date,
      run,
      prompt,
      settings: String(input.settings || '').trim(),
      answerSummary,
      brandsMentioned,
      citedUrls,
      citedDomains,
      notes: String(input.notes || '').trim(),
    },
  };
}

/** Key used to detect duplicate observations (same question, platform, date and run). */
export function observationKey(o) {
  return `${o.questionId}|${o.platform.trim().toLowerCase()}|${o.date}|${o.run || 1}`;
}

export function createProject({ name = 'Untitled project', description = '', illustrative = false } = {}) {
  return {
    id: uid('p'),
    name: String(name).trim() || 'Untitled project',
    description: String(description).trim(),
    illustrative: Boolean(illustrative),
    createdAt: new Date().toISOString(),
    brands: [],
    questions: [],
    observations: [],
  };
}

export function createEmptyState() {
  return { schema: SCHEMA, version: VERSION, activeProjectId: null, projects: [] };
}

/** Next free sequential question id like q31. */
export function nextQuestionId(questions) {
  let max = 0;
  for (const q of questions) {
    const m = /^q(\d+)$/.exec(q.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  const ids = new Set(questions.map((q) => q.id));
  while (ids.has(`q${String(n).padStart(2, '0')}`)) n += 1;
  return `q${String(n).padStart(2, '0')}`;
}

/** Remove a brand and strip it from every observation's mention list. */
export function removeBrand(project, brandId) {
  return {
    ...project,
    brands: project.brands.filter((b) => b.id !== brandId),
    observations: project.observations.map((o) => ({ ...o, brandsMentioned: o.brandsMentioned.filter((id) => id !== brandId) })),
  };
}

/** Remove a question and every observation recorded against it. */
export function removeQuestion(project, questionId) {
  return {
    ...project,
    questions: project.questions.filter((q) => q.id !== questionId),
    observations: project.observations.filter((o) => o.questionId !== questionId),
  };
}

/**
 * Validate an untrusted state object (e.g. a restored JSON backup).
 * Returns { ok, errors, state } where state is a cleaned copy.
 */
export function validateState(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['Backup is not a JSON object.'], state: null };
  if (obj.schema !== SCHEMA) errors.push(`Not an ${SCHEMA} backup (missing or wrong "schema" field).`);
  if (obj.version !== VERSION) errors.push(`Unsupported backup version ${JSON.stringify(obj.version)} (expected ${VERSION}).`);
  if (!Array.isArray(obj.projects)) errors.push('Backup has no "projects" array.');
  if (errors.length) return { ok: false, errors, state: null };

  const projects = [];
  obj.projects.forEach((p, pi) => {
    const where = `Project ${pi + 1}`;
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.name !== 'string') {
      errors.push(`${where}: missing id or name.`); return;
    }
    for (const k of ['brands', 'questions', 'observations']) {
      if (!Array.isArray(p[k])) errors.push(`${where} ("${p.name}"): "${k}" must be an array.`);
    }
    if (errors.length) return;
    const brands = [];
    p.brands.forEach((b, i) => {
      const r = validateBrand(b || {}, brands);
      if (!r.ok || !b.id) errors.push(`${where} brand ${i + 1}: ${r.errors.join(' ') || 'missing id.'}`);
      else brands.push(r.value);
    });
    const questions = [];
    p.questions.forEach((q, i) => {
      const r = validateQuestion(q || {}, questions);
      if (!r.ok || !q.id) errors.push(`${where} question ${i + 1}: ${r.errors.join(' ') || 'missing id.'}`);
      else questions.push(r.value);
    });
    const shell = { brands, questions };
    const observations = [];
    const ids = new Set();
    p.observations.forEach((o, i) => {
      const r = validateObservation(o || {}, shell);
      if (!r.ok || !o.id) errors.push(`${where} observation ${i + 1}: ${r.errors.join(' ') || 'missing id.'}`);
      else if (ids.has(o.id)) errors.push(`${where} observation ${i + 1}: duplicate id ${o.id}.`);
      else { ids.add(o.id); observations.push(r.value); }
    });
    projects.push({
      id: p.id,
      name: p.name.trim() || 'Untitled project',
      description: String(p.description || ''),
      illustrative: Boolean(p.illustrative),
      createdAt: String(p.createdAt || ''),
      brands,
      questions,
      observations,
    });
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 20), state: null };
  const activeProjectId = projects.some((p) => p.id === obj.activeProjectId) ? obj.activeProjectId : (projects[0]?.id ?? null);
  return { ok: true, errors: [], state: { schema: SCHEMA, version: VERSION, activeProjectId, projects } };
}

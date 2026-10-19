// Metric calculations. Pure functions, no DOM access.
//
// Every rate is returned as { num, den, value, lowN } where value = num / den, or null when
// den = 0 (rendered as "n/a", never 0%). lowN flags den < LOW_N.

import { INTENTS, observationDomains, domainMatches, domainOwner, domainFromUrl } from './model.js';

export const LOW_N = 10;

export function rate(num, den) {
  return { num, den, value: den > 0 ? num / den : null, lowN: den < LOW_N };
}

/** Format a 0–1 value as a percentage with one decimal, or "n/a". */
export function formatPct(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value) ? 'n/a' : `${(value * 100).toFixed(digits)}%`;
}

/** Format a difference of two 0–1 values in percentage points, signed. */
export function formatPP(delta, digits = 1) {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return 'n/a';
  const pp = delta * 100;
  const s = pp.toFixed(digits);
  return `${pp > 0 ? '+' : ''}${s === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : s} pp`;
}

const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Distinct sorted values of a dimension in a list of observations. */
export function distinct(observations, key) {
  return [...new Set(observations.map((o) => o[key]))].sort(sortStr);
}

/**
 * Filter a project's observations. Empty/missing filter arrays mean "all".
 * filters: { platforms, dates, intents, questionIds }
 */
export function filterObservations(project, filters = {}) {
  const intentOf = new Map(project.questions.map((q) => [q.id, q.intent]));
  const inList = (list, v) => !list || list.length === 0 || list.includes(v);
  return project.observations.filter((o) => intentOf.has(o.questionId)
    && inList(filters.platforms, o.platform)
    && inList(filters.dates, o.date)
    && inList(filters.intents, intentOf.get(o.questionId))
    && inList(filters.questionIds, o.questionId));
}

/** True if the observation cites at least one URL/domain belonging to the brand's domains. */
export function citesBrandDomain(obs, brand) {
  const domains = observationDomains(obs);
  return domains.some((d) => (brand.domains || []).some((bd) => domainMatches(d, bd)));
}

/**
 * Brand mention rate per brand.
 * = observations whose brandsMentioned includes the brand ÷ observations in scope.
 */
export function brandMentionRates(observations, brands) {
  const n = observations.length;
  return brands.map((b) => ({ brand: b, ...rate(observations.filter((o) => o.brandsMentioned.includes(b.id)).length, n) }));
}

/** Rate of observations mentioning at least one target brand. */
export function targetMentionRate(observations, brands) {
  const targets = new Set(brands.filter((b) => b.role === 'target').map((b) => b.id));
  return rate(observations.filter((o) => o.brandsMentioned.some((id) => targets.has(id))).length, observations.length);
}

/**
 * Target-domain citation rate
 * = observations citing ≥1 URL/domain on any target-brand domain ÷ observations in scope.
 */
export function targetDomainCitationRate(observations, brands) {
  const targets = brands.filter((b) => b.role === 'target');
  return rate(observations.filter((o) => targets.some((t) => citesBrandDomain(o, t))).length, observations.length);
}

/** Domain citation rate for every brand (same definition, per brand). */
export function brandDomainCitationRates(observations, brands) {
  return brands.map((b) => ({ brand: b, ...rate(observations.filter((o) => citesBrandDomain(o, b)).length, observations.length) }));
}

/** Share of observations that cite any source at all. */
export function anyCitationRate(observations) {
  return rate(observations.filter((o) => observationDomains(o).length > 0).length, observations.length);
}

/**
 * Mention share (share of voice) per brand
 * = mentions of the brand ÷ all tracked-brand mentions in scope.
 * A mention is one (observation, brand) pair, so a brand counts at most once per observation.
 */
export function mentionShare(observations, brands) {
  const ids = new Set(brands.map((b) => b.id));
  const counts = new Map(brands.map((b) => [b.id, 0]));
  let total = 0;
  for (const o of observations) {
    for (const id of new Set(o.brandsMentioned)) {
      if (ids.has(id)) { counts.set(id, counts.get(id) + 1); total += 1; }
    }
  }
  return { total, rows: brands.map((b) => ({ brand: b, ...rate(counts.get(b.id), total) })) };
}

/**
 * Citation-source frequency by domain.
 * For each cited domain: observations citing it (counted once per observation), the number of
 * cited URLs on it, and rate = observations citing it ÷ observations in scope.
 * owner: 'target' | 'competitor' | 'third-party' (+ brand name when owned by a tracked brand).
 */
export function citationSourceFrequency(observations, brands) {
  const map = new Map();
  for (const o of observations) {
    for (const d of observationDomains(o)) {
      if (!map.has(d)) map.set(d, { domain: d, observations: 0, urls: 0 });
      map.get(d).observations += 1;
    }
    for (const url of o.citedUrls || []) {
      const host = domainFromUrl(url);
      if (host && map.has(host)) map.get(host).urls += 1;
    }
  }
  const n = observations.length;
  return [...map.values()].map((row) => {
    const owner = domainOwner(row.domain, brands);
    return {
      ...row,
      ownerType: owner ? owner.role : 'third-party',
      ownerName: owner ? owner.name : '',
      ...rate(row.observations, n),
    };
  }).sort((a, b) => b.observations - a.observations || sortStr(a.domain, b.domain));
}

/**
 * Run-to-run agreement on target mention: among (question, platform, date) groups with ≥2 runs,
 * the share where every run agrees on whether a target brand was mentioned.
 */
export function runConsistency(observations, brands) {
  const targets = new Set(brands.filter((b) => b.role === 'target').map((b) => b.id));
  const groups = new Map();
  for (const o of observations) {
    const k = `${o.questionId}|${o.platform}|${o.date}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o.brandsMentioned.some((id) => targets.has(id)));
  }
  let multi = 0;
  let agree = 0;
  for (const runs of groups.values()) {
    if (runs.length < 2) continue;
    multi += 1;
    if (runs.every((v) => v === runs[0])) agree += 1;
  }
  return rate(agree, multi);
}

/** All headline metrics for one set of observations. */
export function summarize(observations, brands) {
  return {
    n: observations.length,
    questions: new Set(observations.map((o) => o.questionId)).size,
    targetMention: targetMentionRate(observations, brands),
    targetDomainCitation: targetDomainCitationRate(observations, brands),
    anyCitation: anyCitationRate(observations),
    mentionRates: brandMentionRates(observations, brands),
    domainCitationRates: brandDomainCitationRates(observations, brands),
    share: mentionShare(observations, brands),
    sources: citationSourceFrequency(observations, brands),
    consistency: runConsistency(observations, brands),
  };
}

/** Value of a dimension for an observation ('platform' | 'date' | 'intent'). */
export function dimensionValue(project, dim) {
  const intentOf = new Map(project.questions.map((q) => [q.id, q.intent]));
  return (o) => (dim === 'intent' ? intentOf.get(o.questionId) : o[dim]);
}

/** Summaries per value of a dimension. Intent groups always list all four intents. */
export function breakdown(project, observations, dim) {
  const valueOf = dimensionValue(project, dim);
  const values = dim === 'intent' ? INTENTS : distinct(observations, dim);
  return values.map((v) => {
    const obs = observations.filter((o) => valueOf(o) === v);
    return { value: v, summary: summarize(obs, project.brands) };
  });
}

/**
 * Coverage grid of observation counts: rows = platforms, cols = dates (by default).
 * Uses all values present in `universe` so missing combinations appear as 0 and are listed.
 */
export function coverageGrid(observations, universe = observations, rowDim = 'platform', colDim = 'date') {
  const rows = distinct(universe, rowDim);
  const cols = distinct(universe, colDim);
  const cells = rows.map((r) => cols.map((c) => observations.filter((o) => o[rowDim] === r && o[colDim] === c).length));
  const missing = [];
  rows.forEach((r, i) => cols.forEach((c, j) => { if (cells[i][j] === 0) missing.push({ [rowDim]: r, [colDim]: c }); }));
  return { rowDim, colDim, rows, cols, cells, missing };
}

export const COMPARE_METRICS = [
  { key: 'targetMention', label: 'Target brand mention rate' },
  { key: 'targetDomainCitation', label: 'Target-domain citation rate' },
  { key: 'anyCitation', label: 'Any-citation rate' },
  { key: 'targetShare', label: 'Target mention share' },
];

function metricOf(summary, key, brands) {
  if (key === 'targetShare') {
    const targets = new Set(brands.filter((b) => b.role === 'target').map((b) => b.id));
    const num = summary.share.rows.filter((r) => targets.has(r.brand.id)).reduce((s, r) => s + r.num, 0);
    return rate(num, summary.share.total);
  }
  return summary[key];
}

/**
 * Compare two values (a, b) of a dimension ('date' or 'platform') over `observations`.
 * By default only questions observed on BOTH sides are compared (matched questions), so a
 * difference is not caused by a different question mix. A metric is comparable only when both
 * sides have a non-zero denominator; otherwise the reason is given.
 */
export function compareGroups(project, observations, { dimension, a, b, matchQuestions = true }) {
  const sideA = observations.filter((o) => o[dimension] === a);
  const sideB = observations.filter((o) => o[dimension] === b);
  const qa = new Set(sideA.map((o) => o.questionId));
  const qb = new Set(sideB.map((o) => o.questionId));
  const shared = [...qa].filter((q) => qb.has(q));
  const sharedSet = new Set(shared);
  // With no shared questions there is nothing to match; each side's own values are still shown
  // for context, but the metrics are marked not comparable below.
  const match = matchQuestions && shared.length > 0;
  const useA = match ? sideA.filter((o) => sharedSet.has(o.questionId)) : sideA;
  const useB = match ? sideB.filter((o) => sharedSet.has(o.questionId)) : sideB;
  const sa = summarize(useA, project.brands);
  const sb = summarize(useB, project.brands);
  const metrics = COMPARE_METRICS.map((m) => {
    const ra = metricOf(sa, m.key, project.brands);
    const rb = metricOf(sb, m.key, project.brands);
    let reason = '';
    if (sideA.length === 0 && sideB.length === 0) reason = `No observations for ${a} or ${b}.`;
    else if (sideA.length === 0) reason = `No observations for ${a}.`;
    else if (sideB.length === 0) reason = `No observations for ${b}.`;
    else if (matchQuestions && shared.length === 0) reason = 'No questions were observed on both sides.';
    else if (ra.den === 0 || rb.den === 0) reason = 'Denominator is zero on at least one side.';
    const comparable = reason === '';
    return {
      ...m,
      a: ra,
      b: rb,
      comparable,
      reason,
      delta: comparable ? rb.value - ra.value : null,
      lowN: comparable && (ra.lowN || rb.lowN),
    };
  });
  return {
    dimension, a, b, matchQuestions,
    rawN: { a: sideA.length, b: sideB.length },
    usedN: { a: useA.length, b: useB.length },
    sharedQuestions: shared.length,
    excluded: { a: sideA.length - useA.length, b: sideB.length - useB.length },
    metrics,
  };
}

/**
 * Pairwise comparisons for every value of `holdDim` (e.g. each platform) between two values of
 * `dimension` (e.g. two dates). Missing sides are reported, never imputed.
 */
export function comparisonTable(project, observations, { dimension, a, b, holdDim, matchQuestions = true }) {
  return distinct(observations, holdDim).map((h) => ({
    hold: h,
    result: compareGroups(project, observations.filter((o) => o[holdDim] === h), { dimension, a, b, matchQuestions }),
  }));
}

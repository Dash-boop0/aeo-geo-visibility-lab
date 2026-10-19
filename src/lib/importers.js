// CSV importers for questions and observations. Pure functions, no DOM access.
// Each importer returns { project, report } and never mutates its input project.

import { parseCSVObjects, CsvError } from './csv.js';
import {
  validateQuestion, validateObservation, questionKey, nextQuestionId, parseIntent,
  findBrandByName, splitList, observationKey, uid,
} from './model.js';

export const QUESTION_COLUMNS = ['question_id', 'question', 'intent', 'notes'];
export const QUESTION_REQUIRED = ['question', 'intent'];

export const OBSERVATION_COLUMNS = [
  'observation_id', 'date', 'platform', 'run', 'question_id', 'question', 'intent', 'prompt', 'settings',
  'answer_summary', 'brands_mentioned', 'cited_urls', 'cited_domains', 'notes',
];
export const OBSERVATION_REQUIRED = ['date', 'platform'];

function emptyReport() {
  return { added: 0, skipped: 0, errors: [], warnings: [], fatal: null };
}

function parseOrFatal(text, required, report) {
  let parsed;
  try {
    parsed = parseCSVObjects(text);
  } catch (e) {
    report.fatal = e instanceof CsvError ? e.message : `Could not read CSV: ${e.message}`;
    return null;
  }
  if (parsed.headers.length === 0) { report.fatal = 'The file is empty. Use the template in sample-data/.'; return null; }
  const missing = required.filter((h) => !parsed.headers.includes(h));
  if (missing.length) {
    report.fatal = `Missing required column(s): ${missing.join(', ')}. Found: ${parsed.headers.join(', ') || '(none)'}.`;
    return null;
  }
  if (parsed.records.length === 0) { report.fatal = 'The file has a header row but no data rows.'; return null; }
  return parsed;
}

/**
 * Import buyer-intent questions.
 * Columns: question (required), intent (required: discovery|informational|comparison|purchase),
 * question_id (optional; generated as q01, q02… when blank), notes (optional).
 * Rows duplicating an existing question (same normalised text or same id) are skipped.
 */
export function importQuestions(project, text) {
  const report = emptyReport();
  const parsed = parseOrFatal(text, QUESTION_REQUIRED, report);
  if (!parsed) return { project, report };
  const questions = [...project.questions];
  for (const { line, data } of parsed.records) {
    const id = (data.question_id || '').trim();
    const existingById = id && questions.find((q) => q.id === id);
    const dupText = questions.find((q) => questionKey(q.text) === questionKey(data.question));
    if (dupText || existingById) {
      report.skipped += 1;
      report.warnings.push(`Row ${line}: skipped duplicate of ${(dupText || existingById).id}.`);
      continue;
    }
    if (id && !/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
      report.errors.push(`Row ${line}: question_id "${id}" may only contain letters, numbers, - and _.`);
      continue;
    }
    const r = validateQuestion({ id: id || nextQuestionId(questions), text: data.question, intent: data.intent, notes: data.notes }, questions);
    if (!r.ok) { report.errors.push(`Row ${line}: ${r.errors.join(' ')}`); continue; }
    questions.push(r.value);
    report.added += 1;
  }
  return { project: { ...project, questions }, report };
}

/**
 * Import observations.
 * Question matching: question_id first, then exact question text (case/space-insensitive).
 * An unmatched question is created only when the row has a valid `intent`; otherwise the row errors.
 * brands_mentioned: brand names or aliases separated by ";" — unknown names produce a warning.
 * cited_urls / cited_domains: separated by ";" or whitespace — invalid entries produce warnings.
 * Rows with the same question + platform + date + run as an existing observation are skipped.
 */
export function importObservations(project, text) {
  const report = emptyReport();
  const parsed = parseOrFatal(text, OBSERVATION_REQUIRED, report);
  if (!parsed) return { project, report };
  if (!parsed.headers.includes('question_id') && !parsed.headers.includes('question')) {
    report.fatal = 'Missing column: provide question_id or question so each row can be linked to a question.';
    return { project, report };
  }
  const questions = [...project.questions];
  const observations = [...project.observations];
  const keys = new Set(observations.map(observationKey));
  let createdQuestions = 0;
  for (const { line, data } of parsed.records) {
    let q = data.question_id ? questions.find((x) => x.id === data.question_id) : null;
    if (!q && data.question) q = questions.find((x) => questionKey(x.text) === questionKey(data.question));
    if (!q) {
      if (data.question && parseIntent(data.intent)) {
        const r = validateQuestion({ id: nextQuestionId(questions), text: data.question, intent: data.intent }, questions);
        if (!r.ok) { report.errors.push(`Row ${line}: ${r.errors.join(' ')}`); continue; }
        q = r.value;
        questions.push(q);
        createdQuestions += 1;
      } else {
        report.errors.push(`Row ${line}: question not found (${data.question_id || data.question || 'blank'}). Import questions first, or add question text and a valid intent to create it.`);
        continue;
      }
    }
    const brandIds = [];
    for (const name of splitList(data.brands_mentioned)) {
      const b = findBrandByName(name, project.brands);
      if (b) { if (!brandIds.includes(b.id)) brandIds.push(b.id); } else {
        report.warnings.push(`Row ${line}: brand "${name}" is not tracked in this project and was ignored. Add it under Brands, then re-import.`);
      }
    }
    const r = validateObservation({
      id: uid('o'),
      questionId: q.id,
      platform: data.platform,
      date: data.date,
      run: data.run,
      prompt: data.prompt,
      settings: data.settings,
      answerSummary: data.answer_summary,
      brandsMentioned: brandIds,
      citedUrls: data.cited_urls,
      citedDomains: data.cited_domains,
      notes: data.notes,
    }, { questions, brands: project.brands }, { lenient: true });
    if (!r.ok) { report.errors.push(`Row ${line}: ${r.errors.join(' ')}`); continue; }
    const key = observationKey(r.value);
    if (keys.has(key)) {
      report.skipped += 1;
      report.warnings.push(`Row ${line}: skipped — an observation for ${q.id} on ${r.value.platform}, ${r.value.date}, run ${r.value.run} already exists.`);
      continue;
    }
    for (const w of r.warnings) report.warnings.push(`Row ${line}: ${w}`);
    keys.add(key);
    observations.push(r.value);
    report.added += 1;
  }
  if (createdQuestions) report.warnings.push(`${createdQuestions} new question(s) were created from observation rows.`);
  return { project: { ...project, questions, observations }, report };
}

/** One-line human summary of an import report. */
export function describeReport(report, noun) {
  if (report.fatal) return `Import failed: ${report.fatal}`;
  const parts = [`Imported ${report.added} ${noun}${report.added === 1 ? '' : 's'}`];
  if (report.skipped) parts.push(`${report.skipped} duplicate${report.skipped === 1 ? '' : 's'} skipped`);
  if (report.errors.length) parts.push(`${report.errors.length} row${report.errors.length === 1 ? '' : 's'} rejected`);
  if (report.warnings.length) parts.push(`${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'}`);
  return `${parts.join(', ')}.`;
}

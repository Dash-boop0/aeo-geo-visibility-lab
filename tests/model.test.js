import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDomain, domainFromUrl, domainMatches, observationDomains, domainOwner, isValidDate, questionKey,
  validateBrand, validateQuestion, validateObservation, detectBrandMentions, findBrandByName, validateState,
  removeBrand, removeQuestion, nextQuestionId, splitList, splitUrls, SCHEMA, VERSION,
} from '../src/lib/model.js';
import { fixtureProject } from './fixtures.js';

test('normalizeDomain strips protocol, www, path, port and case', () => {
  assert.equal(normalizeDomain('https://WWW.Brand.Example.com:8080/path?q=1'), 'brand.example.com');
  assert.equal(normalizeDomain('brand.example.com.'), 'brand.example.com');
  assert.equal(normalizeDomain('  sub.brand.example.org '), 'sub.brand.example.org');
  assert.equal(normalizeDomain('localhost'), null);
  assert.equal(normalizeDomain('not a domain'), null);
  assert.equal(normalizeDomain(''), null);
});

test('domainFromUrl accepts only http(s) URLs', () => {
  assert.equal(domainFromUrl('https://www.t.example.com/x'), 't.example.com');
  assert.equal(domainFromUrl('ftp://t.example.com/x'), null);
  assert.equal(domainFromUrl('t.example.com/x'), null);
  assert.equal(domainFromUrl('javascript:alert(1)'), null);
});

test('domainMatches covers exact and subdomains but not look-alikes', () => {
  assert.ok(domainMatches('t.example.com', 't.example.com'));
  assert.ok(domainMatches('docs.t.example.com', 't.example.com'));
  assert.ok(!domainMatches('nott.example.com', 't.example.com'));
  assert.ok(!domainMatches('example.com', 't.example.com'));
});

test('observationDomains merges URL domains and manual domains without duplicates', () => {
  const o = { citedUrls: ['https://a.example.com/1', 'https://www.a.example.com/2', 'bad url'], citedDomains: ['b.example.org', 'A.example.com'] };
  assert.deepEqual(observationDomains(o).sort(), ['a.example.com', 'b.example.org']);
});

test('domainOwner picks the most specific matching brand domain', () => {
  const brands = [{ id: 'x', domains: ['example.net'] }, { id: 'y', domains: ['shop.example.net'] }];
  assert.equal(domainOwner('a.shop.example.net', brands).id, 'y');
  assert.equal(domainOwner('blog.example.net', brands).id, 'x');
  assert.equal(domainOwner('other.example.org', brands), null);
});

test('isValidDate rejects impossible dates and wrong formats', () => {
  assert.ok(isValidDate('2026-02-28'));
  assert.ok(isValidDate('2028-02-29'));
  assert.ok(!isValidDate('2026-02-29'));
  assert.ok(!isValidDate('2026-13-01'));
  assert.ok(!isValidDate('01/02/2026'));
  assert.ok(!isValidDate(''));
});

test('list splitting', () => {
  assert.deepEqual(splitList(' a ; b| c\n\n'), ['a', 'b', 'c']);
  assert.deepEqual(splitUrls('https://a.example.com https://b.example.com;https://c.example.com'), ['https://a.example.com', 'https://b.example.com', 'https://c.example.com']);
});

test('questionKey ignores case, spacing and trailing punctuation', () => {
  assert.equal(questionKey('  What  is X? '), questionKey('what is x'));
});

test('validateQuestion requires text and a known intent and blocks duplicates', () => {
  assert.ok(validateQuestion({ text: 'New?', intent: 'Purchase' }).ok);
  assert.equal(validateQuestion({ text: 'New?', intent: 'Purchase' }).value.intent, 'purchase');
  const bad = validateQuestion({ text: '', intent: 'other' });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 2);
  const dup = validateQuestion({ text: 'best tools for x', intent: 'discovery' }, fixtureProject().questions);
  assert.match(dup.errors[0], /Duplicate of existing question q1/);
});

test('validateBrand normalises domains and rejects invalid ones and duplicate names', () => {
  const ok = validateBrand({ name: 'New', role: 'competitor', domains: 'https://www.new.example.com/ new.example.com' });
  assert.deepEqual(ok.value.domains, ['new.example.com']);
  const bad = validateBrand({ name: 'Target Co (fictional)', role: 'boss', domains: 'nope' }, fixtureProject().brands);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 3);
});

test('validateObservation checks required fields, URLs and defaults the prompt', () => {
  const p = fixtureProject();
  const r = validateObservation({ questionId: 'q1', platform: 'A', date: '2026-03-01', citedUrls: ['https://x.example.com'], brandsMentioned: ['T', 'ghost'] }, p);
  assert.ok(r.ok);
  assert.equal(r.value.prompt, 'Best tools for X?');
  assert.deepEqual(r.value.brandsMentioned, ['T']);
  assert.equal(r.value.run, 1);
  assert.ok(r.warnings.some((w) => /question text/.test(w)));
  const bad = validateObservation({ questionId: 'zz', platform: '', date: '2026-02-30', run: 0, citedUrls: ['nope'] }, p);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 5);
  const lenient = validateObservation({ questionId: 'q1', platform: 'A', date: '2026-03-01', citedUrls: ['nope'] }, p, { lenient: true });
  assert.ok(lenient.ok);
  assert.ok(lenient.warnings.some((w) => /ignored/.test(w)));
});

test('detectBrandMentions matches names, stripped names and aliases on word boundaries', () => {
  const brands = fixtureProject().brands;
  assert.deepEqual(detectBrandMentions('We like Target Co and rival one.', brands), ['T', 'C1']);
  assert.deepEqual(detectBrandMentions('TargetCo is fine', brands), ['T']);
  assert.deepEqual(detectBrandMentions('TargetCompany and Rival Ones', brands), []);
  assert.equal(findBrandByName('target co', brands).id, 'T');
  assert.equal(findBrandByName('nobody', brands), null);
});

test('removeBrand and removeQuestion cascade to observations', () => {
  const p = fixtureProject();
  const noT = removeBrand(p, 'T');
  assert.equal(noT.brands.length, 2);
  assert.ok(noT.observations.every((o) => !o.brandsMentioned.includes('T')));
  const noQ1 = removeQuestion(p, 'q1');
  assert.equal(noQ1.observations.length, 3);
});

test('nextQuestionId continues the sequence', () => {
  assert.equal(nextQuestionId([{ id: 'q01' }, { id: 'q09' }, { id: 'custom' }]), 'q10');
  assert.equal(nextQuestionId([]), 'q01');
});

test('validateState accepts a valid backup and rejects malformed ones', () => {
  const good = validateState({ schema: SCHEMA, version: VERSION, activeProjectId: 'missing', projects: [fixtureProject()] });
  assert.ok(good.ok);
  assert.equal(good.state.activeProjectId, 'p-fixture');
  assert.equal(validateState(null).ok, false);
  assert.equal(validateState({ schema: 'other', version: 1, projects: [] }).ok, false);
  const broken = fixtureProject();
  broken.observations[0].date = 'yesterday';
  const r = validateState({ schema: SCHEMA, version: VERSION, projects: [broken] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /observation 1/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseCSVObjects, toCSV, escapeCell, CsvError } from '../src/lib/csv.js';

test('parses simple rows', () => {
  assert.deepEqual(parseCSV('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('handles quoted commas, escaped quotes and newlines inside quotes', () => {
  const text = 'name,note\n"Smith, J","He said ""hi""\nthen left"\n';
  assert.deepEqual(parseCSV(text), [['name', 'note'], ['Smith, J', 'He said "hi"\nthen left']]);
});

test('strips BOM and handles CRLF and lone CR line endings', () => {
  assert.deepEqual(parseCSV('﻿a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCSV('a,b\r1,2'), [['a', 'b'], ['1', '2']]);
});

test('keeps empty fields, skips fully blank lines, no trailing newline needed', () => {
  assert.deepEqual(parseCSV('a,b,c\n\n1,,3\n,,\n'), [['a', 'b', 'c'], ['1', '', '3'], ['', '', '']]);
  assert.deepEqual(parseCSV('x\n"y"'), [['x'], ['y']]);
  assert.deepEqual(parseCSV(''), []);
});

test('quoted empty field is kept as a row', () => {
  assert.deepEqual(parseCSV('""\n'), [['']]);
});

test('throws a helpful error on an unterminated quote', () => {
  assert.throws(() => parseCSV('a,b\n"open,2\n'), (e) => e instanceof CsvError && /line 2/.test(e.message));
});

test('parseCSVObjects normalises headers and reports data line numbers', () => {
  const r = parseCSVObjects('Question ID, Intent \nq1, discovery \n');
  assert.deepEqual(r.headers, ['question_id', 'intent']);
  assert.deepEqual(r.records, [{ line: 2, data: { question_id: 'q1', intent: 'discovery' } }]);
});

test('escapeCell guards against CSV injection but keeps numbers numeric', () => {
  assert.equal(escapeCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(escapeCell('+1'), "'+1");
  assert.equal(escapeCell('-cmd'), "'-cmd");
  assert.equal(escapeCell('@x'), "'@x");
  assert.equal(escapeCell(-0.25), '-0.25');
  assert.equal(escapeCell(null), '');
  assert.equal(escapeCell(NaN), '');
  assert.equal(escapeCell('a,"b"'), '"a,""b"""');
});

test('toCSV output round-trips through parseCSV', () => {
  const rows = [['h1', 'h2'], ['multi\nline', 'comma, quote "q"'], ['', 'plain']];
  assert.deepEqual(parseCSV(toCSV(rows)), rows);
  assert.ok(toCSV(rows).endsWith('\r\n'));
});

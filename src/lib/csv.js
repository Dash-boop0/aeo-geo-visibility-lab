// RFC 4180 CSV parser/serializer. Pure functions, no DOM access.
// Handles: quoted fields, escaped quotes (""), commas and newlines inside quotes,
// UTF-8 BOM, CRLF / LF / CR line endings. Exports guard against CSV injection.

export class CsvError extends Error {}

/**
 * Parse CSV text into an array of rows (arrays of strings).
 * Fully blank lines are skipped. Throws CsvError on an unterminated quoted field.
 */
export function parseCSV(text) {
  if (typeof text !== 'string') throw new CsvError('CSV input must be text.');
  let s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let fieldQuoted = false;
  let i = 0;
  let line = 1;
  let quoteStartLine = 0;
  const pushField = () => { row.push(field); field = ''; fieldQuoted = false; };
  const pushRow = () => {
    const quoted = fieldQuoted;
    pushField();
    const blank = row.length === 1 && row[0] === '' && !quoted;
    if (!blank) rows.push(row);
    row = [];
  };
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      if (c === '\n') line += 1;
      field += c; i += 1; continue;
    }
    if (c === '"') {
      if (field === '' && !fieldQuoted) { inQuotes = true; fieldQuoted = true; quoteStartLine = line; i += 1; continue; }
      // Stray quote inside an unquoted field: keep it literally (lenient).
      field += c; i += 1; continue;
    }
    if (c === ',') { pushField(); i += 1; continue; }
    if (c === '\r') { pushRow(); line += 1; i += s[i + 1] === '\n' ? 2 : 1; continue; }
    if (c === '\n') { pushRow(); line += 1; i += 1; continue; }
    field += c; i += 1;
  }
  if (inQuotes) throw new CsvError(`Unterminated quoted field starting on line ${quoteStartLine}. Check for a missing closing double quote.`);
  if (field !== '' || row.length > 0 || fieldQuoted) pushRow();
  return rows;
}

/** Normalise a header cell: trim, lowercase, spaces/hyphens -> underscore. */
export function normalizeHeader(h) {
  return String(h).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Parse CSV with a header row into objects keyed by normalised header.
 * Returns { headers, records: [{ line, data }] } where line is the 1-based data row number.
 */
export function parseCSVObjects(text) {
  const rows = parseCSV(text);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map(normalizeHeader);
  const records = rows.slice(1).map((cells, idx) => {
    const data = {};
    headers.forEach((h, j) => { if (h) data[h] = (cells[j] ?? '').trim(); });
    return { line: idx + 2, data };
  });
  return { headers, records };
}

const INJECTION_START = /^[=+\-@\t\r]/;

/**
 * Serialise one cell. Strings starting with = + - @ (or tab/CR) are prefixed with an
 * apostrophe to stop spreadsheet formula execution. Finite numbers are written as-is so
 * negative numeric values stay numeric. null/undefined become empty cells.
 */
export function escapeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let str = String(value);
  if (INJECTION_START.test(str)) str = `'${str}`;
  if (/[",\r\n]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Serialise rows (arrays) to CSV text with CRLF line endings (RFC 4180). */
export function toCSV(rows) {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

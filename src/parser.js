'use strict';

/**
 * CSV Parser — RFC 4180 compliant, zero dependencies.
 * Handles quoted fields, escaped quotes, newlines in fields, BOM.
 */
function parse(input, opts = {}) {
  const delimiter = opts.delimiter || ',';
  const quote = '"';
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Strip BOM
  if (input.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === quote) {
        if (input[i + 1] === quote) {
          field += quote;
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === quote && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // CRLF or bare CR — treat as row end
      if (input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  // Last field/row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Stringify rows to CSV.
 */
function stringify(rows, opts = {}) {
  const delimiter = opts.delimiter || ',';
  return rows.map(row =>
    row.map(field => {
      const s = String(field ?? '');
      if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(delimiter)
  ).join('\n');
}

/**
 * Parse into objects using first row as headers.
 */
function parseObjects(input, opts = {}) {
  const rows = parse(input, opts);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = opts.headers || rows[0];
  const dataStart = opts.headers ? 0 : 1;
  const objects = [];
  for (let i = dataStart; i < rows.length; i++) {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = rows[i][j] ?? ''; });
    objects.push(obj);
  }
  return { headers, rows: objects };
}

module.exports = { parse, stringify, parseObjects };

'use strict';
const { parse, stringify, parseObjects } = require('./parser');

// --- Filter rows where column matches a condition ---
function filter(data, opts = {}) {
  const { headers, rows } = parseObjects(data);
  if (!opts.column) throw new Error('--column required for filter');
  if (!opts.condition) throw new Error('--condition required for filter (e.g. >10, =foo, ~regex)');

  const col = opts.column;
  const cond = opts.condition;
  let test;

  const match = cond.match(/^([<>=!~]+)(.*)/);
  if (!match) throw new Error('Invalid condition format. Use: >val, <val, =val, !=val, ~regex');

  const [, op, val] = match;
  const numVal = Number(val);

  if (op === '~') {
    const re = new RegExp(val, 'i');
    test = v => re.test(v);
  } else if (op === '=' || op === '==') {
    test = v => String(v) === val;
  } else if (op === '!=' || op === '!') {
    test = v => String(v) !== val;
  } else if (op === '>') {
    test = v => !isNaN(Number(v)) && Number(v) > numVal;
  } else if (op === '>=') {
    test = v => !isNaN(Number(v)) && Number(v) >= numVal;
  } else if (op === '<') {
    test = v => !isNaN(Number(v)) && Number(v) < numVal;
  } else if (op === '<=') {
    test = v => !isNaN(Number(v)) && Number(v) <= numVal;
  } else {
    throw new Error(`Unknown operator: ${op}`);
  }

  const filtered = rows.filter(row => test(row[col] ?? ''));
  return { headers, rows: filtered };
}

// --- Sort rows by column ---
function sort(data, opts = {}) {
  const { headers, rows } = parseObjects(data);
  if (!opts.column) throw new Error('--column required for sort');

  const col = opts.column;
  const desc = opts.desc || false;
  const numeric = opts.numeric || false;

  const sorted = [...rows].sort((a, b) => {
    let va = a[col] ?? '';
    let vb = b[col] ?? '';
    if (numeric) { va = Number(va) || 0; vb = Number(vb) || 0; }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return desc ? 1 : -1;
    if (va > vb) return desc ? -1 : 1;
    return 0;
  });

  return { headers, rows: sorted };
}

// --- Aggregate: sum, avg, min, max, count, countunique ---
function aggregate(data, opts = {}) {
  const { headers, rows } = parseObjects(data);
  if (!opts.column) throw new Error('--column required for aggregate');
  if (!opts.op) throw new Error('--op required (sum, avg, min, max, count, countunique, median, stddev)');

  const col = opts.column;
  const values = rows.map(r => r[col] ?? '');
  const nums = values.map(Number).filter(n => !isNaN(n));
  const op = opts.op.toLowerCase();
  let result;

  switch (op) {
    case 'count':
      result = values.length;
      break;
    case 'countunique':
      result = new Set(values).size;
      break;
    case 'sum':
      result = nums.reduce((a, b) => a + b, 0);
      break;
    case 'avg':
      result = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      break;
    case 'min':
      result = nums.length ? Math.min(...nums) : NaN;
      break;
    case 'max':
      result = nums.length ? Math.max(...nums) : NaN;
      break;
    case 'median': {
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      result = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      break;
    }
    case 'stddev': {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
      result = Math.sqrt(variance);
      break;
    }
    default:
      throw new Error(`Unknown aggregation: ${op}`);
  }

  return { column: col, op, result };
}

// --- Select/reorder columns ---
function select(data, opts = {}) {
  const parsed = parse(data);
  if (parsed.length === 0) return { headers: [], rows: [] };
  const headers = parsed[0];
  const cols = (opts.columns || '').split(',').map(c => c.trim()).filter(Boolean);
  if (cols.length === 0) throw new Error('--columns required (comma-separated)');

  const indices = cols.map(c => {
    const i = headers.indexOf(c);
    if (i === -1) throw new Error(`Column not found: ${c}`);
    return i;
  });

  const result = parsed.map(row => indices.map(i => row[i] ?? ''));
  return { headers: indices.map(i => headers[i]), rows: result.slice(1).map(r => {
    const obj = {};
    indices.forEach((idx, j) => { obj[headers[idx]] = r[j]; });
    return obj;
  }) };
}

// --- Add computed column ---
function compute(data, opts = {}) {
  const { headers, rows } = parseObjects(data);
  if (!opts.name) throw new Error('--name required for new column name');
  if (!opts.expr) throw new Error('--expr required (JS expression, use column names as variables)');

  const name = opts.name;
  const expr = opts.expr;

  const computed = rows.map(row => {
    try {
      const fn = new Function(...Object.keys(row), `return (${expr});`);
      row[name] = fn(...Object.values(row).map(v => {
        const n = Number(v);
        return !isNaN(n) && v.trim() !== '' ? n : v;
      }));
    } catch {
      row[name] = '';
    }
    return row;
  });

  return { headers: [...headers, name], rows: computed };
}

// --- Summary stats per column ---
function summary(data, opts = {}) {
  const { headers, rows } = parseObjects(data);
  return headers.map(h => {
    const vals = rows.map(r => r[h] ?? '');
    const nums = vals.map(Number).filter(n => !isNaN(n));
    const unique = new Set(vals).size;
    const empty = vals.filter(v => v === '').length;

    const info = { column: h, count: vals.length, unique, empty };

    if (nums.length > 0 && nums.length === vals.length - empty) {
      info.type = 'numeric';
      info.min = Math.min(...nums);
      info.max = Math.max(...nums);
      info.sum = nums.reduce((a, b) => a + b, 0);
      info.avg = +(info.sum / nums.length).toFixed(2);
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      info.median = sorted.length % 2 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);
    } else {
      info.type = 'text';
      // Most common value
      const freq = {};
      vals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      info.top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      info.topCount = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[1] || 0;
    }

    return info;
  });
}

// --- Find duplicates based on columns ---
function duplicates(data, opts = {}) {
  const { headers, rows } = parseObjects(data);
  const cols = (opts.columns || '').split(',').map(c => c.trim()).filter(Boolean);
  if (cols.length === 0) throw new Error('--columns required');

  const seen = new Map();
  const dups = [];

  rows.forEach((row, idx) => {
    const key = cols.map(c => String(row[c] ?? '')).join('|');
    if (seen.has(key)) {
      dups.push({ index: idx + 2, row, duplicateOf: seen.get(key) }); // +2 for 1-indexed + header
    } else {
      seen.set(key, idx + 2);
    }
  });

  return { columns: cols, count: dups.length, duplicates: dups };
}

// --- Pivot table ---
function pivot(data, opts = {}) {
  const { headers, rows } = parseObjects(data);
  if (!opts.row) throw new Error('--row required');
  if (!opts.value) throw new Error('--value required');

  const rowCol = opts.row;
  const valCol = opts.value;
  const colCol = opts.col || null;
  const op = opts.op || 'sum';

  if (!colCol) {
    // Simple group-by
    const groups = {};
    rows.forEach(r => {
      const key = r[rowCol] ?? '';
      if (!groups[key]) groups[key] = [];
      const n = Number(r[valCol]);
      if (!isNaN(n)) groups[key].push(n);
    });

    const result = Object.entries(groups).map(([key, nums]) => {
      let val;
      switch (op) {
        case 'sum': val = nums.reduce((a, b) => a + b, 0); break;
        case 'avg': val = nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0; break;
        case 'count': val = nums.length; break;
        case 'min': val = nums.length ? Math.min(...nums) : 0; break;
        case 'max': val = nums.length ? Math.max(...nums) : 0; break;
        default: val = nums.reduce((a, b) => a + b, 0);
      }
      return { [rowCol]: key, [`${op}(${valCol})`]: val };
    });

    return { headers: [rowCol, `${op}(${valCol})`], rows: result };
  }

  // Full pivot with column axis
  const rowKeys = [...new Set(rows.map(r => r[rowCol] ?? ''))];
  const colKeys = [...new Set(rows.map(r => r[colCol] ?? ''))];

  const pivotData = {};
  rows.forEach(r => {
    const rk = r[rowCol] ?? '';
    const ck = r[colCol] ?? '';
    const v = Number(r[valCol]);
    const k = `${rk}|${ck}`;
    if (!pivotData[k]) pivotData[k] = [];
    if (!isNaN(v)) pivotData[k].push(v);
  });

  const result = rowKeys.map(rk => {
    const obj = { [rowCol]: rk };
    colKeys.forEach(ck => {
      const nums = pivotData[`${rk}|${ck}`] || [];
      let val;
      switch (op) {
        case 'sum': val = nums.reduce((a, b) => a + b, 0); break;
        case 'avg': val = nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0; break;
        case 'count': val = nums.length; break;
        case 'min': val = nums.length ? Math.min(...nums) : 0; break;
        case 'max': val = nums.length ? Math.max(...nums) : 0; break;
        default: val = nums.reduce((a, b) => a + b, 0);
      }
      obj[ck] = val;
    });
    return obj;
  });

  return { headers: [rowCol, ...colKeys], rows: result };
}

// --- Join two CSVs ---
function join(data1, data2, opts = {}) {
  const d1 = parseObjects(data1);
  const d2 = parseObjects(data2);
  if (!opts.on) throw new Error('--on required (join column)');

  const key = opts.on;
  const type = opts.type || 'inner'; // inner, left, right, full

  const map2 = new Map();
  d2.rows.forEach(r => {
    const k = r[key] ?? '';
    if (!map2.has(k)) map2.set(k, []);
    map2.get(k).push(r);
  });

  const result = [];
  const matched2 = new Set();

  d1.rows.forEach(r1 => {
    const k = r1[key] ?? '';
    const matches = map2.get(k) || [];
    if (matches.length === 0) {
      if (type === 'left' || type === 'full') {
        const obj = { ...r1 };
        d2.headers.filter(h => h !== key).forEach(h => { obj[h] = ''; });
        result.push(obj);
      }
    } else {
      matches.forEach(r2 => {
        matched2.add(r2[key] ?? '');
        const obj = { ...r1 };
        d2.headers.filter(h => h !== key).forEach(h => { obj[h] = r2[h] ?? ''; });
        result.push(obj);
      });
    }
  });

  if (type === 'right' || type === 'full') {
    d2.rows.forEach(r2 => {
      const k = r2[key] ?? '';
      if (type === 'full' && !matched2.has(k)) {
        const obj = {};
        d1.headers.forEach(h => { obj[h] = h === key ? k : ''; });
        d2.headers.filter(h => h !== key).forEach(h => { obj[h] = r2[h] ?? ''; });
        result.push(obj);
      } else if (type === 'right' && !d1.rows.some(r1 => (r1[key] ?? '') === k)) {
        const obj = {};
        d1.headers.forEach(h => { obj[h] = h === key ? k : ''; });
        d2.headers.filter(h => h !== key).forEach(h => { obj[h] = r2[h] ?? ''; });
        result.push(obj);
      }
    });
  }

  const allHeaders = [...new Set([...d1.headers, ...d2.headers])];
  return { headers: allHeaders, rows: result };
}

module.exports = { parse, stringify, parseObjects, filter, sort, aggregate, select, compute, summary, duplicates, pivot, join };

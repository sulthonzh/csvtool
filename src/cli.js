'use strict';
const fs = require('fs');
const path = require('path');
const api = require('./index');

function readInput(opts) {
  if (opts.file) return fs.readFileSync(opts.file, 'utf-8');
  if (opts.data) return opts.data;
  // Read stdin
  if (!process.stdin.isTTY) {
    return fs.readFileSync('/dev/stdin', 'utf-8');
  }
  throw new Error('No input. Use --file <path> or pipe CSV via stdin.');
}

function formatOutput(result, opts) {
  const format = opts.format || 'csv';

  if (format === 'json') {
    return JSON.stringify(result, null, opts.compact ? 0 : 2);
  }

  if (format === 'markdown' || format === 'md') {
    if (!result.headers || !result.rows) {
      return JSON.stringify(result, null, 2);
    }
    const headerRow = '| ' + result.headers.join(' | ') + ' |';
    const sepRow = '| ' + result.headers.map(() => '---').join(' | ') + ' |';
    const dataRows = (Array.isArray(result.rows[0]) ? result.rows : result.rows.map(r => result.headers.map(h => r[h] ?? ''))).map(r => '| ' + r.join(' | ') + ' |');
    return [headerRow, sepRow, ...dataRows].join('\n');
  }

  // Default: CSV
  if (result.headers && result.rows) {
    const rows = Array.isArray(result.rows[0])
      ? [result.headers, ...result.rows]
      : [result.headers, ...result.rows.map(r => result.headers.map(h => String(r[h] ?? '')))];
    return api.stringify(rows);
  }

  return JSON.stringify(result, null, 2);
}

function parseArgs(argv) {
  const args = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    } else if (a.startsWith('-') && a.length === 2) {
      const key = a.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
    i++;
  }
  return args;
}

const COMMANDS = {
  filter: { desc: 'Filter rows by column condition', needs: ['column', 'condition'] },
  sort: { desc: 'Sort rows by column', needs: ['column'] },
  agg: { desc: 'Aggregate column (sum/avg/min/max/count/median/stddev)', needs: ['column', 'op'] },
  select: { desc: 'Select/reorder columns', needs: ['columns'] },
  compute: { desc: 'Add computed column from expression', needs: ['name', 'expr'] },
  summary: { desc: 'Column statistics overview', needs: [] },
  dupes: { desc: 'Find duplicate rows by columns', needs: ['columns'] },
  pivot: { desc: 'Pivot table / group-by', needs: ['row', 'value'] },
  join: { desc: 'Join two CSVs on a column', needs: ['on', 'file2'] },
  head: { desc: 'Show first N rows', needs: [] },
  tail: { desc: 'Show last N rows', needs: [] },
  rename: { desc: 'Rename columns (old:new,old2:new2)', needs: ['mapping'] },
  sample: { desc: 'Random sample of N rows', needs: [] },
  cols: { desc: 'List column names', needs: [] },
  count: { desc: 'Count rows', needs: [] },
};

function usage() {
  let out = 'csvtool — CSV processing CLI\n\nUsage: csvtool <command> [options]\n\nCommands:\n';
  Object.entries(COMMANDS).forEach(([cmd, info]) => {
    out += `  ${cmd.padEnd(10)} ${info.desc}\n`;
  });
  out += '\nOptions:\n';
  out += '  --file <path>       Input CSV file (or use stdin)\n';
  out += '  --file2 <path>      Second CSV for join\n';
  out += '  --column <name>     Column name\n';
  out += '  --columns <a,b,c>   Comma-separated column names\n';
  out += '  --condition <expr>  Filter condition (>10, =foo, ~regex, etc.)\n';
  out += '  --op <op>           Aggregation op (sum/avg/min/max/count/countunique/median/stddev)\n';
  out += '  --row <col>         Pivot row column\n';
  out += '  --col <col>         Pivot column axis\n';
  out += '  --value <col>       Pivot value column\n';
  out += '  --name <name>       New column name for compute\n';
  out += '  --expr <expr>       JS expression for compute\n';
  out += '  --on <col>          Join column\n';
  out += '  --type <type>       Join type (inner/left/right/full)\n';
  out += '  --mapping <m>       Column rename mapping (old:new,old2:new2)\n';
  out += '  --seed <num>        Random seed for sample reproducibility\n';
  out += '  --desc              Sort descending\n';
  out += '  --numeric           Sort as numbers\n';
  out += '  -n <count>          Row count for head/tail (default: 10)\n';
  out += '  --format <fmt>      Output format: csv, json, markdown (default: csv)\n';
  out += '  --compact           Compact JSON output\n';
  out += '  -d, --delimiter     CSV delimiter (default: comma)\n';
  out += '  --no-header         Treat first row as data, not headers\n';
  return out;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === 'help' || command === '--help') {
    console.log(usage());
    return;
  }

  if (command === 'version' || command === '--version') {
    const pkg = require('../package.json');
    console.log(`csvtool v${pkg.version}`);
    return;
  }

  const spec = COMMANDS[command];
  if (!spec) throw new Error(`Unknown command: ${command}. Run 'csvtool help' for usage.`);

  const delimiter = args.d || args.delimiter || ',';
  const input = readInput(args);
  const opts = { delimiter };

  // Pass relevant options
  ['column', 'columns', 'condition', 'op', 'row', 'col', 'value', 'name', 'expr', 'on', 'type', 'desc', 'numeric', 'mapping', 'n', 'seed'].forEach(k => {
    if (args[k] !== undefined) opts[k] = args[k];
  });

  let result;

  switch (command) {
    case 'filter':
      result = api.filter(input, opts);
      break;
    case 'sort':
      result = api.sort(input, opts);
      break;
    case 'agg':
      result = api.aggregate(input, opts);
      break;
    case 'select':
      result = api.select(input, opts);
      break;
    case 'compute':
      result = api.compute(input, opts);
      break;
    case 'summary':
      result = api.summary(input, opts);
      break;
    case 'dupes':
      result = api.duplicates(input, opts);
      break;
    case 'pivot':
      result = api.pivot(input, opts);
      break;
    case 'join': {
      const data2 = fs.readFileSync(args.file2, 'utf-8');
      result = api.join(input, data2, opts);
      break;
    }
    case 'head': {
      const { headers, rows } = api.parseObjects(input, opts);
      const n = parseInt(args.n || args._[1] || '10', 10);
      result = { headers, rows: rows.slice(0, n) };
      break;
    }
    case 'tail': {
      const { headers, rows } = api.parseObjects(input, opts);
      const n = parseInt(args.n || args._[1] || '10', 10);
      result = { headers, rows: rows.slice(-n) };
      break;
    }
    case 'cols': {
      const parsed = api.parse(input, opts);
      result = { columns: parsed[0] || [] };
      break;
    }
    case 'rename':
      result = api.rename(input, opts);
      break;
    case 'sample':
      result = api.sample(input, opts);
      break;
    case 'count': {
      const parsed = api.parse(input, opts);
      result = { rows: parsed.length - 1, columns: parsed[0]?.length || 0 };
      break;
    }
  }

  if (result) {
    console.log(formatOutput(result, args));
  }
}

module.exports = { run, parseArgs, formatOutput };

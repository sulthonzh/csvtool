# csvtool

> Zero-dep CSV processing CLI — filter, sort, aggregate, pivot, join, and transform CSVs from the terminal.

```bash
# Filter Jakarta employees earning 50k+
csvtool filter --file data.csv --column city --condition =Jakarta | \
  csvtool filter --column salary --condition '>50000'

# Sort by salary descending
csvtool sort --file data.csv --column salary --numeric --desc

# Quick stats
csvtool summary --file data.csv

# Pivot table: total salary by city
csvtool pivot --file data.csv --row city --value salary --op sum

# Join two CSVs
csvtool join --file employees.csv --file2 departments.csv --on name --type left

# Compute a new column
csvtool compute --file data.csv --name bonus --expr 'salary * 0.1'
```

## Why

You know the drill: someone sends you a CSV and you need quick answers. You could fire up a spreadsheet, write a Python script, or install a 50MB dependency. Or you could just pipe it through `csvtool` and move on.

Built for the terminal. No runtime deps. Works with stdin. Plays nice with other Unix tools.

## Install

```bash
npm install -g csvtool
```

## Commands

| Command | What it does |
|---------|-------------|
| `filter` | Filter rows by column condition |
| `sort` | Sort rows by column |
| `agg` | Aggregate (sum/avg/min/max/count/median/stddev) |
| `select` | Select/reorder columns |
| `compute` | Add computed column from JS expression |
| `summary` | Column stats overview |
| `dupes` | Find duplicate rows |
| `pivot` | Pivot table / group-by |
| `join` | Join two CSVs on a column |
| `head` | First N rows |
| `tail` | Last N rows |
| `cols` | List column names |
| `count` | Count rows |

## Filter Conditions

```
=exact          Exact match
!=value         Not equal
>100            Greater than (numeric)
>=50            Greater than or equal
<1000           Less than
<=500           Less than or equal
~^prefix        Regex match
```

## Output Formats

```bash
# Default: CSV
csvtool sort --file data.csv --column name

# JSON
csvtool summary --file data.csv --format json

# Markdown table
csvtool pivot --file data.csv --row city --value salary --op sum --format markdown
```

## Piping

```bash
# Chain commands via stdout
csvtool filter --file data.csv --column status --condition =active | \
  csvtool sort --column revenue --numeric --desc | \
  csvtool head -n 10

# From another process
curl -s https://example.com/data.csv | csvtool summary
```

## Join Types

```bash
csvtool join --file a.csv --file2 b.csv --on id --type inner   # matches only
csvtool join --file a.csv --file2 b.csv --on id --type left    # all from a
csvtool join --file a.csv --file2 b.csv --on id --type right   # all from b
csvtool join --file a.csv --file2 b.csv --on id --type full    # all from both
```

## Programmatic API

```js
const { filter, sort, aggregate, pivot, join } = require('csvtool');

const csv = `name,age,city
Alice,30,Jakarta
Bob,25,Bandung
Charlie,35,Jakarta`;

// Filter
const { headers, rows } = filter(csv, {
  column: 'city',
  condition: '=Jakarta'
});

// Aggregate
const { result } = aggregate(csv, {
  column: 'age',
  op: 'avg'
}); // result: 30

// Pivot
const table = pivot(csv, {
  row: 'city',
  value: 'age',
  op: 'avg'
});
```

## Features

- **RFC 4180 compliant** — quoted fields, escaped quotes, newlines in fields, BOM
- **Zero dependencies** — no node_modules bloat
- **Stdin support** — pipe from anything
- **Multiple output formats** — CSV, JSON, Markdown
- **Full join support** — inner, left, right, full
- **Pivot tables** — group-by with sum/avg/count/min/max
- **Computed columns** — JS expressions with auto numeric coercion
- **Duplicate detection** — find dupes by any column combination

## License

MIT

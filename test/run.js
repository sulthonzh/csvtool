'use strict';
const fs = require('fs');
const path = require('path');
const { parse, stringify, parseObjects, filter, sort, aggregate, select, compute, summary, duplicates, pivot, join, rename, sample } = require('../src/index');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function assertEq(a, b, msg) {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
}

const SAMPLE = `name,age,city,salary
Alice,30,Jakarta,50000
Bob,25,Bandung,45000
Charlie,35,Jakarta,70000
Diana,28,Surabaya,55000
Eve,32,Jakarta,60000
Frank,25,Bandung,48000`;

// --- Parser ---
console.log('Parser tests:');
{
  const rows = parse('a,b,c\n1,2,3\n4,5,6');
  assertEq(rows.length, 3, 'parse row count');
  assertEq(rows[0], ['a', 'b', 'c'], 'parse headers');
  assertEq(rows[1], ['1', '2', '3'], 'parse data row');
}

{
  const rows = parse('"hello, world",b\n"quoted ""inner""",d');
  assertEq(rows[0][0], 'hello, world', 'quoted field with comma');
  assertEq(rows[1][0], 'quoted "inner"', 'escaped quotes');
}

{
  const rows = parse('a\r\nb\r\nc\r\nd');
  assertEq(rows.length, 4, 'CRLF handling');
  assertEq(rows[0][0], 'a', 'CRLF first row');
  assertEq(rows[3][0], 'd', 'CRLF last row');
}

{
  const rows = parse('\ufeffa,b\n1,2');
  assertEq(rows[0][0], 'a', 'BOM stripped');
}

{
  const rows = parse('a\n"multi\nline"\nval');
  assertEq(rows[1][0], 'multi\nline', 'newline in quoted field');
}

// --- Stringify ---
console.log('Stringify tests:');
{
  const csv = stringify([['a', 'b'], ['hello, world', 'test']]);
  assert(csv.includes('"hello, world"'), 'stringify quotes fields with commas');
  assert(csv.includes('test'), 'stringify simple field');
}

{
  const csv = stringify([['a'], ['has "quotes"']]);
  assert(csv.includes('"has ""quotes"""'), 'stringify escapes quotes');
}

// --- parseObjects ---
console.log('parseObjects tests:');
{
  const { headers, rows } = parseObjects('name,age\nAlice,30\nBob,25');
  assertEq(headers, ['name', 'age'], 'parseObjects headers');
  assertEq(rows[0], { name: 'Alice', age: '30' }, 'parseObjects first row');
  assertEq(rows.length, 2, 'parseObjects row count');
}

// --- Filter ---
console.log('Filter tests:');
{
  const { rows } = filter(SAMPLE, { column: 'city', condition: '=Jakarta' });
  assertEq(rows.length, 3, 'filter eq string');
  assertEq(rows[0].name, 'Alice', 'filter first match');
}

{
  const { rows } = filter(SAMPLE, { column: 'age', condition: '>30' });
  assertEq(rows.length, 2, 'filter gt numeric');
}

{
  const { rows } = filter(SAMPLE, { column: 'name', condition: '~^[A-D]' });
  assertEq(rows.length, 4, 'filter regex');
  assertEq(rows.map(r => r.name).sort().join(','), 'Alice,Bob,Charlie,Diana', 'filter regex matches');
}

{
  const { rows } = filter(SAMPLE, { column: 'age', condition: '!=25' });
  assertEq(rows.length, 4, 'filter neq');
}

{
  const { rows } = filter(SAMPLE, { column: 'salary', condition: '>=55000' });
  assertEq(rows.length, 3, 'filter gte');
}

{
  const { rows } = filter(SAMPLE, { column: 'salary', condition: '<50000' });
  assertEq(rows.length, 2, 'filter lt');
  // Bob 45000, Frank 48000
}

// --- Sort ---
console.log('Sort tests:');
{
  const { rows } = sort(SAMPLE, { column: 'age', numeric: true });
  assertEq(rows[0].name, 'Bob', 'sort asc youngest');
  assertEq(rows[rows.length - 1].name, 'Charlie', 'sort asc oldest');
}

{
  const { rows } = sort(SAMPLE, { column: 'name' });
  assertEq(rows[0].name, 'Alice', 'sort alpha first');
}

{
  const { rows } = sort(SAMPLE, { column: 'salary', numeric: true, desc: true });
  assertEq(rows[0].name, 'Charlie', 'sort desc highest salary');
}

// --- Aggregate ---
console.log('Aggregate tests:');
{
  const r = aggregate(SAMPLE, { column: 'salary', op: 'sum' });
  assertEq(r.result, 328000, 'agg sum');
}

{
  const r = aggregate(SAMPLE, { column: 'salary', op: 'avg' });
  assertEq(r.result, 54666.666666666664, 'agg avg');
}

{
  const r = aggregate(SAMPLE, { column: 'salary', op: 'min' });
  assertEq(r.result, 45000, 'agg min');
}

{
  const r = aggregate(SAMPLE, { column: 'salary', op: 'max' });
  assertEq(r.result, 70000, 'agg max');
}

{
  const r = aggregate(SAMPLE, { column: 'name', op: 'count' });
  assertEq(r.result, 6, 'agg count');
}

{
  const r = aggregate(SAMPLE, { column: 'city', op: 'countunique' });
  assertEq(r.result, 3, 'agg countunique');
}

{
  const r = aggregate(SAMPLE, { column: 'salary', op: 'median' });
  assertEq(r.result, 52500, 'agg median');
}

{
  const r = aggregate(SAMPLE, { column: 'age', op: 'stddev' });
  assert(Math.abs(r.result - 3.651) < 0.1, 'agg stddev approx');
}

// --- Select ---
console.log('Select tests:');
{
  const { headers, rows } = select(SAMPLE, { columns: 'name,salary' });
  assertEq(headers, ['name', 'salary'], 'select headers');
  assertEq(rows[0], { name: 'Alice', salary: '50000' }, 'select first row');
}

// --- Compute ---
console.log('Compute tests:');
{
  const { headers, rows } = compute(SAMPLE, { name: 'bonus', expr: 'salary * 0.1' });
  assertEq(headers.includes('bonus'), true, 'compute adds column');
  assertEq(rows[0].bonus, 5000, 'compute expression');
}

// --- Summary ---
console.log('Summary tests:');
{
  const s = summary(SAMPLE);
  assertEq(s.length, 4, 'summary column count');
  const ageCol = s.find(c => c.column === 'age');
  assertEq(ageCol.type, 'numeric', 'summary age is numeric');
  assertEq(ageCol.min, 25, 'summary age min');
  assertEq(ageCol.max, 35, 'summary age max');
  const cityCol = s.find(c => c.column === 'city');
  assertEq(cityCol.type, 'text', 'summary city is text');
  assertEq(cityCol.unique, 3, 'summary city unique');
}

// --- Duplicates ---
console.log('Duplicates tests:');
{
  const dupData = `id,name
1,Alice
2,Bob
1,Alice
3,Charlie
2,Bob`;
  const r = duplicates(dupData, { columns: 'id' });
  assertEq(r.count, 2, 'dupes found');
  assertEq(r.duplicates[0].index, 4, 'dupes first index');
}

{
  const r = duplicates(SAMPLE, { columns: 'name' });
  assertEq(r.count, 0, 'no dupes');
}

// --- Pivot ---
console.log('Pivot tests:');
{
  const r = pivot(SAMPLE, { row: 'city', value: 'salary', op: 'sum' });
  assertEq(r.rows.length, 3, 'pivot group count');
  const jkt = r.rows.find(x => x.city === 'Jakarta');
  assertEq(jkt['sum(salary)'], 180000, 'pivot Jakarta sum');
}

{
  const r = pivot(SAMPLE, { row: 'city', col: 'age', value: 'salary', op: 'sum' });
  assertEq(r.headers.length, 6, 'pivot with col axis headers');
  assertEq(r.rows.length, 3, 'pivot with col axis rows');
}

// --- Join ---
console.log('Join tests:');
{
  const csv2 = `name,dept
Alice,Engineering
Bob,Marketing
Charlie,Engineering
Diana,Design
Eve,Engineering
Frank,Marketing`;

  const r = join(SAMPLE, csv2, { on: 'name', type: 'inner' });
  assertEq(r.rows.length, 6, 'join inner count');
  assertEq(r.rows[0].dept, 'Engineering', 'join inner data');
}

{
  const csv2 = `name,dept
Alice,Engineering
Bob,Marketing`;
  const r = join(SAMPLE, csv2, { on: 'name', type: 'left' });
  assertEq(r.rows.length, 6, 'join left count');
  const diana = r.rows.find(x => x.name === 'Diana');
  assertEq(diana.dept, '', 'join left unmatched');
}

{
  const csv2 = `name,dept
Alice,Engineering
Zara,Sales`;
  const r = join(SAMPLE, csv2, { on: 'name', type: 'right' });
  assertEq(r.rows.length, 2, 'join right count');
  const zara = r.rows.find(x => x.name === 'Zara');
  assertEq(zara !== undefined, true, 'join right includes unmatched from right');
}

// --- Head/Tail (via CLI parseObjects) ---
console.log('Head/Tail tests:');
{
  const { headers, rows } = parseObjects(SAMPLE);
  assertEq(rows.slice(0, 3).length, 3, 'head 3 rows');
  assertEq(rows.slice(-2).length, 2, 'tail 2 rows');
}

// --- Rename ---
console.log('Rename tests:');
{
  const { headers, rows } = rename(SAMPLE, { mapping: 'name:full_name,age:years' });
  assertEq(headers.includes('full_name'), true, 'rename header updated');
  assertEq(headers.includes('years'), true, 'rename header updated 2');
  assertEq(headers.includes('city'), true, 'rename untouched header kept');
  assertEq(rows[0].full_name, 'Alice', 'rename data preserved');
  assertEq(rows[0].years, '30', 'rename data preserved 2');
}

{
  try {
    rename(SAMPLE, { mapping: '' });
    assert(false, 'rename empty mapping should throw');
  } catch (e) {
    assert(e.message.includes('mapping required'), 'rename empty mapping throws');
  }
}

{
  try {
    rename(SAMPLE, { mapping: 'name' });
    assert(false, 'rename invalid format should throw');
  } catch (e) {
    assert(e.message.includes('Invalid mapping'), 'rename invalid format throws');
  }
}

// --- Sample ---
console.log('Sample tests:');
{
  const { headers, rows } = sample(SAMPLE, { n: '3', seed: '42' });
  assertEq(headers.length, 4, 'sample keeps headers');
  assertEq(rows.length, 3, 'sample correct count');
}

{
  // Same seed = same results
  const r1 = sample(SAMPLE, { n: '3', seed: '123' });
  const r2 = sample(SAMPLE, { n: '3', seed: '123' });
  assertEq(r1.rows.map(r => r.name), r2.rows.map(r => r.name), 'sample deterministic with seed');
}

{
  // n >= total rows returns all
  const { rows } = sample(SAMPLE, { n: '100' });
  assertEq(rows.length, 6, 'sample returns all when n >= total');
}

{
  try {
    sample(SAMPLE, { n: '0' });
    assert(false, 'sample n=0 should throw');
  } catch (e) {
    assert(e.message.includes('must be > 0'), 'sample n=0 throws');
  }
}

// --- Summary of results ---
console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);

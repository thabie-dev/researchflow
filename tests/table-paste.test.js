const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTabularText } = require('../frontend/table-paste');

test('parses spreadsheet rows, blank cells, quoted tabs and line breaks', () => {
  assert.deepEqual(parseTabularText('Name\tValue\r\nA\t1\r\n'), [['Name', 'Value'], ['A', '1']]);
  assert.deepEqual(parseTabularText('"A\tB"\t"x\n""y"""\n\t'), [['A\tB', 'x\n"y"'], ['', '']]);
  assert.deepEqual(parseTabularText('one\ttwo\t'), [['one', 'two', '']]);
  assert.equal(parseTabularText('one line'), null);
  assert.equal(parseTabularText('"a\tb"'), null);
});

test('rejects uneven or oversized tabular text', () => {
  assert.throws(() => parseTabularText('a\tb\nc'), /rectangular/);
  assert.throws(() => parseTabularText(Array(13).fill('x').join('\t')), /12 columns/);
  assert.throws(() => parseTabularText(Array(101).fill('a\tb').join('\n')), /100 rows/);
  assert.throws(() => parseTabularText('a\t"unclosed'), /unclosed/);
  assert.throws(() => parseTabularText('a\t"bad"suffix'), /invalid quoted/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'researchflow-app-connected.html'), 'utf8');
const source = html.slice(html.indexOf('function deadlineRisk('), html.indexOf('\nfunction renderProjectGrid('));
const deadlineRisk = vm.runInNewContext(`(${source})`);

test('deadline risk uses local calendar dates and the agreed boundaries', () => {
  const today = new Date(2026, 10, 14, 23, 59);
  const cases = [
    ['2026-11-13', 'overdue', '1 day overdue'],
    ['2026-11-14', 'high', 'Due today'],
    ['2026-11-15', 'high', '1 day remaining'],
    ['2026-11-21', 'high', '7 days remaining'],
    ['2026-11-22', 'medium', '8 days remaining'],
    ['2026-12-14', 'medium', '30 days remaining'],
    ['2026-12-15', 'low', '31 days remaining'],
    [null, 'none', 'No deadline set'],
    ['2026-02-30', 'invalid', 'Check deadline: 2026-02-30'],
    ['unknown', 'invalid', 'Check deadline: unknown'],
  ];
  for (const [deadline, key, detail] of cases) {
    const result = deadlineRisk(deadline, today);
    assert.equal(result.key, key, String(deadline));
    assert.equal(result.detail, detail, String(deadline));
  }
});

test('calendar differences remain correct across daylight saving and leap days', () => {
  assert.equal(deadlineRisk('2024-03-01', new Date(2024, 1, 28, 12)).detail, '2 days remaining');
  assert.equal(deadlineRisk('2026-03-09', new Date(2026, 2, 7, 12)).detail, '2 days remaining');
});

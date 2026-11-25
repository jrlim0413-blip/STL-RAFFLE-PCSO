import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fromManilaDateTimeInput,
  getCountdownParts,
  getEntrySchedule,
  toManilaDateTimeInput
} from '../src/utils/entrySchedule.js';

test('entry schedule opens and closes at the configured instants', () => {
  const start = '2026-03-01T10:00:00.000Z';
  const end = '2026-03-02T10:00:00.000Z';

  assert.equal(getEntrySchedule('', '', Date.parse(start)).state, 'unscheduled');
  assert.equal(getEntrySchedule(start, end, Date.parse(start) - 1).state, 'upcoming');
  assert.equal(getEntrySchedule(start, end, Date.parse(start)).state, 'open');
  assert.equal(getEntrySchedule(start, end, Date.parse(end) - 1).state, 'open');
  assert.equal(getEntrySchedule(start, end, Date.parse(end)).state, 'ended');
});

test('invalid partial or reversed schedules remain closed', () => {
  assert.equal(getEntrySchedule('2026-03-01T10:00:00.000Z', '', 0).state, 'invalid');
  assert.equal(getEntrySchedule('2026-03-02T10:00:00.000Z', '2026-03-01T10:00:00.000Z', 0).state, 'invalid');
});

test('countdown shows days, hours, minutes, and seconds', () => {
  assert.deepEqual(getCountdownParts(100000000, 6216000), {
    days: 1,
    hours: 2,
    minutes: 3,
    seconds: 4
  });
});

test('admin local date-times round-trip in Philippines time', () => {
  const utc = '2026-03-01T10:00:00.000Z';
  const local = '2026-03-01T18:00';
  assert.equal(toManilaDateTimeInput(utc), local);
  assert.equal(fromManilaDateTimeInput(local), utc);
  assert.equal(fromManilaDateTimeInput('2026-02-31T18:00'), '');
});

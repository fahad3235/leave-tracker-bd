/* leave-tracker-bd - node unit tests. Run: node tests/unit.test.js */
'use strict';
const L = require('../js/logic.js');

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

/* --- Date parsing --- */
check('parseDate valid', L.fmtISO(L.parseDate('2026-10-20')) === '2026-10-20');
check('parseDate rejects 2026-02-30', L.parseDate('2026-02-30') === null);
check('parseDate rejects garbage', L.parseDate('hello') === null);
check('parseDate rejects 2026-13-01', L.parseDate('2026-13-01') === null);
check('yearOf', L.yearOf('2026-10-20') === 2026);

/* --- Day counting (2026-10-18 is a Sunday; 2026-10-23 is Friday) --- */
check('countDays Tue-Thu = 3', L.countDays('2026-10-20', '2026-10-22', [5]) === 3);
check('countDays single day = 1', L.countDays('2026-10-20', '2026-10-20', [5]) === 1);
check('countDays Fri only with Fri weekend = 0', L.countDays('2026-10-23', '2026-10-23', [5]) === 0);
check('countDays Fri-Sat, Fri-only weekend = 1', L.countDays('2026-10-23', '2026-10-24', [5]) === 1);
check('countDays Fri-Sat, Fri+Sat weekend = 0', L.countDays('2026-10-23', '2026-10-24', [5, 6]) === 0);
check('countDays full week Fri-only = 6', L.countDays('2026-10-18', '2026-10-24', [5]) === 6);
check('countDays full week Fri+Sat = 5', L.countDays('2026-10-18', '2026-10-24', [5, 6]) === 5);
check('countDays end<start = 0', L.countDays('2026-10-22', '2026-10-20', [5]) === 0);
check('countDays no weekend config defaults Fri', L.countDays('2026-10-23', '2026-10-23') === 0);
check('countDays leap Feb 2028 (Sat-Sun) = 2', L.countDays('2028-02-28', '2028-02-29', [5]) === 2);
check('countDays year boundary Dec30-Jan2 Fri weekend = 3', L.countDays('2026-12-30', '2027-01-02', [5]) === 3);

/* --- Overlap --- */
check('overlaps touching', L.overlaps('2026-10-20', '2026-10-22', '2026-10-22', '2026-10-25') === true);
check('overlaps adjacent false', L.overlaps('2026-10-20', '2026-10-22', '2026-10-23', '2026-10-25') === false);
check('overlaps contained', L.overlaps('2026-10-20', '2026-10-30', '2026-10-22', '2026-10-25') === true);
check('overlaps disjoint', L.overlaps('2026-10-20', '2026-10-22', '2026-11-01', '2026-11-05') === false);

/* --- Balances --- */
const TYPES = JSON.parse(JSON.stringify(L.DEFAULT_TYPES));
const REQS = [
  { id: 'a', typeId: 'cl', start: '2026-10-20', end: '2026-10-22', reason: '', status: 'Approved' },
  { id: 'b', typeId: 'cl', start: '2026-11-02', end: '2026-11-03', reason: '', status: 'Pending' },
  { id: 'c', typeId: 'sl', start: '2026-10-19', end: '2026-10-19', reason: '', status: 'Taken' },
  { id: 'd', typeId: 'cl', start: '2026-10-20', end: '2026-10-21', reason: '', status: 'Rejected' },
  { id: 'e', typeId: 'el', start: '2025-12-29', end: '2025-12-31', reason: '', status: 'Approved' }
];
check('usedDays CL approved only = 3 (pending/rejected excluded)', L.usedDays(REQS, 'cl', 2026, [5]) === 3);
check('usedDays SL taken counts = 1', L.usedDays(REQS, 'sl', 2026, [5]) === 1);
check('usedDays EL 2025 request not in 2026 = 0', L.usedDays(REQS, 'el', 2026, [5]) === 0);
check('usedDays EL 2025 = 3', L.usedDays(REQS, 'el', 2025, [5]) === 3);
const BALS = L.balances(TYPES, REQS, 2026, [5]);
check('balances CL remaining 7', BALS[0].remaining === 7 && BALS[0].used === 3 && BALS[0].quota === 10);
check('balances SL remaining 13', BALS[1].remaining === 13);
check('balances EL remaining 20', BALS[2].remaining === 20);
check('remainingDays negative allowed', L.remainingDays(10, 12) === -2);

/* --- findOverlap --- */
check('findOverlap hits active', L.findOverlap(REQS, '2026-10-21', '2026-10-21', null).id === 'a');
check('findOverlap ignores rejected', L.findOverlap([{ id: 'x', typeId: 'cl', start: '2026-12-01', end: '2026-12-02', status: 'Rejected' }], '2026-12-01', '2026-12-01', null) === null);
check('findOverlap excludes self', L.findOverlap(REQS, '2026-10-20', '2026-10-22', 'a') === null);

/* --- Transitions --- */
check('Pending -> Approved allowed', L.canTransition('Pending', 'Approved') === true);
check('Pending -> Taken blocked', L.canTransition('Pending', 'Taken') === false);
check('Approved -> Taken allowed', L.canTransition('Approved', 'Taken') === true);
check('Approved -> Rejected blocked', L.canTransition('Approved', 'Rejected') === false);
check('Taken terminal', L.allowedTransitions('Taken').length === 0);
check('Cancelled terminal', L.allowedTransitions('Cancelled').length === 0);

/* --- Validation --- */
check('validateRequest ok', L.validateRequest({ typeId: 'cl', start: '2026-10-20', end: '2026-10-22', reason: 'trip', status: 'Pending' }, TYPES, [], [5]).length === 0);
check('validateRequest unknown type', L.validateRequest({ typeId: 'xx', start: '2026-10-20', end: '2026-10-22' }, TYPES, [], [5]).indexOf('unknown_type') !== -1);
check('validateRequest end before start', L.validateRequest({ typeId: 'cl', start: '2026-10-22', end: '2026-10-20' }, TYPES, [], [5]).indexOf('end_before_start') !== -1);
check('validateRequest all-weekend range', L.validateRequest({ typeId: 'cl', start: '2026-10-23', end: '2026-10-23' }, TYPES, [], [5]).indexOf('no_counted_days') !== -1);
check('validateRequest overlap', L.validateRequest({ typeId: 'sl', start: '2026-10-21', end: '2026-10-21' }, TYPES, REQS, [5]).indexOf('overlaps_existing') !== -1);
check('validateRequest long reason', L.validateRequest({ typeId: 'cl', start: '2026-10-20', end: '2026-10-20', reason: 'x'.repeat(201) }, TYPES, [], [5]).indexOf('invalid_reason') !== -1);
check('validateType ok', L.validateType({ id: 'ml', name: 'Maternity Leave', quota: 180, color: '#123456' }, TYPES).length === 0);
check('validateType bad quota', L.validateType({ id: 'ml', name: 'X', quota: 366 }, TYPES).indexOf('invalid_quota') !== -1);
check('validateType negative quota', L.validateType({ id: 'ml', name: 'X', quota: -1 }, TYPES).indexOf('invalid_quota') !== -1);
check('validateType duplicate id', L.validateType({ id: 'cl', name: 'Other', quota: 5 }, TYPES).indexOf('duplicate_id') !== -1);
check('validateType empty name', L.validateType({ id: 'ml', name: '   ', quota: 5 }, TYPES).indexOf('invalid_name') !== -1);
check('validateType bad color', L.validateType({ id: 'ml', name: 'X', quota: 5, color: 'red' }, TYPES).indexOf('invalid_color') !== -1);

/* --- Upcoming --- */
const UP = L.upcoming(REQS, '2026-10-18', 30);
check('upcoming only approved/taken in window', UP.length === 2 && UP[0].id === 'c' && UP[1].id === 'a');
check('upcoming excludes past', L.upcoming([{ id: 'p', typeId: 'cl', start: '2026-10-01', end: '2026-10-02', status: 'Approved' }], '2026-10-18', 30).length === 0);

/* --- Calendar grid --- */
const GRID = L.monthGrid(2026, 10, REQS);
check('monthGrid 42 cells', GRID.length === 42);
check('monthGrid first cell Sat 2026-09-26', GRID[0].date === '2026-09-26' && GRID[0].inMonth === false);
check('monthGrid Oct 20 has approved leave', GRID.find(function (c) { return c.date === '2026-10-20'; }).leaves.length === 1);
check('monthGrid Oct 21 excludes rejected only', GRID.find(function (c) { return c.date === '2026-10-21'; }).leaves.length === 1);
check('monthGrid Oct 25 no leave', GRID.find(function (c) { return c.date === '2026-10-25'; }).leaves.length === 0);
check('monthGrid Nov 2 pending not shown', GRID.find(function (c) { return c.date === '2026-11-02'; }).leaves.length === 0);

/* --- Import validation --- */
const GOOD = { app: 'leave-tracker-bd', version: 1, data: { types: TYPES, requests: REQS, weekendDays: [5], year: 2026, lang: 'en' } };
check('validateImport good', L.validateImport(GOOD).ok === true);
check('validateImport wrong app', L.validateImport(Object.assign({}, GOOD, { app: 'other' })).ok === false);
check('validateImport wrong version', L.validateImport(Object.assign({}, GOOD, { version: 2 })).ok === false);
check('validateImport missing data', L.validateImport({ app: 'leave-tracker-bd', version: 1 }).ok === false);
check('validateImport bad request status', L.validateImport({ app: 'leave-tracker-bd', version: 1, data: { types: TYPES, requests: [{ id: 'z', typeId: 'cl', start: '2026-10-20', end: '2026-10-20', status: 'Flying' }], weekendDays: [5] } }).ok === false);
check('validateImport bad weekend', L.validateImport({ app: 'leave-tracker-bd', version: 1, data: { types: TYPES, requests: [], weekendDays: [9] } }).ok === false);
check('validateImport unknown request type', L.validateImport({ app: 'leave-tracker-bd', version: 1, data: { types: TYPES, requests: [{ id: 'z', typeId: 'nope', start: '2026-10-20', end: '2026-10-20', status: 'Pending' }], weekendDays: [5] } }).ok === false);
check('validateImport dup type id', L.validateImport({ app: 'leave-tracker-bd', version: 1, data: { types: TYPES.concat([TYPES[0]]), requests: [], weekendDays: [5] } }).ok === false);
check('exportEnvelope shape', (function () { var e = L.exportEnvelope({ types: TYPES, requests: REQS, weekendDays: [5], year: 2026, lang: 'en' }); return e.app === 'leave-tracker-bd' && e.version === 1 && e.data.types.length === 3; })());

/* --- Bengali digits / dates --- */
check('toBnDigits', L.toBnDigits('2026-10-18') === '\u09e8\u09e6\u09e8\u09ec-\u09e7\u09e6-\u09e7\u09ee');
check('fmtNum bn', L.fmtNum(1500, 'bn') === '\u09e7\u09eb\u09e6\u09e6');
check('fmtNum en', L.fmtNum(1500, 'en') === '1500');
check('fmtDate en', L.fmtDate('2026-10-20', 'en') === '20 Oct 2026');
check('fmtDate bn digits', L.fmtDate('2026-10-20', 'bn') === '\u09e8\u09e6 \u0985\u0995\u09cd\u099f\u09cb \u09e8\u09e6\u09e8\u09ec');
check('fmtDate invalid passthrough', L.fmtDate('nope', 'en') === 'nope');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

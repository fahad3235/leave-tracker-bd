/* leave-tracker-bd - pure logic (no DOM). UMD: works in browser + node.
   Money-free app: all math is integer days. Dates are ISO 'YYYY-MM-DD'
   strings; parsing uses local noon to avoid DST/timezone day shifts. */
'use strict';

var WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

var DEFAULT_TYPES = [
  { id: 'cl', name: 'Casual Leave', nameBn: '\u09a8\u09c8\u09ae\u09bf\u09a4\u09cd\u09a4\u09bf\u0995 \u099b\u09c1\u099f\u09bf', quota: 10, color: '#2563eb' },
  { id: 'sl', name: 'Sick Leave', nameBn: '\u0985\u09b8\u09c1\u09b8\u09cd\u09a5\u09a4\u09be\u09b0 \u099b\u09c1\u099f\u09bf', quota: 14, color: '#dc2626' },
  { id: 'el', name: 'Earned Leave', nameBn: '\u0985\u09b0\u09cd\u099c\u09bf\u09a4 \u099b\u09c1\u099f\u09bf', quota: 20, color: '#059669' }
];

var STATUSES = ['Pending', 'Approved', 'Rejected', 'Taken', 'Cancelled'];

var TRANSITIONS = {
  Pending: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['Taken', 'Cancelled'],
  Rejected: [],
  Taken: [],
  Cancelled: []
};

function parseDate(iso) {
  if (typeof iso !== 'string') return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

function fmtISO(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function isValidISO(iso) { return parseDate(iso) !== null; }

function yearOf(iso) {
  var d = parseDate(iso);
  return d ? d.getFullYear() : null;
}

/* Counted leave days in [startISO, endISO], skipping weekend weekdays.
   weekendDays: array of JS weekday numbers (0=Sun..6=Sat). Default [5] (Friday). */
function countDays(startISO, endISO, weekendDays) {
  var start = parseDate(startISO);
  var end = parseDate(endISO);
  if (!start || !end || end < start) return 0;
  var weekends = new Set(Array.isArray(weekendDays) ? weekendDays : [5]);
  var n = 0;
  var cur = new Date(start.getTime());
  while (cur <= end) {
    if (!weekends.has(cur.getDay())) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

/* Days of leave consumed by a request: counted days, 0 when range invalid. */
function requestDays(req, weekendDays) {
  if (!req || !req.start || !req.end) return 0;
  return countDays(req.start, req.end, weekendDays);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  var aS = parseDate(aStart), aE = parseDate(aEnd), bS = parseDate(bStart), bE = parseDate(bEnd);
  if (!aS || !aE || !bS || !bE) return false;
  return aS <= bE && bS <= aE;
}

var ACTIVE_STATUSES = ['Pending', 'Approved', 'Taken'];

/* Find an active request overlapping [startISO, endISO], excluding excludeId. */
function findOverlap(requests, startISO, endISO, excludeId) {
  for (var i = 0; i < requests.length; i++) {
    var r = requests[i];
    if (r.id === excludeId) continue;
    if (ACTIVE_STATUSES.indexOf(r.status) === -1) continue;
    if (overlaps(r.start, r.end, startISO, endISO)) return r;
  }
  return null;
}

/* Days consumed by a type in a year: Approved + Taken requests only. */
function usedDays(requests, typeId, year, weekendDays) {
  var total = 0;
  for (var i = 0; i < requests.length; i++) {
    var r = requests[i];
    if (r.typeId !== typeId) continue;
    if (yearOf(r.start) !== year) continue;
    if (r.status !== 'Approved' && r.status !== 'Taken') continue;
    total += requestDays(r, weekendDays);
  }
  return total;
}

function remainingDays(quota, used) { return quota - used; }

/* Per-type balance summary for a year. */
function balances(types, requests, year, weekendDays) {
  return types.map(function (t) {
    var used = usedDays(requests, t.id, year, weekendDays);
    return { typeId: t.id, quota: t.quota, used: used, remaining: t.quota - used };
  });
}

function allowedTransitions(status) {
  return TRANSITIONS[status] ? TRANSITIONS[status].slice() : [];
}

function canTransition(from, to) {
  return allowedTransitions(from).indexOf(to) !== -1;
}

/* --- Validation --- */

function validateType(type, existingTypes) {
  var errors = [];
  if (!type || typeof type !== 'object') return ['invalid_type'];
  if (!type.id || typeof type.id !== 'string' || !/^[a-z0-9-]{1,24}$/.test(type.id)) errors.push('invalid_id');
  if (!type.name || typeof type.name !== 'string' || type.name.trim().length === 0 || type.name.length > 40) errors.push('invalid_name');
  if (type.nameBn !== undefined && (typeof type.nameBn !== 'string' || type.nameBn.length > 40)) errors.push('invalid_name_bn');
  if (!Number.isInteger(type.quota) || type.quota < 0 || type.quota > 365) errors.push('invalid_quota');
  if (type.color !== undefined && (typeof type.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(type.color))) errors.push('invalid_color');
  if (existingTypes && existingTypes.some(function (t) { return t.id === type.id; })) errors.push('duplicate_id');
  return errors;
}

function validateRequest(req, types, requests, weekendDays) {
  var errors = [];
  if (!req || typeof req !== 'object') return ['invalid_request'];
  var type = types.find(function (t) { return t.id === req.typeId; });
  if (!type) errors.push('unknown_type');
  if (!isValidISO(req.start)) errors.push('invalid_start');
  if (!isValidISO(req.end)) errors.push('invalid_end');
  if (isValidISO(req.start) && isValidISO(req.end)) {
    if (parseDate(req.end) < parseDate(req.start)) errors.push('end_before_start');
    else {
      var days = countDays(req.start, req.end, weekendDays);
      if (days < 1) errors.push('no_counted_days');
      if (type && days > 365) errors.push('range_too_long');
    }
    if (requests && findOverlap(requests, req.start, req.end, req.id)) errors.push('overlaps_existing');
  }
  if (req.reason !== undefined && (typeof req.reason !== 'string' || req.reason.length > 200)) errors.push('invalid_reason');
  if (req.status !== undefined && STATUSES.indexOf(req.status) === -1) errors.push('invalid_status');
  return errors;
}

/* Upcoming approved/taken requests starting within `withinDays` of `fromISO`. */
function upcoming(requests, fromISO, withinDays) {
  var from = parseDate(fromISO);
  if (!from) return [];
  var to = new Date(from.getTime());
  to.setDate(to.getDate() + (withinDays || 30));
  return requests
    .filter(function (r) {
      if (r.status !== 'Approved' && r.status !== 'Taken') return false;
      var s = parseDate(r.start);
      return s && s >= from && s <= to;
    })
    .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
}

/* Calendar cells for a month: { date: ISO, day, inMonth, leaves: [request...] }.
   Leaves shown: Approved + Taken requests covering the cell date. */
function monthGrid(year, month, requests) {
  var first = new Date(year, month - 1, 1, 12, 0, 0, 0);
  // Week starts Saturday (Bangladesh convention).
  var lead = (first.getDay() + 1) % 7;
  var cells = [];
  var cursor = new Date(first.getTime());
  cursor.setDate(cursor.getDate() - lead);
  for (var i = 0; i < 42; i++) {
    var iso = fmtISO(cursor);
    var leaves = requests.filter(function (r) {
      if (r.status !== 'Approved' && r.status !== 'Taken') return false;
      return iso >= r.start && iso <= r.end;
    });
    cells.push({ date: iso, day: cursor.getDate(), inMonth: cursor.getMonth() === month - 1, leaves: leaves });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

/* --- Import / export --- */

function exportEnvelope(state) {
  return {
    app: 'leave-tracker-bd',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      types: state.types,
      requests: state.requests,
      weekendDays: state.weekendDays,
      year: state.year,
      lang: state.lang
    }
  };
}

function validateImport(obj) {
  var errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not_an_object'] };
  if (obj.app !== 'leave-tracker-bd') errors.push('wrong_app');
  if (obj.version !== 1) errors.push('unsupported_version');
  if (!obj.data || typeof obj.data !== 'object') errors.push('missing_data');
  if (errors.length) return { ok: false, errors: errors };
  var data = obj.data;
  if (!Array.isArray(data.types) || data.types.length === 0 || data.types.length > 20) errors.push('invalid_types');
  else {
    var seen = new Set();
    for (var i = 0; i < data.types.length; i++) {
      var t = data.types[i];
      if (validateType(t, []).length) { errors.push('invalid_type_' + i); break; }
      if (seen.has(t.id)) { errors.push('duplicate_type_id'); break; }
      seen.add(t.id);
    }
  }
  if (!Array.isArray(data.requests) || data.requests.length > 2000) errors.push('invalid_requests');
  else {
    for (var j = 0; j < data.requests.length; j++) {
      var r = data.requests[j];
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) { errors.push('invalid_request_' + j); break; }
      if (typeof r.typeId !== 'string' || !data.types.some(function (t) { return t.id === r.typeId; })) { errors.push('invalid_request_type_' + j); break; }
      if (!isValidISO(r.start) || !isValidISO(r.end) || parseDate(r.end) < parseDate(r.start)) { errors.push('invalid_request_dates_' + j); break; }
      if (STATUSES.indexOf(r.status) === -1) { errors.push('invalid_request_status_' + j); break; }
      if (r.reason !== undefined && (typeof r.reason !== 'string' || r.reason.length > 200)) { errors.push('invalid_request_reason_' + j); break; }
    }
  }
  if (!Array.isArray(data.weekendDays) || data.weekendDays.length > 7 ||
      data.weekendDays.some(function (d) { return !Number.isInteger(d) || d < 0 || d > 6; })) errors.push('invalid_weekend_days');
  if (data.year !== undefined && (!Number.isInteger(data.year) || data.year < 2000 || data.year > 2100)) errors.push('invalid_year');
  if (data.lang !== undefined && data.lang !== 'en' && data.lang !== 'bn') errors.push('invalid_lang');
  if (errors.length) return { ok: false, errors: errors };
  return { ok: true, errors: [], data: data };
}

/* --- Number formatting --- */

var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];

function toBnDigits(str) {
  return String(str).replace(/[0-9]/g, function (d) { return BN_DIGITS[Number(d)]; });
}

function fmtNum(n, lang) {
  var s = String(n);
  return lang === 'bn' ? toBnDigits(s) : s;
}

/* "2026-10-20" -> "20 Oct 2026" (en) or Bengali-digit form (bn). */
function fmtDate(iso, lang) {
  var d = parseDate(iso);
  if (!d) return iso;
  var monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var monthsBn = ['\u099c\u09be\u09a8\u09c1', '\u09ab\u09c7\u09ac\u09cd\u09b0\u09c1', '\u09ae\u09be\u09b0\u09cd\u099a', '\u098f\u09aa\u09cd\u09b0\u09bf\u09b2', '\u09ae\u09c7', '\u099c\u09c1\u09a8', '\u099c\u09c1\u09b2\u09be\u0987', '\u0986\u0997\u09b8\u09cd\u099f', '\u09b8\u09c7\u09aa\u09cd\u099f\u09c7', '\u0985\u0995\u09cd\u099f\u09cb', '\u09a8\u09ad\u09c7', '\u09a1\u09bf\u09b8\u09c7'];
  var out = lang === 'bn'
    ? toBnDigits(d.getDate()) + ' ' + monthsBn[d.getMonth()] + ' ' + toBnDigits(d.getFullYear())
    : d.getDate() + ' ' + monthsEn[d.getMonth()] + ' ' + d.getFullYear();
  return out;
}

var api = {
  WEEKDAY_NAMES: WEEKDAY_NAMES,
  DEFAULT_TYPES: DEFAULT_TYPES,
  STATUSES: STATUSES,
  TRANSITIONS: TRANSITIONS,
  parseDate: parseDate, fmtISO: fmtISO, isValidISO: isValidISO, yearOf: yearOf,
  countDays: countDays, requestDays: requestDays, overlaps: overlaps,
  findOverlap: findOverlap, usedDays: usedDays, remainingDays: remainingDays,
  balances: balances, allowedTransitions: allowedTransitions, canTransition: canTransition,
  validateType: validateType, validateRequest: validateRequest,
  upcoming: upcoming, monthGrid: monthGrid,
  exportEnvelope: exportEnvelope, validateImport: validateImport,
  toBnDigits: toBnDigits, fmtNum: fmtNum, fmtDate: fmtDate
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.LeaveLogic = api;

/* leave-tracker-bd - UI glue. All math lives in js/logic.js. */
'use strict';

(function () {
  var L = window.LeaveLogic;
  var I18N = window.LeaveI18N;
  var KEY = 'leave-tracker-bd-v1';

  function todayISO() {
    var m = /[?&]asof=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    if (m && L.isValidISO(m[1])) return m[1];
    return L.fmtISO(new Date());
  }
  var TODAY = todayISO();
  var TODAY_YEAR = L.yearOf(TODAY);

  function defaultState() {
    return {
      version: 1,
      lang: 'en',
      year: TODAY_YEAR,
      weekendDays: [5],
      types: JSON.parse(JSON.stringify(L.DEFAULT_TYPES)),
      requests: []
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object' || !Array.isArray(s.types) || !Array.isArray(s.requests)) return defaultState();
      s.lang = s.lang === 'bn' ? 'bn' : 'en';
      if (!Number.isInteger(s.year)) s.year = TODAY_YEAR;
      if (!Array.isArray(s.weekendDays)) s.weekendDays = [5];
      return s;
    } catch (e) { return defaultState(); }
  }

  var state = loadState();
  var calYear = TODAY_YEAR;
  var calMonth = Number(TODAY.slice(5, 7));
  var editingReqId = null;
  var statusFilter = 'all';
  var searchText = '';

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function $ (id) { return document.getElementById(id); }
  function typeById(id) { return state.types.find(function (x) { return x.id === id; }) || null; }
  function typeName(ty) { return state.lang === 'bn' && ty.nameBn ? ty.nameBn : ty.name; }
  function fmtN(n) { return L.fmtNum(n, state.lang); }
  function fmtD(iso) { return L.fmtDate(iso, state.lang); }

  function showNotice(msg) {
    var el = $('notice');
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = msg; el.hidden = false;
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    $('langBtn').textContent = t('langBtn');
  }

  function renderYearSelect() {
    var sel = $('yearSelect');
    var years = [];
    for (var y = TODAY_YEAR - 2; y <= TODAY_YEAR + 2; y++) years.push(y);
    sel.innerHTML = years.map(function (y) {
      return '<option value="' + y + '"' + (y === state.year ? ' selected' : '') + '>' + L.fmtNum(y, state.lang) + '</option>';
    }).join('');
  }

  function renderDashboard() {
    var bals = L.balances(state.types, state.requests, state.year, state.weekendDays);
    $('balanceCards').innerHTML = bals.map(function (b, i) {
      var ty = state.types[i];
      var pct = ty.quota > 0 ? Math.min(100, Math.round(b.used / ty.quota * 100)) : (b.used > 0 ? 100 : 0);
      var over = b.remaining < 0;
      return '<article class="card" style="border-top-color:' + esc(ty.color) + '">' +
        '<h3>' + esc(typeName(ty)) + '</h3>' +
        '<div class="big">' + fmtN(b.remaining) + ' <span class="meta">' + t('remaining') + '</span></div>' +
        '<div class="meta">' + t('used') + ': ' + fmtN(b.used) + ' / ' + t('quota') + ': ' + fmtN(ty.quota) + ' ' + t('days') + '</div>' +
        '<div class="progress' + (over ? ' over' : '') + '"><div style="width:' + pct + '%"></div></div>' +
        '</article>';
    }).join('');
    var totalUsed = bals.reduce(function (a, b) { return a + b.used; }, 0);
    var totalRemaining = bals.reduce(function (a, b) { return a + b.remaining; }, 0);
    $('totalUsed').textContent = fmtN(totalUsed);
    $('totalRemaining').textContent = fmtN(totalRemaining);
    $('pendingCount').textContent = fmtN(state.requests.filter(function (r) { return r.status === 'Pending' && L.yearOf(r.start) === state.year; }).length);
    var up = L.upcoming(state.requests, TODAY, 30).filter(function (r) { return L.yearOf(r.start) === state.year; });
    $('upcomingList').innerHTML = up.length ? up.map(function (r) {
      var ty = typeById(r.typeId);
      return '<li><span class="dot" style="background:' + esc(ty ? ty.color : '#888') + '"></span>' +
        '<strong>' + esc(ty ? typeName(ty) : r.typeId) + '</strong> ' +
        fmtD(r.start) + ' \u2013 ' + fmtD(r.end) + ' (' + fmtN(L.requestDays(r, state.weekendDays)) + ' ' + t('days') + ')' +
        (r.reason ? ' \u2014 ' + esc(r.reason) : '') + '</li>';
    }).join('') : '<li>' + esc(t('upcomingEmpty')) + '</li>';
  }

  function renderRequestForm() {
    var sel = $('reqType');
    sel.innerHTML = state.types.map(function (ty) {
      return '<option value="' + esc(ty.id) + '">' + esc(typeName(ty)) + '</option>';
    }).join('');
    updateCounted();
  }

  function currentFormValues() {
    return {
      id: editingReqId || ('r' + Date.now() + Math.floor(Math.random() * 1000)),
      typeId: $('reqType').value,
      start: $('reqStart').value,
      end: $('reqEnd').value,
      reason: $('reqReason').value.trim(),
      status: 'Pending'
    };
  }

  function updateCounted() {
    var start = $('reqStart').value, end = $('reqEnd').value;
    var out = $('countedDays');
    if (L.isValidISO(start) && L.isValidISO(end) && L.parseDate(end) >= L.parseDate(start)) {
      out.textContent = fmtN(L.countDays(start, end, state.weekendDays));
    } else out.textContent = '\u2013';
    updateExceedWarning();
  }

  function updateExceedWarning() {
    var w = $('reqWarning');
    var start = $('reqStart').value, end = $('reqEnd').value, typeId = $('reqType').value;
    var ty = typeById(typeId);
    if (!ty || !L.isValidISO(start) || !L.isValidISO(end)) { w.hidden = true; return; }
    var days = L.countDays(start, end, state.weekendDays);
    var used = L.usedDays(state.requests, typeId, L.yearOf(start), state.weekendDays);
    // Exclude the request being edited from its own used total.
    if (editingReqId) {
      var old = state.requests.find(function (r) { return r.id === editingReqId; });
      if (old && (old.status === 'Approved' || old.status === 'Taken') && old.typeId === typeId && L.yearOf(old.start) === L.yearOf(start)) {
        used -= L.requestDays(old, state.weekendDays);
      }
    }
    var over = days - (ty.quota - used);
    if (over > 0) {
      w.textContent = t('exceedsRemaining').replace('{n}', fmtN(over));
      w.hidden = false;
    } else w.hidden = true;
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + esc(status) + '">' + esc(t('status' + status)) + '</span>';
  }

  function renderRequests() {
    var list = state.requests.slice().sort(function (a, b) {
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      return a.typeId < b.typeId ? -1 : 1;
    });
    var q = searchText.trim().toLowerCase();
    if (statusFilter !== 'all') list = list.filter(function (r) { return r.status === statusFilter; });
    if (q) list = list.filter(function (r) { return (r.reason || '').toLowerCase().indexOf(q) !== -1; });
    $('noRequests').hidden = list.length > 0;
    $('requestList').innerHTML = list.map(function (r) {
      var ty = typeById(r.typeId);
      var days = L.requestDays(r, state.weekendDays);
      var btns = L.allowedTransitions(r.status).map(function (to) {
        var label = to === 'Approved' ? t('approve') : to === 'Rejected' ? t('reject') : to === 'Taken' ? t('markTaken') : t('cancelRequest');
        return '<button type="button" class="btn btn-sm" data-act="' + esc(to) + '" data-id="' + esc(r.id) + '">' + esc(label) + '</button>';
      }).join('');
      btns += '<button type="button" class="btn btn-sm" data-act="Edit" data-id="' + esc(r.id) + '">' + esc(t('editBtn')) + '</button>';
      btns += '<button type="button" class="btn btn-sm" data-act="Delete" data-id="' + esc(r.id) + '">' + esc(t('deleteBtn')) + '</button>';
      return '<article class="req" style="border-left-color:' + esc(ty ? ty.color : '#888') + '">' +
        '<div class="req-head"><span class="req-title">' + esc(ty ? typeName(ty) : r.typeId) + '</span>' + statusBadge(r.status) + '</div>' +
        '<div class="req-meta">' + fmtD(r.start) + ' \u2013 ' + fmtD(r.end) + ' \u00b7 ' + fmtN(days) + ' ' + t('days') + '</div>' +
        (r.reason ? '<p class="req-reason">' + esc(r.reason) + '</p>' : '') +
        '<div class="req-actions">' + btns + '</div></article>';
    }).join('');
  }

  function renderTypes() {
    $('typeList').innerHTML = state.types.map(function (ty) {
      var inUse = state.requests.some(function (r) { return r.typeId === ty.id; });
      return '<div class="type-row">' +
        '<span class="dot" style="background:' + esc(ty.color) + '"></span>' +
        '<div class="grow"><strong>' + esc(ty.name) + '</strong>' + (ty.nameBn ? '<br><span class="meta">' + esc(ty.nameBn) + '</span>' : '') + '</div>' +
        '<label>' + esc(t('typeQuota')) + ' <input type="number" min="0" max="365" step="1" data-quota-for="' + esc(ty.id) + '" value="' + ty.quota + '"></label>' +
        '<button type="button" class="btn btn-sm" data-save-quota="' + esc(ty.id) + '">' + esc(t('saveType')) + '</button>' +
        '<button type="button" class="btn btn-sm" data-del-type="' + esc(ty.id) + '"' + (inUse || state.types.length <= 1 ? ' disabled' : '') + '>' + esc(t('deleteType')) + '</button>' +
        '</div>';
    }).join('');
    $('wk5').checked = state.weekendDays.indexOf(5) !== -1;
    $('wk6').checked = state.weekendDays.indexOf(6) !== -1;
    $('wk0').checked = state.weekendDays.indexOf(0) !== -1;
  }

  function renderCalendar() {
    var dict = I18N[state.lang];
    var title = dict.monthNames[calMonth - 1] + ' ' + (state.lang === 'bn' ? L.toBnDigits(calYear) : calYear);
    $('calTitle').textContent = title;
    var heads = dict.weekdayShort;
    // Week starts Saturday: order Sa Su Mo Tu We Th Fr.
    var order = [6, 0, 1, 2, 3, 4, 5];
    var cells = L.monthGrid(calYear, calMonth, state.requests);
    var html = order.map(function (d) { return '<div class="cal-head">' + esc(heads[d]) + '</div>'; }).join('');
    html += cells.map(function (c) {
      var cls = 'cal-cell' + (c.inMonth ? '' : ' out') + (c.date === TODAY ? ' today' : '');
      var dots = c.leaves.map(function (r) {
        var ty = typeById(r.typeId);
        return '<span class="dot" style="background:' + esc(ty ? ty.color : '#888') + '" title="' + esc(ty ? typeName(ty) : r.typeId) + '"></span>';
      }).join('');
      return '<div class="' + cls + '" data-date="' + esc(c.date) + '">' + fmtN(c.day) + '<div class="cal-dots">' + dots + '</div></div>';
    }).join('');
    $('calendarGrid').innerHTML = html;
  }

  function renderAll() {
    applyLang();
    renderYearSelect();
    renderDashboard();
    renderRequestForm();
    renderRequests();
    renderTypes();
    renderCalendar();
  }

  /* --- Events --- */

  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      $('panel-' + btn.getAttribute('data-tab')).classList.add('active');
    });
  });

  $('langBtn').addEventListener('click', function () {
    state.lang = state.lang === 'en' ? 'bn' : 'en';
    save(); renderAll();
  });

  $('yearSelect').addEventListener('change', function () {
    state.year = Number($('yearSelect').value);
    save(); renderAll();
  });

  ['reqStart', 'reqEnd', 'reqType'].forEach(function (id) {
    $(id).addEventListener('change', updateCounted);
    $(id).addEventListener('input', updateCounted);
  });

  $('requestForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('reqError');
    var base = currentFormValues();
    var req;
    if (editingReqId) {
      var old = state.requests.find(function (r) { return r.id === editingReqId; });
      req = { id: old.id, typeId: base.typeId, start: base.start, end: base.end, reason: base.reason, status: old.status, createdAt: old.createdAt };
    } else req = Object.assign(base, { createdAt: new Date().toISOString() });
    var codes = L.validateRequest(req, state.types, state.requests, state.weekendDays);
    var msgMap = {
      unknown_type: 'errUnknownType', invalid_start: 'errInvalidStart', invalid_end: 'errInvalidEnd',
      end_before_start: 'errEndBeforeStart', no_counted_days: 'errNoCountedDays',
      range_too_long: 'errRangeTooLong', overlaps_existing: 'errOverlaps', invalid_reason: 'errInvalidReason'
    };
    if (codes.length) {
      err.textContent = t(msgMap[codes[0]] || 'errInvalidStart');
      err.hidden = false;
      return;
    }
    err.hidden = true;
    if (editingReqId) {
      var idx = state.requests.findIndex(function (r) { return r.id === editingReqId; });
      state.requests[idx] = req;
      showNotice(t('requestUpdated'));
    } else {
      state.requests.push(req);
      showNotice(t('requestSaved'));
    }
    editingReqId = null;
    $('reqId').value = '';
    $('requestForm').reset();
    $('reqCancelEdit').hidden = true;
    save(); renderAll();
  });

  $('reqCancelEdit').addEventListener('click', function () {
    editingReqId = null;
    $('requestForm').reset();
    $('reqCancelEdit').hidden = true;
    $('reqError').hidden = true;
    renderAll();
  });

  $('requestList').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');
    var req = state.requests.find(function (r) { return r.id === id; });
    if (!req) return;
    if (act === 'Delete') {
      if (window.confirm(t('confirmDelete'))) {
        state.requests = state.requests.filter(function (r) { return r.id !== id; });
        save(); renderAll(); showNotice(t('saved'));
      }
      return;
    }
    if (act === 'Edit') {
      editingReqId = id;
      $('reqType').value = req.typeId;
      $('reqStart').value = req.start;
      $('reqEnd').value = req.end;
      $('reqReason').value = req.reason || '';
      $('reqCancelEdit').hidden = false;
      document.querySelector('[data-tab="requests"]').click();
      $('requestForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
      updateCounted();
      return;
    }
    if (L.canTransition(req.status, act)) {
      req.status = act;
      save(); renderAll(); showNotice(t('saved'));
    }
  });

  $('statusFilter').addEventListener('change', function () {
    statusFilter = $('statusFilter').value;
    renderRequests();
  });
  $('searchInput').addEventListener('input', function () {
    searchText = $('searchInput').value;
    renderRequests();
  });

  $('typeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('typeError');
    var name = $('typeName').value.trim();
    var nameBn = $('typeNameBn').value.trim();
    var quota = Number($('typeQuota').value);
    var color = $('typeColor').value;
    var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'type-' + Date.now();
    var ty = { id: id, name: name, nameBn: nameBn, quota: quota, color: color };
    var codes = L.validateType(ty, state.types);
    if (codes.length) {
      var map = { invalid_name: 'errInvalidName', invalid_quota: 'errInvalidQuota', duplicate_id: 'errDuplicateId', invalid_id: 'errInvalidName', invalid_color: 'errInvalidName' };
      err.textContent = t(map[codes[0]] || 'errInvalidName');
      err.hidden = false;
      return;
    }
    err.hidden = true;
    state.types.push(ty);
    $('typeForm').reset();
    $('typeColor').value = '#7c3aed';
    save(); renderAll(); showNotice(t('saved'));
  });

  $('typeList').addEventListener('click', function (e) {
    var saveBtn = e.target.closest('button[data-save-quota]');
    var delBtn = e.target.closest('button[data-del-type]');
    if (saveBtn) {
      var id = saveBtn.getAttribute('data-save-quota');
      var input = document.querySelector('input[data-quota-for="' + id + '"]');
      var q = Number(input.value);
      if (!Number.isInteger(q) || q < 0 || q > 365) { alert(t('errInvalidQuota')); return; }
      var ty = typeById(id);
      if (ty) { ty.quota = q; save(); renderAll(); showNotice(t('saved')); }
      return;
    }
    if (delBtn) {
      var delId = delBtn.getAttribute('data-del-type');
      if (state.requests.some(function (r) { return r.typeId === delId; })) { alert(t('typeInUse')); return; }
      if (window.confirm(t('confirmDeleteType'))) {
        state.types = state.types.filter(function (x) { return x.id !== delId; });
        save(); renderAll(); showNotice(t('saved'));
      }
    }
  });

  ['wk5', 'wk6', 'wk0'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      var days = [];
      if ($('wk5').checked) days.push(5);
      if ($('wk6').checked) days.push(6);
      if ($('wk0').checked) days.push(0);
      state.weekendDays = days;
      save(); renderAll();
    });
  });

  $('calPrev').addEventListener('click', function () {
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    renderCalendar();
  });
  $('calNext').addEventListener('click', function () {
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    renderCalendar();
  });

  $('exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(L.exportEnvelope(state), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leave-tracker-bd-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  $('importFile').addEventListener('change', function () {
    var file = $('importFile').files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var msg = $('importMsg');
      try {
        var parsed = JSON.parse(reader.result);
        var v = L.validateImport(parsed);
        if (!v.ok) { msg.textContent = t('importFailed') + v.errors.join(', '); msg.hidden = false; return; }
        state.types = v.data.types;
        state.requests = v.data.requests;
        state.weekendDays = v.data.weekendDays;
        if (v.data.year !== undefined) state.year = v.data.year;
        if (v.data.lang) state.lang = v.data.lang;
        editingReqId = null;
        save(); renderAll();
        msg.textContent = t('importSuccess');
        msg.hidden = false;
      } catch (err) {
        msg.textContent = t('importFailed') + 'invalid_json';
        msg.hidden = false;
      }
    };
    reader.readAsText(file);
    $('importFile').value = '';
  });

  $('eraseBtn').addEventListener('click', function () {
    var msg = $('eraseMsg');
    if ($('eraseInput').value.trim() !== 'DELETE') {
      msg.textContent = t('eraseWrong');
      msg.hidden = false;
      return;
    }
    msg.hidden = true;
    state = defaultState();
    save(); renderAll();
    showNotice(t('erased'));
  });

  // Test hook (smoke tests only).
  window.LeaveApp = { getState: function () { return state; }, getToday: function () { return TODAY; } };

  renderAll();
})();

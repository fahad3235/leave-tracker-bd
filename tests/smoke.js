/* leave-tracker-bd - headless-Chrome smoke test via raw CDP.
   Run: node tests/smoke.js [desktop|mobile]
   Uses /opt/meta-chromium/chrome + Node global WebSocket. No deps. */
'use strict';
const { spawn, execSync } = require('child_process');
const path = require('path');

const MODE = process.argv[2] || 'desktop';
const WIDTH = MODE === 'mobile' ? 390 : 1280;
const PORT = MODE === 'mobile' ? 9238 : 9237;
const DIR = path.resolve(__dirname, '..');
const URL = 'file://' + DIR + '/index.html?asof=2026-10-18';

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.events = []; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) {
        const { resolve, reject } = this.pending.get(d.id);
        this.pending.delete(d.id);
        d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result);
      } else this.events.push(d);
    };
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async evalExpr(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

(async () => {
  const userDir = '/tmp/lt-chrome-' + MODE;
  execSync('rm -rf ' + userDir);
  const chrome = spawn('/opt/meta-chromium/chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-proxy-server',
    '--window-size=' + WIDTH + ',900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir, 'about:blank'
  ], { stdio: 'ignore' });
  let cdp = null;
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
      await sleep(200);
      try {
        const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
        const list = await res.json();
        targets = list.filter(t => t.type === 'page');
      } catch (e) { /* not up yet */ }
    }
    if (!targets || !targets.length) throw new Error('no page target');
    cdp = new CDP(targets[0].webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: MODE === 'mobile' });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.confirm = () => true;' });
    await cdp.send('Page.navigate', { url: URL });
    await sleep(1500);

    const errors = cdp.events.filter(e =>
      (e.method === 'Log.entryAdded' && e.params && e.params.entry && e.params.entry.level === 'error') ||
      e.method === 'Runtime.exceptionThrown');
    check('0 console/page errors', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    const httpReqs = cdp.events.filter(e => e.method === 'Network.requestWillBeSent' && e.params && /^https?:/.test(e.params.request.url));
    check('zero http(s) network requests', httpReqs.length === 0, JSON.stringify(httpReqs.slice(0, 1)));

    // 1. Initial render: 3 default types, quotas 10/14/20, empty requests
    let v = await cdp.evalExpr(`({h1: document.querySelector('h1').textContent, cards: document.querySelectorAll('#balanceCards .card').length, cardText: document.getElementById('balanceCards').textContent, noReq: document.getElementById('noRequests').hidden, tabs: document.querySelectorAll('.tab').length})`);
    check('title renders', v.h1 === 'Leave Tracker BD', v.h1);
    check('3 balance cards', v.cards === 3, String(v.cards));
    check('quotas 10/14/20 shown', /10/.test(v.cardText) && /14/.test(v.cardText) && /20/.test(v.cardText), v.cardText.slice(0, 120));
    check('empty requests state visible', v.noReq === false, String(v.noReq));
    check('5 tabs', v.tabs === 5, String(v.tabs));

    async function addRequest(type, start, end, reason) {
      return cdp.evalExpr(`(function(){
        document.getElementById('reqType').value = ${JSON.stringify(type)};
        document.getElementById('reqStart').value = ${JSON.stringify(start)};
        document.getElementById('reqEnd').value = ${JSON.stringify(end)};
        document.getElementById('reqReason').value = ${JSON.stringify(reason)};
        document.getElementById('reqStart').dispatchEvent(new Event('change', {bubbles:true}));
        document.getElementById('requestForm').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
        return document.querySelectorAll('#requestList .req').length;
      })()`);
    }

    // 2. Counted days preview: Tue-Thu = 3
    await cdp.evalExpr(`(function(){
      document.getElementById('reqStart').value = '2026-10-20';
      document.getElementById('reqEnd').value = '2026-10-22';
      document.getElementById('reqStart').dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    v = await cdp.evalExpr(`document.getElementById('countedDays').textContent`);
    check('counted preview Tue-Thu = 3', v === '3', v);

    // 3. Add CL request 2026-10-20..22, reason "Family trip"
    let n = await addRequest('cl', '2026-10-20', '2026-10-22', 'Family trip');
    check('add CL request -> 1 row', n === 1, String(n));
    v = await cdp.evalExpr(`document.querySelector('#requestList .req').textContent`);
    check('request shows Pending + reason', v.indexOf('Pending') >= 0 && v.indexOf('Family trip') >= 0, v.slice(0, 120));

    // 4. Overlap rejected inline
    n = await addRequest('sl', '2026-10-21', '2026-10-22', 'Overlap attempt');
    v = await cdp.evalExpr(`({err: document.getElementById('reqError').textContent, rows: document.querySelectorAll('#requestList .req').length})`);
    check('overlap inline error', v.err.length > 0, v.err);
    check('no row added on overlap', v.rows === 1, String(v.rows));

    // 5. Approve CL -> remaining 7, used 3
    await cdp.evalExpr(`document.querySelector('#requestList .req [data-act="Approved"]').click()`);
    await sleep(200);
    v = await cdp.evalExpr(`({card: document.getElementById('balanceCards').textContent, badge: document.querySelector('#requestList .req .badge').textContent})`);
    check('approve -> CL remaining 7 / used 3', /7/.test(v.card) && /3/.test(v.card), v.card.slice(0, 140));
    check('badge Approved', v.badge === 'Approved', v.badge);

    // 6. Weekend: Fri 2026-10-23 -> Sat 2026-10-24 counts 1 day (Sat)
    await cdp.evalExpr(`(function(){
      document.getElementById('reqType').value = 'sl';
      document.getElementById('reqStart').value = '2026-10-23';
      document.getElementById('reqEnd').value = '2026-10-24';
      document.getElementById('reqStart').dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    v = await cdp.evalExpr(`document.getElementById('countedDays').textContent`);
    check('counted Fri-Sat (Fri weekend) = 1', v === '1', v);
    n = await addRequest('sl', '2026-10-23', '2026-10-24', 'Fever');
    check('add SL weekend request -> 2 rows', n === 2, String(n));
    await cdp.evalExpr(`(function(){ var btns = document.querySelectorAll('#requestList .req [data-act="Approved"]'); btns[btns.length-1].click(); })()`);
    await sleep(200);
    v = await cdp.evalExpr(`window.LeaveApp.getState().requests.filter(r => r.typeId === 'sl' && r.status === 'Approved').length`);
    check('SL approved', v === 1, String(v));

    // 7. Exceeds-remaining warning: CL 9 counted days vs 7 remaining
    await cdp.evalExpr(`(function(){
      document.getElementById('reqType').value = 'cl';
      document.getElementById('reqStart').value = '2026-11-01';
      document.getElementById('reqEnd').value = '2026-11-10';
      document.getElementById('reqStart').dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    v = await cdp.evalExpr(`({warn: document.getElementById('reqWarning').textContent, hidden: document.getElementById('reqWarning').hidden, counted: document.getElementById('countedDays').textContent})`);
    check('counted Nov 1-10 = 9', v.counted === '9', v.counted);
    check('exceeds-remaining warning shows 2', v.hidden === false && /2/.test(v.warn), v.warn);

    // 8. Calendar: Oct 2026 shows dot on 2026-10-20
    await cdp.evalExpr(`document.querySelector('[data-tab="calendar"]').click()`);
    await sleep(300);
    v = await cdp.evalExpr(`({title: document.getElementById('calTitle').textContent, dot: document.querySelector('[data-date="2026-10-20"] .cal-dots').innerHTML.length, nodot: document.querySelector('[data-date="2026-10-25"] .cal-dots').innerHTML.length, cells: document.querySelectorAll('.cal-cell').length})`);
    check('calendar title Oct 2026', v.title === 'October 2026', v.title);
    check('calendar dot on leave day', v.dot > 0, String(v.dot));
    check('calendar no dot on free day', v.nodot === 0, String(v.nodot));
    check('calendar 42 cells', v.cells === 42, String(v.cells));

    // 9. Types tab: add custom type "Maternity Leave" quota 180
    await cdp.evalExpr(`document.querySelector('[data-tab="types"]').click()`);
    await sleep(300);
    await cdp.evalExpr(`(function(){
      document.getElementById('typeName').value = 'Maternity Leave';
      document.getElementById('typeQuota').value = '180';
      document.getElementById('typeForm').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
    })()`);
    await sleep(200);
    v = await cdp.evalExpr(`({rows: document.querySelectorAll('#typeList .type-row').length, cards: document.querySelectorAll('#balanceCards .card').length})`);
    check('custom type added -> 4 type rows', v.rows === 4, String(v.rows));
    check('dashboard shows 4 cards', v.cards === 4, String(v.cards));

    // 10. BN toggle: Bengali title + Bengali digits, persists after reload
    await cdp.evalExpr(`document.getElementById('langBtn').click()`);
    await sleep(300);
    v = await cdp.evalExpr(`({h1: document.querySelector('h1').textContent, card: document.getElementById('balanceCards').textContent})`);
    check('BN title renders', /\u099b\u09c1\u099f\u09bf/.test(v.h1), v.h1);
    check('BN digits in cards', /[\u09e6-\u09ef]/.test(v.card), v.card.slice(0, 100));
    await cdp.evalExpr(`document.getElementById('langBtn').click()`);
    await sleep(300);
    v = await cdp.evalExpr(`document.querySelector('h1').textContent`);
    check('toggle back to English', v === 'Leave Tracker BD', v);

    // 11. Reload persistence: 2 requests + 4 types survive
    await cdp.send('Page.reload');
    await sleep(1500);
    v = await cdp.evalExpr(`({reqs: window.LeaveApp.getState().requests.length, types: window.LeaveApp.getState().types.length})`);
    check('reload persists 2 requests', v.reqs === 2, String(v.reqs));
    check('reload persists 4 types', v.types === 4, String(v.types));

    // 12. Export -> erase (DELETE) -> import round-trip
    const exported = await cdp.evalExpr(`JSON.stringify(window.LeaveLogic.exportEnvelope(window.LeaveApp.getState()))`);
    check('export envelope valid', exported.indexOf('leave-tracker-bd') >= 0 && exported.indexOf('Family trip') >= 0, exported.slice(0, 80));
    await cdp.evalExpr(`document.querySelector('[data-tab="data"]').click()`);
    await sleep(200);
    await cdp.evalExpr(`(function(){ document.getElementById('eraseInput').value = 'DELETE'; document.getElementById('eraseBtn').click(); })()`);
    await sleep(300);
    v = await cdp.evalExpr(`window.LeaveApp.getState().requests.length`);
    check('erase -> 0 requests', v === 0, String(v));
    const restored = await cdp.evalExpr(`(function(){
      var env = JSON.parse(${JSON.stringify(exported)});
      var res = window.LeaveLogic.validateImport(env);
      if (!res.ok) return 'bad:' + res.errors.join(',');
      localStorage.setItem('leave-tracker-bd-v1', JSON.stringify(env.data));
      location.reload();
      return 'ok';
    })()`);
    await sleep(1500);
    v = await cdp.evalExpr(`window.LeaveApp.getState().requests.length`);
    check('import round-trip restores 2', restored === 'ok' && v === 2, restored + '/' + v);

    // 13. Malformed import rejected with data intact
    const badRes = await cdp.evalExpr(`window.LeaveLogic.validateImport({app:'leave-tracker-bd',version:1,data:{types:[{id:'cl',name:'CL',quota:10}],requests:[{id:'z',typeId:'cl',start:'2026-10-20',end:'2026-10-19',status:'Pending'}],weekendDays:[5]}}).ok`);
    check('malformed import rejected', badRes === false);
    v = await cdp.evalExpr(`window.LeaveApp.getState().requests.length`);
    check('data intact after bad import', v === 2, String(v));

    // 14. No horizontal overflow
    v = await cdp.evalExpr(`({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})`);
    check('no horizontal overflow', v.sw <= v.cw + 1, v.sw + ' vs ' + v.cw);

    console.log('\n' + passed + ' passed, ' + failed + ' failed (' + MODE + ')');
    process.exitCode = failed ? 1 : 0;
  } catch (err) {
    console.error('SMOKE ERROR', err);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
  }
})();

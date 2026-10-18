# leave-tracker-bd — TEST RESULTS (run #85, 2026-10-18)

## Unit tests — 72/72 passed
Command: `node tests/unit.test.js`
- Date parsing: valid dates, rejects 2026-02-30 / garbage / month 13.
- Day counting (weekend-aware, default Friday): Tue–Thu = 3; Fri-only = 0; Fri–Sat Fri-only = 1; Fri–Sat Fri+Sat = 0; full week Fri-only = 6, Fri+Sat = 5; end<start = 0; leap Feb 2028 = 2; year boundary Dec 30 – Jan 2 = 3.
- Overlap: touching ranges overlap; adjacent ranges do not; contained overlaps; disjoint does not.
- Balances: CL approved-only used = 3 (pending + rejected excluded); SL taken counts = 1; 2025 request excluded from 2026; balances CL 3/10 → remaining 7, SL remaining 13, EL remaining 20; negative remaining allowed.
- findOverlap: hits active, ignores rejected, excludes self.
- Transitions: Pending→Approved ok; Pending→Taken blocked; Approved→Taken ok; Approved→Rejected blocked; Taken/Cancelled terminal.
- Validation: ok case; unknown type; end-before-start; all-weekend range; overlap; long reason; type ok / bad quota (366, −1) / duplicate id / empty name / bad color.
- Upcoming: only approved/taken in 30-day window, sorted; past excluded.
- Calendar grid: 42 cells; first cell Sat 2026-09-26; Oct 20 has 1 leave; Oct 21 shows approved only; Oct 25 empty; Nov 2 pending not shown.
- Import: good ok; wrong app / version / missing data / bad status / bad weekend / unknown request type / duplicate type id all rejected; export envelope shape ok.
- Formatting: toBnDigits('2026-10-18') = Bengali digits; fmtNum bn/en; fmtDate en '20 Oct 2026'; fmtDate bn Bengali digits + Bengali month; invalid date passthrough.

## Headless-Chrome smoke — 36/36 desktop + 36/36 mobile passed
Command: `node tests/smoke.js desktop` / `node tests/smoke.js mobile`
(Chrome /opt/meta-chromium/chrome, file:// + ?asof=2026-10-18, raw CDP, fresh profile)
- 0 console/page errors; zero http(s) network requests.
- Initial render: title, 3 balance cards, quotas 10/14/20, empty-requests state, 5 tabs.
- Counted preview Tue–Thu = 3; add CL 2026-10-20..22 'Family trip' → 1 row, Pending + reason shown.
- Overlap (SL 2026-10-21..22) → inline error, still 1 row.
- Approve CL → CL remaining 7 / used 3, badge Approved.
- Weekend: Fri 2026-10-23 → Sat 2026-10-24 counted = 1; SL add → 2 rows; SL approved.
- Exceeds-remaining: CL Nov 1–10 counted 9 vs remaining 7 → warning shows 2.
- Calendar: title 'October 2026', dot on 2026-10-20, no dot on 2026-10-25, 42 cells.
- Types: add 'Maternity Leave' quota 180 → 4 type rows, 4 dashboard cards.
- BN toggle: Bengali title + Bengali digits; toggle back to English.
- Reload persistence: 2 requests + 4 types survive.
- Export envelope valid; erase (DELETE) → 0 requests; import round-trip restores 2.
- Malformed import rejected; data intact.
- No horizontal overflow (desktop + 390px mobile).

## Repairs
0 app-logic bugs. 0 test-side fixes. First green run on both suites after the ASCII-escape build step (re-ran unit + desktop smoke after escaping: still 72/72 and 36/36).

## ASCII hygiene
All sources pure ASCII after build step (Bengali as \uXXXX escapes in JS, numeric entities in HTML). Verified: `grep -rP '[^\x00-\x7F]'` over *.js/*.html/*.css returns nothing.

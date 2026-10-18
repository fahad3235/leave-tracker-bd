# Leave Tracker BD

A free, fully offline, bilingual (English / Bangla) leave tracker for employees and students in Bangladesh. Track yearly leave balances across leave types, submit requests with weekend-aware day counting, move them through an approval workflow, and see everything on a calendar — no account, no server, no network calls.

Live demo: https://fahad3235.github.io/leave-tracker-bd/

## Problem

Most Bangladeshi offices still track leave in notebooks or spreadsheets: it is easy to lose count of how many Casual / Sick / Earned days you have left, to double-book overlapping leave, or to forget whether a request was ever approved. Leave Tracker BD digitizes that notebook with exact, transparent math.

## Features

1. **Leave types & yearly quotas** — Casual Leave (10), Sick Leave (14), Earned Leave (20) by default (the quotas many Bangladeshi offices use); add custom types, rename, recolour, edit quotas inline, delete unused types.
2. **Weekend-aware day counting** — counted days skip your weekend days (default: Friday only, the Bangladesh government weekend; optionally also Saturday / Sunday). A Friday-only request counts as 0 days and is rejected with a clear message.
3. **Request workflow** — Pending → Approved / Rejected / Cancelled; Approved → Taken / Cancelled. Only legal transitions are ever rendered as buttons. Overlapping active requests are rejected inline.
4. **Live balances** — per-type quota / used / remaining with progress bars, this-year totals, pending count, and an over-balance warning when a request exceeds the remaining quota (approval still possible — the warning is informational).
5. **Leave calendar** — month view (week starts Saturday, Bangladesh convention) with coloured dots for approved / taken leave; prev / next navigation; today highlighted.
6. **Data portability** — JSON export / strict import (wrong app, version, type, dates, or status rejected with data left intact), typed-DELETE erase-all, English / Bangla toggle persisted with Bengali digits, all data in `localStorage`.

## Stack

- Vanilla HTML / CSS / JavaScript — no frameworks, no build step, no dependencies.
- Pure static site: open `index.html` or serve the folder with any static server.
- Tests: Node unit tests (`tests/unit.test.js`) + headless-Chrome smoke tests via raw CDP (`tests/smoke.js`, Node global `WebSocket`, no deps).

## Prerequisites

- Any modern browser (Chrome / Edge / Firefox / Safari).
- For tests: Node.js 18+ and `/opt/meta-chromium/chrome` (or adjust the `chrome` path in `tests/smoke.js`).

## Install / run

```bash
# Just open it:
open index.html
# …or serve it:
npx serve .
# …or:
python3 -m http.server 8000
```

## Dev commands

```bash
node tests/unit.test.js        # 72 unit checks
node tests/smoke.js desktop    # 36 headless-Chrome checks (1280px)
node tests/smoke.js mobile     # 36 headless-Chrome checks (390px)
```

## Environment

No environment variables, no API keys, no backend. Everything is stored in the browser under the `localStorage` key `leave-tracker-bd-v1`.

## Testing

- `tests/unit.test.js` — 72 checks: date parsing, weekend-aware counting (incl. leap-year and year-boundary cases), overlap rules, balance math (pending / rejected excluded, cross-year isolation), status transitions, request / type validation, import validation, Bengali-digit and date formatting.
- `tests/smoke.js` — 36 checks × 2 viewports: initial render, counted-day preview, add / overlap-reject / approve flow, weekend counting, exceeds-remaining warning, calendar dots, custom type creation, Bangla toggle + persistence, reload persistence, export → erase → import round-trip, malformed-import rejection, no horizontal overflow, zero `http(s)` network requests, zero console / page errors.

## Deployment

GitHub Pages: push this folder to the `main` branch of the repo and enable Pages (branch `main`, folder `/ (root)`). No build step.

## Limitations

- **Personal planner, not an HR system.** Approvals recorded here are your own record; nothing is sent to an employer or manager.
- **Quotas are defaults, not rules.** CL 10 / SL 14 / EL 20 match common Bangladeshi office practice; your workplace may differ — edit the quotas to match.
- **Weekend handling is a setting, not law.** Friday-only is the government weekend; many private offices take Friday + Saturday or Saturday + Sunday — set the checkboxes accordingly.
- **No notifications.** The app does not remind you of upcoming leave; check the Dashboard / Calendar.
- **Single-device.** Data lives in one browser's `localStorage`; use Export / Import to move it.
- **Calendar-year quotas.** Balances are computed per calendar year from the start date of each request; if your office runs a different leave year, the numbers are still per calendar year.

## Status

MVP complete and verified: 72/72 unit + 36/36 desktop + 36/36 mobile smoke checks, 0 console / page errors.

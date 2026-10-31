# TRN FIT — Inventory & Barcode Management

**TRAIN. RISE. NEVER QUIT.**

Mobile-first inventory system for TRN FIT warehouse staff: camera barcode scanning (Code 128), stock in / out / adjustments, product & variant management, label printing, CSV/Excel export. Arabic (RTL) by default, English switch.

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | One deployable unit for UI + API, Vercel-native |
| Styling | Tailwind CSS v4, IBM Plex Sans Arabic (self-hosted via Fontsource) | No runtime UI library, no Google Fonts request |
| Database | PostgreSQL + Drizzle ORM (`pg` pool) | Parameterised queries, SQL migrations, transactions, constraints |
| Scanner | `zxing-wasm` (ZXing-C++ → WebAssembly) in a Web Worker | Works on iOS Safari, Android Chrome and desktop; does not depend on `BarcodeDetector` |
| Barcodes | `bwip-js` (Code 128) + `pdf-lib` | Exact-module-width rendering, PNG/SVG/PDF |
| Excel | `exceljs` (server only) | |

---

## Quick start (local)

Requirements: Node 20+, PostgreSQL 14+.

```bash
cp .env.example .env          # edit DATABASE_URL if needed
npm install                   # also copies the ZXing .wasm into public/zxing/
npm run db:setup              # runs migrations + seeds admin employee and the 3 TRN FIT products
npm run dev                   # http://localhost:3000
```

Sign in with the access code from `INITIAL_ACCESS_CODE` (initially `trnfit19`). **Change it** in *الإعدادات → تغيير رمز الدخول* after the first login.

> The camera only works on **HTTPS** (or `http://localhost`). To test on a phone during development, use an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) — a plain `http://192.168.x.x` address will be blocked by the browser.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. On serverless (Vercel) use the **pooled** URL (Neon `-pooler`, Supabase port 6543, etc.). |
| `INITIAL_ACCESS_CODE` | first deploy | Access code for the first admin employee. Only read by `npm run db:seed` when the `employees` table is empty; stored as a scrypt hash. Never sent to the browser. You can remove it after the first seed. |
| `SESSION_TTL_HOURS` | no | Sliding session lifetime, default `12`. |
| `DATABASE_POOL_MAX` | no | Max connections per server instance, default `5`. |
| `DATABASE_SSL` | no | Set to `require` if your provider needs SSL and the URL has no `sslmode`. |

## Deploying to Vercel

1. Create a Postgres database (Neon, Supabase, Vercel Marketplace Postgres, RDS…).
2. Import this repo in Vercel and set `DATABASE_URL` and `INITIAL_ACCESS_CODE` (Production + Preview).
3. Deploy. The `vercel-build` script runs `db:migrate` + `db:seed` (both idempotent) and then `next build`.
   If you prefer to migrate manually, change the Build Command to `next build` and run `npm run db:setup` yourself against the production URL.
4. Open the production URL on a phone, sign in, tap **مسح باركود**, allow camera access.

Any Node host works too: `npm run build && npm start` behind HTTPS.

## Scripts

| Script | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:generate` | Generate a new SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` / `db:setup` | Apply migrations / seed / both |
| `npm test` | Unit + integration tests (Vitest, real PostgreSQL — uses `TEST_DATABASE_URL`, default `…/trnfit_test`, **wiped on every run**) |
| `npm run test:e2e` | Builds and runs Playwright end-to-end tests (uses `E2E_DATABASE_URL`, default `…/trnfit_e2e`, **wiped**). Needs `ffmpeg` to build the fake-camera videos. |

## Architecture

```
src/
  app/(app)/…          authenticated pages (dashboard, scan, items, movements, barcodes, settings)
  app/api/…            route handlers — every one calls requireUser()/requireAdmin()
  app/login, app/print login page, print-only label view
  components/          client UI (ScanView, StockSheet, Dashboard, …)
  scanner/engine.ts    camera + ROI capture + feedback (lazy-loaded)
  scanner/decoder.worker.ts  ZXing WASM decoding off the main thread
  lib/server/          auth, inventory service, http helpers, audit
  lib/barcode.ts       Code 128 → SVG / 600-DPI PNG labels / PDF
  db/schema.ts         Drizzle schema → drizzle/*.sql migrations
```

### Database
`employees`, `sessions`, `login_attempts`, `products`, `product_variants` (one row per SKU — stock lives here), `stock_movements` (ledger), `audit_logs`.

* Unique indexes on SKU and barcode; `CHECK (quantity >= 0)`; `CHECK (quantity_after = quantity_before + quantity)` on every ledger row.
* Stock changes run in a transaction with `SELECT … FOR UPDATE` on the variant row, so concurrent employees can never lose updates or drive stock negative.
* Each movement carries a client-generated `request_id` (unique). The client retries on network failure with the same id, so a flaky connection can never double-count.
* Movement history uses keyset pagination (`id < cursor`) on indexed columns.

### Authentication & security
* Access codes hashed with scrypt (per-code salt). Sessions are random 256-bit tokens in an `HttpOnly; SameSite=Lax; Secure` cookie; only the SHA-256 of the token is stored. Sliding expiry, logout deletes the session; changing a code or disabling an employee revokes their sessions.
* Login rate limiting stored in Postgres (works across serverless instances): 8 failures / 15 min per IP, plus a global cap.
* All mutating API calls verify `Origin`; Zod validation on every input; errors never leak SQL.
* Multiple employees: admins add employees (name, username, own code, role) in Settings. Every movement records the employee.

### Scanner pipeline (performance-critical path)
1. The scanner bundle and WASM are fetched only when the user heads to the scanner (pointer-down on the scan button pre-warms them); the service worker caches them afterwards.
2. Rear camera (`facingMode: environment`) at up to 1080p, continuous autofocus when the track supports it, torch/zoom/camera-switch buttons when available.
3. Each new video frame (`requestVideoFrameCallback`), only the region under the green frame (+ small margin) is copied, capped at 1000 px wide, and transferred (zero-copy) to the worker. One frame in flight at a time → no backlog, no main-thread decoding.
4. ZXing reads Code 128 first (plus EAN/UPC/Code 39), single symbol.
5. On a hit: vibration (Android), optional beep, green flash; the decoder pauses while the stock sheet is open (camera stays live so the next scan is instant). The same code must leave the frame for 1.2 s before it can be scanned again (duplicate guard).
6. Fallbacks: manual entry, decode from photo, clear messages for HTTPS/permission/no-camera/camera-busy errors.

**Instant mode** (⚡ on the scanner) records 1 unit per scan with no confirmation — fastest way to receive or pick many items.

### Labels
Code 128 rendered at 600 DPI with integer dots per module and a 10-module quiet zone on each side; product name above, SKU below. Sizes: 50×25, 40×30, 58×40, 100×50 mm (one label per page for roll printers) and A4 3×8 sheets. Download PNG/SVG/PDF or print directly (`/print` sets `@page` to the label size — print at 100 % / "actual size").

## What has been tested (and what hasn't)

Automated (all passing): 22 Vitest integration tests on real PostgreSQL (stock math, negative-stock prevention incl. 60 concurrent stock-outs against 40 units, idempotent retries, duplicate SKU/barcode, login + rate limit, pagination, dashboard stats) and 19 Playwright tests (login/logout, API protection, product create/edit, stock in/out/adjust, persistence after reload, CSV/XLSX/PDF exports, language switch, no horizontal overflow at 375/390/820/1440 px, and the scanner fed by a fake camera stream built from labels the app itself generated).

Scanner measurements in **headless desktop Chromium with a simulated camera** (blurred, noisy, slightly rotated label): camera start → first decode ≈ 90 ms, ≈ 7 ms per frame decode, tap on "مسح باركود" → product sheet ≈ 0.5 s; rapid alternating scans recorded exactly once per appearance.

**Not yet verified on physical devices.** iPhone Safari and Android Chrome support is designed for (playsinline video, WASM worker, no `BarcodeDetector` dependency) but has not been tested on real phones — please run through the checklist below on your actual devices before rollout:

- [ ] iPhone (Safari) — open via HTTPS, allow camera, scan a printed label
- [ ] iPhone — installed to Home Screen (PWA) and scanning
- [ ] Android (Chrome) — scan, torch, camera switch if the wrong lens opens
- [ ] Print a 50×25 label on your label printer at 100 % scale and scan it
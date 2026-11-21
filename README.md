# KalshiBot Mission Control — Seven-Market Research Release

**Assets:** BTC, BNB, ETH, SOL, XRP, GOLD, SILVER; market duration: 15 minutes. Node.js 22+; no npm dependencies. **Research-only. Zero order routes, zero trade execution, no live trading switch.**

## Important scope

This is a *new self-contained research implementation*, not a byte-for-byte replica of your previous Mission Control; that repository/database was not accessible during the build. The prediction engine is **a transparent quote-based heuristic, not a trained/validated AI model**. Never mistake implied market odds for an independent calibrated model. No old Mission Control historical data is imported. No demo/paper order execution is implemented, but the pre-outcome prediction and settlement ledgers start logging once data is available.

## Deploy tonight: Render / Railway

1. Create a **new private GitHub repository**. Upload all files and folders in this ZIP **at the repository root** (`server.js`, `lib.js`, `storage.js`, `public/`, `sql/`, `package.json`). Do not expose your secrets in GitHub.
2. In Supabase create or choose a **separate** project, open **SQL Editor**, execute `sql/supabase.sql`. The `mc_records` table will persist quotes, forecasts, audits, and results. This app does **not** read or overwrite your old database tables.
3. In your new Render Web Service (or Railway service): connect the new GitHub repository; use **Node 22+**. Build command `npm install` (no dependencies). Start command `npm start`. **Exactly one running instance** of this app per database. Configure an always-on instance; free/sleeping instances cannot collect 24/7. A web service's ephemeral disk is **not** suitable for retaining SQLite data across redeployments.
4. Set these **server environment variables** (never in frontend code):
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) — a server-only secret that can write your *new* `mc_records` table
   - `VIEWER_PASSPHRASE` — your own long random secret to unlock private research/account endpoints
   - `KALSHI_API_KEY_ID` — optional Kalshi API key ID, preferably **read-only**
   - `KALSHI_PRIVATE_KEY_PEM` — optional matching RSA or Ed25519 PEM; paste as an environment value and preserve its line breaks (escaped `\n` is supported)
   - `POLL_SECONDS=30` — optional; minimum enforced 15 seconds
   - `SERIES_GOLD`, `SERIES_SILVER` — optional if Kalshi uses different active series identifiers
5. Deploy. Open `/api/health`. Confirm `persistence.durable=true`, `persistence.ok=true`, `last_poll` is recent, and `errors` is empty. If a series is missing/incorrect, `/api/health` displays that market's error and the other six continue independently. **No collection is proven until those checks pass.**
6. Open dashboard and enter your viewer passphrase. Each tab has forward scoreboards, official settlement read logs, retrospective replay, CSV exports, and a read-only portfolio section. Verify an active ticker and increasing saved forecast rows **after market minute 3**. Official market results are confirmed after the window closes and repeated market endpoint reads agree at least 30 seconds apart. Their source is still **one venue**, not an independent third-party settlement feed.
7. Leave the hosting service **awake and connected** overnight. The UI may be closed; server process must stay online. Check persisted observations and audits in the morning. No legacy database was migrated.

## Safety, limits, and operational caveats

- HTTP API and server only accept **GET**; account requests are authenticated signed GET calls to `/portfolio/balance` and `/portfolio/positions`. No order, fill, cancel, or funding endpoints are included.
- Server secret is used only on server, never embedded in browser. Viewer passphrase remains in page memory, not localStorage; use HTTPS. Protect the Supabase service-role secret and use read-only Kalshi key permissions where possible.
- **Do not put the Supabase `anon`/publishable key in the `SUPABASE_SERVICE_ROLE_KEY` field.** The SQL enables RLS and revokes client roles; the backend needs server-only credentials. Keep keys out of commits.
- Without Supabase, local SQLite allows offline development. It is **not safe as persistent cloud storage unless a mounted durable disk is configured**. `/api/health` explicitly reports `durable:false`.
- Runs one server+worker process. Multiple replicas cause redundant requests and possible audit contention. Public market polling is rate-limited by the venue; choose an appropriate plan and poll interval. The code records API errors, not fake data.
- Signals are emitted once per ticker/checkpoint (3/5/7/9/11 minutes) only with three prior observed market quotes spanning >=30 seconds. Delayed starts can miss checkpoints rather than fill them from hindsight. Signals record a `baseline_p_yes` (market quote midpoint) separately from the `p_yes` heuristic.
- No forecast is scored without a persisted official yes/no result. Two separated reads from Kalshi are an **internal consistency check**, not independent adjudication. Conflicting reads flag the outcome unverified.
- Forward Brier counts checkpoint predictions, which are correlated within a market. Both checkpoint and distinct market counts are displayed. Readiness labels do **not** authorize trading. Calibration and backtest require enough genuine outcomes; low samples remain unqualified.
- Retrospective replay only uses quotes saved prior to each simulated prediction timestamp, and it is clearly labelled as retrospective, *not* independent forward validation. The built-in prototype heuristic is fixed in advance; it is not trained or optimized. Backtesting historical pre-install data is unavailable until separately sourced.
- Account credentials cannot be auto-transferred from your original service. They must be configured again by you in your new hosting environment. Your account cannot be claimed “connected” until read-only API signing succeeds.
- Gold/Silver ticker conventions and availability can change; use official feed errors and correct `SERIES_*` values rather than trusting a guess. Venue quote semantics are YES/NO on the listed contract, not necessarily spot asset price changes across different rules.
- There is **no automatic live trading** in this download. A future version would require explicit separate authorization, verified edge, risk/fee modeling, and a new audited execution implementation.

## Local smoke tests

```
node --version
npm test
npm start
```

Visit `http://localhost:3000/api/health`; the runtime requires Node 22+ for built-in SQLite local fallback. `/api/overview` returns seven market snapshots after the worker's first successful loop.

## API routes

| Endpoint | Purpose | Passphrase |
|---|---|---|
| `GET /api/health` | Worker / durability / errors | No |
| `GET /api/overview` | Seven market snapshots | No |
| `GET /api/market?symbol=BTC` | One current market | No |
| `GET /api/research?symbol=BTC` | Saved live forecasts, official audits, Brier, calibration | Yes |
| `GET /api/backtest?symbol=BTC` | Chronological snapshot replay (when evidence exists) | Yes |
| `GET /api/account` | Signed read-only portfolio balance and positions | Yes + Kalshi credentials |

Passphrase header: `X-Viewer-Passphrase`. No private account data returned on public endpoints.

## Database auditing

`mc_records` uses append-keyed IDs. Kinds: `quote`, `forward`, `audit`, `outcome`. Market-ticker IDs allow idempotent forward checkpoints. Two official settled reads are required for outcome verification. Raw audit events are retained and not replaced by a simulated outcome. A repeated observation in the same minute may update an audit key; this is not a cryptographic append-only WORM log. For legal-grade immutable evidence, add separate database-enforced append-only audit storage and external integrity anchoring.

## Current known limits

No historical import, no full order-book feed, no independent underlying spot oracle, no external settlement adjudicator, no paid data feeds, no trained ML training pipeline, no fee/slippage simulated execution, no order placement, no automatic external alerting. These are intentionally **not** claimed as ready or verified.

## Mission Control expanded dashboard sections (v2.1)

Each of the seven asset tabs now contains a **Signal Journal**, **15-Minute Checkpoint Research** breakdown, **Recent Checkpoint Records**, **BOT INTENT**, and **Live Trading Statistics / Mission Control** in addition to the original forward-learning scorecard, settlement audits, and backtesting. Journal correctness and checkpoint accuracy use only two-read-verified Kalshi official market outcomes; pending outcomes are explicitly marked pending. The live trading panel deliberately shows zero bot orders and no fabricated P/L because there are no order routes. Account connectivity remains read-only and does not import account trade history or claim all existing account trades belong to the bot.

**Visual parity limitation:** The original BTC KalshiBot Mission Control source and exact frontend assets were not accessible. This expanded edition recreates the requested functional dashboard sections in the existing seven-market dark Mission Control theme; it cannot truthfully be called a pixel-identical clone. If original source becomes available, its precise styling and markup can be transplanted without sacrificing the data collector.

**Forward-ledger limitation:** The UI displays the latest 120 forward rows and latest 120 outcomes returned by `/api/research` (rather than an unbounded database-wide view), but the server computes checkpoint research statistics from up to 2,500 latest saved forward records. Journal outcomes are joined server-side against up to 1,500 verified official outcomes. Large installations should add paginated, whole-history SQL aggregation for exhaustive lifetime metrics.

## v2.2 — XRP and deployment verification (November 21, 2026)

XRP was already integrated in the v2.1 seven-market release. The XRP tab uses **KXXRP15M** by default, independently records quotes, pre-outcome checkpoint forecasts, and official settlement audits, and has its own forward-learning and journal display. This release adds a test that prevents accidentally removing XRP from either the configured markets or UI.

### Quick deployment checklist

1. Create a separate **private** GitHub repository named `kalshibot-seven-market-research`. Choose **Add file → Upload files** and upload all ZIP contents, preserving the `public/`, `sql/`, and `tests/` directories. Do not upload the ZIP as a single file. Do not upload credentials.
2. In your Supabase project's SQL Editor, run `sql/supabase.sql` and confirm `public.mc_records` exists. The service-role credential must be stored only in Render's environment settings.
3. In Render, create **New → Web Service** connected to that repository. Runtime: Node; build command: `npm install`; start command: `npm start`. Set an always-on service if you expect overnight collection.
4. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `VIEWER_PASSPHRASE`. Add `KALSHI_API_KEY_ID` and `KALSHI_PRIVATE_KEY_PEM` for account read-only access. No trade API routes exist. Do not put secrets in GitHub, screenshots, or this chat.
5. Open `https://YOUR-RENDER-URL/api/health` and check `assets` includes `XRP`, `series.XRP` is `KXXRP15M`, `persistence.ok` and `persistence.durable` are `true`, `last_poll` is recent, and `errors.XRP` is absent or `null`.
6. Open the dashboard and select **XRP**. Confirm it shows an actual market ticker; then unlock your viewer passphrase and confirm that saved forward observations begin appearing at the supported checkpoints. If there are no observations yet, do not infer successful collection merely from a working page.
7. After an XRP 15-minute market closes, check the settlement audit and verified results. Official settlement reads may lag market close; persistent scores only incorporate verified outcomes.

**Note:** No direct deployment into your GitHub, Render, or Supabase account has been performed by the build system. This is a ready-to-upload research package, not evidence of a running deployment.

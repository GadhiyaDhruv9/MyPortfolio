# MyPortfolio — Portfolio Tracker

Personal stock portfolio tracker for Indian markets (NSE/BSE, INR), built with Expo SDK 57, React Native, TypeScript and Expo Router. All data stays on the device (AsyncStorage). No backend, analytics or tracking.

## Run it

```bash
npm install
npx expo start        # scan the QR code with Expo Go (Android) or the Camera app (iOS)
npx expo start --web  # optional: run in the browser
```

On first launch the app seeds sample data: 2 portfolios, 10 instruments, 28 transactions across FY 2023-24 to 2025-26, 4 dividends and price quotes. Use **Settings → Clear all data** to start fresh, or **Load sample data** to bring the sample back.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the domain logic (FIFO, charges, XIRR, tax, reports, seed data) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Expo config) |

## Features

- **Dashboard**: current value, invested amount, P&L, XIRR, today's P&L, realized P&L, dividends, value-over-time chart, sector allocation, top gainers and losers.
- **Holdings**: open and sold/closed positions (closed ones are never deleted), search, sort, and a detail sheet with FIFO lots, LTCG-eligible dates, transaction history, dividends and trade notes. Prices are updated manually here, because the app is offline.
- **Transactions**: add, edit and delete buys, sells and corporate actions. Charges are calculated from editable templates, with a manual override. A FIFO sell preview shows STCG/LTCG/intraday badges and blocks overselling.
- **Reports**: realized P&L by month, quarter, year or FY; per-period breakdown with win rate; capital gains per FY with loss set-off and carry-forward; charges breakdown; CSV export.
- **Settings**: privacy mode, portfolios, charge templates, tax rules, JSON backup and restore, clear data.

## Zerodha integration

Two ways to bring in your Zerodha trades. You can use both; trades are matched by trade ID, so nothing gets imported twice.

### 1. Tradebook CSV import (history, free, no setup)

1. Go to [console.zerodha.com](https://console.zerodha.com) → **Reports → Tradebook**, choose **Equity**, pick a date range (up to one FY at a time) and download it as **CSV**.
2. In the app, go to **Settings → Broker → Import tradebook CSV** and pick the file.
3. Check the preview and tap **Import**.

How the import works:
- Fills are merged into one transaction per day, stock and side.
- Same-day buys and sells of a stock become intraday (MIS); the rest is delivery (CNC).
- F&O, currency and commodity rows are skipped.
- The tradebook has no charges, so they are estimated from the delivery and intraday templates chosen in **Zerodha settings**.
- Bonus and split corporate actions are not in the tradebook. Add them by hand under Transactions → Other transaction types.

### 2. Kite Connect live sync (holdings, today's trades, prices)

Kite's login needs your **API secret**, which must never be on the phone. A small free Cloudflare Worker (`server/kite-auth-worker`) holds it and does the token exchange. Setup takes one time:

1. **Create a Kite Connect app** at [developers.kite.trade](https://developers.kite.trade) and choose a plan. Live market quotes need the paid plan; without it, prices still update for stocks in your Zerodha holdings. Note the **API key** and **API secret**.
2. **Deploy the worker** (needs a free [Cloudflare](https://dash.cloudflare.com/sign-up) account):
   ```bash
   cd server/kite-auth-worker
   npx wrangler login
   npx wrangler secret put KITE_API_KEY      # paste the API key
   npx wrangler secret put KITE_API_SECRET   # paste the API secret
   npx wrangler deploy                       # prints https://kite-auth.<you>.workers.dev
   ```
3. In the Kite developer console, set the app's **Redirect URL** to `https://kite-auth.<you>.workers.dev/callback`.
4. In the app, go to **Settings → Broker → Zerodha settings**. Enter the **API key** and the **auth server URL** (`https://kite-auth.<you>.workers.dev`), and pick the portfolio to sync into.
5. Tap **Login with Zerodha**, log in, then tap **Sync now**.

What a sync does:
- Adds today's trades.
- Updates prices.
- Lists any stock where the app's quantity differs from Zerodha's settled holdings, usually because older trades still need a CSV import.

Limits:
- Zerodha sessions expire every day at 6 AM (a SEBI rule), so log in once a day before syncing.
- Kite's API only returns **today's** trades; history comes from the CSV.
- Sync works in the iOS/Android app, not the web build.

The access token is kept in the phone's secure storage and is never included in JSON backups.

## Project layout

```
app/                     Expo Router screens
  _layout.tsx            Root providers
  (tabs)/_layout.tsx     Bottom tab bar
  (tabs)/*.tsx           Dashboard, Holdings, Transactions, Reports, Settings
src/domain/              Pure business logic (no React): fifo, charges, tax, returns, holdings, reports
src/data/                AsyncStorage persistence, seed data, React context
src/lib/                 Indian number/date formatting, theme, export, confirm dialogs
src/components/          UI building blocks and charts (react-native-svg)
src/integrations/zerodha/ Tradebook CSV parser, importer, Kite Connect client and login
server/kite-auth-worker/ Cloudflare Worker that holds the Kite API secret
```

## Notes

- Tax figures are estimates only, not tax advice. Verify them with your CA or your broker's P&L statement.
- Tax rules are stored with an effective-from date. The defaults cover the 23 Jul 2024 change (STCG 15% → 20%, LTCG 10% → 12.5%, exemption ₹1L → ₹1.25L).

## Branches

- `main`: stable, production-ready code
- `develop`: active development; feature branches merge here first

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
```

## Notes

- Tax figures are estimates only, not tax advice. Verify them with your CA or your broker's P&L statement.
- Tax rules are stored with an effective-from date. The defaults cover the 23 Jul 2024 change (STCG 15% → 20%, LTCG 10% → 12.5%, exemption ₹1L → ₹1.25L).

## Branches

- `main`: stable, production-ready code
- `develop`: active development; feature branches merge here first

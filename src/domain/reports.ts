import { getFY } from './fifo';
import type { RealizedTrade, Transaction } from './types';

export type PeriodKind = 'monthly' | 'quarterly' | 'yearly' | 'fy';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Sortable key and display label for the period containing `date`. */
export function periodOf(date: string, kind: PeriodKind): { key: string; label: string } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  switch (kind) {
    case 'monthly':
      return { key: date.slice(0, 7), label: `${MONTHS[month - 1]} ${String(year).slice(2)}` };
    case 'quarterly': {
      // Indian FY quarters: Q1 = Apr–Jun … Q4 = Jan–Mar.
      const fy = getFY(date);
      const q = month >= 4 ? Math.ceil((month - 3) / 3) : 4;
      return { key: `${fy}-Q${q}`, label: `Q${q} ${fy.slice(2)}` };
    }
    case 'yearly':
      return { key: String(year), label: String(year) };
    case 'fy': {
      const fy = getFY(date);
      return { key: fy, label: fy };
    }
  }
}

export interface PeriodRow {
  key: string;
  label: string;
  bought: number;
  sold: number;
  realizedPnL: number;
  charges: number;
  trades: number;
  wins: number;
  winRate: number;
}

/**
 * Per-period activity. "Trades" counts sell transactions; a sell is a win when the
 * realized gain across all the lots it consumed is positive.
 */
export function periodBreakdown(txns: Transaction[], realized: RealizedTrade[], kind: PeriodKind): PeriodRow[] {
  const rows = new Map<string, PeriodRow>();
  const row = (date: string) => {
    const { key, label } = periodOf(date, kind);
    let r = rows.get(key);
    if (!r) {
      r = { key, label, bought: 0, sold: 0, realizedPnL: 0, charges: 0, trades: 0, wins: 0, winRate: 0 };
      rows.set(key, r);
    }
    return r;
  };

  for (const t of txns) {
    if (t.type === 'BUY' || t.type === 'IPO_ALLOTMENT' || t.type === 'RIGHTS') row(t.tradeDate).bought += t.netAmount;
    else if (t.type === 'SELL') row(t.tradeDate).sold += t.netAmount;
    if (t.totalCharges) row(t.tradeDate).charges += t.totalCharges;
  }

  const gainBySell = new Map<string, { date: string; gain: number }>();
  for (const r of realized) {
    row(r.sellDate).realizedPnL += r.gain;
    const prev = gainBySell.get(r.sellTxnId);
    gainBySell.set(r.sellTxnId, { date: r.sellDate, gain: (prev?.gain ?? 0) + r.gain });
  }
  for (const { date, gain } of gainBySell.values()) {
    const r = row(date);
    r.trades += 1;
    if (gain > 0) r.wins += 1;
  }

  return [...rows.values()]
    .map((r) => ({ ...r, winRate: r.trades ? (r.wins / r.trades) * 100 : 0 }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

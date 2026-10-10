import { applyFIFO, sortTransactions, todayISO, type FifoResult } from './fifo';
import type { Dividend, HoldingSummary, Instrument, PriceQuote, RealizedTrade, Transaction } from './types';

const EPS = 1e-9;

export function filterByPortfolio<T extends { portfolioId: string }>(items: T[], portfolioId?: string | null): T[] {
  return portfolioId ? items.filter((i) => i.portfolioId === portfolioId) : items;
}

/**
 * Holdings per instrument (summed across the selected portfolios). Instruments that
 * were traded but are fully sold are returned with `isClosed: true` — closed
 * positions are never dropped.
 */
export function computeHoldings(
  transactions: Transaction[],
  instruments: Instrument[],
  quotes: PriceQuote[],
  portfolioId?: string | null,
  fifo?: FifoResult,
): HoldingSummary[] {
  const txns = filterByPortfolio(transactions, portfolioId);
  const { lots, realized } = fifo ?? applyFIFO(txns);
  const instrumentById = new Map(instruments.map((i) => [i.id, i]));
  const quoteById = new Map(quotes.map((q) => [q.instrumentId, q]));
  // A demerger's new company has no transactions of its own; its lots come from the parent.
  const tradedIds = [...new Set(txns.flatMap((t) => (t.demergedInstrumentId ? [t.instrumentId, t.demergedInstrumentId] : [t.instrumentId])))];

  const realizedById = new Map<string, number>();
  for (const r of realized) realizedById.set(r.instrumentId, (realizedById.get(r.instrumentId) ?? 0) + r.gain);

  const rows: HoldingSummary[] = tradedIds.map((instrumentId) => {
    const inst = instrumentById.get(instrumentId);
    const openLots = lots.filter((l) => l.instrumentId === instrumentId && l.remainingQty > EPS);
    const quantity = openLots.reduce((s, l) => s + l.remainingQty, 0);
    const investedAmount = openLots.reduce((s, l) => s + l.remainingQty * l.perShareCost, 0);
    const buyCharges = openLots.reduce((s, l) => s + l.buyCharges, 0);
    const quote = quoteById.get(instrumentId);
    const lastTradePrice = sortTransactions(txns.filter((t) => t.instrumentId === instrumentId && t.price > 0 && (t.type === 'BUY' || t.type === 'SELL'))).at(-1)?.price ?? 0;
    const currentPrice = quote?.price ?? lastTradePrice;
    const previousClose = quote?.previousClose ?? currentPrice;
    const currentValue = quantity * currentPrice;
    const unrealizedPnL = currentValue - investedAmount;
    const isClosed = quantity <= EPS;
    return {
      instrumentId,
      symbol: inst?.symbol ?? '?',
      companyName: inst?.companyName ?? 'Unknown instrument',
      sector: inst?.sector,
      marketCapBucket: inst?.marketCapBucket ?? 'unknown',
      quantity: isClosed ? 0 : quantity,
      avgBuyPrice: quantity > EPS ? investedAmount / quantity : 0,
      investedAmount,
      buyCharges,
      currentPrice,
      currentValue,
      unrealizedPnL,
      unrealizedPnLPct: investedAmount > 0 ? (unrealizedPnL / investedAmount) * 100 : 0,
      dayChange: quantity * (currentPrice - previousClose),
      dayChangePct: previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0,
      weight: 0,
      lots: openLots,
      isClosed,
      realizedPnL: realizedById.get(instrumentId) ?? 0,
    };
  });

  const total = rows.reduce((s, r) => s + r.currentValue, 0);
  for (const r of rows) r.weight = total > 0 ? (r.currentValue / total) * 100 : 0;
  return rows;
}

export interface PortfolioTotals {
  currentValue: number;
  invested: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  dayChange: number;
  dayChangePct: number;
  realizedPnL: number;
  openCount: number;
  closedCount: number;
}

export function portfolioTotals(holdings: HoldingSummary[], realized: RealizedTrade[]): PortfolioTotals {
  const open = holdings.filter((h) => !h.isClosed);
  const currentValue = open.reduce((s, h) => s + h.currentValue, 0);
  const invested = open.reduce((s, h) => s + h.investedAmount, 0);
  const dayChange = open.reduce((s, h) => s + h.dayChange, 0);
  const previousValue = currentValue - dayChange;
  return {
    currentValue,
    invested,
    unrealizedPnL: currentValue - invested,
    unrealizedPnLPct: invested > 0 ? ((currentValue - invested) / invested) * 100 : 0,
    dayChange,
    dayChangePct: previousValue > 0 ? (dayChange / previousValue) * 100 : 0,
    realizedPnL: realized.reduce((s, r) => s + r.gain, 0),
    openCount: open.length,
    closedCount: holdings.length - open.length,
  };
}

export function realizedPnL(realized: RealizedTrade[]): number {
  return realized.reduce((s, r) => s + r.gain, 0);
}

export function dividendTotals(dividends: Dividend[]): { gross: number; tds: number; net: number; count: number } {
  return dividends.reduce(
    (acc, d) => ({ gross: acc.gross + d.gross, tds: acc.tds + d.tds, net: acc.net + d.net, count: acc.count + 1 }),
    { gross: 0, tds: 0, net: 0, count: 0 },
  );
}

export interface AllocationSlice {
  label: string;
  value: number;
  pct: number;
}

export function allocationBySector(holdings: HoldingSummary[]): AllocationSlice[] {
  const map = new Map<string, number>();
  for (const h of holdings) {
    if (h.isClosed) continue;
    const key = h.sector || 'Other';
    map.set(key, (map.get(key) ?? 0) + h.currentValue);
  }
  const total = [...map.values()].reduce((s, v) => s + v, 0);
  return [...map.entries()]
    .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface ValuePoint {
  date: string;
  value: number;
  invested: number;
}

/**
 * Estimated portfolio value over time. The app is offline and keeps no daily price
 * history, so each instrument's price on a date is interpolated linearly between its
 * known prices: recorded trade prices and today's quote. Corporate actions are
 * respected because quantities come from the FIFO replay up to each date.
 */
export function valueHistory(
  transactions: Transaction[],
  quotes: PriceQuote[],
  fromDate: string,
  toDate = todayISO(),
  points = 40,
): ValuePoint[] {
  if (!transactions.length) return [];
  const sorted = sortTransactions(transactions);
  const start = fromDate > sorted[0].tradeDate ? fromDate : sorted[0].tradeDate;
  const startMs = Date.parse(start);
  const endMs = Date.parse(toDate);
  if (!(endMs > startMs)) return [];

  // Price anchors per instrument, adjusted so pre-split/bonus trades compare like-for-like.
  const anchors = new Map<string, { ms: number; price: number }[]>();
  const factorAfter = (instrumentId: string, date: string) =>
    sorted
      .filter((t) => t.instrumentId === instrumentId && t.tradeDate > date && (t.type === 'BONUS' || t.type === 'SPLIT'))
      .reduce((f, t) => f * (t.type === 'SPLIT' ? t.price : 1 + t.quantity / t.price), 1);
  for (const t of sorted) {
    if ((t.type !== 'BUY' && t.type !== 'SELL') || !(t.price > 0)) continue;
    const list = anchors.get(t.instrumentId) ?? [];
    list.push({ ms: Date.parse(t.tradeDate), price: t.price / factorAfter(t.instrumentId, t.tradeDate) });
    anchors.set(t.instrumentId, list);
  }
  for (const q of quotes) {
    const list = anchors.get(q.instrumentId);
    if (list) list.push({ ms: endMs, price: q.price });
  }
  const priceAt = (instrumentId: string, ms: number) => {
    const list = anchors.get(instrumentId);
    if (!list?.length) return 0;
    if (ms <= list[0].ms) return list[0].price;
    for (let i = 1; i < list.length; i++) {
      if (ms <= list[i].ms) {
        const a = list[i - 1];
        const b = list[i];
        const f = b.ms === a.ms ? 1 : (ms - a.ms) / (b.ms - a.ms);
        return a.price + (b.price - a.price) * f;
      }
    }
    return list[list.length - 1].price;
  };

  const out: ValuePoint[] = [];
  const step = (endMs - startMs) / (points - 1);
  for (let i = 0; i < points; i++) {
    const ms = i === points - 1 ? endMs : startMs + step * i;
    const date = new Date(ms).toISOString().slice(0, 10);
    const { lots } = applyFIFO(sorted.filter((t) => t.tradeDate <= date));
    let value = 0;
    let invested = 0;
    for (const l of lots) {
      if (l.remainingQty <= EPS) continue;
      // Anchors are in today's (post split/bonus) terms; quantities are as of `date`.
      value += l.remainingQty * priceAt(l.instrumentId, ms) * factorAfter(l.instrumentId, date);
      invested += l.remainingQty * l.perShareCost;
    }
    out.push({ date, value, invested });
  }
  return out;
}

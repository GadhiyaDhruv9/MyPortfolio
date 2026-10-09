import { daysBetween, todayISO } from './fifo';
import type { Transaction } from './types';

export interface CashFlow {
  date: string; // YYYY-MM-DD
  amount: number; // negative = money invested, positive = money received
}

const npv = (rate: number, flows: CashFlow[], t0: string) =>
  flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, daysBetween(t0, f.date) / 365), 0);

const dNpv = (rate: number, flows: CashFlow[], t0: string) =>
  flows.reduce((s, f) => {
    const years = daysBetween(t0, f.date) / 365;
    return s - (years * f.amount) / Math.pow(1 + rate, years + 1);
  }, 0);

/**
 * Annualised XIRR as a percentage. Newton-Raphson first; if it fails to converge
 * (or leaves the valid range), falls back to bisection. Returns null when there are
 * fewer than two cash flows or they all have the same sign.
 */
export function xirr(cashFlows: CashFlow[]): number | null {
  const flows = cashFlows.filter((f) => f.amount !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;
  const t0 = flows[0].date;
  const tolerance = 1e-7;

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate, flows, t0);
    const deriv = dNpv(rate, flows, t0);
    if (!Number.isFinite(value) || !Number.isFinite(deriv) || deriv === 0) break;
    const next = rate - value / deriv;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < tolerance) return next * 100;
    rate = next;
  }

  // Bisection fallback: NPV falls as the rate rises for an invest-then-receive profile.
  let lo = -0.9999;
  let hi = 1;
  let fLo = npv(lo, flows, t0);
  let fHi = npv(hi, flows, t0);
  while (fLo * fHi > 0 && hi < 1e6) {
    hi *= 2;
    fHi = npv(hi, flows, t0);
  }
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows, t0);
    if (Math.abs(fMid) < tolerance || (hi - lo) / 2 < tolerance) return mid * 100;
    if (fMid * fLo < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return ((lo + hi) / 2) * 100;
}

/**
 * Portfolio cash flows: purchases (BUY, IPO allotment, rights) are outflows, sells are
 * inflows, and today's market value closes the series. Shares received without
 * payment (transfer in, gift) are counted at their recorded cost so they do not
 * inflate the return.
 */
export function portfolioCashFlows(txns: Transaction[], currentValue: number, asOf = todayISO()): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const t of txns) {
    if (t.type === 'BUY' || t.type === 'IPO_ALLOTMENT' || t.type === 'RIGHTS') {
      flows.push({ date: t.tradeDate, amount: -t.netAmount });
    } else if (t.type === 'TRANSFER_IN' || t.type === 'GIFT') {
      flows.push({ date: t.tradeDate, amount: -(t.quantity * t.price + t.totalCharges) });
    } else if (t.type === 'SELL') {
      flows.push({ date: t.tradeDate, amount: t.netAmount });
    }
  }
  if (currentValue > 0) flows.push({ date: asOf, amount: currentValue });
  return flows;
}

export function absoluteReturn(invested: number, finalValue: number): number | null {
  if (invested <= 0) return null;
  return ((finalValue - invested) / invested) * 100;
}

export function cagr(invested: number, finalValue: number, years: number): number | null {
  if (invested <= 0 || finalValue <= 0 || years <= 0) return null;
  return (Math.pow(finalValue / invested, 1 / years) - 1) * 100;
}

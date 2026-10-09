import { getFY } from './fifo';
import type { Instrument, RealizedTrade, TaxRules } from './types';

export const TAX_DISCLAIMER = 'Estimate only, not tax advice. Verify with your CA/broker P&L statement.';

/**
 * Listed equity rules. Budget 2024 raised rates for sales from 23 Jul 2024; the
 * latest entry is the FY 2026-27 default and is what Settings edits.
 */
export const DEFAULT_TAX_RULES: TaxRules[] = [
  {
    effectiveFrom: '2018-04-01',
    stcgRate: 15,
    ltcgRate: 10,
    ltcgExemption: 100000,
    cessRate: 4,
    surchargeRate: 0,
    grandfatheringDate: '2018-02-01',
    financialYearStart: { month: 4, day: 1 },
  },
  {
    effectiveFrom: '2024-07-23',
    stcgRate: 20,
    ltcgRate: 12.5,
    ltcgExemption: 125000,
    cessRate: 4,
    surchargeRate: 0,
    grandfatheringDate: '2018-02-01',
    financialYearStart: { month: 4, day: 1 },
  },
];

/** The rule set in force on `date` (falls back to the earliest one). */
export function rulesOn(rules: TaxRules[], date: string): TaxRules {
  const sorted = [...rules].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let found = sorted[0];
  for (const r of sorted) if (r.effectiveFrom <= date) found = r;
  return found;
}

/**
 * Section 112A grandfathering for shares bought before 1 Feb 2018:
 * cost = max(actual cost, min(FMV on 31 Jan 2018, sale price)).
 */
export function grandfatheredCost(
  actualCostPerShare: number,
  salePricePerShare: number,
  fmv31Jan2018: number | null | undefined,
): number {
  if (fmv31Jan2018 == null) return actualCostPerShare;
  return Math.max(actualCostPerShare, Math.min(fmv31Jan2018, salePricePerShare));
}

/** Applies grandfathering to a realized trade when it qualifies; otherwise returns it unchanged. */
export function adjustForGrandfathering(
  trade: RealizedTrade,
  instrument: Instrument | undefined,
  rules: TaxRules,
): RealizedTrade {
  if (trade.classification !== 'ltcg' || trade.buyDate >= rules.grandfatheringDate) return trade;
  if (instrument?.fmv31Jan2018 == null || trade.quantity <= 0) return trade;
  const perShare = grandfatheredCost(
    trade.buyCost / trade.quantity,
    trade.sellValue / trade.quantity,
    instrument.fmv31Jan2018,
  );
  const buyCost = perShare * trade.quantity;
  const gain = trade.sellValue - buyCost;
  return { ...trade, buyCost, gain, gainPct: buyCost > 0 ? (gain / buyCost) * 100 : 0 };
}

export interface CapitalGainsReport {
  fy: string;
  trades: RealizedTrade[];
  stcgGains: number;
  stcgLosses: number;
  ltcgGains: number;
  ltcgLosses: number;
  /** Net STCG after set-off (≥ 0). */
  stcgNet: number;
  /** Net LTCG after set-off, before the exemption (≥ 0). */
  ltcgNet: number;
  intradayNet: number;
  intradayTurnover: number;
  stclUsedAgainstLtcg: number;
  stclCarryForward: number;
  ltclCarryForward: number;
  ltcgExemptionUsed: number;
  stcgTaxable: number;
  ltcgTaxable: number;
  stcgRate: number;
  ltcgRate: number;
  baseTax: number;
  surcharge: number;
  cess: number;
  estimatedTax: number;
  rules: TaxRules;
  grandfatheredCount: number;
}

/** Weighted average rate of the gain-making trades, by gain amount. */
function weightedRate(items: { gain: number; rate: number }[], fallback: number): number {
  const gains = items.filter((i) => i.gain > 0);
  const total = gains.reduce((s, i) => s + i.gain, 0);
  if (total <= 0) return fallback;
  return gains.reduce((s, i) => s + i.gain * i.rate, 0) / total;
}

/**
 * Capital gains for one Indian FY, across every portfolio passed in (the LTCG
 * exemption is applied once per FY).
 *
 * Set-off order: losses first offset gains of the same head; remaining STCL then
 * offsets LTCG; LTCL can only offset LTCG. Unabsorbed losses are carried forward.
 * Each trade is taxed at the rate in force on its sale date (e.g. FY 2024-25 has
 * sales on both sides of 23 Jul 2024); the exemption and cess use the rules in
 * force at FY end. Intraday (MIS) is speculative business income and is reported
 * but not taxed here.
 */
export function computeCapitalGains(
  allRealized: RealizedTrade[],
  instruments: Instrument[],
  taxRules: TaxRules[],
  fy: string,
): CapitalGainsReport {
  const fyEndYear = Number(fy.slice(2, 6)) + 1;
  const fyRules = rulesOn(taxRules, `${fyEndYear}-03-31`);
  const byId = new Map(instruments.map((i) => [i.id, i]));

  let grandfatheredCount = 0;
  const trades = allRealized
    .filter((t) => getFY(t.sellDate) === fy)
    .map((t) => {
      const adjusted = adjustForGrandfathering(t, byId.get(t.instrumentId), rulesOn(taxRules, t.sellDate));
      if (adjusted !== t) grandfatheredCount++;
      return adjusted;
    });

  let stcgGains = 0;
  let stcgLosses = 0;
  let ltcgGains = 0;
  let ltcgLosses = 0;
  let intradayNet = 0;
  let intradayTurnover = 0;
  const stRates: { gain: number; rate: number }[] = [];
  const ltRates: { gain: number; rate: number }[] = [];

  for (const t of trades) {
    const r = rulesOn(taxRules, t.sellDate);
    if (t.classification === 'intraday') {
      intradayNet += t.gain;
      intradayTurnover += Math.abs(t.gain);
    } else if (t.classification === 'stcg') {
      if (t.gain >= 0) stcgGains += t.gain;
      else stcgLosses += -t.gain;
      stRates.push({ gain: t.gain, rate: r.stcgRate });
    } else {
      if (t.gain >= 0) ltcgGains += t.gain;
      else ltcgLosses += -t.gain;
      ltRates.push({ gain: t.gain, rate: r.ltcgRate });
    }
  }

  let stNet = stcgGains - stcgLosses;
  let ltNet = ltcgGains - ltcgLosses;
  let stclCarryForward = 0;
  let ltclCarryForward = 0;
  let stclUsedAgainstLtcg = 0;

  if (stNet < 0) {
    const stLoss = -stNet;
    stNet = 0;
    stclUsedAgainstLtcg = Math.min(stLoss, Math.max(0, ltNet));
    ltNet -= stclUsedAgainstLtcg;
    stclCarryForward = stLoss - stclUsedAgainstLtcg;
  }
  if (ltNet < 0) {
    ltclCarryForward = -ltNet;
    ltNet = 0;
  }

  const ltcgExemptionUsed = Math.min(ltNet, fyRules.ltcgExemption);
  const stcgTaxable = stNet;
  const ltcgTaxable = ltNet - ltcgExemptionUsed;
  const stcgRate = weightedRate(stRates, fyRules.stcgRate);
  const ltcgRate = weightedRate(ltRates, fyRules.ltcgRate);

  const baseTax = (stcgTaxable * stcgRate) / 100 + (ltcgTaxable * ltcgRate) / 100;
  const surcharge = (baseTax * fyRules.surchargeRate) / 100;
  const cess = ((baseTax + surcharge) * fyRules.cessRate) / 100;

  return {
    fy,
    trades,
    stcgGains,
    stcgLosses,
    ltcgGains,
    ltcgLosses,
    stcgNet: stNet,
    ltcgNet: ltNet,
    intradayNet,
    intradayTurnover,
    stclUsedAgainstLtcg,
    stclCarryForward,
    ltclCarryForward,
    ltcgExemptionUsed,
    stcgTaxable,
    ltcgTaxable,
    stcgRate,
    ltcgRate,
    baseTax,
    surcharge,
    cess,
    estimatedTax: baseTax + surcharge + cess,
    rules: fyRules,
    grandfatheredCount,
  };
}

/** FY labels that have at least one sale, newest first. */
export function financialYearsWithSales(realized: RealizedTrade[]): string[] {
  return [...new Set(realized.map((t) => getFY(t.sellDate)))].sort().reverse();
}

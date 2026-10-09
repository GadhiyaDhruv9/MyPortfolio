import { round2 } from './fifo';
import type { ChargeTemplate, Transaction } from './types';

export type TradeSide = 'BUY' | 'SELL';

export interface ChargeBreakdown {
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  sebiFee: number;
  stampDuty: number;
  gst: number;
  dpCharges: number;
  otherCharges: number;
  totalCharges: number;
  netAmount: number;
}

/**
 * Default templates modelled on Indian discount brokers (2026 rates). Every value is
 * editable in Settings — nothing in the calculation below is hard-coded.
 */
export const DEFAULT_CHARGE_TEMPLATES: ChargeTemplate[] = [
  {
    id: 'tpl_zero_delivery',
    name: 'Zero Brokerage (Delivery)',
    brokerageType: 'zero_delivery',
    brokerageFlat: 0,
    brokeragePercent: 0,
    sttBuyPct: 0.1,
    sttSellPct: 0.1,
    exchangeChargesPct: 0.00297,
    sebiFeePer10L: 1,
    stampDutyBuyPct: 0.015,
    gstPct: 18,
    dpCharges: 15.34,
  },
  {
    id: 'tpl_flat_20',
    name: '₹20 Per Order',
    brokerageType: 'flat_per_order',
    brokerageFlat: 20,
    brokeragePercent: 0,
    sttBuyPct: 0.1,
    sttSellPct: 0.1,
    exchangeChargesPct: 0.00297,
    sebiFeePer10L: 1,
    stampDutyBuyPct: 0.015,
    gstPct: 18,
    dpCharges: 15.34,
  },
];

export function calculateCharges(
  template: ChargeTemplate,
  side: TradeSide,
  quantity: number,
  price: number,
): ChargeBreakdown {
  const tradeValue = quantity * price;
  const isBuy = side === 'BUY';

  let brokerage = 0;
  if (template.brokerageType === 'flat_per_order') brokerage = template.brokerageFlat;
  else if (template.brokerageType === 'percent') brokerage = (tradeValue * template.brokeragePercent) / 100;
  if (tradeValue <= 0) brokerage = 0;

  const stt = (tradeValue * (isBuy ? template.sttBuyPct : template.sttSellPct)) / 100;
  const exchangeCharges = (tradeValue * template.exchangeChargesPct) / 100;
  const sebiFee = (tradeValue / 1000000) * template.sebiFeePer10L;
  const stampDuty = isBuy ? (tradeValue * template.stampDutyBuyPct) / 100 : 0;
  const gst = ((brokerage + exchangeCharges + sebiFee) * template.gstPct) / 100;
  const dpCharges = !isBuy && tradeValue > 0 ? template.dpCharges : 0;

  const parts = {
    brokerage: round2(brokerage),
    stt: round2(stt),
    exchangeCharges: round2(exchangeCharges),
    sebiFee: round2(sebiFee),
    stampDuty: round2(stampDuty),
    gst: round2(gst),
    dpCharges: round2(dpCharges),
    otherCharges: 0,
  };
  const totalCharges = round2(brokerage + stt + exchangeCharges + sebiFee + stampDuty + gst + dpCharges);
  return { ...parts, totalCharges, netAmount: netAmountFor(side, tradeValue, totalCharges) };
}

export function netAmountFor(side: TradeSide, tradeValue: number, totalCharges: number): number {
  return round2(side === 'BUY' ? tradeValue + totalCharges : tradeValue - totalCharges);
}

/**
 * A manual override replaces the itemised breakdown with a single total, recorded
 * under "other charges" so the totals in Reports still add up.
 */
export function manualCharges(side: TradeSide, quantity: number, price: number, total: number): ChargeBreakdown {
  const totalCharges = round2(total);
  return {
    brokerage: 0,
    stt: 0,
    exchangeCharges: 0,
    sebiFee: 0,
    stampDuty: 0,
    gst: 0,
    dpCharges: 0,
    otherCharges: totalCharges,
    totalCharges,
    netAmount: netAmountFor(side, quantity * price, totalCharges),
  };
}

export const CHARGE_FIELDS = [
  ['brokerage', 'Brokerage'],
  ['stt', 'STT'],
  ['exchangeCharges', 'Exchange charges'],
  ['sebiFee', 'SEBI fee'],
  ['stampDuty', 'Stamp duty'],
  ['gst', 'GST'],
  ['dpCharges', 'DP charges'],
  ['otherCharges', 'Other'],
] as const satisfies readonly (readonly [keyof Transaction & keyof ChargeBreakdown, string])[];

export type ChargeTotals = Record<(typeof CHARGE_FIELDS)[number][0] | 'totalCharges', number>;

export function sumCharges(txns: Transaction[]): ChargeTotals {
  const totals: ChargeTotals = {
    brokerage: 0,
    stt: 0,
    exchangeCharges: 0,
    sebiFee: 0,
    stampDuty: 0,
    gst: 0,
    dpCharges: 0,
    otherCharges: 0,
    totalCharges: 0,
  };
  for (const t of txns) {
    for (const [key] of CHARGE_FIELDS) totals[key] += t[key];
    totals.totalCharges += t.totalCharges;
  }
  return totals;
}

import { calculateCharges } from '../../domain/charges';
import type { AppData, ChargeTemplate, ImportedFill, Instrument, ProductType, Transaction, TxnSource } from '../../domain/types';

/** One executed trade (fill) as reported by the broker. */
export interface BrokerFill extends ImportedFill {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  isin?: string;
  date: string; // YYYY-MM-DD
}

export interface ImportOptions {
  portfolioId: string;
  deliveryTemplate?: ChargeTemplate;
  intradayTemplate?: ChargeTemplate;
  source: Exclude<TxnSource, 'manual'>;
  newId: (prefix: string) => string;
}

export interface ImportPlan {
  newInstruments: Instrument[];
  /** Transactions to add or replace (matched by id). */
  upserts: Transaction[];
  /** Previously imported transactions superseded by a rebuilt day. */
  removeIds: string[];
  newFills: number;
  duplicateFills: number;
  /** Days × symbols that were (re)built. */
  groups: number;
  dateRange: { from: string; to: string } | null;
}

const isImported = (t: Transaction) => !!t.importedFills?.length && t.source !== undefined && t.source !== 'manual';

/** Finds an instrument by ISIN (preferred) or symbol + exchange; NSE and BSE listings of one ISIN share an instrument. */
export function matchInstrument(instruments: Instrument[], fill: { symbol: string; exchange: string; isin?: string }): Instrument | undefined {
  if (fill.isin) {
    const byIsin = instruments.find((i) => i.isin && i.isin === fill.isin);
    if (byIsin) return byIsin;
  }
  return (
    instruments.find((i) => i.symbol === fill.symbol && i.exchange === fill.exchange) ??
    instruments.find((i) => i.symbol === fill.symbol && !fill.isin)
  );
}

export function newInstrumentFor(fill: { symbol: string; exchange: 'NSE' | 'BSE'; isin?: string }, id: string): Instrument {
  const etf = /BEES$|ETF$|IETF$/i.test(fill.symbol) || (fill.isin?.startsWith('INF') ?? false);
  return {
    id,
    symbol: fill.symbol,
    exchange: fill.exchange,
    isin: fill.isin,
    companyName: fill.symbol,
    type: etf ? 'etf' : 'equity',
    sector: etf ? 'Index ETF' : undefined,
    marketCapBucket: 'unknown',
  };
}

const vwap = (fills: ImportedFill[]) => {
  const qty = fills.reduce((s, f) => s + f.quantity, 0);
  return qty > 0 ? fills.reduce((s, f) => s + f.quantity * f.price, 0) / qty : 0;
};

const earliestTime = (fills: ImportedFill[]) => fills.map((f) => f.time).filter(Boolean).sort()[0];

/**
 * Turns broker fills into transactions for one portfolio.
 *
 * Fills are merged per day, instrument and side (one transaction each), because
 * Indian tax treats any same-day buy and sell of a stock as intraday regardless of
 * the product used: the matched quantity becomes an MIS buy + MIS sell, and the rest
 * stays delivery (CNC). Fills already imported are skipped by trade ID, so the same
 * tradebook or sync can be applied any number of times. When new fills arrive for a
 * day that was imported before, that day is rebuilt from all its fills while keeping
 * the reason, notes and tags you added.
 */
export function planImport(fills: BrokerFill[], data: AppData, opts: ImportOptions): ImportPlan {
  const portfolioTxns = data.transactions.filter((t) => t.portfolioId === opts.portfolioId);
  const known = new Set(portfolioTxns.flatMap((t) => t.importedFills?.map((f) => f.id) ?? []));
  const instruments = [...data.instruments];
  const newInstruments: Instrument[] = [];

  let duplicateFills = 0;
  const fresh: (BrokerFill & { instrumentId: string })[] = [];
  for (const f of fills) {
    if (known.has(f.id)) {
      duplicateFills++;
      continue;
    }
    known.add(f.id);
    let inst = matchInstrument(instruments, f);
    if (!inst) {
      inst = newInstrumentFor(f, opts.newId('in'));
      instruments.push(inst);
      newInstruments.push(inst);
    } else if (!inst.isin && f.isin) {
      // Remember the ISIN so later imports match even if the symbol changes.
      const updated = { ...inst, isin: f.isin };
      instruments[instruments.indexOf(inst)] = updated;
      if (!newInstruments.includes(inst)) newInstruments.push(updated);
      inst = updated;
    }
    fresh.push({ ...f, instrumentId: inst.id });
  }

  const groupKey = (instrumentId: string, date: string) => `${instrumentId}|${date}`;
  const groups = new Map<string, { instrumentId: string; date: string; fills: ImportedFill[]; previous: Transaction[] }>();
  for (const f of fresh) {
    const key = groupKey(f.instrumentId, f.date);
    if (!groups.has(key)) {
      const previous = portfolioTxns.filter((t) => isImported(t) && t.instrumentId === f.instrumentId && t.tradeDate === f.date);
      groups.set(key, { instrumentId: f.instrumentId, date: f.date, fills: previous.flatMap((t) => t.importedFills ?? []), previous });
    }
    const { id, orderId, side, quantity, price, time } = f;
    groups.get(key)!.fills.push({ id, orderId, side, quantity, price, time });
  }

  const upserts: Transaction[] = [];
  const removeIds: string[] = [];
  for (const g of groups.values()) {
    const buys = g.fills.filter((f) => f.side === 'BUY');
    const sells = g.fills.filter((f) => f.side === 'SELL');
    const buyQty = buys.reduce((s, f) => s + f.quantity, 0);
    const sellQty = sells.reduce((s, f) => s + f.quantity, 0);
    const intraday = Math.min(buyQty, sellQty);
    const parts: { side: 'BUY' | 'SELL'; product: ProductType; qty: number; price: number; fills: ImportedFill[] }[] = [];
    const add = (side: 'BUY' | 'SELL', product: ProductType, qty: number, sideFills: ImportedFill[], carriesFills: boolean) => {
      if (qty > 1e-9) parts.push({ side, product, qty, price: vwap(sideFills), fills: carriesFills ? sideFills : [] });
    };
    // Each side's fills are stored on one of its transactions so re-imports can rebuild the day.
    add('BUY', 'MIS', intraday, buys, buyQty - intraday <= 1e-9);
    add('BUY', 'CNC', buyQty - intraday, buys, true);
    add('SELL', 'MIS', intraday, sells, sellQty - intraday <= 1e-9);
    add('SELL', 'CNC', sellQty - intraday, sells, true);

    const reused = new Set<string>();
    for (const p of parts) {
      const prev = g.previous.find((t) => t.type === p.side && t.productType === p.product && !reused.has(t.id));
      if (prev) reused.add(prev.id);
      const template = p.product === 'MIS' ? opts.intradayTemplate : opts.deliveryTemplate;
      const charges = template
        ? calculateCharges(template, p.side, p.qty, p.price)
        : { brokerage: 0, stt: 0, exchangeCharges: 0, sebiFee: 0, stampDuty: 0, gst: 0, dpCharges: 0, otherCharges: 0, totalCharges: 0, netAmount: p.qty * p.price };
      const sideFills = p.side === 'BUY' ? buys : sells;
      upserts.push({
        id: prev?.id ?? opts.newId('txn'),
        portfolioId: opts.portfolioId,
        instrumentId: g.instrumentId,
        type: p.side,
        tradeDate: g.date,
        tradeTime: earliestTime(sideFills),
        quantity: p.qty,
        price: p.price,
        productType: p.product,
        ...charges,
        orderRef: [...new Set(sideFills.map((f) => f.orderId).filter(Boolean))].join(', ') || undefined,
        reason: prev?.reason,
        notes: prev?.notes,
        tags: prev?.tags,
        chargeTemplateId: template?.id,
        source: prev?.source ?? opts.source,
        importedFills: p.fills,
      });
    }
    for (const t of g.previous) if (!reused.has(t.id)) removeIds.push(t.id);
  }

  const dates = fresh.map((f) => f.date).sort();
  return {
    newInstruments,
    upserts,
    removeIds,
    newFills: fresh.length,
    duplicateFills,
    groups: groups.size,
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  };
}

/** Applies a plan to app data (pure; used by the data context). */
export function applyImportPlan(data: AppData, plan: Pick<ImportPlan, 'newInstruments' | 'upserts' | 'removeIds'>): AppData {
  const instruments = [...data.instruments];
  for (const inst of plan.newInstruments) {
    const i = instruments.findIndex((x) => x.id === inst.id);
    if (i >= 0) instruments[i] = inst;
    else instruments.push(inst);
  }
  const remove = new Set(plan.removeIds);
  const byId = new Map(plan.upserts.map((t) => [t.id, t]));
  const transactions = data.transactions.filter((t) => !remove.has(t.id)).map((t) => byId.get(t.id) ?? t);
  for (const t of plan.upserts) if (!data.transactions.some((x) => x.id === t.id)) transactions.push(t);
  return { ...data, instruments, transactions };
}

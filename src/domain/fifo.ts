import type { GainClassification, Lot, ProductType, RealizedTrade, Transaction, TxnType } from './types';

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Transaction types that create a new FIFO lot. */
export const LOT_CREATING_TYPES: TxnType[] = ['BUY', 'IPO_ALLOTMENT', 'TRANSFER_IN', 'GIFT', 'RIGHTS'];
/** Transaction types that consume lots (oldest first). */
export const LOT_CONSUMING_TYPES: TxnType[] = ['SELL', 'TRANSFER_OUT'];

const MS_PER_DAY = 86400000;

/** Whole days from `fromDate` to `toDate` (YYYY-MM-DD or ISO strings). */
export function daysBetween(fromDate: string, toDate: string): number {
  return Math.floor((Date.parse(toDate) - Date.parse(fromDate)) / MS_PER_DAY);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Indian financial year (1 April – 31 March), e.g. 2025-05-10 → "FY2025-26". */
export function getFY(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1; // 0-indexed, April = 3
  const start = month >= 3 ? year : year - 1;
  return `FY${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** First and last calendar day of an FY label such as "FY2025-26". */
export function fyRange(fy: string): { start: string; end: string } {
  const start = Number(fy.slice(2, 6));
  return { start: `${start}-04-01`, end: `${start + 1}-03-31` };
}

export function classifyGain(productType: ProductType, holdingDays: number): GainClassification {
  if (productType === 'MIS') return 'intraday';
  if (holdingDays <= 0) return 'intraday';
  if (holdingDays <= 365) return 'stcg';
  return 'ltcg';
}

const TYPE_ORDER: Record<TxnType, number> = {
  BUY: 0,
  IPO_ALLOTMENT: 0,
  TRANSFER_IN: 0,
  GIFT: 0,
  RIGHTS: 0,
  BONUS: 1,
  SPLIT: 1,
  MERGER: 1,
  DEMERGER: 1,
  SELL: 2,
  TRANSFER_OUT: 2,
};

/** Chronological order; on the same day, acquisitions run before corporate actions and sells. */
export function sortTransactions(txns: Transaction[]): Transaction[] {
  return txns
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        a.t.tradeDate.localeCompare(b.t.tradeDate) ||
        (a.t.tradeTime ?? '').localeCompare(b.t.tradeTime ?? '') ||
        TYPE_ORDER[a.t.type] - TYPE_ORDER[b.t.type] ||
        a.i - b.i,
    )
    .map((x) => x.t);
}

export function createLot(txn: Transaction): Lot {
  const costBasis = txn.quantity * txn.price + txn.totalCharges;
  return {
    id: `lot_${txn.id}`,
    instrumentId: txn.instrumentId,
    portfolioId: txn.portfolioId,
    buyTxnId: txn.id,
    buyDate: txn.tradeDate,
    originalQty: txn.quantity,
    remainingQty: txn.quantity,
    buyPrice: txn.price,
    buyCharges: txn.totalCharges,
    costBasis,
    perShareCost: txn.quantity > 0 ? costBasis / txn.quantity : 0,
    productType: txn.productType,
  };
}

/**
 * Lots a sell draws from, in order. Intraday (MIS) sells square off the same day's
 * buys first; everything else is strict FIFO by buy date.
 */
function consumptionOrder(queue: Lot[], txn: Transaction): Lot[] {
  if (txn.productType !== 'MIS') return queue;
  const sameDay = queue.filter((l) => l.buyDate === txn.tradeDate);
  return [...sameDay, ...queue.filter((l) => l.buyDate !== txn.tradeDate)];
}

export interface FifoIssue {
  txnId: string;
  message: string;
}

export interface FifoResult {
  /** All lots ever created, with their remaining quantity after every transaction. */
  lots: Lot[];
  realized: RealizedTrade[];
  issues: FifoIssue[];
}

const EPS = 1e-9;
const lotKey = (portfolioId: string, instrumentId: string) => `${portfolioId}|${instrumentId}`;

/**
 * Instruments whose lots depend on each other through demergers (the new company's
 * shares come from the parent's lots), including `instrumentId` itself.
 */
export function linkedInstrumentIds(transactions: Transaction[], instrumentId: string): Set<string> {
  const ids = new Set([instrumentId]);
  const links = transactions.filter((t) => t.type === 'DEMERGER' && t.demergedInstrumentId);
  for (let grew = true; grew; ) {
    grew = false;
    for (const t of links) {
      const has = ids.has(t.instrumentId);
      if (has !== ids.has(t.demergedInstrumentId!)) {
        ids.add(has ? t.demergedInstrumentId! : t.instrumentId);
        grew = true;
      }
    }
  }
  return ids;
}

/** Transactions needed to replay one instrument's lots in a portfolio. */
export function transactionsFor(transactions: Transaction[], portfolioId: string, instrumentId: string): Transaction[] {
  const ids = linkedInstrumentIds(transactions, instrumentId);
  return transactions.filter((t) => t.portfolioId === portfolioId && ids.has(t.instrumentId));
}

/**
 * Replays transactions and returns lots and realized trades. Lots are tracked per
 * portfolio (demat account) and instrument; sells consume the oldest lot first.
 *
 * A DEMERGER moves `costSharePct` % of each open parent lot's cost into a lot of the
 * new company, keeping the original buy date (the holding period carries over for tax).
 * MERGER, and a DEMERGER without a new company, are kept for the record only.
 */
export function applyFIFO(transactions: Transaction[]): FifoResult {
  const queues = new Map<string, Lot[]>();
  const lots: Lot[] = [];
  const realized: RealizedTrade[] = [];
  const issues: FifoIssue[] = [];

  for (const txn of sortTransactions(transactions)) {
    const key = lotKey(txn.portfolioId, txn.instrumentId);
    const queue = queues.get(key) ?? [];
    queues.set(key, queue);

    if (LOT_CREATING_TYPES.includes(txn.type)) {
      const lot = createLot(txn);
      queue.push(lot);
      lots.push(lot);
      continue;
    }

    if (txn.type === 'BONUS') {
      if (!(txn.price > 0)) {
        issues.push({ txnId: txn.id, message: 'Bonus ratio needs a non-zero "price" (held shares).' });
        continue;
      }
      const ratio = txn.quantity / txn.price;
      for (const lot of queue) {
        if (lot.remainingQty <= EPS) continue;
        const added = lot.remainingQty * ratio;
        lot.remainingQty += added;
        lot.originalQty += lot.originalQty * ratio;
        lot.buyPrice = lot.buyPrice / (1 + ratio);
        lot.perShareCost = lot.costBasis / lot.remainingQty;
      }
      continue;
    }

    if (txn.type === 'DEMERGER' && txn.demergedInstrumentId) {
      const ratio = txn.price > 0 ? txn.quantity / txn.price : 0;
      const share = (txn.costSharePct ?? 0) / 100;
      if (!(ratio > 0) || !(share >= 0 && share < 1)) {
        issues.push({ txnId: txn.id, message: 'Demerger needs a share ratio above 0 and a cost share from 0 to under 100%.' });
        continue;
      }
      const childKey = lotKey(txn.portfolioId, txn.demergedInstrumentId);
      const childQueue = queues.get(childKey) ?? [];
      queues.set(childKey, childQueue);
      for (const lot of queue) {
        if (lot.remainingQty <= EPS) continue;
        const qty = lot.remainingQty * ratio;
        const cost = lot.costBasis * share;
        const charges = lot.buyCharges * share;
        const child: Lot = {
          id: `lot_${txn.id}_${lot.id}`,
          instrumentId: txn.demergedInstrumentId,
          portfolioId: txn.portfolioId,
          buyTxnId: lot.buyTxnId,
          buyDate: lot.buyDate,
          originalQty: qty,
          remainingQty: qty,
          buyPrice: (lot.buyPrice * lot.remainingQty * share) / qty,
          buyCharges: charges,
          costBasis: cost,
          perShareCost: cost / qty,
          productType: lot.productType,
        };
        lot.costBasis -= cost;
        lot.buyCharges -= charges;
        lot.buyPrice *= 1 - share;
        lot.perShareCost = lot.costBasis / lot.remainingQty;
        childQueue.push(child);
        lots.push(child);
      }
      // Inherited lots keep their old buy dates; keep the new company's queue oldest first.
      childQueue.sort((a, b) => a.buyDate.localeCompare(b.buyDate));
      continue;
    }

    if (txn.type === 'SPLIT') {
      const ratio = txn.price;
      if (!(ratio > 0)) {
        issues.push({ txnId: txn.id, message: 'Split ratio ("price") must be greater than 0.' });
        continue;
      }
      for (const lot of queue) {
        if (lot.remainingQty <= EPS) continue;
        lot.remainingQty *= ratio;
        lot.originalQty *= ratio;
        lot.buyPrice /= ratio;
        lot.perShareCost = lot.costBasis / lot.remainingQty;
      }
      continue;
    }

    if (LOT_CONSUMING_TYPES.includes(txn.type)) {
      let toSell = txn.quantity;
      const sellNetPerShare = txn.quantity > 0 ? txn.netAmount / txn.quantity : 0;
      for (const lot of consumptionOrder(queue, txn)) {
        if (toSell <= EPS) break;
        if (lot.remainingQty <= EPS) continue;
        const take = Math.min(lot.remainingQty, toSell);
        const fraction = take / lot.remainingQty;
        const buyCost = take * lot.perShareCost;
        lot.buyCharges -= lot.buyCharges * fraction;
        lot.costBasis -= buyCost;
        lot.remainingQty -= take;
        if (lot.remainingQty <= EPS) {
          lot.remainingQty = 0;
          lot.costBasis = 0;
          lot.buyCharges = 0;
        }
        toSell -= take;

        if (txn.type === 'SELL') {
          const sellValue = take * sellNetPerShare;
          const gain = sellValue - buyCost;
          const holdingDays = daysBetween(lot.buyDate, txn.tradeDate);
          realized.push({
            id: `rt_${txn.id}_${lot.id}`,
            instrumentId: txn.instrumentId,
            portfolioId: txn.portfolioId,
            lotId: lot.id,
            sellTxnId: txn.id,
            buyDate: lot.buyDate,
            sellDate: txn.tradeDate,
            quantity: take,
            buyCost,
            sellValue,
            gain,
            gainPct: buyCost > 0 ? (gain / buyCost) * 100 : 0,
            holdingDays,
            classification: classifyGain(txn.productType, holdingDays),
            productType: txn.productType,
          });
        }
      }
      if (toSell > EPS) {
        issues.push({
          txnId: txn.id,
          message: `Oversold by ${round2(toSell)} shares — not enough quantity held on ${txn.tradeDate}.`,
        });
      }
    }
  }

  return { lots, realized, issues };
}

/** Quantity of an instrument held in a portfolio on a date (inclusive), ignoring `excludeTxnId`. */
export function availableQuantity(
  transactions: Transaction[],
  portfolioId: string,
  instrumentId: string,
  onDate: string,
  excludeTxnId?: string,
): number {
  const relevant = transactionsFor(transactions, portfolioId, instrumentId).filter((t) => t.tradeDate <= onDate && t.id !== excludeTxnId);
  return applyFIFO(relevant)
    .lots.filter((l) => l.instrumentId === instrumentId)
    .reduce((s, l) => s + l.remainingQty, 0);
}

export interface SellPreview {
  consumed: { lot: Lot; quantity: number; buyCost: number; holdingDays: number; classification: GainClassification }[];
  available: number;
  shortfall: number;
  totalBuyCost: number;
  estimatedGain: number;
  byClass: Record<GainClassification, number>;
}

/** Which lots a prospective sell would consume, without changing any data. */
export function previewSell(
  transactions: Transaction[],
  draft: Transaction,
  excludeTxnId?: string,
): SellPreview {
  const prior = transactionsFor(transactions, draft.portfolioId, draft.instrumentId).filter(
    (t) => t.id !== excludeTxnId && sortTransactions([t, draft])[0] === t,
  );
  const { lots } = applyFIFO(prior);
  const open = lots.filter((l) => l.instrumentId === draft.instrumentId && l.remainingQty > EPS);
  const available = open.reduce((s, l) => s + l.remainingQty, 0);
  const byClass: Record<GainClassification, number> = { intraday: 0, stcg: 0, ltcg: 0 };
  const consumed: SellPreview['consumed'] = [];
  const sellNetPerShare = draft.quantity > 0 ? draft.netAmount / draft.quantity : 0;
  let toSell = draft.quantity;
  let totalBuyCost = 0;
  let estimatedGain = 0;
  for (const lot of consumptionOrder(open, draft)) {
    if (toSell <= EPS) break;
    const take = Math.min(lot.remainingQty, toSell);
    const buyCost = take * lot.perShareCost;
    const holdingDays = daysBetween(lot.buyDate, draft.tradeDate);
    const classification = classifyGain(draft.productType, holdingDays);
    const gain = take * sellNetPerShare - buyCost;
    consumed.push({ lot, quantity: take, buyCost, holdingDays, classification });
    byClass[classification] += gain;
    totalBuyCost += buyCost;
    estimatedGain += gain;
    toSell -= take;
  }
  return { consumed, available, shortfall: Math.max(0, toSell), totalBuyCost, estimatedGain, byClass };
}

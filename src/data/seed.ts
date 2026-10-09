import { calculateCharges, DEFAULT_CHARGE_TEMPLATES } from '../domain/charges';
import { DEFAULT_TAX_RULES } from '../domain/tax';
import type {
  AppData,
  ChargeTemplate,
  Dividend,
  Instrument,
  Portfolio,
  PriceQuote,
  ProductType,
  Transaction,
  TxnType,
} from '../domain/types';

export const DATA_VERSION = 1;

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    portfolios: [],
    instruments: [],
    transactions: [],
    dividends: [],
    quotes: [],
    chargeTemplates: DEFAULT_CHARGE_TEMPLATES.map((t) => ({ ...t })),
    taxRules: DEFAULT_TAX_RULES.map((r) => ({ ...r })),
    settings: { privacyMode: false, defaultChargeTemplateId: DEFAULT_CHARGE_TEMPLATES[0].id },
  };
}

/** Fills in anything missing from older or hand-edited data so the app never crashes on load. */
export function normalizeData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Not a valid backup file.');
  const d = raw as Partial<AppData>;
  const arrays = ['portfolios', 'instruments', 'transactions', 'dividends', 'quotes'] as const;
  for (const key of arrays) {
    if (d[key] !== undefined && !Array.isArray(d[key])) throw new Error(`"${key}" must be a list.`);
  }
  const base = emptyData();
  return {
    version: DATA_VERSION,
    portfolios: d.portfolios ?? [],
    instruments: d.instruments ?? [],
    transactions: d.transactions ?? [],
    dividends: d.dividends ?? [],
    quotes: d.quotes ?? [],
    chargeTemplates: d.chargeTemplates?.length ? d.chargeTemplates : base.chargeTemplates,
    taxRules: d.taxRules?.length ? d.taxRules : base.taxRules,
    settings: { ...base.settings, ...(d.settings ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_PORTFOLIOS: Portfolio[] = [
  { id: 'pf_main', name: 'Main Portfolio', owner: 'Self', broker: 'Zerodha', baseCurrency: 'INR', createdAt: '2023-04-01T00:00:00.000Z' },
  { id: 'pf_spouse', name: 'Spouse Portfolio', owner: 'Spouse', broker: 'Groww', baseCurrency: 'INR', createdAt: '2023-10-01T00:00:00.000Z' },
];

const SEED_INSTRUMENTS: Instrument[] = [
  { id: 'in_reliance', symbol: 'RELIANCE', exchange: 'NSE', isin: 'INE002A01018', companyName: 'Reliance Industries Ltd', type: 'equity', sector: 'Energy', industry: 'Oil, Gas & Consumable Fuels', marketCapBucket: 'large' },
  { id: 'in_tcs', symbol: 'TCS', exchange: 'NSE', isin: 'INE467B01029', companyName: 'Tata Consultancy Services Ltd', type: 'equity', sector: 'IT', industry: 'IT Services & Consulting', marketCapBucket: 'large' },
  { id: 'in_infy', symbol: 'INFY', exchange: 'NSE', isin: 'INE009A01021', companyName: 'Infosys Ltd', type: 'equity', sector: 'IT', industry: 'IT Services & Consulting', marketCapBucket: 'large' },
  { id: 'in_hdfcbank', symbol: 'HDFCBANK', exchange: 'NSE', isin: 'INE040A01034', companyName: 'HDFC Bank Ltd', type: 'equity', sector: 'Financials', industry: 'Private Sector Bank', marketCapBucket: 'large' },
  { id: 'in_itc', symbol: 'ITC', exchange: 'NSE', isin: 'INE154A01025', companyName: 'ITC Ltd', type: 'equity', sector: 'FMCG', industry: 'Diversified FMCG', marketCapBucket: 'large' },
  { id: 'in_tatasteel', symbol: 'TATASTEEL', exchange: 'NSE', isin: 'INE081A01020', companyName: 'Tata Steel Ltd', type: 'equity', sector: 'Metals', industry: 'Iron & Steel', marketCapBucket: 'large' },
  { id: 'in_wipro', symbol: 'WIPRO', exchange: 'NSE', isin: 'INE075A01022', companyName: 'Wipro Ltd', type: 'equity', sector: 'IT', industry: 'IT Services & Consulting', marketCapBucket: 'large' },
  { id: 'in_niftybees', symbol: 'NIFTYBEES', exchange: 'NSE', isin: 'INF204KB14I2', companyName: 'Nippon India ETF Nifty 50 BeES', type: 'etf', sector: 'Index ETF', industry: 'Exchange Traded Fund', marketCapBucket: 'large' },
  { id: 'in_zomato', symbol: 'ZOMATO', exchange: 'NSE', isin: 'INE758T01015', companyName: 'Eternal Ltd (Zomato)', type: 'equity', sector: 'Consumer Services', industry: 'E-Retail / E-Commerce', marketCapBucket: 'large' },
  { id: 'in_tatamotors', symbol: 'TATAMOTORS', exchange: 'NSE', isin: 'INE155A01022', companyName: 'Tata Motors Ltd', type: 'equity', sector: 'Automobile', industry: 'Passenger Cars & Utility Vehicles', marketCapBucket: 'large' },
];

type SeedRow = [
  portfolioId: string,
  instrumentId: string,
  type: TxnType,
  tradeDate: string,
  quantity: number,
  price: number,
  reason: string,
  productType?: ProductType,
];

/** Sample trades across FY 2023-24, 2024-25 and 2025-26. Prices are illustrative. */
const SEED_TRADES: SeedRow[] = [
  ['pf_main', 'in_reliance', 'BUY', '2023-04-12', 20, 2340, 'Core holding: refining cash flows funding Jio and Retail growth.'],
  ['pf_main', 'in_tcs', 'BUY', '2023-05-08', 10, 3210, 'Quality IT compounder after a 15% correction from highs.'],
  ['pf_main', 'in_infy', 'BUY', '2023-06-15', 25, 1290, 'Guidance cut priced in; valuation below 5-year average.'],
  ['pf_main', 'in_hdfcbank', 'BUY', '2023-07-20', 30, 1640, 'Merger with HDFC Ltd completed; long-term banking compounder.'],
  ['pf_main', 'in_itc', 'BUY', '2023-08-10', 100, 445, 'Dividend yield plus hotel demerger optionality.'],
  ['pf_main', 'in_tatasteel', 'BUY', '2023-09-05', 200, 128, 'Cyclical bet on China stimulus and steel price recovery.'],
  ['pf_spouse', 'in_infy', 'BUY', '2023-10-03', 15, 1450, 'Starting a monthly IT allocation for the spouse account.'],
  ['pf_main', 'in_niftybees', 'BUY', '2023-11-22', 150, 215, 'Index core: low-cost Nifty 50 exposure.'],
  ['pf_main', 'in_tatasteel', 'SELL', '2024-01-18', 100, 138, 'Booked half after the stimulus rally to de-risk.'],
  ['pf_main', 'in_zomato', 'BUY', '2024-02-14', 300, 140, 'Food delivery turned profitable; Blinkit quick-commerce upside.'],
  ['pf_main', 'in_wipro', 'BUY', '2024-03-12', 100, 520, 'Intraday breakout above 515 resistance.', 'MIS'],
  ['pf_main', 'in_wipro', 'SELL', '2024-03-12', 100, 524, 'Target hit intraday; squared off.', 'MIS'],
  ['pf_spouse', 'in_itc', 'BUY', '2024-04-16', 150, 428, 'Defensive dividend stock for the spouse account.'],
  ['pf_main', 'in_tatamotors', 'BUY', '2024-05-20', 50, 960, 'JLR margin expansion and EV leadership in India.'],
  ['pf_main', 'in_zomato', 'SELL', '2024-06-24', 150, 195, 'Took out initial capital after a 39% run-up.'],
  ['pf_main', 'in_tcs', 'BUY', '2024-08-08', 5, 4300, 'Added on deal-win momentum.'],
  ['pf_main', 'in_infy', 'SELL', '2024-09-30', 10, 1930, 'Trimmed after a 50% gain; position too large.'],
  ['pf_main', 'in_reliance', 'BONUS', '2024-10-28', 1, 1, '1:1 bonus issue.'],
  ['pf_main', 'in_wipro', 'BONUS', '2024-12-03', 1, 1, '1:1 bonus issue (no shares held at the time).'],
  ['pf_main', 'in_tatamotors', 'SELL', '2024-12-16', 50, 780, 'Stop-loss: JLR demand slowdown and tariff risk.'],
  ['pf_main', 'in_niftybees', 'BUY', '2025-01-27', 100, 255, 'Added to index core on a 10% market correction.'],
  ['pf_spouse', 'in_infy', 'SELL', '2025-02-10', 15, 1850, 'Long-term gain harvested within the ₹1.25L exemption.'],
  ['pf_main', 'in_tatasteel', 'SELL', '2025-04-22', 100, 140, 'Exited remaining steel; better opportunities elsewhere.'],
  ['pf_spouse', 'in_reliance', 'BUY', '2025-06-18', 25, 1420, 'Post-bonus entry; Jio IPO a potential re-rating trigger.'],
  ['pf_main', 'in_hdfcbank', 'BONUS', '2025-08-26', 1, 1, '1:1 bonus issue.'],
  ['pf_main', 'in_itc', 'SELL', '2025-11-10', 100, 405, 'Thesis broken after demerger; harvested the long-term loss.'],
  ['pf_spouse', 'in_zomato', 'BUY', '2025-12-08', 200, 300, 'Quick commerce scaling faster than expected.'],
  ['pf_main', 'in_wipro', 'BUY', '2026-02-05', 80, 245, 'Mean reversion after bonus-adjusted underperformance.'],
];

const SEED_QUOTES: [string, number, number][] = [
  ['in_reliance', 1452.3, 1438.9],
  ['in_tcs', 3085.0, 3110.4],
  ['in_infy', 1528.6, 1512.2],
  ['in_hdfcbank', 1012.4, 1004.1],
  ['in_itc', 412.15, 415.5],
  ['in_tatasteel', 168.4, 165.2],
  ['in_wipro', 252.6, 255.1],
  ['in_niftybees', 288.4, 287.1],
  ['in_zomato', 318.0, 309.5],
  ['in_tatamotors', 705.0, 712.3],
];

export function buildTransaction(
  base: Omit<Transaction, 'id' | 'brokerage' | 'stt' | 'exchangeCharges' | 'sebiFee' | 'stampDuty' | 'gst' | 'dpCharges' | 'otherCharges' | 'totalCharges' | 'netAmount'>,
  template: ChargeTemplate | undefined,
  id = uid('txn'),
): Transaction {
  const side = base.type === 'SELL' || base.type === 'TRANSFER_OUT' ? 'SELL' : 'BUY';
  const charged = (base.type === 'BUY' || base.type === 'SELL') && template;
  const c = charged ? calculateCharges(template, side, base.quantity, base.price) : null;
  const value = base.quantity * base.price;
  return {
    id,
    ...base,
    brokerage: c?.brokerage ?? 0,
    stt: c?.stt ?? 0,
    exchangeCharges: c?.exchangeCharges ?? 0,
    sebiFee: c?.sebiFee ?? 0,
    stampDuty: c?.stampDuty ?? 0,
    gst: c?.gst ?? 0,
    dpCharges: c?.dpCharges ?? 0,
    otherCharges: 0,
    totalCharges: c?.totalCharges ?? 0,
    netAmount: c?.netAmount ?? (base.type === 'BONUS' || base.type === 'SPLIT' ? 0 : value),
    chargeTemplateId: c ? template?.id : undefined,
  };
}

export function seedData(): AppData {
  const data = emptyData();
  data.portfolios = SEED_PORTFOLIOS.map((p) => ({ ...p }));
  data.instruments = SEED_INSTRUMENTS.map((i) => ({ ...i }));
  const [zero, flat] = data.chargeTemplates;

  data.transactions = SEED_TRADES.map(([portfolioId, instrumentId, type, tradeDate, quantity, price, reason, productType], i) => {
    const template = productType === 'MIS' || portfolioId === 'pf_spouse' ? flat : zero;
    return buildTransaction(
      { portfolioId, instrumentId, type, tradeDate, quantity, price, productType: productType ?? 'CNC', reason, tradeTime: productType === 'MIS' ? (type === 'BUY' ? '09:40' : '14:55') : undefined, tags: productType === 'MIS' ? ['intraday'] : undefined },
      template,
      `txn_seed_${String(i + 1).padStart(2, '0')}`,
    );
  });

  const div = (id: string, instrumentId: string, portfolioId: string, recordDate: string, paymentDate: string, amountPerShare: number, shares: number): Dividend => {
    const gross = amountPerShare * shares;
    return { id, instrumentId, portfolioId, recordDate, paymentDate, amountPerShare, shares, gross, tds: 0, net: gross };
  };
  data.dividends = [
    div('div_seed_1', 'in_tcs', 'pf_main', '2024-01-19', '2024-02-05', 18, 10),
    div('div_seed_2', 'in_tatamotors', 'pf_main', '2024-06-11', '2024-07-05', 6, 50),
    div('div_seed_3', 'in_itc', 'pf_main', '2024-06-04', '2024-07-24', 7.5, 100),
    div('div_seed_4', 'in_tcs', 'pf_main', '2025-01-17', '2025-02-03', 76, 15),
  ];

  const now = new Date().toISOString();
  data.quotes = SEED_QUOTES.map(([instrumentId, price, previousClose]): PriceQuote => ({ instrumentId, price, previousClose, updatedAt: now }));
  return data;
}

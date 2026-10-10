export type TxnType =
  | 'BUY'
  | 'SELL'
  | 'BONUS'
  | 'SPLIT'
  | 'RIGHTS'
  | 'MERGER'
  | 'DEMERGER'
  | 'IPO_ALLOTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'GIFT';
export type ProductType = 'CNC' | 'MIS' | 'NRML';
export type InstrumentType = 'equity' | 'etf' | 'mf' | 'sgb' | 'reit' | 'invit';
export type MarketCapBucket = 'large' | 'mid' | 'small' | 'unknown';
export type GainClassification = 'intraday' | 'stcg' | 'ltcg';

export interface Portfolio {
  id: string;
  name: string;
  owner: string;
  broker?: string;
  accountLabel?: string;
  baseCurrency: string;
  createdAt: string;
}

export interface Instrument {
  id: string;
  symbol: string;
  exchange: 'NSE' | 'BSE' | 'OTHER';
  isin?: string;
  companyName: string;
  type: InstrumentType;
  sector?: string;
  industry?: string;
  marketCapBucket: MarketCapBucket;
  fmv31Jan2018?: number | null;
}

export interface Transaction {
  id: string;
  portfolioId: string;
  instrumentId: string;
  type: TxnType;
  tradeDate: string; // YYYY-MM-DD
  tradeTime?: string; // HH:mm
  quantity: number;
  price: number;
  productType: ProductType;
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
  orderRef?: string;
  notes?: string;
  tags?: string[];
  reason?: string;
  /** Template the charges were calculated from; absent when entered manually. */
  chargeTemplateId?: string;
  /** Where the transaction came from; absent means entered by hand. */
  source?: TxnSource;
  /** Broker fills merged into this transaction (used to skip duplicates on re-import). */
  importedFills?: ImportedFill[];
  /**
   * DEMERGER only: the new company's instrument. `quantity` new shares are received for
   * every `price` shares held, and `costSharePct` % of the cost moves to them.
   */
  demergedInstrumentId?: string;
  costSharePct?: number;
}

export type TxnSource = 'manual' | 'zerodha_csv' | 'kite';

export interface ImportedFill {
  /** Broker trade ID. */
  id: string;
  orderId?: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  time?: string;
}

export interface Lot {
  id: string;
  instrumentId: string;
  portfolioId: string;
  buyTxnId: string;
  buyDate: string;
  originalQty: number;
  remainingQty: number;
  buyPrice: number;
  /** Charges attributable to the remaining quantity. */
  buyCharges: number;
  /** Cost of the remaining quantity (reduced as the lot is consumed). */
  costBasis: number;
  perShareCost: number;
  productType?: ProductType;
}

export interface RealizedTrade {
  id: string;
  instrumentId: string;
  portfolioId: string;
  lotId: string;
  sellTxnId: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyCost: number;
  sellValue: number;
  gain: number;
  gainPct: number;
  holdingDays: number;
  classification: GainClassification;
  productType: ProductType;
}

export interface HoldingSummary {
  instrumentId: string;
  symbol: string;
  companyName: string;
  sector?: string;
  marketCapBucket: MarketCapBucket;
  quantity: number;
  avgBuyPrice: number;
  investedAmount: number;
  buyCharges: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  dayChange: number;
  dayChangePct: number;
  weight: number;
  lots: Lot[];
  isClosed: boolean;
  realizedPnL: number;
}

export interface Dividend {
  id: string;
  instrumentId: string;
  portfolioId: string;
  recordDate: string;
  paymentDate?: string;
  amountPerShare: number;
  shares: number;
  gross: number;
  tds: number;
  net: number;
}

export interface TaxRules {
  /** Rules apply to sales on or after this date (YYYY-MM-DD). */
  effectiveFrom: string;
  stcgRate: number; // %
  ltcgRate: number; // %
  ltcgExemption: number; // ₹ per FY
  cessRate: number; // %
  surchargeRate: number; // %
  grandfatheringDate: string; // YYYY-MM-DD
  financialYearStart: { month: number; day: number };
}

export interface ChargeTemplate {
  id: string;
  name: string;
  brokerageType: 'zero_delivery' | 'flat_per_order' | 'percent';
  brokerageFlat: number;
  brokeragePercent: number;
  sttBuyPct: number;
  sttSellPct: number;
  exchangeChargesPct: number;
  sebiFeePer10L: number;
  stampDutyBuyPct: number;
  gstPct: number;
  dpCharges: number;
  /** Upper limit on brokerage per order for the "percent" type (e.g. ₹20); 0 = no cap. */
  brokerageMax?: number;
}

export interface PriceQuote {
  instrumentId: string;
  price: number;
  previousClose: number;
  updatedAt: string;
}

export interface ZerodhaSettings {
  /** Kite Connect API key (public identifier; the secret stays on the auth server). */
  apiKey?: string;
  /** Base URL of the deployed auth worker, e.g. https://kite-auth.example.workers.dev */
  authServerUrl?: string;
  /** Portfolio that imported trades and holdings belong to. */
  portfolioId?: string;
  deliveryTemplateId?: string;
  intradayTemplateId?: string;
  lastSyncAt?: string;
}

export interface Settings {
  privacyMode: boolean;
  defaultChargeTemplateId: string;
  zerodha: ZerodhaSettings;
}

export interface AppData {
  version: number;
  portfolios: Portfolio[];
  instruments: Instrument[];
  transactions: Transaction[];
  dividends: Dividend[];
  quotes: PriceQuote[];
  chargeTemplates: ChargeTemplate[];
  /** Sorted by effectiveFrom; the latest entry is the one edited in Settings. */
  taxRules: TaxRules[];
  settings: Settings;
}

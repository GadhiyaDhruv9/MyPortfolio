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
}

export interface PriceQuote {
  instrumentId: string;
  price: number;
  previousClose: number;
  updatedAt: string;
}

export interface Settings {
  privacyMode: boolean;
  defaultChargeTemplateId: string;
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

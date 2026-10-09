import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { applyFIFO, type FifoResult } from '../domain/fifo';
import type {
  AppData,
  ChargeTemplate,
  Dividend,
  Instrument,
  Portfolio,
  PriceQuote,
  Settings,
  TaxRules,
  Transaction,
} from '../domain/types';
import { emptyData, loadData, normalizeData, saveData, seedData } from './store';

interface DataContextValue {
  data: AppData;
  ready: boolean;
  error: string | null;
  /** FIFO replay across all portfolios, recomputed whenever transactions change. */
  fifo: FifoResult;
  /** "All" when null. Shared by Dashboard, Holdings, Transactions and Reports. */
  selectedPortfolioId: string | null;
  setSelectedPortfolioId: (id: string | null) => void;

  upsertTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => void;
  upsertInstrument: (i: Instrument) => void;
  upsertPortfolio: (p: Portfolio) => void;
  upsertDividend: (d: Dividend) => void;
  deleteDividend: (id: string) => void;
  upsertQuote: (q: PriceQuote) => void;
  upsertChargeTemplate: (t: ChargeTemplate) => void;
  deleteChargeTemplate: (id: string) => void;
  updateTaxRules: (r: TaxRules) => void;
  updateSettings: (s: Partial<Settings>) => void;
  replaceAll: (raw: unknown) => void;
  clearAll: () => void;
  resetToSample: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    loadData()
      .then((d) => {
        setData(d);
        loaded.current = true;
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setReady(true));
  }, []);

  // Persist every change after the initial load.
  useEffect(() => {
    if (!loaded.current) return;
    saveData(data).catch((e: unknown) => setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`));
  }, [data]);

  const fifo = useMemo(() => applyFIFO(data.transactions), [data.transactions]);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    loaded.current = true;
    setData(fn);
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      ready,
      error,
      fifo,
      selectedPortfolioId,
      setSelectedPortfolioId,
      upsertTransaction: (t) => update((d) => ({ ...d, transactions: upsert(d.transactions, t) })),
      deleteTransaction: (id) => update((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) })),
      upsertInstrument: (i) => update((d) => ({ ...d, instruments: upsert(d.instruments, i) })),
      upsertPortfolio: (p) => update((d) => ({ ...d, portfolios: upsert(d.portfolios, p) })),
      upsertDividend: (x) => update((d) => ({ ...d, dividends: upsert(d.dividends, x) })),
      deleteDividend: (id) => update((d) => ({ ...d, dividends: d.dividends.filter((x) => x.id !== id) })),
      upsertQuote: (q) =>
        update((d) => {
          const others = d.quotes.filter((x) => x.instrumentId !== q.instrumentId);
          return { ...d, quotes: [...others, q] };
        }),
      upsertChargeTemplate: (t) => update((d) => ({ ...d, chargeTemplates: upsert(d.chargeTemplates, t) })),
      deleteChargeTemplate: (id) =>
        update((d) => {
          const chargeTemplates = d.chargeTemplates.filter((t) => t.id !== id);
          const settings =
            d.settings.defaultChargeTemplateId === id
              ? { ...d.settings, defaultChargeTemplateId: chargeTemplates[0]?.id ?? '' }
              : d.settings;
          return { ...d, chargeTemplates, settings };
        }),
      updateTaxRules: (r) =>
        update((d) => {
          const rules = [...d.taxRules].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
          const i = rules.findIndex((x) => x.effectiveFrom === r.effectiveFrom);
          if (i >= 0) rules[i] = r;
          else rules.push(r);
          return { ...d, taxRules: rules.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)) };
        }),
      updateSettings: (s) => update((d) => ({ ...d, settings: { ...d.settings, ...s } })),
      replaceAll: (raw) => {
        const next = normalizeData(raw);
        setSelectedPortfolioId(null);
        update(() => next);
      },
      clearAll: () => {
        setSelectedPortfolioId(null);
        update(() => emptyData());
      },
      resetToSample: () => {
        setSelectedPortfolioId(null);
        update(() => seedData());
      },
    }),
    [data, ready, error, fifo, selectedPortfolioId, update],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

export function useInstrumentMap(): Map<string, Instrument> {
  const { data } = useData();
  return useMemo(() => new Map(data.instruments.map((i) => [i.id, i])), [data.instruments]);
}

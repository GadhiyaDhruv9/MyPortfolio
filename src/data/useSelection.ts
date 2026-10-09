import { useMemo } from 'react';

import { computeHoldings, filterByPortfolio, portfolioTotals } from '../domain/holdings';
import { portfolioCashFlows, xirr } from '../domain/returns';
import { useData } from './DataContext';

/**
 * Data for the portfolio picked in the header switcher ("All" when none). Lots are
 * tracked per portfolio, so filtering the global FIFO result is equivalent to
 * replaying only that portfolio's transactions.
 */
export function useSelection() {
  const { data, fifo, selectedPortfolioId } = useData();

  return useMemo(() => {
    const pid = selectedPortfolioId;
    const transactions = filterByPortfolio(data.transactions, pid);
    const dividends = filterByPortfolio(data.dividends, pid);
    const selectedFifo = {
      lots: filterByPortfolio(fifo.lots, pid),
      realized: filterByPortfolio(fifo.realized, pid),
      issues: fifo.issues.filter((i) => transactions.some((t) => t.id === i.txnId)),
    };
    const holdings = computeHoldings(data.transactions, data.instruments, data.quotes, pid, selectedFifo);
    const totals = portfolioTotals(holdings, selectedFifo.realized);
    const xirrPct = xirr(portfolioCashFlows(transactions, totals.currentValue));
    return { portfolioId: pid, transactions, dividends, fifo: selectedFifo, holdings, totals, xirrPct };
  }, [data, fifo, selectedPortfolioId]);
}

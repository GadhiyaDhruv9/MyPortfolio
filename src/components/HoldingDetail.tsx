import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useData } from '../data/DataContext';
import { uid } from '../data/store';
import { useSelection } from '../data/useSelection';
import { addDays, daysBetween, sortTransactions, todayISO } from '../domain/fifo';
import type { HoldingSummary } from '../domain/types';
import { confirm } from '../lib/confirm';
import { formatDate, formatINR, formatPct, formatQty, parseNumber, pnlColor, toDateInput } from '../lib/format';
import { colors, radius, spacing, type } from '../lib/theme';
import { Badge, TxnTypeBadge } from './Badge';
import { Button, IconButton } from './Button';
import { DateField } from './DateField';
import { InfoButton } from './InfoButton';
import { Input } from './Input';
import { Modal } from './Modal';
import { Money } from './Money';
import { Select } from './Select';

interface Props {
  holding: HoldingSummary | null;
  onClose: () => void;
}

export function HoldingDetail({ holding, onClose }: Props) {
  const { data, upsertQuote, deleteDividend } = useData();
  const { transactions, dividends } = useSelection();
  const [editingPrice, setEditingPrice] = useState(false);
  const [addingDividend, setAddingDividend] = useState(false);

  const instrumentId = holding?.instrumentId;
  const txns = useMemo(
    () => sortTransactions(transactions.filter((t) => t.instrumentId === instrumentId)).reverse(),
    [transactions, instrumentId],
  );
  const divs = useMemo(
    () => dividends.filter((d) => d.instrumentId === instrumentId).sort((a, b) => b.recordDate.localeCompare(a.recordDate)),
    [dividends, instrumentId],
  );
  const portfolioName = (id: string) => data.portfolios.find((p) => p.id === id)?.name ?? '—';
  const showPortfolio = data.portfolios.length > 1;

  if (!holding) return null;
  const h = holding;
  const today = todayISO();
  const quote = data.quotes.find((q) => q.instrumentId === h.instrumentId);
  const notes = txns.filter((t) => t.reason || t.notes);

  return (
    <Modal visible={!!holding} onClose={onClose} title={h.symbol} subtitle={h.companyName} tall>
      <View style={styles.statsGrid}>
        <Stat label="Quantity" value={formatQty(h.quantity)} />
        <Stat label="Avg cost" money={h.avgBuyPrice} />
        <Stat label="Current price" value={formatINR(h.currentPrice)} />
        <Stat label="Current value" money={h.currentValue} />
        <Stat label="Invested" money={h.investedAmount} />
        <Stat label="Unrealized P&L" money={h.unrealizedPnL} signed sub={formatPct(h.unrealizedPnLPct)} />
        <Stat label="Realized P&L" money={h.realizedPnL} signed />
        <Stat label="Day change" money={h.dayChange} signed sub={formatPct(h.dayChangePct)} />
      </View>
      <View style={styles.priceRow}>
        <Text style={[type.caption, { flex: 1 }]}>
          {quote ? `Price updated ${formatDate(toDateInput(new Date(quote.updatedAt)))}` : 'No saved quote — using last trade price'}
        </Text>
        <Button title="Update price" size="sm" variant="secondary" icon="pencil" onPress={() => setEditingPrice(true)} />
      </View>

      {!h.isClosed ? (
        <Section title="Open lots (FIFO)" info={LOT_INFO}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.tr, styles.thead]}>
                {LOT_COLS.map(([label, w]) => (
                  <Text key={label} style={[styles.th, { width: w }]}>
                    {label}
                  </Text>
                ))}
              </View>
              {h.lots.map((l) => {
                const days = daysBetween(l.buyDate, today);
                const ltcgDate = addDays(l.buyDate, 366);
                const eligible = ltcgDate <= today;
                return (
                  <View key={l.id} style={styles.tr}>
                    <Text style={[styles.td, { width: LOT_COLS[0][1] }]}>{formatDate(l.buyDate)}</Text>
                    <Text style={[styles.td, { width: LOT_COLS[1][1] }]}>{formatQty(l.remainingQty)}</Text>
                    <View style={{ width: LOT_COLS[2][1] }}>
                      <Money value={l.perShareCost} style={styles.td} />
                    </View>
                    <View style={{ width: LOT_COLS[3][1] }}>
                      <Money value={l.remainingQty * l.perShareCost} style={styles.td} />
                    </View>
                    <Text style={[styles.td, { width: LOT_COLS[4][1] }]}>{days}</Text>
                    <View style={[styles.ltcgCell, { width: LOT_COLS[5][1] }]}>
                      <Text style={styles.td}>{formatDate(ltcgDate)}</Text>
                      {eligible ? <Badge label="Yes" tone="success" /> : null}
                    </View>
                    {showPortfolio ? <Text style={[styles.td, { width: 120 }]} numberOfLines={1}>{portfolioName(l.portfolioId)}</Text> : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Section>
      ) : null}

      <Section title={`Transactions (${txns.length})`}>
        {txns.map((t, i) => (
          <View key={t.id} style={[styles.listRow, i > 0 && styles.divider]}>
            <TxnTypeBadge type={t.type} />
            <View style={{ flex: 1 }}>
              <Text style={styles.listMain}>
                {formatQty(t.quantity)} @ {formatINR(t.price)}
              </Text>
              <Text style={type.caption}>
                {formatDate(t.tradeDate)}
                {t.productType !== 'CNC' ? ` · ${t.productType}` : ''}
                {showPortfolio ? ` · ${portfolioName(t.portfolioId)}` : ''}
              </Text>
            </View>
            <Money value={t.netAmount} style={styles.listMain} />
          </View>
        ))}
      </Section>

      <Section
        title={`Dividends (${divs.length})`}
        right={<Button title="Add" size="sm" variant="ghost" icon="add" onPress={() => setAddingDividend(true)} />}
      >
        {divs.length ? (
          divs.map((d, i) => (
            <View key={d.id} style={[styles.listRow, i > 0 && styles.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listMain}>
                  {formatINR(d.amountPerShare)} × {formatQty(d.shares)}
                </Text>
                <Text style={type.caption}>
                  Record {formatDate(d.recordDate)}
                  {d.paymentDate ? ` · Paid ${formatDate(d.paymentDate)}` : ''}
                  {d.tds ? ' · TDS ' : ''}
                  {d.tds ? formatINR(d.tds) : ''}
                </Text>
              </View>
              <Money value={d.net} style={[styles.listMain, { color: colors.success }]} />
              <IconButton
                icon="trash-outline"
                label="Delete dividend"
                color={colors.error}
                onPress={async () => {
                  if (await confirm('Delete dividend?', 'This removes the dividend entry.')) deleteDividend(d.id);
                }}
              />
            </View>
          ))
        ) : (
          <Text style={type.small}>No dividends recorded.</Text>
        )}
      </Section>

      {notes.length ? (
        <Section title="Trade notes">
          {notes.map((t, i) => (
            <View key={t.id} style={[styles.note, i > 0 && styles.divider]}>
              <View style={styles.noteHeader}>
                <TxnTypeBadge type={t.type} />
                <Text style={type.caption}>{formatDate(t.tradeDate)}</Text>
              </View>
              {t.reason ? <Text style={styles.reason}>“{t.reason}”</Text> : null}
              {t.notes ? <Text style={type.small}>{t.notes}</Text> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {editingPrice ? (
        <PriceForm
        visible
        onClose={() => setEditingPrice(false)}
        symbol={h.symbol}
        price={h.currentPrice}
        previousClose={quote?.previousClose ?? h.currentPrice}
        onSave={(price, previousClose) => {
          upsertQuote({ instrumentId: h.instrumentId, price, previousClose, updatedAt: new Date().toISOString() });
          setEditingPrice(false);
        }}
        />
      ) : null}
      {addingDividend ? <DividendForm visible onClose={() => setAddingDividend(false)} holding={h} /> : null}
    </Modal>
  );
}

const LOT_COLS: [string, number][] = [
  ['Buy date', 104],
  ['Qty', 60],
  ['Cost/share', 96],
  ['Total cost', 110],
  ['Days', 56],
  ['LTCG from', 150],
];

const LOT_INFO = [
  'Each buy creates a lot. Sells consume the oldest lot first (FIFO), which is how Indian capital gains are computed for demat holdings.',
  'Cost/share includes the buy charges for that lot. Splits and bonuses raise the quantity and lower the per-share cost; the lot’s total cost is unchanged.',
  'A lot becomes long-term (LTCG) when held for more than 365 days — the “LTCG from” date is buy date + 366 days.',
];

function Stat({ label, value, money, signed, sub }: { label: string; value?: string; money?: number; signed?: boolean; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.caption}>{label}</Text>
      {money != null ? (
        <Money value={money} variant={signed ? 'signed' : 'full'} colored={signed} style={styles.statValue} />
      ) : (
        <Text style={styles.statValue}>{value}</Text>
      )}
      {sub ? <Text style={[styles.statSub, { color: pnlColor(money) }]}>{sub}</Text> : null}
    </View>
  );
}

function Section({ title, info, right, children }: { title: string; info?: string[]; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={type.h3}>{title}</Text>
        {info ? <InfoButton title={title} body={info} /> : null}
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {children}
    </View>
  );
}

function PriceForm({
  visible,
  onClose,
  symbol,
  price,
  previousClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  symbol: string;
  price: number;
  previousClose: number;
  onSave: (price: number, previousClose: number) => void;
}) {
  const [p, setP] = useState(String(price));
  const [pc, setPc] = useState(String(previousClose));
  const pv = parseNumber(p);
  const pcv = parseNumber(pc);
  const valid = pv > 0 && pcv > 0;
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={`Update ${symbol} price`}
      subtitle="The app is offline — enter the latest price from your broker app."
      footer={<Button title="Save price" onPress={() => onSave(pv, pcv)} disabled={!valid} />}
    >
      <Input label="Current price (LTP)" prefix="₹" numeric value={p} onChangeText={setP} error={p && !(pv > 0) ? 'Enter a price above 0' : null} />
      <Input label="Previous close" prefix="₹" numeric value={pc} onChangeText={setPc} hint="Used for today's P&L" error={pc && !(pcv > 0) ? 'Enter a price above 0' : null} />
    </Modal>
  );
}

function DividendForm({ visible, onClose, holding }: { visible: boolean; onClose: () => void; holding: HoldingSummary }) {
  const { data, upsertDividend, selectedPortfolioId } = useData();
  const portfolios = data.portfolios;
  const [portfolioId, setPortfolioId] = useState(selectedPortfolioId ?? holding.lots[0]?.portfolioId ?? portfolios[0]?.id ?? '');
  const [recordDate, setRecordDate] = useState(todayISO());
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [perShare, setPerShare] = useState('');
  const [shares, setShares] = useState(holding.quantity ? String(holding.quantity) : '');
  const [tds, setTds] = useState('0');

  const ps = parseNumber(perShare);
  const sh = parseNumber(shares);
  const td = parseNumber(tds) || 0;
  const gross = ps > 0 && sh > 0 ? ps * sh : 0;
  const valid = gross > 0 && td >= 0 && td <= gross && !!portfolioId;

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={`Add ${holding.symbol} dividend`}
      footer={
        <Button
          title="Save dividend"
          disabled={!valid}
          onPress={() => {
            upsertDividend({
              id: uid('div'),
              instrumentId: holding.instrumentId,
              portfolioId,
              recordDate,
              paymentDate,
              amountPerShare: ps,
              shares: sh,
              gross,
              tds: td,
              net: gross - td,
            });
            setPerShare('');
            onClose();
          }}
        />
      }
    >
      {portfolios.length > 1 ? (
        <Select label="Portfolio" value={portfolioId} options={portfolios.map((p) => ({ label: p.name, value: p.id }))} onChange={setPortfolioId} />
      ) : null}
      <View style={styles.twoCol}>
        <DateField label="Record date" value={recordDate} onChange={setRecordDate} style={{ flex: 1 }} />
        <DateField label="Payment date" value={paymentDate} onChange={setPaymentDate} style={{ flex: 1 }} />
      </View>
      <View style={styles.twoCol}>
        <Input label="Amount per share" prefix="₹" numeric value={perShare} onChangeText={setPerShare} style={{ flex: 1 }} />
        <Input label="Shares" numeric value={shares} onChangeText={setShares} style={{ flex: 1 }} />
      </View>
      <Input label="TDS deducted" prefix="₹" numeric value={tds} onChangeText={setTds} hint="10% TDS applies above ₹10,000 per company per FY" error={td > gross && gross > 0 ? 'TDS cannot exceed the gross amount' : null} />
      <View style={styles.totalBox}>
        <Text style={type.small}>Net received</Text>
        <Text style={styles.totalValue}>{formatINR(Math.max(0, gross - td))}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm },
  stat: { width: '50%', padding: spacing.sm, gap: 2 },
  statValue: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statSub: { fontSize: 12, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  section: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  thead: { borderTopWidth: 0 },
  th: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  td: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  ltcgCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listMain: { fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  note: { paddingVertical: 10, gap: 6 },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reason: { fontSize: 14, fontStyle: 'italic', color: colors.textSecondary, lineHeight: 20 },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg },
  totalValue: { fontSize: 18, fontWeight: '700', color: colors.text },
});

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useData } from '../data/DataContext';
import { uid } from '../data/store';
import { calculateCharges, CHARGE_FIELDS, manualCharges, type ChargeBreakdown } from '../domain/charges';
import { applyFIFO, LOT_CONSUMING_TYPES, previewSell, round2, todayISO } from '../domain/fifo';
import type { Instrument, ProductType, Transaction, TxnType } from '../domain/types';
import { formatDate, formatINR, formatQty, parseNumber, pnlColor } from '../lib/format';
import { colors, radius, spacing, type } from '../lib/theme';
import { GainClassBadge } from './Badge';
import { Button } from './Button';
import { DateField } from './DateField';
import { Input } from './Input';
import { InstrumentForm } from './InstrumentForm';
import { Modal } from './Modal';
import { Money } from './Money';
import { SegmentedControl } from './SegmentedControl';
import { Select } from './Select';

const OTHER_TYPES: { label: string; value: TxnType; description: string }[] = [
  { label: 'Bonus', value: 'BONUS', description: 'Free shares in a ratio, e.g. 1:1' },
  { label: 'Split', value: 'SPLIT', description: 'Face value split, e.g. 1 → 5 shares' },
  { label: 'IPO allotment', value: 'IPO_ALLOTMENT', description: 'Shares allotted in an IPO' },
  { label: 'Rights issue', value: 'RIGHTS', description: 'Shares bought in a rights issue' },
  { label: 'Transfer in', value: 'TRANSFER_IN', description: 'Shares moved in from another demat' },
  { label: 'Transfer out', value: 'TRANSFER_OUT', description: 'Shares moved out (FIFO, no gain booked)' },
  { label: 'Gift received', value: 'GIFT', description: 'Shares received as a gift (enter donor’s cost)' },
  { label: 'Merger', value: 'MERGER', description: 'Recorded for reference only' },
  { label: 'Demerger', value: 'DEMERGER', description: 'Recorded for reference only' },
];

const PRODUCT_TYPES: { label: string; value: ProductType }[] = [
  { label: 'CNC (delivery)', value: 'CNC' },
  { label: 'MIS (intraday)', value: 'MIS' },
  { label: 'NRML', value: 'NRML' },
];

interface Props {
  /** Existing transaction to edit; omit to add. */
  editing?: Transaction | null;
  onClose: () => void;
}

export function TransactionForm({ editing, onClose }: Props) {
  const { data, upsertTransaction, selectedPortfolioId } = useData();
  const isEdit = !!editing;
  const defaultTemplateId = data.settings.defaultChargeTemplateId || data.chargeTemplates[0]?.id || '';

  const [txnType, setTxnType] = useState<TxnType>(editing?.type ?? 'BUY');
  const [instrumentId, setInstrumentId] = useState(editing?.instrumentId ?? '');
  const [instrumentQuery, setInstrumentQuery] = useState('');
  const [addingInstrument, setAddingInstrument] = useState(false);
  const [portfolioId, setPortfolioId] = useState(editing?.portfolioId ?? selectedPortfolioId ?? data.portfolios[0]?.id ?? '');
  const [tradeDate, setTradeDate] = useState(editing?.tradeDate ?? todayISO());
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [productType, setProductType] = useState<ProductType>(editing?.productType ?? 'CNC');
  const editingTemplate = editing?.chargeTemplateId && data.chargeTemplates.some((t) => t.id === editing.chargeTemplateId) ? editing.chargeTemplateId : null;
  const [templateId, setTemplateId] = useState(editingTemplate ?? defaultTemplateId);
  const [override, setOverride] = useState(isEdit && !editingTemplate && (editing?.totalCharges ?? 0) > 0);
  const [manualTotal, setManualTotal] = useState(editing ? String(editing.totalCharges) : '');
  const [reason, setReason] = useState(editing?.reason ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [tags, setTags] = useState(editing?.tags?.join(', ') ?? '');
  const [submitted, setSubmitted] = useState(false);

  const instrument = data.instruments.find((i) => i.id === instrumentId);
  const qty = parseNumber(quantity);
  const px = parseNumber(price);
  const isBuySell = txnType === 'BUY' || txnType === 'SELL';
  const isSellLike = LOT_CONSUMING_TYPES.includes(txnType);
  const side = isSellLike ? 'SELL' : 'BUY';
  const needsQty = txnType !== 'SPLIT';
  const needsPrice = txnType !== 'TRANSFER_OUT' && txnType !== 'MERGER' && txnType !== 'DEMERGER';
  const template = data.chargeTemplates.find((t) => t.id === templateId);

  const charges: ChargeBreakdown | null = useMemo(() => {
    const q = needsQty ? qty : 0;
    const p = needsPrice ? px : 0;
    if (!(q >= 0) || !(p >= 0)) return null;
    if (override) {
      const total = parseNumber(manualTotal);
      return manualCharges(side, q || 0, p || 0, Number.isFinite(total) ? total : 0);
    }
    if (isBuySell && template && q > 0 && p > 0) return calculateCharges(template, side, q, p);
    return manualCharges(side, q || 0, p || 0, 0);
  }, [needsQty, needsPrice, qty, px, override, manualTotal, isBuySell, template, side]);

  const draft: Transaction | null = useMemo(() => {
    if (!instrumentId || !portfolioId || !charges) return null;
    const q = needsQty ? qty : 0;
    const p = needsPrice ? px : 0;
    const isCorporateAction = txnType === 'BONUS' || txnType === 'SPLIT' || txnType === 'MERGER' || txnType === 'DEMERGER';
    return {
      id: editing?.id ?? uid('txn'),
      portfolioId,
      instrumentId,
      type: txnType,
      tradeDate,
      tradeTime: editing?.tradeTime,
      quantity: q,
      price: p,
      productType,
      ...charges,
      netAmount: isCorporateAction ? 0 : charges.netAmount,
      orderRef: editing?.orderRef,
      reason: reason.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      chargeTemplateId: !override && isBuySell ? templateId : undefined,
      // Keep import metadata so re-importing the same broker trades doesn't duplicate them.
      source: editing?.source,
      importedFills: editing?.importedFills,
    };
  }, [instrumentId, portfolioId, charges, needsQty, needsPrice, qty, px, txnType, tradeDate, productType, reason, notes, tags, override, isBuySell, templateId, editing]);

  const preview = useMemo(() => {
    if (!draft || !isSellLike || !(draft.quantity > 0)) return null;
    return previewSell(data.transactions, draft, editing?.id);
  }, [draft, isSellLike, data.transactions, editing?.id]);

  /** Saving this change must not leave any later sell short of shares. */
  const downstreamIssue = useMemo(() => {
    if (!draft) return null;
    const others = data.transactions.filter((t) => t.id !== editing?.id);
    const scope = (list: Transaction[]) =>
      list.filter(
        (t) =>
          (t.portfolioId === draft.portfolioId && t.instrumentId === draft.instrumentId) ||
          (editing && t.portfolioId === editing.portfolioId && t.instrumentId === editing.instrumentId),
      );
    const before = new Set(applyFIFO(scope(data.transactions)).issues.map((i) => i.txnId));
    const after = applyFIFO(scope([...others, draft])).issues.filter((i) => i.txnId !== draft.id && !before.has(i.txnId));
    if (!after.length) return null;
    const t = data.transactions.find((x) => x.id === after[0].txnId);
    return `This change leaves a later sell${t ? ` on ${formatDate(t.tradeDate)}` : ''} without enough shares.`;
  }, [draft, data.transactions, editing]);

  const errors = {
    instrument: !instrumentId ? 'Choose an instrument' : null,
    portfolio: !portfolioId ? 'Choose a portfolio' : null,
    quantity: needsQty && !(qty > 0) ? 'Enter a quantity above 0' : null,
    price: needsPrice && !(px > 0) ? (txnType === 'SPLIT' ? 'Enter the split ratio' : txnType === 'BONUS' ? 'Enter the held-shares part of the ratio' : 'Enter a price above 0') : null,
    charges: override && !(parseNumber(manualTotal) >= 0) ? 'Enter total charges (0 or more)' : null,
    oversell: preview && preview.shortfall > 1e-9 ? `You only hold ${formatQty(preview.available)} shares on ${formatDate(tradeDate)}.` : null,
    downstream: downstreamIssue,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const save = () => {
    setSubmitted(true);
    if (hasErrors || !draft) return;
    upsertTransaction(draft);
    onClose();
  };

  const show = (e: string | null) => (submitted ? e : null);
  const matches = useMemo(() => {
    const q = instrumentQuery.trim().toLowerCase();
    if (!q) return [];
    return data.instruments.filter((i) => i.symbol.toLowerCase().includes(q) || i.companyName.toLowerCase().includes(q)).slice(0, 6);
  }, [instrumentQuery, data.instruments]);

  const qtyLabel = txnType === 'BONUS' ? 'Bonus shares (ratio, e.g. 1)' : 'Quantity';
  const priceLabel =
    txnType === 'BONUS' ? 'For every … held (e.g. 1)' : txnType === 'SPLIT' ? 'Split ratio (new shares per old)' : txnType === 'GIFT' ? 'Donor’s cost per share' : 'Price per share';
  const tradeValue = (needsQty ? qty || 0 : 0) * (needsPrice ? px || 0 : 0);

  return (
    <Modal
      visible
      onClose={onClose}
      title={isEdit ? 'Edit transaction' : 'Add transaction'}
      tall
      footer={<Button title={isEdit ? 'Save changes' : 'Add transaction'} onPress={save} size="lg" disabled={submitted && hasErrors} />}
    >
      <View style={styles.toggleRow}>
        <Button title="Buy" variant="success" active={txnType === 'BUY'} onPress={() => setTxnType('BUY')} style={{ flex: 1 }} size="lg" />
        <Button title="Sell" variant="danger" active={txnType === 'SELL'} onPress={() => setTxnType('SELL')} style={{ flex: 1 }} size="lg" />
      </View>
      <Select
        label="Other transaction types"
        placeholder="Corporate action / transfer…"
        value={isBuySell ? ('' as TxnType) : txnType}
        options={OTHER_TYPES}
        onChange={setTxnType}
      />

      {/* Instrument autocomplete */}
      <View style={{ gap: 6 }}>
        {instrument ? (
          <>
            <Text style={styles.label}>Instrument</Text>
            <View style={styles.selectedInstrument}>
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>
                  {instrument.symbol} <Text style={type.caption}>{instrument.exchange}</Text>
                </Text>
                <Text style={type.caption} numberOfLines={1}>
                  {instrument.companyName}
                </Text>
              </View>
              <Button title="Change" size="sm" variant="ghost" onPress={() => setInstrumentId('')} />
            </View>
          </>
        ) : (
          <>
            <Input
              label="Instrument"
              placeholder="Search symbol or company (e.g. INFY)"
              value={instrumentQuery}
              onChangeText={setInstrumentQuery}
              autoCapitalize="characters"
              autoCorrect={false}
              error={show(errors.instrument)}
              right={<Ionicons name="search" size={18} color={colors.textMuted} />}
            />
            {instrumentQuery.trim() ? (
              <View style={styles.dropdown}>
                {matches.map((m, i) => (
                  <InstrumentOption
                    key={m.id}
                    instrument={m}
                    divider={i > 0}
                    onPress={() => {
                      setInstrumentId(m.id);
                      setInstrumentQuery('');
                    }}
                  />
                ))}
                <Pressable onPress={() => setAddingInstrument(true)} style={[styles.option, matches.length > 0 && styles.divider]} accessibilityRole="button">
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>Add “{instrumentQuery.trim().toUpperCase()}” as new instrument</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </View>

      {data.portfolios.length > 0 ? (
        <Select
          label="Portfolio"
          value={portfolioId}
          options={data.portfolios.map((p) => ({ label: p.name, value: p.id, description: [p.owner, p.broker].filter(Boolean).join(' · ') }))}
          onChange={setPortfolioId}
        />
      ) : (
        <Text style={styles.errorText}>Create a portfolio in Settings first.</Text>
      )}

      <DateField label="Trade date" value={tradeDate} onChange={setTradeDate} maximumDate={new Date()} />

      <View style={styles.twoCol}>
        {needsQty ? (
          <Input label={qtyLabel} numeric value={quantity} onChangeText={setQuantity} style={{ flex: 1 }} error={show(errors.quantity)} placeholder="0" />
        ) : null}
        {needsPrice ? (
          <Input label={priceLabel} numeric value={price} onChangeText={setPrice} prefix={txnType === 'BONUS' || txnType === 'SPLIT' ? undefined : '₹'} style={{ flex: 1 }} error={show(errors.price)} placeholder="0.00" />
        ) : null}
      </View>

      {isBuySell ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Product type</Text>
          <SegmentedControl options={PRODUCT_TYPES} value={productType} onChange={setProductType} />
        </View>
      ) : null}

      {isBuySell || override ? (
        <View style={styles.box}>
          <View style={styles.boxHeader}>
            <Text style={type.h3}>Charges</Text>
            <View style={styles.overrideRow}>
              <Text style={type.small}>Manual</Text>
              <Switch value={override} onValueChange={setOverride} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel="Override charges manually" />
            </View>
          </View>
          {override ? (
            <Input label="Total charges" prefix="₹" numeric value={manualTotal} onChangeText={setManualTotal} error={show(errors.charges)} hint="Copy the total from your contract note." />
          ) : (
            <>
              <Select
                label="Charge template"
                value={templateId}
                options={data.chargeTemplates.map((t) => ({ label: t.name, value: t.id }))}
                onChange={setTemplateId}
              />
              {charges
                ? CHARGE_FIELDS.filter(([k]) => k !== 'otherCharges').map(([key, label]) => (
                    <View key={key} style={styles.chargeRow}>
                      <Text style={type.small}>{label}</Text>
                      <Text style={styles.chargeValue}>{formatINR(charges[key])}</Text>
                    </View>
                  ))
                : null}
            </>
          )}
          <View style={[styles.chargeRow, styles.totalRow]}>
            <Text style={type.h3}>Total charges</Text>
            <Text style={[styles.chargeValue, { fontWeight: '700' }]}>{formatINR(charges?.totalCharges ?? 0)}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.netBox}>
        <View>
          <Text style={type.small}>{side === 'BUY' ? 'Net amount payable' : 'Net amount receivable'}</Text>
          <Text style={type.caption}>
            Trade value {formatINR(tradeValue)} {side === 'BUY' ? '+' : '−'} charges
          </Text>
        </View>
        <Text style={styles.netValue}>{formatINR(draft?.netAmount ?? round2(tradeValue))}</Text>
      </View>

      {preview ? <SellPreviewBox preview={preview} error={errors.oversell} isSell={txnType === 'SELL'} /> : null}
      {errors.downstream ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color={colors.error} />
          <Text style={[styles.errorText, { flex: 1 }]}>{errors.downstream}</Text>
        </View>
      ) : null}

      <Input label={side === 'BUY' ? 'Why I bought' : 'Why I sold'} value={reason} onChangeText={setReason} placeholder="Thesis, trigger, strategy…" multiline />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Order ref, contract note details…" />
      <Input label="Tags" value={tags} onChangeText={setTags} placeholder="long-term, dividend (comma separated)" autoCapitalize="none" />

      {addingInstrument ? (
        <InstrumentForm
          initialSymbol={instrumentQuery}
          onClose={() => setAddingInstrument(false)}
          onSaved={(i) => {
            setInstrumentId(i.id);
            setInstrumentQuery('');
            setAddingInstrument(false);
          }}
        />
      ) : null}
    </Modal>
  );
}

function InstrumentOption({ instrument, onPress, divider }: { instrument: Instrument; onPress: () => void; divider: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.option, divider && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={type.h3}>{instrument.symbol}</Text>
        <Text style={type.caption} numberOfLines={1}>
          {instrument.companyName}
        </Text>
      </View>
      <Text style={type.caption}>{instrument.exchange}</Text>
    </Pressable>
  );
}

function SellPreviewBox({ preview, error, isSell }: { preview: ReturnType<typeof previewSell>; error: string | null; isSell: boolean }) {
  return (
    <View style={[styles.box, error && { borderColor: colors.errorBright, borderWidth: 1 }]}>
      <View style={styles.boxHeader}>
        <Text style={type.h3}>FIFO preview</Text>
        <Text style={type.caption}>Holding {formatQty(preview.available)}</Text>
      </View>
      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="close-circle" size={18} color={colors.error} />
          <Text style={[styles.errorText, { flex: 1 }]}>{error}</Text>
        </View>
      ) : null}
      {preview.consumed.map((c) => (
        <View key={c.lot.id} style={styles.previewRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.chargeValue}>
              {formatQty(c.quantity)} from {formatDate(c.lot.buyDate)} lot
            </Text>
            <Text style={type.caption}>
              Cost {formatINR(c.buyCost)} · {c.holdingDays} days
            </Text>
          </View>
          {isSell ? <GainClassBadge classification={c.classification} /> : null}
        </View>
      ))}
      {isSell && preview.consumed.length ? (
        <>
          <View style={[styles.chargeRow, styles.totalRow]}>
            <Text style={type.h3}>Estimated gain</Text>
            <Money value={preview.estimatedGain} variant="signed" colored style={[styles.chargeValue, { fontWeight: '700' }]} />
          </View>
          {(['stcg', 'ltcg', 'intraday'] as const)
            .filter((k) => preview.consumed.some((c) => c.classification === k))
            .map((k) => (
              <View key={k} style={styles.chargeRow}>
                <GainClassBadge classification={k} />
                <Text style={[styles.chargeValue, { color: pnlColor(preview.byClass[k]) }]}>{formatINR(preview.byClass[k])}</Text>
              </View>
            ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  selectedInstrument: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm + 2, borderWidth: 1, borderColor: colors.primary, padding: spacing.md },
  dropdown: { backgroundColor: colors.surface, borderRadius: radius.sm + 2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  box: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  boxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chargeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chargeValue: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: 2 },
  netBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.lg },
  netValue: { fontSize: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.errorSoft, borderRadius: radius.sm, padding: spacing.md },
  errorText: { fontSize: 13, color: colors.error, fontWeight: '600' },
});

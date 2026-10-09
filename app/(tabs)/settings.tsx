import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { DateField } from '../../src/components/DateField';
import { Input } from '../../src/components/Input';
import { Modal } from '../../src/components/Modal';
import { Screen, SectionTitle } from '../../src/components/Screen';
import { Select } from '../../src/components/Select';
import { useData } from '../../src/data/DataContext';
import { uid } from '../../src/data/store';
import { rulesOn, TAX_DISCLAIMER } from '../../src/domain/tax';
import type { ChargeTemplate, Portfolio, TaxRules } from '../../src/domain/types';
import { confirm, notify } from '../../src/lib/confirm';
import { shareTextFile } from '../../src/lib/export';
import { formatDate, formatINR, parseNumber } from '../../src/lib/format';
import { colors, radius, spacing, type } from '../../src/lib/theme';

export default function Settings() {
  const { data, updateSettings, clearAll, resetToSample, replaceAll } = useData();
  const [editingTemplate, setEditingTemplate] = useState<ChargeTemplate | null>(null);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [editingTax, setEditingTax] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const latestRules = data.taxRules.length ? rulesOn(data.taxRules, '9999-12-31') : null;

  const backup = async () => {
    setBusy('backup');
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await shareTextFile(`portfolio-backup-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json', 'public.json');
    } catch (e) {
      notify('Backup failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const text = Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await new File(asset.uri).text();
      const parsed: unknown = JSON.parse(text);
      const counts = parsed && typeof parsed === 'object' ? (parsed as { transactions?: unknown[] }).transactions?.length ?? 0 : 0;
      const ok = await confirm('Restore backup?', `This replaces all data on this device with “${asset.name}” (${counts} transactions).`, 'Restore');
      if (!ok) return;
      replaceAll(parsed);
      notify('Restored', 'Your data has been restored from the backup.');
    } catch (e) {
      notify('Restore failed', e instanceof Error ? e.message : 'The file is not a valid backup.');
    }
  };

  return (
    <Screen title="Settings" showPortfolioSwitcher={false}>
      <Card index={0}>
        <View style={styles.switchRow}>
          <Icon name="eye-off-outline" tint={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>Privacy mode</Text>
            <Text style={type.caption}>Hide all amounts. Tap a hidden value to reveal it briefly.</Text>
          </View>
          <Switch
            value={data.settings.privacyMode}
            onValueChange={(v) => updateSettings({ privacyMode: v })}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Privacy mode"
          />
        </View>
      </Card>

      <SectionTitle right={<Button title="Add" size="sm" variant="ghost" icon="add" onPress={() => setEditingPortfolio(newPortfolio())} />}>Portfolios</SectionTitle>
      <Card index={1} padded={false}>
        {data.portfolios.length ? (
          data.portfolios.map((p, i) => (
            <Row key={p.id} first={i === 0} title={p.name} subtitle={[p.owner, p.broker, p.accountLabel].filter(Boolean).join(' · ')} onPress={() => setEditingPortfolio(p)} />
          ))
        ) : (
          <Text style={[type.small, { padding: spacing.lg }]}>No portfolios. Add one to start recording transactions.</Text>
        )}
      </Card>

      <SectionTitle right={<Button title="Add" size="sm" variant="ghost" icon="add" onPress={() => setEditingTemplate(newTemplate())} />}>Charge templates</SectionTitle>
      <Card index={2} padded={false}>
        {data.chargeTemplates.map((t, i) => (
          <Row
            key={t.id}
            first={i === 0}
            title={t.name}
            subtitle={templateSummary(t)}
            right={t.id === data.settings.defaultChargeTemplateId ? <Badge label="Default" tone="primary" /> : null}
            onPress={() => setEditingTemplate(t)}
          />
        ))}
      </Card>

      <SectionTitle>Tax rules</SectionTitle>
      <Card index={3} padded={false}>
        {latestRules ? (
          <Row
            first
            title={`STCG ${latestRules.stcgRate}% · LTCG ${latestRules.ltcgRate}%`}
            subtitle={`Exemption ${formatINR(latestRules.ltcgExemption, 0)} · Cess ${latestRules.cessRate}% · from ${formatDate(latestRules.effectiveFrom)}`}
            onPress={() => setEditingTax(true)}
          />
        ) : null}
        <Text style={[type.caption, { paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]}>{TAX_DISCLAIMER}</Text>
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card index={4} style={{ gap: spacing.sm }}>
        <Text style={type.caption}>All data stays on this device. Nothing is uploaded — back up regularly.</Text>
        <Button title="Back up (export JSON)" icon="cloud-download-outline" variant="secondary" onPress={backup} loading={busy === 'backup'} />
        <Button title="Restore from JSON" icon="cloud-upload-outline" variant="secondary" onPress={restore} />
        <Button
          title="Load sample data"
          icon="sparkles-outline"
          variant="secondary"
          onPress={async () => {
            if (await confirm('Load sample data?', 'This replaces all your data with the demo portfolios.', 'Load sample')) resetToSample();
          }}
        />
        <Button
          title="Clear all data"
          icon="trash-outline"
          variant="danger"
          onPress={async () => {
            if (await confirm('Clear all data?', 'Every portfolio, transaction and setting on this device will be deleted. This cannot be undone — back up first.', 'Clear everything')) clearAll();
          }}
        />
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card index={5} style={{ gap: spacing.sm }}>
        <Text style={type.h3}>Portfolio Tracker</Text>
        <Text style={type.small}>Personal stock portfolio tracker for Indian markets (NSE/BSE). No servers, no analytics, no ads, no tracking.</Text>
        <View style={styles.badges}>
          <Badge label="FIFO" tone="primary" />
          <Badge label="XIRR" tone="success" />
          <Badge label="Tax Estimate" tone="warning" />
          <Badge label="Offline" tone="purple" />
        </View>
      </Card>

      {editingTemplate ? <TemplateEditor template={editingTemplate} onClose={() => setEditingTemplate(null)} /> : null}
      {editingPortfolio ? <PortfolioEditor portfolio={editingPortfolio} onClose={() => setEditingPortfolio(null)} /> : null}
      {editingTax && latestRules ? <TaxEditor rules={latestRules} onClose={() => setEditingTax(false)} /> : null}
    </Screen>
  );
}

function templateSummary(t: ChargeTemplate): string {
  const brokerage = t.brokerageType === 'zero_delivery' ? '₹0 brokerage' : t.brokerageType === 'flat_per_order' ? `₹${t.brokerageFlat}/order` : `${t.brokeragePercent}% brokerage`;
  return `${brokerage} · STT ${t.sttBuyPct}%/${t.sttSellPct}% · DP ₹${t.dpCharges}`;
}

function newTemplate(): ChargeTemplate {
  return {
    id: uid('tpl'),
    name: 'New template',
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
  };
}

function newPortfolio(): Portfolio {
  return { id: uid('pf'), name: '', owner: 'Self', baseCurrency: 'INR', createdAt: new Date().toISOString() };
}

function Icon({ name, tint }: { name: ComponentProps<typeof Ionicons>['name']; tint: string }) {
  return (
    <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
      <Ionicons name={name} size={18} color={tint} />
    </View>
  );
}

function Row({ title, subtitle, right, onPress, first }: { title: string; subtitle?: string; right?: React.ReactNode; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={type.h3}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/** Text state for a numeric field, validated on save. */
function useNumberFields<K extends string>(initial: Record<K, number>) {
  const [values, setValues] = useState<Record<K, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])) as Record<K, string>);
  const parsed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, parseNumber(v as string)])) as Record<K, number>;
  const invalid = (Object.keys(parsed) as K[]).filter((k) => !(parsed[k] >= 0));
  const bind = (key: K) => ({
    value: values[key],
    onChangeText: (v: string) => setValues((s) => ({ ...s, [key]: v })),
    numeric: true,
    error: invalid.includes(key) ? 'Enter 0 or more' : null,
  });
  return { parsed, invalid, bind };
}

function TemplateEditor({ template, onClose }: { template: ChargeTemplate; onClose: () => void }) {
  const { data, upsertChargeTemplate, deleteChargeTemplate, updateSettings } = useData();
  const exists = data.chargeTemplates.some((t) => t.id === template.id);
  const [name, setName] = useState(template.name);
  const [brokerageType, setBrokerageType] = useState(template.brokerageType);
  const { parsed, invalid, bind } = useNumberFields({
    brokerageFlat: template.brokerageFlat,
    brokeragePercent: template.brokeragePercent,
    sttBuyPct: template.sttBuyPct,
    sttSellPct: template.sttSellPct,
    exchangeChargesPct: template.exchangeChargesPct,
    sebiFeePer10L: template.sebiFeePer10L,
    stampDutyBuyPct: template.stampDutyBuyPct,
    gstPct: template.gstPct,
    dpCharges: template.dpCharges,
  });
  const isDefault = data.settings.defaultChargeTemplateId === template.id;
  const valid = name.trim().length > 0 && invalid.length === 0;

  return (
    <Modal
      visible
      onClose={onClose}
      title={exists ? 'Edit template' : 'New template'}
      tall
      footer={
        <>
          <Button
            title="Save template"
            disabled={!valid}
            onPress={() => {
              upsertChargeTemplate({ ...template, name: name.trim(), brokerageType, ...parsed });
              onClose();
            }}
          />
          {exists && !isDefault ? <Button title="Make default" variant="secondary" onPress={() => updateSettings({ defaultChargeTemplateId: template.id })} /> : null}
          {exists && data.chargeTemplates.length > 1 ? (
            <Button
              title="Delete template"
              variant="danger"
              onPress={async () => {
                if (await confirm('Delete template?', 'Existing transactions keep their recorded charges.')) {
                  deleteChargeTemplate(template.id);
                  onClose();
                }
              }}
            />
          ) : null}
        </>
      }
    >
      <Input label="Name" value={name} onChangeText={setName} />
      <Select
        label="Brokerage"
        value={brokerageType}
        onChange={setBrokerageType}
        options={[
          { label: 'Zero (delivery)', value: 'zero_delivery' },
          { label: 'Flat per order', value: 'flat_per_order' },
          { label: 'Percent of trade value', value: 'percent' },
        ]}
      />
      {brokerageType === 'flat_per_order' ? <Input label="Brokerage per order" prefix="₹" {...bind('brokerageFlat')} /> : null}
      {brokerageType === 'percent' ? <Input label="Brokerage %" {...bind('brokeragePercent')} /> : null}
      <View style={styles.twoCol}>
        <Input label="STT buy %" style={{ flex: 1 }} {...bind('sttBuyPct')} />
        <Input label="STT sell %" style={{ flex: 1 }} {...bind('sttSellPct')} />
      </View>
      <View style={styles.twoCol}>
        <Input label="Exchange charges %" style={{ flex: 1 }} {...bind('exchangeChargesPct')} />
        <Input label="SEBI fee per ₹10L" prefix="₹" style={{ flex: 1 }} {...bind('sebiFeePer10L')} />
      </View>
      <View style={styles.twoCol}>
        <Input label="Stamp duty (buy) %" style={{ flex: 1 }} {...bind('stampDutyBuyPct')} />
        <Input label="GST %" style={{ flex: 1 }} {...bind('gstPct')} />
      </View>
      <Input label="DP charges per sell" prefix="₹" hint="Charged once per scrip per sell day by the depository" {...bind('dpCharges')} />
      <Text style={type.caption}>GST applies to brokerage + exchange charges + SEBI fee. Stamp duty applies to buys only; DP charges to sells only.</Text>
    </Modal>
  );
}

function PortfolioEditor({ portfolio, onClose }: { portfolio: Portfolio; onClose: () => void }) {
  const { data, upsertPortfolio } = useData();
  const exists = data.portfolios.some((p) => p.id === portfolio.id);
  const [name, setName] = useState(portfolio.name);
  const [owner, setOwner] = useState(portfolio.owner);
  const [broker, setBroker] = useState(portfolio.broker ?? '');
  const [accountLabel, setAccountLabel] = useState(portfolio.accountLabel ?? '');
  const valid = name.trim().length > 0 && owner.trim().length > 0;
  return (
    <Modal
      visible
      onClose={onClose}
      title={exists ? 'Edit portfolio' : 'New portfolio'}
      footer={
        <Button
          title="Save portfolio"
          disabled={!valid}
          onPress={() => {
            upsertPortfolio({ ...portfolio, name: name.trim(), owner: owner.trim(), broker: broker.trim() || undefined, accountLabel: accountLabel.trim() || undefined });
            onClose();
          }}
        />
      }
    >
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Main Portfolio" />
      <Input label="Owner" value={owner} onChangeText={setOwner} hint="Tax is estimated per person — keep each person's demat accounts under the same owner." />
      <Input label="Broker" value={broker} onChangeText={setBroker} placeholder="e.g. Zerodha" />
      <Input label="Account label" value={accountLabel} onChangeText={setAccountLabel} placeholder="e.g. Client ID" />
    </Modal>
  );
}

function TaxEditor({ rules, onClose }: { rules: TaxRules; onClose: () => void }) {
  const { updateTaxRules } = useData();
  const [effectiveFrom, setEffectiveFrom] = useState(rules.effectiveFrom);
  const { parsed, invalid, bind } = useNumberFields({
    stcgRate: rules.stcgRate,
    ltcgRate: rules.ltcgRate,
    ltcgExemption: rules.ltcgExemption,
    cessRate: rules.cessRate,
    surchargeRate: rules.surchargeRate,
  });
  return (
    <Modal
      visible
      onClose={onClose}
      title="Tax rules"
      subtitle="Listed equity shares & equity-oriented funds"
      tall
      footer={
        <Button
          title="Save rules"
          disabled={invalid.length > 0}
          onPress={() => {
            updateTaxRules({ ...rules, ...parsed, effectiveFrom });
            onClose();
          }}
        />
      }
    >
      <DateField label="Effective from (sale date)" value={effectiveFrom} onChange={setEffectiveFrom} />
      <Text style={type.caption}>Changing the date saves a new rule set; sales before it keep using the earlier rates.</Text>
      <View style={styles.twoCol}>
        <Input label="STCG rate %" style={{ flex: 1 }} {...bind('stcgRate')} />
        <Input label="LTCG rate %" style={{ flex: 1 }} {...bind('ltcgRate')} />
      </View>
      <Input label="LTCG exemption per FY" prefix="₹" {...bind('ltcgExemption')} />
      <View style={styles.twoCol}>
        <Input label="Cess %" style={{ flex: 1 }} {...bind('cessRate')} />
        <Input label="Surcharge %" style={{ flex: 1 }} {...bind('surchargeRate')} />
      </View>
      <View style={styles.note}>
        <Text style={type.small}>STCG: held ≤ 365 days. LTCG: held &gt; 365 days. Grandfathering date: {formatDate(rules.grandfatheringDate)}.</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  note: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
});

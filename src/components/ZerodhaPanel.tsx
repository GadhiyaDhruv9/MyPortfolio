import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { useData } from '../data/DataContext';
import { uid } from '../data/store';
import type { AppData, ZerodhaSettings } from '../domain/types';
import { planImport, type ImportPlan } from '../integrations/zerodha/importer';
import { KiteError, kiteApi, openInstrumentKeys, planKiteSync, tokenExpiry, type KiteSession, type SyncPlan } from '../integrations/zerodha/kite';
import { clearSession, kiteSupported, loadSession, loginWithZerodha } from '../integrations/zerodha/kiteAuth';
import { parseTradebook } from '../integrations/zerodha/tradebook';
import { notify } from '../lib/confirm';
import { formatDate, formatQty } from '../lib/format';
import { colors, radius, spacing, type } from '../lib/theme';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { Modal } from './Modal';
import { Select } from './Select';

/** Resolves the portfolio and charge templates imports should use. */
function resolveConfig(data: AppData) {
  const z = data.settings.zerodha;
  const portfolio =
    data.portfolios.find((p) => p.id === z.portfolioId) ??
    data.portfolios.find((p) => /zerodha|kite/i.test(p.broker ?? '')) ??
    data.portfolios[0];
  const template = (id: string | undefined, fallback: string) =>
    data.chargeTemplates.find((t) => t.id === id) ?? data.chargeTemplates.find((t) => t.id === fallback) ?? data.chargeTemplates[0];
  return {
    portfolio,
    deliveryTemplate: template(z.deliveryTemplateId, 'tpl_zero_delivery'),
    intradayTemplate: template(z.intradayTemplateId, 'tpl_intraday'),
  };
}

type Result =
  | { kind: 'csv-preview'; plan: ImportPlan; skipped: number; fileName: string }
  | { kind: 'sync'; plan: SyncPlan; quotesNote?: string };

export function ZerodhaPanel({ index }: { index: number }) {
  const { data, applyImport } = useData();
  const z = data.settings.zerodha;
  const [session, setSession] = useState<KiteSession | null>(null);
  const [busy, setBusy] = useState<'login' | 'sync' | 'csv' | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const config = resolveConfig(data);
  const configured = !!z.apiKey && !!z.authServerUrl;

  useEffect(() => {
    loadSession().then(setSession);
  }, []);

  const importOptions = (source: 'zerodha_csv' | 'kite') => ({
    portfolioId: config.portfolio!.id,
    deliveryTemplate: config.deliveryTemplate,
    intradayTemplate: config.intradayTemplate,
    source,
    newId: uid,
  });

  const importCsv = async () => {
    if (!config.portfolio) return notify('No portfolio', 'Create a portfolio in Settings first.');
    setBusy('csv');
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const text = Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await new File(asset.uri).text();
      const parsed = parseTradebook(text);
      if (parsed.error) return notify('Could not read tradebook', `${parsed.error}\n\nDownload it from console.zerodha.com → Reports → Tradebook → Equity, as CSV.`);
      setResult({ kind: 'csv-preview', plan: planImport(parsed.fills, data, importOptions('zerodha_csv')), skipped: parsed.skipped.length, fileName: asset.name });
    } catch (e) {
      notify('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const login = async (): Promise<KiteSession | null> => {
    if (!configured) {
      setSetupOpen(true);
      return null;
    }
    setBusy('login');
    try {
      const s = await loginWithZerodha(z.apiKey!, z.authServerUrl!);
      if (s) setSession(s);
      return s;
    } catch (e) {
      notify('Login failed', e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    if (!config.portfolio) return notify('No portfolio', 'Create a portfolio in Settings first.');
    const s = session ?? (await login());
    if (!s) return;
    setBusy('sync');
    try {
      const [holdings, trades] = await Promise.all([kiteApi.holdings(s), kiteApi.trades(s)]);
      let ohlc = null;
      let quotesNote: string | undefined;
      const keys = openInstrumentKeys(data);
      if (keys.length) {
        try {
          ohlc = await kiteApi.ohlc(s, keys.slice(0, 1000));
        } catch (e) {
          if (e instanceof KiteError && e.isAuthError) throw e;
          quotesNote = 'Live quotes are not included in your Kite Connect plan, so prices were updated only for stocks in your Zerodha holdings.';
        }
      }
      const plan = planKiteSync(data, holdings, trades, ohlc, importOptions('kite'));
      const now = new Date().toISOString();
      applyImport(plan, plan.quotes, now);
      setResult({ kind: 'sync', plan, quotesNote });
    } catch (e) {
      if (e instanceof KiteError && e.isAuthError) {
        await clearSession();
        setSession(null);
        notify('Login expired', 'Your Zerodha session has ended (it expires every morning at 6 AM). Log in again to sync.');
      } else {
        notify('Sync failed', e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    await clearSession();
    setSession(null);
  };

  return (
    <>
      <Card index={index} style={{ gap: spacing.md }}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="link-outline" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>Zerodha</Text>
            <Text style={type.caption}>
              {session
                ? `Logged in${session.userId ? ` as ${session.userId}` : ''} · until ${tokenExpiry(session.issuedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
                : configured
                  ? 'Not logged in today'
                  : 'Kite Connect not set up'}
            </Text>
          </View>
          {session ? <Badge label="Connected" tone="success" /> : null}
        </View>
        <Text style={type.caption}>
          Imports go to “{config.portfolio?.name ?? '—'}”.{z.lastSyncAt ? ` Last synced ${formatDate(z.lastSyncAt.slice(0, 10))} ${new Date(z.lastSyncAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.` : ''}
        </Text>

        <Button title="Import tradebook CSV" icon="document-attach-outline" variant="secondary" onPress={importCsv} loading={busy === 'csv'} />
        {kiteSupported ? (
          session ? (
            <View style={styles.row}>
              <Button title="Sync now" icon="sync" onPress={sync} loading={busy === 'sync'} style={{ flex: 1 }} />
              <Button title="Log out" variant="secondary" onPress={logout} />
            </View>
          ) : (
            <Button title={configured ? 'Login with Zerodha' : 'Set up Kite Connect'} icon="log-in-outline" onPress={configured ? sync : () => setSetupOpen(true)} loading={busy === 'login' || busy === 'sync'} />
          )
        ) : (
          <Text style={type.caption}>Live sync works in the iOS/Android app (Kite’s API can’t be called from a browser). CSV import works here.</Text>
        )}
        <Button title="Zerodha settings" variant="ghost" icon="settings-outline" onPress={() => setSetupOpen(true)} />
      </Card>

      {setupOpen ? <ZerodhaSetup onClose={() => setSetupOpen(false)} /> : null}
      {result ? (
        <ResultSheet
          result={result}
          data={data}
          onClose={() => setResult(null)}
          onConfirm={
            result.kind === 'csv-preview'
              ? () => {
                  applyImport(result.plan);
                  setResult(null);
                  notify('Imported', `${result.plan.upserts.length} transactions added or updated.`);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function ResultSheet({ result, data, onClose, onConfirm }: { result: Result; data: AppData; onClose: () => void; onConfirm?: () => void }) {
  const { plan } = result;
  const symbolOf = (id: string) => plan.newInstruments.find((i) => i.id === id)?.symbol ?? data.instruments.find((i) => i.id === id)?.symbol ?? '?';
  const isPreview = result.kind === 'csv-preview';
  const added = plan.upserts.filter((t) => !data.transactions.some((x) => x.id === t.id)).length;
  const updated = plan.upserts.length - added;
  return (
    <Modal
      visible
      onClose={onClose}
      title={isPreview ? 'Import preview' : 'Sync complete'}
      subtitle={isPreview ? result.fileName : undefined}
      tall
      footer={
        isPreview ? (
          <Button title={plan.upserts.length ? `Import ${plan.upserts.length} transactions` : 'Nothing new to import'} onPress={onConfirm ?? onClose} disabled={!plan.upserts.length} />
        ) : (
          <Button title="Done" onPress={onClose} />
        )
      }
    >
      <View style={styles.box}>
        <Stat label="New trades (fills)" value={String(plan.newFills)} />
        <Stat label="Already imported (skipped)" value={String(plan.duplicateFills)} />
        {isPreview ? <Stat label="Rows skipped (F&O / invalid)" value={String(result.skipped)} /> : null}
        <Stat label={isPreview ? 'Transactions to add' : 'Transactions added'} value={String(added)} />
        {updated ? <Stat label="Transactions updated" value={String(updated)} /> : null}
        <Stat label="New instruments" value={String(plan.newInstruments.filter((i) => !data.instruments.some((x) => x.id === i.id)).length)} />
        {plan.dateRange ? <Stat label="Trade dates" value={`${formatDate(plan.dateRange.from)} – ${formatDate(plan.dateRange.to)}`} /> : null}
        {result.kind === 'sync' ? (
          <>
            <Stat label="Holdings read" value={String(result.plan.holdingsCount)} />
            <Stat label="Prices updated" value={String(result.plan.quotes.length)} />
          </>
        ) : null}
      </View>

      {result.kind === 'sync' && result.quotesNote ? <Text style={type.caption}>{result.quotesNote}</Text> : null}

      {result.kind === 'sync' ? (
        result.plan.mismatches.length ? (
          <View style={styles.box}>
            <Text style={type.h3}>Quantity differences</Text>
            <Text style={type.caption}>
              Zerodha’s settled holdings vs this app (before today’s trades). Usually this means older trades are missing — import your tradebook CSV for the missing period. Corporate actions (bonus, split) may also need to be added.
            </Text>
            {result.plan.mismatches.map((m) => (
              <View key={m.instrumentId} style={styles.mismatch}>
                <Text style={[type.h3, { flex: 1 }]}>{m.symbol}</Text>
                <Text style={type.small}>
                  Zerodha {formatQty(m.zerodhaQty)} · App {formatQty(m.appQty)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.box, { backgroundColor: colors.successSoft }]}>
            <Text style={[type.small, { color: colors.success, fontWeight: '600' }]}>Holdings match Zerodha.</Text>
          </View>
        )
      ) : null}

      {isPreview && plan.upserts.length ? (
        <View style={styles.box}>
          <Text style={type.h3}>Transactions</Text>
          {plan.upserts.slice(0, 50).map((t) => (
            <View key={t.id} style={styles.mismatch}>
              <Badge label={`${t.type}${t.productType === 'MIS' ? ' · MIS' : ''}`} tone={t.type === 'BUY' ? 'success' : 'error'} />
              <Text style={[type.small, { flex: 1 }]}>
                {symbolOf(t.instrumentId)} {formatQty(t.quantity)} @ {t.price.toFixed(2)}
              </Text>
              <Text style={type.caption}>{formatDate(t.tradeDate)}</Text>
            </View>
          ))}
          {plan.upserts.length > 50 ? <Text style={type.caption}>…and {plan.upserts.length - 50} more</Text> : null}
        </View>
      ) : null}

      <Text style={type.caption}>
        Same-day buys and sells of a stock are recorded as intraday (MIS); fills are merged per day. Charges are estimated from your templates — the tradebook does not include them.
      </Text>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.small}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ZerodhaSetup({ onClose }: { onClose: () => void }) {
  const { data, updateSettings } = useData();
  const z = data.settings.zerodha;
  const config = resolveConfig(data);
  const [apiKey, setApiKey] = useState(z.apiKey ?? '');
  const [authServerUrl, setAuthServerUrl] = useState(z.authServerUrl ?? '');
  const [portfolioId, setPortfolioId] = useState(config.portfolio?.id ?? '');
  const [deliveryTemplateId, setDelivery] = useState(config.deliveryTemplate?.id ?? '');
  const [intradayTemplateId, setIntraday] = useState(config.intradayTemplate?.id ?? '');
  const urlValid = authServerUrl === '' || /^https:\/\/[^\s/]+/.test(authServerUrl.trim());
  const templates = data.chargeTemplates.map((t) => ({ label: t.name, value: t.id }));

  const save = () => {
    const next: ZerodhaSettings = {
      ...z,
      apiKey: apiKey.trim() || undefined,
      authServerUrl: authServerUrl.trim().replace(/\/+$/, '') || undefined,
      portfolioId,
      deliveryTemplateId,
      intradayTemplateId,
    };
    updateSettings({ zerodha: next });
    onClose();
  };

  return (
    <Modal visible onClose={onClose} title="Zerodha settings" tall footer={<Button title="Save" onPress={save} disabled={!urlValid} />}>
      {data.portfolios.length ? (
        <Select label="Import into portfolio" value={portfolioId} options={data.portfolios.map((p) => ({ label: p.name, value: p.id, description: [p.owner, p.broker].filter(Boolean).join(' · ') }))} onChange={setPortfolioId} />
      ) : (
        <Text style={type.small}>Create a portfolio first (Settings → Portfolios).</Text>
      )}
      <View style={styles.row}>
        <Select label="Delivery charges" value={deliveryTemplateId} options={templates} onChange={setDelivery} style={{ flex: 1 }} />
        <Select label="Intraday charges" value={intradayTemplateId} options={templates} onChange={setIntraday} style={{ flex: 1 }} />
      </View>

      <Text style={[type.h3, { marginTop: spacing.sm }]}>Kite Connect (live sync)</Text>
      <Input label="API key" value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} placeholder="From developers.kite.trade" hint="The API key is not secret. Never enter your API secret here — it lives only on your auth server." />
      <Input
        label="Auth server URL"
        value={authServerUrl}
        onChangeText={setAuthServerUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://kite-auth.<you>.workers.dev"
        error={urlValid ? null : 'Must start with https://'}
        hint="Your deployed Cloudflare Worker (see server/kite-auth-worker in the project). Set the Kite app's redirect URL to this address + /callback."
      />
      <View style={styles.box}>
        <Text style={type.small}>• Zerodha sessions expire every day at 6 AM — log in once a day to sync.</Text>
        <Text style={type.small}>• Sync reads your holdings, today’s trades and prices. Older trades come from the tradebook CSV.</Text>
        <Text style={type.small}>• Your access token is kept in the phone’s secure storage and is not included in backups.</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  box: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  stat: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  statValue: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  mismatch: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
});

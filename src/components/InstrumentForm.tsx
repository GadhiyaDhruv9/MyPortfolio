import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useData } from '../data/DataContext';
import { uid } from '../data/store';
import type { Instrument, InstrumentType, MarketCapBucket } from '../domain/types';
import { parseNumber } from '../lib/format';
import { spacing } from '../lib/theme';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { Select } from './Select';

const TYPES: { label: string; value: InstrumentType }[] = [
  { label: 'Equity', value: 'equity' },
  { label: 'ETF', value: 'etf' },
  { label: 'Mutual fund', value: 'mf' },
  { label: 'Sovereign Gold Bond', value: 'sgb' },
  { label: 'REIT', value: 'reit' },
  { label: 'InvIT', value: 'invit' },
];

const CAPS: { label: string; value: MarketCapBucket }[] = [
  { label: 'Large cap', value: 'large' },
  { label: 'Mid cap', value: 'mid' },
  { label: 'Small cap', value: 'small' },
  { label: 'Unknown', value: 'unknown' },
];

const EXCHANGES: { label: string; value: Instrument['exchange'] }[] = [
  { label: 'NSE', value: 'NSE' },
  { label: 'BSE', value: 'BSE' },
  { label: 'Other', value: 'OTHER' },
];

interface Props {
  initialSymbol?: string;
  onClose: () => void;
  onSaved: (instrument: Instrument) => void;
}

/** Adds a new instrument (the app has no online symbol lookup). */
export function InstrumentForm({ initialSymbol = '', onClose, onSaved }: Props) {
  const { data, upsertInstrument } = useData();
  const [symbol, setSymbol] = useState(initialSymbol.toUpperCase());
  const [companyName, setCompanyName] = useState('');
  const [exchange, setExchange] = useState<Instrument['exchange']>('NSE');
  const [kind, setKind] = useState<InstrumentType>('equity');
  const [sector, setSector] = useState('');
  const [industry, setIndustry] = useState('');
  const [cap, setCap] = useState<MarketCapBucket>('unknown');
  const [isin, setIsin] = useState('');
  const [fmv, setFmv] = useState('');

  const sym = symbol.trim().toUpperCase();
  const duplicate = data.instruments.some((i) => i.symbol === sym && i.exchange === exchange);
  const fmvValue = parseNumber(fmv);
  const valid = sym.length > 0 && companyName.trim().length > 0 && !duplicate && (fmv === '' || fmvValue > 0);

  const save = () => {
    const instrument: Instrument = {
      id: uid('in'),
      symbol: sym,
      exchange,
      companyName: companyName.trim(),
      type: kind,
      sector: sector.trim() || undefined,
      industry: industry.trim() || undefined,
      marketCapBucket: cap,
      isin: isin.trim() || undefined,
      fmv31Jan2018: fmv === '' ? null : fmvValue,
    };
    upsertInstrument(instrument);
    onSaved(instrument);
  };

  return (
    <Modal visible onClose={onClose} title="New instrument" tall footer={<Button title="Add instrument" onPress={save} disabled={!valid} />}>
      <View style={styles.row}>
        <Input
          label="Symbol"
          value={symbol}
          onChangeText={setSymbol}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{ flex: 1 }}
          error={duplicate ? 'Already exists' : null}
        />
        <Select label="Exchange" value={exchange} options={EXCHANGES} onChange={setExchange} style={{ width: 120 }} />
      </View>
      <Input label="Company / fund name" value={companyName} onChangeText={setCompanyName} />
      <View style={styles.row}>
        <Select label="Type" value={kind} options={TYPES} onChange={setKind} style={{ flex: 1 }} />
        <Select label="Market cap" value={cap} options={CAPS} onChange={setCap} style={{ flex: 1 }} />
      </View>
      <View style={styles.row}>
        <Input label="Sector" value={sector} onChangeText={setSector} placeholder="e.g. IT" style={{ flex: 1 }} />
        <Input label="Industry" value={industry} onChangeText={setIndustry} style={{ flex: 1 }} />
      </View>
      <Input label="ISIN (optional)" value={isin} onChangeText={setIsin} autoCapitalize="characters" />
      <Input
        label="FMV on 31 Jan 2018 (optional)"
        prefix="₹"
        numeric
        value={fmv}
        onChangeText={setFmv}
        hint="Only needed for shares bought before 1 Feb 2018 (LTCG grandfathering)."
        error={fmv !== '' && !(fmvValue > 0) ? 'Enter a price above 0' : null}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
});

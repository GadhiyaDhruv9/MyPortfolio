import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAX_DISCLAIMER } from '../domain/tax';
import { colors, radius, spacing } from '../lib/theme';
import { Modal } from './Modal';

/** "i" button that explains how a number was calculated. */
export function InfoButton({ title, body }: { title: string; body: string | string[] }) {
  const [open, setOpen] = useState(false);
  const paragraphs = Array.isArray(body) ? body : [body];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`How ${title} is calculated`}>
        <Ionicons name="information-circle-outline" size={17} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={styles.box}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={styles.text}>
              {p}
            </Text>
          ))}
        </View>
      </Modal>
    </>
  );
}

export function TaxDisclaimer() {
  return (
    <View style={styles.disclaimer} accessibilityRole="text">
      <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
      <Text style={styles.disclaimerText}>{TAX_DISCLAIMER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  text: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  disclaimer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  disclaimerText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.warning, fontWeight: '500' },
});

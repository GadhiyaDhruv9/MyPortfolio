import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../lib/theme';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
  prefix?: string;
  numeric?: boolean;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Input({ label, error, hint, prefix, numeric, right, style, multiline, ...rest }: InputProps) {
  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, multiline && { minHeight: 72, alignItems: 'flex-start' }, error ? { borderColor: colors.errorBright } : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          keyboardType={numeric ? 'decimal-pad' : rest.keyboardType}
          multiline={multiline}
          style={[styles.input, multiline && { textAlignVertical: 'top', paddingTop: 10 }]}
          accessibilityLabel={label}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  prefix: { fontSize: 15, color: colors.textMuted, marginRight: 4 },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 },
  error: { fontSize: 12, color: colors.error },
  hint: { fontSize: 12, color: colors.textMuted },
});

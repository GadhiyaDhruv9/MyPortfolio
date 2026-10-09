import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from '../lib/theme';
import { IconButton } from './Button';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned below the scrollable content (e.g. Save button). */
  footer?: ReactNode;
  /** Take most of the screen height (forms, details). */
  tall?: boolean;
  scroll?: boolean;
}

/** Bottom sheet built on the platform modal. */
export function Modal({ visible, onClose, title, subtitle, children, footer, tall, scroll = true }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.avoider} pointerEvents="box-none">
          <View style={[styles.sheet, tall && { height: '92%' }, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={type.h2} numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? <Text style={[type.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
              </View>
              <IconButton icon="close" label="Close" onPress={onClose} size={22} />
            </View>
            {scroll ? (
              <ScrollView
                style={tall ? { flex: 1 } : undefined}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.content, tall && { flex: 1 }]}>{children}</View>
            )}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  avoider: { width: '100%', maxHeight: '100%', justifyContent: 'flex-end', flexShrink: 1 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    maxHeight: '92%',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#cbd5e1', alignSelf: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});

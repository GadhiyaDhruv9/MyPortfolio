import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../src/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: 'Dashboard', icon: 'pie-chart-outline', activeIcon: 'pie-chart' },
  { name: 'holdings', title: 'Holdings', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { name: 'transactions', title: 'Transactions', icon: 'swap-vertical-outline', activeIcon: 'swap-vertical' },
  { name: 'reports', title: 'Reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

// On web the default 49pt bar is too short for icon + label and clips the labels
// (visible in the iPhone home-screen app), so give it a little more room there.
const WEB_TAB_BAR_HEIGHT = 58;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          ...(Platform.OS === 'web' && { height: WEB_TAB_BAR_HEIGHT + insets.bottom }),
        },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? t.activeIcon : t.icon} size={size - 2} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}

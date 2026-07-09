// Pilot bottom-tab navigation: Jobs / Alerts / CV Builder / Logbook / Profile.
// Employers never reach this group (they land on /(app)/employer/pending-approval,
// which has no tabs). Jobs/Logbook/Profile are their own stacks (see the nested
// _layout.tsx files); Alerts and CV Builder are single screens. Airlines lives
// outside the tabs at /(app)/airlines (reached from job cards + Settings).
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUnread } from '../../../src/context/UnreadContext';
import { makeTabBarStyle } from '../../../src/theme/tabBar';
import { useTheme } from '../../../src/theme/ThemeContext';
import { fontFamilies } from '../../../src/theme/tokens';

export default function TabsLayout() {
  const { unread } = useUnread();
  const { colors: pilot, mode } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: pilot.navy,
        tabBarInactiveTintColor: pilot.muted,
        tabBarStyle: makeTabBarStyle(pilot),
        tabBarItemStyle: { borderRadius: 24, marginHorizontal: 2, overflow: 'hidden' },
        tabBarActiveBackgroundColor: mode === 'dark' ? 'rgba(111,169,224,0.16)' : 'rgba(0,63,136,0.08)',
        tabBarLabelStyle: { fontFamily: fontFamilies.bodyMedium, fontSize: 10.5 },
        sceneStyle: { backgroundColor: pilot.cream },
      }}
    >
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: pilot.navy, fontFamily: fontFamilies.bodyBold, fontSize: 10 },
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cv-builder"
        options={{
          title: 'CV',
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="logbook"
        options={{
          title: 'Logbook',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

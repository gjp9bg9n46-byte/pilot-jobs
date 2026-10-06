// Pilot bottom-tab navigation: Dashboard / Jobs / CV Builder / Logbook / Profile.
// Employers never reach this group (they land on /(app)/employer/pending-approval,
// which has no tabs). Jobs/Logbook/Profile are their own stacks (see the nested
// _layout.tsx files); Dashboard, Alerts and CV Builder are single screens.
// Airlines + Alerts live outside the tab bar (href:null) — Airlines is reached
// from job cards + Settings; Alerts is folded into the new Dashboard.
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
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: pilot.navy,
        tabBarInactiveTintColor: pilot.muted,
        tabBarStyle: makeTabBarStyle(pilot),
        tabBarItemStyle: { borderRadius: 24, marginHorizontal: 1 },
        tabBarActiveBackgroundColor: mode === 'dark' ? 'rgba(111,169,224,0.16)' : 'rgba(0,63,136,0.08)',
        // allowFontScaling off + explicit lineHeight: long labels ("Logbook")
        // were truncated/descender-clipped when the phone's text size scaled
        // the label beyond its ~60px slot in the floating pill.
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontFamily: fontFamilies.bodyMedium, fontSize: 9, lineHeight: 12 },
        sceneStyle: { backgroundColor: pilot.cream },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: pilot.navy, fontFamily: fontFamilies.bodyBold, fontSize: 10 },
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="airlines" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
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

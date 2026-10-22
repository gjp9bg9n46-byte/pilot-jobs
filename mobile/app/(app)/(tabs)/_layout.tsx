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
  const { newJobs } = useUnread();
  const { colors: pilot, mode } = useTheme();
  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: pilot.navy,
        tabBarInactiveTintColor: pilot.muted,
        tabBarStyle: makeTabBarStyle(pilot),
        // The selected tab used to read as a square grey block inside a round
        // bar, because the highlight filled the item to the bar's own edges.
        // Vertical margin gives it even space all round, so it reads as a pill
        // that belongs to the bar's shape at any text size.
        tabBarItemStyle: { borderRadius: 20, marginVertical: 3, marginHorizontal: 3 },
        tabBarActiveBackgroundColor: mode === 'dark' ? 'rgba(111,169,224,0.16)' : 'rgba(0,63,136,0.08)',
        // One badge, 18px with a white ring, tucked on the icon's corner —
        // it was nearly as big as the icon it sat on.
        tabBarBadgeStyle: {
          minWidth: 18, height: 18, borderRadius: 9, lineHeight: 14,
          fontSize: 10.5, fontFamily: fontFamilies.bodyBold,
          backgroundColor: pilot.navy, color: '#fff',
          borderWidth: 2, borderColor: pilot.surface,
          transform: [{ translateX: -4 }, { translateY: 3 }],
        },
        // allowFontScaling off + explicit lineHeight: long labels ("Logbook")
        // were truncated/descender-clipped when the phone's text size scaled
        // the label beyond its ~60px slot in the floating pill.
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontFamily: fontFamilies.bodyMedium, fontSize: 9, lineHeight: 12, marginBottom: 0, paddingBottom: 0 },
        sceneStyle: { backgroundColor: pilot.cream },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          // A#2 — "Dashboard" was clipped on a real device and the badge sat on
          // top of it. "Home" fits the pill at any text size.
          title: 'Home',
          // A#1 — the ONE badge in the app: new jobs since the last visit. Same
          // count, same timestamp as the dashboard's own line (newSinceLastVisit).
          tabBarBadge: newJobs > 0 ? (newJobs > 99 ? '99+' : newJobs) : undefined,
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

// Admin — operator-only dark surface (third theme after pilot editorial-light
// and employer b2b-grey). Web appends admin links to the pilot sidebar; on mobile
// the native equivalent is a dedicated dark bottom-tab nav: Dashboard / Employers /
// Moderation — the same three destinations web exposes. Only reachable by a pilot
// with isAdmin (login routes them here; the screens themselves 404-guard on 401/404).
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { admin } from '../../../src/theme/tokens';

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: admin.surface, borderTopColor: admin.line, borderTopWidth: 1 },
        tabBarActiveTintColor: admin.accent,
        tabBarInactiveTintColor: admin.muted,
        sceneStyle: { backgroundColor: admin.bg },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="employers"
        options={{ title: 'Employers', tabBarIcon: ({ color, size }) => <Ionicons name="business-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="moderation"
        options={{ title: 'Moderation', tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} /> }}
      />
    </Tabs>
  );
}

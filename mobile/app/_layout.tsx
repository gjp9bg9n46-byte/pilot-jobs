// Expo-router root layout.
//
// Responsibilities:
//   - Load the web brand fonts (Fraunces / Inter / JetBrains Mono) via expo-font.
//   - Provide SafeAreaProvider + GestureHandler root + AuthProvider to the tree.
//   - Gate navigation on auth: unauthenticated users are pushed to (auth), and
//     authenticated users landing in (auth) are pushed into (app).
import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CACHE_BUSTER, persister, queryClient } from '../src/lib/queryClient';
import { usePrefetchTabs } from '../src/hooks/queries';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { pilot } from '../src/theme/tokens';

// Reactive auth gate — PROTECT-ONLY. Kicks unauthenticated users out of the
// (app) area to /login (this is what bounces a user back after a 401-driven
// logout). It intentionally does NOT redirect authenticated users INTO the app:
// the login/register screens navigate explicitly (by account type), which avoids
// a redirect race with those flows.
function AuthGate() {
  const { token, loading } = useAuth();
  // Warm Home, Jobs, Logbook and CV as soon as there is a session, so the first
  // visit to each tab reads from cache instead of waiting on the network.
  usePrefetchTabs(!!token && !loading);
  const { colors, mode } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const seg = segments as string[];
    const inAuthGroup = seg[0] === '(auth)';
    const inAppGroup = seg[0] === '(app)';
    if (!token && inAppGroup) {
      router.replace('/(auth)/login');
    }
    // atRoot ("/") is handled by app/index.tsx, which redirects by account type.
    void inAuthGroup;
  }, [token, loading, segments, router]);

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
  });

  // Keep the native splash (cream) until fonts resolve; render nothing meanwhile.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: pilot.cream }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* The cache is written to AsyncStorage and restored on launch, so a
              cold start paints last session's data before the network answers. */}
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, buster: CACHE_BUSTER, maxAge: 7 * 24 * 60 * 60 * 1000 }}
          >
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Auth-area layout. Simple headerless stack over the cream editorial background.
import { Stack } from 'expo-router';
import { pilot } from '../../src/theme/tokens';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: pilot.cream },
      }}
    />
  );
}

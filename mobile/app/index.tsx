// Entry route. Redirects based on auth state once the initial hydrate finishes.
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth, Employer } from '../src/context/AuthContext';
import { pilot } from '../src/theme/tokens';
import { employerDest } from '../src/lib/employerNav';

export default function Index() {
  const { token, accountType, user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: pilot.cream, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={pilot.navy} />
      </View>
    );
  }

  if (!token) return <Redirect href="/(auth)/login" />;
  // Employers land by status (dashboard / pending / rejected-suspended); pilots on jobs.
  if (accountType === 'employer') return <Redirect href={employerDest((user as Employer | null)?.status) as never} />;
  return <Redirect href="/(app)/jobs" />;
}

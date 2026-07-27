import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { OnboardingFlow } from './src/features/onboarding/OnboardingFlow';
import { PostSignupOnboardingFlow } from './src/features/onboarding/PostSignupOnboardingFlow';
import { queryClient } from './src/infrastructure/query';
import { ProductNavigator } from './src/navigation/ProductNavigator';
import { rememberPendingDeepLink } from './src/navigation/pendingDeepLink';
import { SessionProvider, useSession } from './src/session/SessionProvider';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

function AppGate() {
  const { state, completeOnboarding, logout, refresh } = useSession();

  useEffect(() => {
    if (state.status !== 'booting') SplashScreen.hide();
  }, [state.status]);

  useEffect(() => {
    if (state.status === 'authenticated') return undefined;
    const subscription = Linking.addEventListener('url', ({ url }) => rememberPendingDeepLink(url));
    return () => subscription.remove();
  }, [state.status]);

  if (state.status === 'booting') return null;

  if (state.status === 'anonymous') {
    return <View style={styles.dark}><StatusBar style="light" /><OnboardingFlow /></View>;
  }

  if (state.status === 'error') {
    return (
      <View style={styles.error}>
        <StatusBar style="light" />
        <Text style={styles.errorTitle}>Could not load your account</Text>
        <Text style={styles.errorBody}>{state.error.message}</Text>
        <Pressable onPress={() => void refresh()} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => void logout()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (state.status === 'onboarding') {
    return (
      <View style={styles.dark}>
        <StatusBar style="light" />
        <PostSignupOnboardingFlow
          onAuthenticationRequired={logout}
          onComplete={completeOnboarding}
        />
      </View>
    );
  }

  return (
    <View style={styles.dark}>
      <StatusBar style="light" />
      <ProductNavigator user={state.user} />
    </View>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <AppGate />
        </SessionProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#080808' },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#161616' },
  errorTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  errorBody: { color: 'rgba(255,255,255,0.58)', textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, backgroundColor: '#B82F29' },
  buttonText: { color: '#fff', fontWeight: '600' },
  signOut: { color: 'rgba(255,255,255,0.65)', padding: 10 },
});

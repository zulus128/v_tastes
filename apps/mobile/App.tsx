import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { OnboardingFlow } from './src/features/onboarding/OnboardingFlow';
import { PostSignupOnboardingFlow } from './src/features/onboarding/PostSignupOnboardingFlow';
import { queryClient, queryPersister } from './src/infrastructure/query';
import { configureObservability } from './src/infrastructure/observability';
import { ProductNavigator } from './src/navigation/ProductNavigator';
import { rememberPendingDeepLink } from './src/navigation/pendingDeepLink';
import { SessionProvider, useSession } from './src/session/SessionProvider';
import { ThemeProvider, useAppTheme } from './src/ui/ThemeProvider';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 500, fade: true });
configureObservability();

function AppGate() {
  const { state, completeOnboarding, logout, refresh } = useSession();
  const { colors, isDark } = useAppTheme();
  const splashHidden = useRef(false);

  const onRootLayout = useCallback(() => {
    if (state.status === 'booting' || splashHidden.current) return;
    splashHidden.current = true;
    void SplashScreen.hideAsync();
  }, [state.status]);

  useEffect(() => {
    if (state.status === 'authenticated') return undefined;
    const subscription = Linking.addEventListener('url', ({ url }) => rememberPendingDeepLink(url));
    return () => subscription.remove();
  }, [state.status]);

  if (state.status === 'booting') return null;

  if (state.status === 'anonymous') {
    return <View onLayout={onRootLayout} style={[styles.root, { backgroundColor: colors.background }]}><StatusBar style={isDark ? 'light' : 'dark'} /><OnboardingFlow /></View>;
  }

  if (state.status === 'error') {
    return (
      <View onLayout={onRootLayout} style={[styles.error, { backgroundColor: colors.canvas }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Could not load your account</Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>{state.error.message}</Text>
        <Pressable onPress={() => void refresh()} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => void logout()}>
          <Text style={[styles.signOut, { color: colors.textMuted }]}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (state.status === 'onboarding') {
    return (
      <View onLayout={onRootLayout} style={[styles.root, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <PostSignupOnboardingFlow
          onAuthenticationRequired={logout}
          onComplete={completeOnboarding}
        />
      </View>
    );
  }

  return (
    <View onLayout={onRootLayout} style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ProductNavigator user={state.user} />
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ maxAge: 24 * 60 * 60_000, persister: queryPersister }}
        >
          <SessionProvider>
            <AppGate />
          </SessionProvider>
        </PersistQueryClientProvider>
      </AppErrorBoundary>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#161616' },
  errorTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  errorBody: { color: 'rgba(255,255,255,0.58)', textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, backgroundColor: '#B82F29' },
  buttonText: { color: '#fff', fontWeight: '600' },
  signOut: { color: 'rgba(255,255,255,0.65)', padding: 10 },
});

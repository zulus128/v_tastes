import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DemoScreen } from './src/features/demo/DemoScreen';
import { OnboardingFlow } from './src/features/onboarding/OnboardingFlow';
import { auth } from './src/infrastructure/firebase';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (authReady) SplashScreen.hide();
  }, [authReady]);

  if (!authReady) {
    return null;
  }

  if (!user) {
    return <View style={styles.dark}><StatusBar style="light" /><OnboardingFlow /></View>;
  }

  return <View style={styles.product}><StatusBar style="dark" /><DemoScreen user={user} /></View>;
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#080808' },
  product: { flex: 1, paddingTop: 54, backgroundColor: '#f6f4ef' },
});

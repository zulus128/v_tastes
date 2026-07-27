import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DemoScreen } from './src/features/demo/DemoScreen';
import { OnboardingFlow } from './src/features/onboarding/OnboardingFlow';
import { PostSignupOnboardingFlow } from './src/features/onboarding/PostSignupOnboardingFlow';
import { auth } from './src/infrastructure/firebase';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [postSignupDone, setPostSignupDone] = useState<boolean | null>(null);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (authReady) SplashScreen.hide();
  }, [authReady]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setPostSignupDone(null);
      return () => { active = false; };
    }
    setPostSignupDone(null);
    AsyncStorage.getItem(`tastes:post-signup-onboarding:${user.uid}`).then((value) => {
      if (active) setPostSignupDone(value === 'complete');
    });
    return () => { active = false; };
  }, [user]);

  if (!authReady) {
    return null;
  }

  if (!user) {
    return <View style={styles.dark}><StatusBar style="light" /><OnboardingFlow /></View>;
  }

  if (postSignupDone === null) return <View style={styles.dark} />;

  if (!postSignupDone) {
    return <View style={styles.dark}><StatusBar style="light" /><PostSignupOnboardingFlow
      onAuthenticationRequired={async () => {
        setUser(null);
        await signOut(auth);
      }}
      onComplete={() => {
        AsyncStorage.setItem(`tastes:post-signup-onboarding:${user.uid}`, 'complete');
        setPostSignupDone(true);
      }}
    /></View>;
  }

  return <View style={styles.product}><StatusBar style="dark" /><DemoScreen user={user} /></View>;
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#080808' },
  product: { flex: 1, paddingTop: 54, backgroundColor: '#f6f4ef' },
});

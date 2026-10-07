import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Dashboard } from './Dashboard';
import { loadLang, type Lang } from './i18n';
import { colours, fontFiles } from './theme';
import { loadView, type ViewId } from './views';

// The splash screen stays up until the fonts and the saved choices are in, so nothing reflows.
void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const [prefs, setPrefs] = useState<{ lang: Lang; view: ViewId } | null>(null);

  useEffect(() => {
    void Promise.all([loadLang(), loadView()]).then(([lang, view]) => setPrefs({ lang, view }));
  }, []);

  // A font that fails to load falls back to the system's rather than holding the app up.
  const ready = (fontsLoaded || fontError !== null) && prefs !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Dashboard initialLang={prefs.lang} initialView={prefs.view} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colours.bg,
  },
});

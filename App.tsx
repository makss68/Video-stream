import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuthStore } from './src/store/authStore';
import { useLibraryStore } from './src/store/libraryStore';
import Navigation from './src/navigation';

// On Android, load fonts from the guaranteed assets/fonts/ path rather than
// the Metro asset registry, which can fail to resolve on Android TV.
const ANDROID_FONT_SOURCES = Platform.OS === 'android'
  ? {
      'material-community': { uri: 'file:///android_asset/fonts/MaterialCommunityIcons.ttf' },
      'ionicons': { uri: 'file:///android_asset/fonts/Ionicons.ttf' },
    }
  : {
      ...Ionicons.font,
      ...MaterialCommunityIcons.font,
    };

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateLibrary = useLibraryStore((s) => s.hydrate);

  Font.useFonts(ANDROID_FONT_SOURCES);

  useEffect(() => {
    hydrate();
    hydrateLibrary();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Navigation />
    </SafeAreaProvider>
  );
}

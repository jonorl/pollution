import type { ExpoConfig } from 'expo/config';

import { version } from './package.json';

// Android only installs an update over an existing copy when this whole number has grown, so it
// comes from the version (1.2.3 → 10203) and package.json stays the one place to bump.
const [major, minor, patch] = version.split('.').map(Number);

const BG = '#05070b';

const config: ExpoConfig = {
  name: 'Air quality',
  slug: 'pollution',
  version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  // One committed dark look, as on the web.
  userInterfaceStyle: 'dark',
  backgroundColor: BG,
  android: {
    package: 'dev.jonathanorlowski.pollution',
    versionCode: major * 10000 + minor * 100 + patch,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: BG,
    },
    predictiveBackGestureEnabled: false,
    // Expo's template asks for these; the app only needs the internet, and a downloaded APK that
    // wants to draw over other apps or read storage looks like something it isn't.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.VIBRATE',
    ],
  },
  plugins: [
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, backgroundColor: BG }],
    'expo-localization',
    './plugins/withReleaseSigning',
  ],
};

export default config;

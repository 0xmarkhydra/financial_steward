import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'cloud.financialsteward.app',
  appName: 'Financial Steward',
  webDir: 'dist',
  android: { backgroundColor: '#f6f8fc', allowMixedContent: false },
  ios: { backgroundColor: '#f6f8fc', contentInset: 'automatic' },
  plugins: { SplashScreen: { launchShowDuration: 1200, backgroundColor: '#f6f8fc' } },
};
export default config;

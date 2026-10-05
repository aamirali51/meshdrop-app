/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import App from './App';
import { name as appName } from './app.json';

function AppRoot() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <App />
    </SafeAreaProvider>
  );
}

AppRegistry.registerComponent(appName, () => AppRoot);

import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

enableScreens(true);

import App from './App';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      display: flex;
      flex: 1;
      flex-direction: column;
      background-color: #f8fafc;
      overflow-x: hidden;
    }
  `;
  document.head.appendChild(style);
}

registerRootComponent(App);

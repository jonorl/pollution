import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Whether the app is on screen; polling stops while it isn't, to spare the battery and data. */
export function useAppActive(): boolean {
  // Android starts out 'unknown' until its first change; only 'background' means hidden.
  const [active, setActive] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state !== 'background'));
    return () => subscription.remove();
  }, []);

  return active;
}

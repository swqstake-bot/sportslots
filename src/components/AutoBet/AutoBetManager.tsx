import { useAutoBetEngine } from '../../hooks/useAutoBetEngine';

export function AutoBetManager() {
  // This hook handles the background logic (fetching, filtering, betting)
  useAutoBetEngine();
  return null;
}

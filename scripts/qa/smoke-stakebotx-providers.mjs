/**
 * Ensures the StakeBot X app provider entrypoint still wires Theme + shell state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const providersPath = path.join(repoRoot, 'apps', 'stakebotx-ui', 'app', 'providers.tsx');

const src = fs.readFileSync(providersPath, 'utf8');
if (!src.includes('AppStateProvider')) {
  throw new Error('apps/stakebotx-ui/app/providers.tsx must contain AppStateProvider');
}
if (!src.includes('ThemeProvider')) {
  throw new Error('apps/stakebotx-ui/app/providers.tsx must contain ThemeProvider');
}
console.log('[qa:smoke:provider] ok — providers entrypoint present');

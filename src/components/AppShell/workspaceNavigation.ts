import type { AppView, CasinoMode } from '../../store/uiStore'

export interface WorkspaceDestination {
  view: AppView
  casinoMode?: CasinoMode
  sportsTab?: 'settings' | 'copy' | 'bets' | 'logs'
  hubTab?: 'casino' | 'autorun' | 'archive'
  promotionsTab?: 'casino' | 'forum' | 'telegram'
  slotInstanceId?: string
}

export type WorkspaceIconName = 'overview' | 'casino' | 'sports' | 'challenges' | 'analysis' | 'settings'

export interface WorkspaceNavigationItem {
  id: string
  label: string
  icon: WorkspaceIconName
  destination: WorkspaceDestination
  description: string
  children?: Array<{ id: string; label: string; destination: WorkspaceDestination }>
}

export const WORKSPACE_NAVIGATION: WorkspaceNavigationItem[] = [
  {
    id: 'overview', label: 'Overview', icon: 'overview', destination: { view: 'overview' },
    description: 'Account details, session status and your workspaces.',
  },
  {
    id: 'casino', label: 'Casino', icon: 'casino', destination: { view: 'casino', casinoMode: 'play' },
    description: 'Slots, Originals and Bonus Hunt.',
    children: [
      { id: 'slots', label: 'Slots', destination: { view: 'casino', casinoMode: 'play' } },
      { id: 'originals', label: 'Originals', destination: { view: 'casino', casinoMode: 'originals' } },
      { id: 'bonus-hunt', label: 'Bonus Hunt', destination: { view: 'casino', casinoMode: 'bonushunt' } },
    ],
  },
  {
    id: 'sports', label: 'Sports', icon: 'sports', destination: { view: 'sports' },
    description: 'Configure AutoBet, Copy and manage active bets.',
  },
  {
    id: 'challenges', label: 'Challenges & promos', icon: 'challenges',
    destination: { view: 'casino', casinoMode: 'challengeHub' },
    description: 'Challenge Hunter, balance rules and promotions.',
    children: [
      { id: 'hunter', label: 'Hunter', destination: { view: 'casino', casinoMode: 'challengeHub' } },
      { id: 'promotions', label: 'Promotions', destination: { view: 'casino', casinoMode: 'promotions' } },
    ],
  },
  {
    id: 'analysis', label: 'Import analysis', icon: 'analysis', destination: { view: 'logger' },
    description: 'Import a session file to inspect and export its bets.',
  },
]

export function isWorkspaceItemActive(item: WorkspaceNavigationItem, currentView: AppView, casinoMode: CasinoMode): boolean {
  if (item.destination.view !== currentView) return false
  if (currentView !== 'casino') return true
  return item.children?.some((child) => child.destination.casinoMode === casinoMode) ?? item.destination.casinoMode === casinoMode
}

export function workspacePageTitle(currentView: AppView, casinoMode: CasinoMode): string {
  if (currentView === 'settings') return 'Settings'
  if (currentView === 'casino' && casinoMode === 'logs') return 'Diagnostics'
  const item = WORKSPACE_NAVIGATION.find((entry) => isWorkspaceItemActive(entry, currentView, casinoMode))
  const child = item?.children?.find((entry) => entry.destination.casinoMode === casinoMode)
  return child?.label ?? item?.label ?? 'Overview'
}

export interface VipProgressInfo {
  currentRank: string
  nextRank: string
  progress: number
  remainingWager: number
}

const VIP_RANKS = [
  { name: 'None', threshold: 0 },
  { name: 'Bronze', threshold: 10_000, id: 'bronze' },
  { name: 'Silver', threshold: 50_000, id: 'silver' },
  { name: 'Gold', threshold: 100_000, id: 'gold' },
  { name: 'Platinum', threshold: 250_000, id: 'platinum' },
  { name: 'Platinum II', threshold: 500_000, id: 'wagered(500k)' },
  { name: 'Platinum III', threshold: 1_000_000, id: 'wagered(1m)' },
  { name: 'Platinum IV', threshold: 2_500_000, id: 'wagered(2.5m)' },
  { name: 'Platinum V', threshold: 5_000_000, id: 'wagered(5m)' },
  { name: 'Platinum VI', threshold: 10_000_000, id: 'wagered(10m)' },
  { name: 'Diamond', threshold: 25_000_000, id: 'wagered(25m)' },
  { name: 'Diamond II', threshold: 50_000_000, id: 'wagered(50m)' },
  { name: 'Diamond III', threshold: 100_000_000, id: 'wagered(100m)' },
  { name: 'Diamond IV', threshold: 250_000_000, id: 'wagered(250m)' },
  { name: 'Diamond V', threshold: 500_000_000, id: 'wagered(500m)' },
  { name: 'Obsidian', threshold: 1_000_000_000, id: 'wagered(1b)' },
  { name: 'Obsidian II', threshold: 2_500_000_000, id: 'wagered(2.5b)' },
  { name: 'Opal', threshold: 5_000_000_000, id: 'wagered(5b)' },
  { name: 'Opal II', threshold: 10_000_000_000, id: 'wagered(10b)' },
] as const

/** SSP SelectionScreen / Navbar — maps Stake flagProgress to rank + bar. */
export function calculateVipInfo(flag: string, progress: number): VipProgressInfo {
  const lowerFlag = String(flag || 'none').toLowerCase()
  let currentRankIndex = -1

  if (lowerFlag === 'none') {
    currentRankIndex = 0
  } else {
    currentRankIndex = VIP_RANKS.findIndex((rank) => {
      const id = 'id' in rank ? rank.id : null
      return id != null && lowerFlag.includes(String(id).toLowerCase())
    })
    if (currentRankIndex === -1) {
      currentRankIndex = VIP_RANKS.findIndex((rank) => rank.name.toLowerCase() === lowerFlag)
    }
  }

  if (currentRankIndex === -1) currentRankIndex = 0

  const currentRank = VIP_RANKS[currentRankIndex]
  const nextRank = VIP_RANKS[currentRankIndex + 1]
  const safeProgress = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0

  if (!nextRank) {
    return {
      currentRank: currentRank.name,
      nextRank: 'Max',
      progress: 1,
      remainingWager: 0,
    }
  }

  const gap = nextRank.threshold - currentRank.threshold
  return {
    currentRank: currentRank.name,
    nextRank: nextRank.name,
    progress: safeProgress,
    remainingWager: gap * (1 - safeProgress),
  }
}

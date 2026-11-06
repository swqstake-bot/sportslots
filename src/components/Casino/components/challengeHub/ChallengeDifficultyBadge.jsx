/**
 * StakeCruncher difficulty badge for challenge rows.
 */

import { formatExpectedSpins, formatHitProbability } from '../../utils/challengeDifficulty'

const GRADE_CLASS = {
  easy: 'challenge-diff--easy',
  medium: 'challenge-diff--medium',
  hard: 'challenge-diff--hard',
  extreme: 'challenge-diff--extreme',
  impossible: 'challenge-diff--impossible',
  error: 'challenge-diff--error',
  unknown: 'challenge-diff--unknown',
}

export default function ChallengeDifficultyBadge({
  assessment,
  loading = false,
  compact = false,
  onAnalyze,
}) {
  if (loading) {
    return (
      <span className="challenge-diff challenge-diff--loading" title="Loading StakeCruncher stats…">
        {compact ? '…' : 'Analyzing…'}
      </span>
    )
  }

  const grade = assessment?.grade || 'unknown'
  const retry = !compact && assessment && onAnalyze && (grade === 'error' || grade === 'unknown')
  if (!assessment || retry) {
    return (
      <button
        type="button"
        className="challenge-diff challenge-diff--analyze"
        title={retry ? assessment.hint : 'Estimate difficulty (StakeCruncher)'}
        onClick={(e) => {
          e.stopPropagation()
          onAnalyze?.()
        }}
      >
        {retry ? (grade === 'error' ? 'Error · Retry' : 'No data · Retry') : 'Analyze'}
      </button>
    )
  }

  const cls = GRADE_CLASS[grade] || GRADE_CLASS.unknown
  const badge = <span className={`challenge-diff ${cls}`} title={assessment.hint || assessment.label}>{assessment.label}</span>
  const { hitProbability, expectedSpins } = assessment
  if (compact || !(hitProbability > 0) || grade === 'unknown' || grade === 'impossible') return badge

  const chance = hitProbability < 0.000001 ? '<0.0001%' : formatHitProbability(hitProbability)
  return (
    <span className="challenge-diff-result">
      {badge}
      <small>
        {chance} per spin{expectedSpins > 0 ? ` · ${formatExpectedSpins(expectedSpins)} avg. spins` : ''}
      </small>
    </span>
  )
}

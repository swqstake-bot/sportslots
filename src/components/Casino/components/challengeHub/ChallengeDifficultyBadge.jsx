/**
 * StakeCruncher difficulty badge for challenge rows.
 */

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
        …
      </span>
    )
  }

  if (!assessment) {
    return (
      <button
        type="button"
        className="challenge-diff challenge-diff--analyze"
        title="Estimate difficulty (StakeCruncher)"
        onClick={(e) => {
          e.stopPropagation()
          onAnalyze?.()
        }}
      >
        Analyze
      </button>
    )
  }

  const grade = assessment.grade || 'unknown'
  const cls = GRADE_CLASS[grade] || GRADE_CLASS.unknown
  const sub =
    !compact && assessment.hitProbability != null && assessment.grade !== 'unknown' && assessment.grade !== 'impossible'
      ? ` · ${(assessment.hitProbability * 100).toFixed(assessment.hitProbability >= 0.01 ? 2 : 3)}%`
      : ''

  return (
    <span className={`challenge-diff ${cls}`} title={assessment.hint || assessment.label}>
      {assessment.label}
      {sub}
    </span>
  )
}

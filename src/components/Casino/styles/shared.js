/**
 * Shared style objects using design tokens.
 */
export const tokens = {
  space1: 'var(--space-1)',
  space2: 'var(--space-2)',
  space3: 'var(--space-3)',
  space4: 'var(--space-4)',
  space5: 'var(--space-5)',
  space6: 'var(--space-6)',
  space8: 'var(--space-8)',
  radiusSm: 'var(--radius-sm)',
  radiusMd: 'var(--radius-md)',
  radiusLg: 'var(--radius-lg)',
  textXs: 'var(--text-xs)',
  textSm: 'var(--text-sm)',
  textBase: 'var(--text-base)',
  textLg: 'var(--text-lg)',
  textXl: 'var(--text-xl)',
}

export const section = { marginBottom: tokens.space4 }
export const label = {
  display: 'block',
  fontSize: tokens.textXs,
  color: 'var(--text-muted)',
  marginBottom: tokens.space1,
}
export const row = { display: 'flex', gap: tokens.space3, flexWrap: 'wrap' }
export const input = {
  flex: 1,
  minWidth: 120,
  padding: `${tokens.space2} ${tokens.space3}`,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: tokens.radiusMd,
  color: 'var(--text)',
  fontSize: tokens.textSm,
}
export const btn = {
  padding: `${tokens.space3} ${tokens.space5}`,
  background: 'var(--accent)',
  color: 'var(--bg-deep)',
  border: 'none',
  borderRadius: tokens.radiusMd,
  fontWeight: 600,
  cursor: 'pointer',
}
export const btnSecondary = {
  padding: `${tokens.space2} ${tokens.space4}`,
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
  borderRadius: tokens.radiusSm,
  cursor: 'pointer',
  fontSize: tokens.textSm,
}
export const btnDanger = { ...btn, background: 'var(--error)' }
export const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: tokens.radiusLg,
  padding: tokens.space5,
}
export const cardElevated = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: tokens.radiusMd,
  padding: tokens.space4,
}
export const error = {
  marginTop: tokens.space3,
  padding: tokens.space2,
  background: 'rgba(255, 82, 82, 0.1)',
  border: '1px solid rgba(255, 82, 82, 0.3)',
  borderRadius: tokens.radiusSm,
  color: 'var(--error)',
  fontSize: tokens.textSm,
}

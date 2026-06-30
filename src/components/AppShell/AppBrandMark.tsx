import { APP_NAME } from '../../constants/branding'

interface AppBrandMarkProps {
  size?: number
  className?: string
}

/** Inline app icon (SVG). */
export function AppBrandMark({ size = 32, className }: AppBrandMarkProps) {
  return (
    <img
      src="/favicon.svg"
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  )
}

interface AppBrandTitleProps {
  suffix?: string
  className?: string
}

export function AppBrandTitle({ suffix, className }: AppBrandTitleProps) {
  return (
    <span className={className ?? 'app-brand-title'}>
      <span className="app-brand-title-sw">{APP_NAME.slice(0, 3)}</span>
      <span className="app-brand-title-bot">{APP_NAME.slice(3)}</span>
      {suffix ? <span className="app-brand-title-suffix">{suffix}</span> : null}
    </span>
  )
}

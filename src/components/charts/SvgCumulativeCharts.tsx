import { useMemo, useId, useReducer } from 'react'

const CHART_MAX_RAW_POINTS = 320
const CHART_MAX_BUCKETS = 200

/** Pfad-Punkte: bei kurzen Reihen 1:1, sonst Min/Max-Buckets (kein gleichmäßiges Resampling — das springt). */
function chartPathValues(arr: number[]): number[] {
  if (!arr.length) return []
  if (arr.length <= CHART_MAX_RAW_POINTS) return arr
  return downsampleWithExtrema(arr, CHART_MAX_BUCKETS)
}

/**
 * Verdichtet lange Reihen performant ohne Trendverlust:
 * pro Bucket werden Min/Max (in Original-Reihenfolge) behalten.
 * So bleibt der komplette Verlauf sichtbar, auch bei Millionen Punkten.
 */
function downsampleWithExtrema(arr: number[], targetBuckets: number): number[] {
  if (!arr.length || targetBuckets <= 0) return []
  if (arr.length <= targetBuckets * 2) return [...arr]
  const buckets = Math.max(1, Math.floor(targetBuckets))
  const bucketSize = arr.length / buckets
  const out: number[] = [arr[0]!]
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * bucketSize)
    const end = Math.min(arr.length, Math.floor((b + 1) * bucketSize))
    if (end <= start) continue
    let minV = Number.POSITIVE_INFINITY
    let maxV = Number.NEGATIVE_INFINITY
    let minI = start
    let maxI = start
    for (let i = start; i < end; i++) {
      const v = arr[i]!
      if (v < minV) {
        minV = v
        minI = i
      }
      if (v > maxV) {
        maxV = v
        maxI = i
      }
    }
    if (minI === maxI) {
      out.push(arr[minI]!)
    } else if (minI < maxI) {
      out.push(arr[minI]!, arr[maxI]!)
    } else {
      out.push(arr[maxI]!, arr[minI]!)
    }
  }
  const last = arr[arr.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

type AreaGeom = {
  lineD: string
  fillD: string
  zeroY: number | null
  stroke: string
  fill: string
}

function buildNetAreaGeometry(values: number[], lastForSign: number, maxPathPoints: number): AreaGeom {
  const W = 200
  const H = 50
  const pad = 4
  const innerW = W - 2 * pad
  const innerH = H - 2 * pad
  const autoBuckets = Math.max(220, Math.floor(W * 3))
  const targetBuckets = Number.isFinite(maxPathPoints) && maxPathPoints > 0 ? maxPathPoints : autoBuckets
  const nets = downsampleWithExtrema(values, targetBuckets)
  if (nets.length === 0) {
    return { lineD: '', fillD: '', zeroY: null, stroke: '#64748b', fill: 'rgba(100,116,139,0.12)' }
  }
  if (nets.length === 1) {
    const y = pad + innerH / 2
    const x0 = pad
    const x1 = pad + innerW
    const s = lastForSign >= 0 ? '#00e701' : '#f43f5e'
    return {
      lineD: `M ${x0} ${y} L ${x1} ${y}`,
      fillD: '',
      zeroY: y,
      stroke: s,
      fill: lastForSign >= 0 ? 'rgba(0,231,1,0.08)' : 'rgba(244,63,94,0.08)',
    }
  }
  const min = Math.min(0, ...nets)
  const max = Math.max(0, ...nets)
  const span = Math.max(max - min, 1e-6)
  const padY = span * 0.06
  const lo = min - padY
  const hi = max + padY
  const span2 = hi - lo
  const xAt = (i: number) => pad + (i / (nets.length - 1)) * innerW
  const yAt = (v: number) => pad + innerH * (1 - (v - lo) / span2)
  let d = ''
  for (let i = 0; i < nets.length; i++) {
    const x = xAt(i)
    const y = yAt(nets[i]!)
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `
  }
  const firstX = xAt(0)
  const lastX = xAt(nets.length - 1)
  const bottom = pad + innerH
  const fillD = `${d} L ${lastX.toFixed(2)} ${bottom} L ${firstX.toFixed(2)} ${bottom} Z`
  let zeroY = pad + innerH * (1 - (0 - lo) / span2)
  zeroY = Math.min(pad + innerH, Math.max(pad, zeroY))
  const stroke = lastForSign >= 0 ? '#00e701' : '#f43f5e'
  const fill = lastForSign >= 0 ? 'rgba(0,231,1,0.12)' : 'rgba(244,63,94,0.12)'
  return { lineD: d.trim(), fillD, zeroY, stroke, fill }
}

/** Fläche + 0-Linie (Session-Netto, Live-Werte) — kein Recharts. */
export function SvgNetAreaChart({
  values,
  height,
  strokeColor,
  lastSignFrom,
  maxPathPoints = 140,
  title,
}: {
  values: number[]
  height: number
  strokeColor: string
  lastSignFrom?: number
  maxPathPoints?: number
  title?: string
}) {
  const gradId = useId().replace(/:/g, '')
  const sign = lastSignFrom ?? values[values.length - 1] ?? 0
  const baseGeom = useMemo(
    () => buildNetAreaGeometry(values, sign, maxPathPoints),
    [values, sign, maxPathPoints]
  )
  const { lineD, fillD, zeroY } = baseGeom
  const strokeMain = strokeColor || baseGeom.stroke
  const fillMain = strokeColor ? `color-mix(in srgb, ${strokeColor} 22%, transparent)` : baseGeom.fill

  return (
    <svg
      width="100%"
      height={height}
      viewBox="0 0 200 50"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      aria-label={title || 'Net chart'}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={strokeMain} stopOpacity={0.55} />
          <stop offset="100%" stopColor={strokeMain} stopOpacity={1} />
        </linearGradient>
      </defs>
      {fillD ? <path d={fillD} fill={fillMain} stroke="none" /> : null}
      {zeroY != null ? (
        <line
          x1={4}
          x2={196}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border, #334155)"
          strokeDasharray="3 3"
          strokeOpacity={0.85}
        />
      ) : null}
      {lineD ? (
        <path
          d={lineD}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  )
}

const PROFIT_VIEW_W = 280
const PROFIT_VIEW_H = 120
const PROFIT_PAD = { l: 40, r: 8, t: 10, b: 22 }

type ProfitYDomainState = { lo: number; hi: number; resetKey?: number | string }

type ProfitYDomainAction = {
  type: 'sync'
  profits: number[]
  stableYDomain: boolean
  domainResetKey?: number | string
}

function profitYDomainReducer(state: ProfitYDomainState, action: ProfitYDomainAction): ProfitYDomainState {
  const { profits, stableYDomain, domainResetKey } = action
  let base = state
  if (domainResetKey !== undefined && domainResetKey !== state.resetKey) {
    base = { lo: 0, hi: 0, resetKey: domainResetKey }
  }
  if (profits.length === 0) {
    if (base.lo === 0 && base.hi === 0 && base.resetKey === state.resetKey) return state
    return { ...base, lo: 0, hi: 0 }
  }
  const rawMin = Math.min(0, ...profits)
  const rawMax = Math.max(0, ...profits)
  if (!stableYDomain) {
    if (base.lo === rawMin && base.hi === rawMax && base.resetKey === state.resetKey) return state
    return { ...base, lo: rawMin, hi: rawMax }
  }
  const lo = base.lo === 0 && base.hi === 0 ? rawMin : Math.min(base.lo, rawMin)
  const hi = base.lo === 0 && base.hi === 0 ? rawMax : Math.max(base.hi, rawMax)
  if (lo === base.lo && hi === base.hi && base.resetKey === state.resetKey) return state
  return { ...base, lo, hi }
}

/** Kumulativer Profit: Linie + leichtes Grid (Originals) — kein Recharts. */
export function SvgCumulativeProfitLineChart({
  profits,
  height = 128,
  stroke = 'var(--accent)',
  betIndexStart,
  betIndexEnd,
  stableYDomain = true,
  domainResetKey,
}: {
  profits: number[]
  height?: number
  stroke?: string
  /** X-axis: first bet index (default 1). */
  betIndexStart?: number
  /** X-axis: last bet index (default profits.length without baseline). */
  betIndexEnd?: number
  /** Y-Achse nur erweitern (nicht bei jedem Tick neu zoomen) — weniger Sprünge. */
  stableYDomain?: boolean
  /** Bei neuer Session Domain zurücksetzen (z. B. Script-Start). */
  domainResetKey?: number | string
}) {
  const pathValues = useMemo(() => chartPathValues(profits), [profits])
  const last = profits.length ? profits[profits.length - 1]! : 0
  const title = `Kumulativer Profit: ${last >= 0 ? '+' : ''}${last.toFixed(4)}`
  const [yDomain, dispatchYDomain] = useReducer(profitYDomainReducer, { lo: 0, hi: 0 })
  dispatchYDomain({ type: 'sync', profits, stableYDomain, domainResetKey })

  const geom = useMemo(() => {
    const plotL = PROFIT_PAD.l
    const plotR = PROFIT_VIEW_W - PROFIT_PAD.r
    const plotT = PROFIT_PAD.t
    const plotB = PROFIT_VIEW_H - PROFIT_PAD.b
    const ph = plotB - plotT
    if (profits.length === 0) {
      return {
        pathD: '',
        zeroGy: null as number | null,
        plotL,
        plotR,
        plotT,
        plotB,
        ph,
        yLabels: [] as { py: number; text: string }[],
      }
    }
    const pts = pathValues.length >= 2 ? pathValues : profits.length >= 2 ? profits : pathValues
    if (pts.length < 2) {
      return {
        pathD: '',
        zeroGy: null as number | null,
        plotL,
        plotR,
        plotT,
        plotB,
        ph,
        yLabels: [] as { py: number; text: string }[],
      }
    }
    const min = yDomain.lo
    const max = yDomain.hi
    const span = Math.max(max - min, 1e-8)
    const padY = span * 0.08
    const lo = min - padY
    const hi = max + padY
    const span2 = hi - lo
    const pw = plotR - plotL
    const xAt = (i: number) => plotL + (i / (pts.length - 1)) * pw
    const yAt = (v: number) => plotT + ph * (1 - (v - lo) / span2)
    let d = ''
    for (let i = 0; i < pts.length; i++) {
      const x = xAt(i)
      const y = yAt(pts[i]!)
      d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }
    const zeroGy = plotT + ph * (1 - (0 - lo) / span2)
    const yVals = [min, 0, max]
    const yLabels = yVals.map((v) => ({
      py: plotT + ph * (1 - (v - lo) / span2),
      text: v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2),
    }))
    return { pathD: d, zeroGy, lo, hi, plotL, plotR, plotT, plotB, ph, yLabels }
  }, [profits, pathValues, yDomain])

  const { pathD, zeroGy, plotL, plotR, plotT, plotB, ph, yLabels } = geom
  const dataPoints = Math.max(0, profits.length > 0 ? profits.length - 1 : 0)
  const xStart = betIndexStart ?? 1
  const xEnd = betIndexEnd ?? (dataPoints > 0 ? dataPoints : xStart)

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${PROFIT_VIEW_W} ${PROFIT_VIEW_H}`}
      className="select-none"
      role="img"
    >
      <title>{title}</title>
      {geom.pathD &&
        [0.25, 0.5, 0.75].map((t) => {
          const gy = plotT + ph * (1 - t)
          return (
            <line
              key={t}
              x1={plotL}
              x2={plotR}
              y1={gy}
              y2={gy}
              stroke="var(--border-subtle, #334155)"
              strokeDasharray="3 3"
              strokeOpacity={0.45}
            />
          )
        })}
      {zeroGy != null && zeroGy >= plotT - 1 && zeroGy <= plotB + 1 && (
        <line
          x1={plotL}
          x2={plotR}
          y1={zeroGy}
          y2={zeroGy}
          stroke="var(--border, #475569)"
          strokeDasharray="4 4"
          strokeOpacity={0.9}
        />
      )}
      {yLabels.map((row, i) => (
        <text key={i} x={4} y={Math.min(plotB + 8, Math.max(plotT + 8, row.py + 4))} fontSize={9} fill="var(--text-muted)" className="tabular-nums">
          {row.text}
        </text>
      ))}
      {dataPoints > 0 && (
        <>
          <text x={plotL} y={PROFIT_VIEW_H - 4} fontSize={9} fill="var(--text-muted)">
            Bet #{xStart}
          </text>
          <text x={plotR} y={PROFIT_VIEW_H - 4} fontSize={9} fill="var(--text-muted)" textAnchor="end">
            Bet #{xEnd}
          </text>
        </>
      )}
      {pathD ? (
        <path
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  )
}

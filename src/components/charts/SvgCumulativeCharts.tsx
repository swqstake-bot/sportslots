import { useMemo, useId } from 'react'

function uniformSampleNumbers(arr: number[], n: number): number[] {
  if (!arr.length || n <= 0) return []
  if (arr.length <= n) return [...arr]
  const out: number[] = []
  for (let j = 0; j < n; j++) {
    const idx = Math.round((j / Math.max(1, n - 1)) * (arr.length - 1))
    out.push(arr[idx]!)
  }
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
  const nets = uniformSampleNumbers(values, maxPathPoints)
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

/** Kumulativer Profit: Linie + leichtes Grid (Originals) — kein Recharts. */
export function SvgCumulativeProfitLineChart({
  profits,
  height = 128,
  stroke = 'var(--accent)',
}: {
  profits: number[]
  height?: number
  stroke?: string
}) {
  const pts = useMemo(() => uniformSampleNumbers(profits, 160), [profits])
  const last = profits.length ? profits[profits.length - 1]! : 0
  const title = `Kumulativer Profit: ${last >= 0 ? '+' : ''}${last.toFixed(4)}`

  const geom = useMemo(() => {
    const plotL = PROFIT_PAD.l
    const plotR = PROFIT_VIEW_W - PROFIT_PAD.r
    const plotT = PROFIT_PAD.t
    const plotB = PROFIT_VIEW_H - PROFIT_PAD.b
    const ph = plotB - plotT
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
    const min = Math.min(0, ...pts)
    const max = Math.max(0, ...pts)
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
  }, [pts])

  const { pathD, zeroGy, plotL, plotR, plotT, plotB, ph, yLabels } = geom

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${PROFIT_VIEW_W} ${PROFIT_VIEW_H}`}
      className="select-none"
      role="img"
    >
      <title>{title}</title>
      {pts.length >= 2 &&
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
      {profits.length > 0 && (
        <>
          <text x={plotL} y={PROFIT_VIEW_H - 4} fontSize={9} fill="var(--text-muted)">
            Bet #1
          </text>
          <text x={plotR} y={PROFIT_VIEW_H - 4} fontSize={9} fill="var(--text-muted)" textAnchor="end">
            Bet #{profits.length}
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

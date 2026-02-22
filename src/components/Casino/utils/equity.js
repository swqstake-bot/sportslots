export function computeEquityCurve(series) {
  let eq = 0
  return series.map(v => {
    eq += Number(v) || 0
    return eq
  })
}

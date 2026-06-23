/**
 * Parst StakeCruncher lookup-table (gzip CSV: eventId,weight,payoutX100) → P(≥ target).
 */

self.onmessage = async (event) => {
  const { jobId, gzipBytes, targetX100 } = event.data || {}
  try {
    if (!gzipBytes || !(targetX100 > 0)) {
      self.postMessage({ jobId, error: 'invalid_input' })
      return
    }
    const stream = new Blob([gzipBytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    const text = await new Response(stream).text()
    let sumWeight = 0
    let hitWeight = 0
    let maxPayoutX100 = 0
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const comma = line.indexOf(',')
      if (comma < 0) continue
      const comma2 = line.indexOf(',', comma + 1)
      if (comma2 < 0) continue
      const weight = Number(line.slice(comma + 1, comma2))
      const payoutX100 = Number(line.slice(comma2 + 1))
      if (!Number.isFinite(weight) || weight <= 0) continue
      if (!Number.isFinite(payoutX100)) continue
      sumWeight += weight
      if (payoutX100 >= targetX100) hitWeight += weight
      if (payoutX100 > maxPayoutX100) maxPayoutX100 = payoutX100
    }
    if (sumWeight <= 0) {
      self.postMessage({ jobId, error: 'empty_table' })
      return
    }
    self.postMessage({
      jobId,
      probability: hitWeight / sumWeight,
      maxMulti: maxPayoutX100 / 100,
      sumWeight,
    })
  } catch (err) {
    self.postMessage({
      jobId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

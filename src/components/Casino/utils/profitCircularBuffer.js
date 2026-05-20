/** Ringpuffer für kumulative Profit-Serie (Chart), feste Kapazität. */
export class ProfitCircularBuffer {
  /**
   * @param {number} [capacity]
   */
  constructor(capacity = 1000) {
    this.capacity = Math.max(16, Number(capacity) || 1000)
    this.buffer = new Float64Array(this.capacity)
    this.head = 0
    this.size = 0
  }

  reset() {
    this.head = 0
    this.size = 0
  }

  /** @param {number} cumulativeProfit */
  push(cumulativeProfit) {
    const v = Number(cumulativeProfit)
    if (!Number.isFinite(v)) return
    const index = this.size < this.capacity ? this.size : this.head % this.capacity
    this.buffer[index] = v
    if (this.size < this.capacity) {
      this.size += 1
    } else {
      this.head = (this.head + 1) % this.capacity
    }
  }

  /** @returns {number[]} */
  toChartSeries() {
    if (this.size === 0) return [0]
    const out = [0]
    for (let i = 0; i < this.size; i++) {
      const idx = this.size < this.capacity ? i : (this.head + i) % this.capacity
      out.push(this.buffer[idx])
    }
    return out
  }

  get pointCount() {
    return this.size
  }
}

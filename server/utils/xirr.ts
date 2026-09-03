/**
 * Cash Flow Item for XIRR calculation
 */
export interface CashFlow {
  date: string | Date // YYYY-MM-DD or Date object
  amount: number // Negative for investments (cash outflow), Positive for returns/current value (cash inflow)
}

/**
 * Calculates Extended Internal Rate of Return (XIRR) using Newton-Raphson numerical method.
 * Returns annualized rate as a percentage (e.g. 15.4 for 15.4%).
 */
export function calculateXIRR(cashFlows: CashFlow[], guess = 0.1): number | null {
  if (!cashFlows || cashFlows.length < 2) return null

  // Normalize dates and parse amounts
  const flows = cashFlows
    .map(cf => ({
      date: typeof cf.date === 'string' ? new Date(cf.date) : cf.date,
      amount: Number(cf.amount)
    }))
    .filter(cf => !isNaN(cf.date.getTime()) && !isNaN(cf.amount) && cf.amount !== 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (flows.length < 2) return null

  // Must have at least one positive and one negative cash flow
  const hasNegative = flows.some(f => f.amount < 0)
  const hasPositive = flows.some(f => f.amount > 0)
  if (!hasNegative || !hasPositive) return null

  const d0 = flows[0]!.date.getTime()
  const MS_PER_DAY = 1000 * 60 * 60 * 24
  const DAYS_PER_YEAR = 365.25

  // Time in years from first cash flow
  const timeInYears = flows.map(f => (f.date.getTime() - d0) / (MS_PER_DAY * DAYS_PER_YEAR))

  // Net Present Value function: NPV(r) = sum( C_i / (1 + r)^t_i )
  function npv(r: number): number {
    let sum = 0
    for (let i = 0; i < flows.length; i++) {
      const denom = Math.pow(1 + r, timeInYears[i]!)
      if (denom === 0 || isNaN(denom)) return Infinity
      sum += flows[i]!.amount / denom
    }
    return sum
  }

  // Derivative of NPV: dNPV/dr = - sum( t_i * C_i / (1 + r)^(t_i + 1) )
  function dnpv(r: number): number {
    let sum = 0
    for (let i = 0; i < flows.length; i++) {
      const denom = Math.pow(1 + r, timeInYears[i]! + 1)
      if (denom === 0 || isNaN(denom)) return Infinity
      sum -= (timeInYears[i]! * flows[i]!.amount) / denom
    }
    return sum
  }

  let rate = guess
  const MAX_ITERATIONS = 100
  const TOLERANCE = 1e-6

  // Newton-Raphson iteration
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Avoid rate <= -1 (rate of -100% or worse leads to imaginary numbers)
    if (rate <= -0.999) rate = -0.999

    const y = npv(rate)
    const dy = dnpv(rate)

    if (Math.abs(dy) < 1e-12 || !isFinite(dy)) {
      // Small perturbation if derivative is near flat
      rate += 0.05
      continue
    }

    const nextRate = rate - y / dy

    if (Math.abs(nextRate - rate) < TOLERANCE) {
      // Check if reasonable annualized rate between -99% and +10,000%
      if (nextRate > -0.99 && nextRate < 100) {
        return Number((nextRate * 100).toFixed(2))
      }
      return null
    }

    rate = nextRate
  }

  // Fallback: Bisection search if Newton-Raphson did not converge
  let low = -0.99
  let high = 5.0
  let fLow = npv(low)
  let fHigh = npv(high)

  if (fLow * fHigh < 0) {
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2
      const fMid = npv(mid)
      if (Math.abs(fMid) < 1e-4 || (high - low) < 1e-5) {
        return Number((mid * 100).toFixed(2))
      }
      if (fLow * fMid < 0) {
        high = mid
        fHigh = fMid
      } else {
        low = mid
        fLow = fMid
      }
    }
  }

  return null
}

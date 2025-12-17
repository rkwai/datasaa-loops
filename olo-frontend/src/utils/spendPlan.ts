import type { ActionPlanItem } from '../db/types'

export function generateRecommendations(channelMetrics: {
  channelId: string
  cac: number
  highLtvShare: number
  spend: number
}[]): ActionPlanItem[] {
  if (!channelMetrics.length) return []
  const sorted = [...channelMetrics].sort(
    (a, b) => b.highLtvShare - a.highLtvShare || a.cac - b.cac,
  )
  const best = sorted.slice(0, Math.min(3, sorted.length))
  const worst = sorted.slice(-Math.min(3, sorted.length))
  const shiftBudget = sorted.reduce((sum, item) => sum + item.spend, 0) * 0.1
  const perIncrease = best.length ? shiftBudget / best.length : 0
  const perDecrease = worst.length ? shiftBudget / worst.length : 0

  const items: ActionPlanItem[] = sorted.map((channel) => ({
    channelId: channel.channelId,
    currentSpend: channel.spend,
    proposedSpend: channel.spend,
    delta: 0,
    rationale: channel.highLtvShare > 0.5 ? 'High HIGH-LTV share' : 'Monitor',
  }))

  items.forEach((item) => {
    if (best.find((c) => c.channelId === item.channelId)) {
      item.proposedSpend = item.currentSpend + perIncrease
      item.delta = perIncrease
      item.rationale = 'Increase allocation to best-performing HIGH segment sources'
    } else if (worst.find((c) => c.channelId === item.channelId)) {
      item.proposedSpend = Math.max(0, item.currentSpend - perDecrease)
      item.delta = -perDecrease
      item.rationale = 'Decrease due to low HIGH-LTV share or high CAC'
    }
  })

  return items
}

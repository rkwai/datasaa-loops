import type { ActionPlanItem, ChannelMetricsRecord } from '../db/types'

export type AllocationStrategy = 'high_efficiency' | 'maximize_revenue' | 'stability'

type RecommendationInput = Pick<
  ChannelMetricsRecord,
  'channelId' | 'cac' | 'highLtvShare' | 'spend' | 'avgLtv' | 'netValue' | 'acquiredCustomers'
>

const SHIFT_BY_STRATEGY: Record<AllocationStrategy, number> = {
  high_efficiency: 0.12,
  maximize_revenue: 0.18,
  stability: 0.06,
}

const HOLD_RATIONALE: Record<AllocationStrategy, string> = {
  high_efficiency: 'Holding for baseline acquisition while we lean into the best HIGH-segment performers.',
  maximize_revenue: 'Maintaining for coverage—these channels still drive incremental revenue even if they are not top bets.',
  stability: 'Kept steady to preserve blended CPA while only nudging the outliers.',
}

const formatDollars = (value: number) => {
  if (!Number.isFinite(value)) return '$0'
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

const ratioOf = (channel: RecommendationInput) => {
  if (!Number.isFinite(channel.cac) || channel.cac <= 0) return 0
  if (!Number.isFinite(channel.avgLtv) || channel.avgLtv <= 0) return 0
  return channel.avgLtv / channel.cac
}

const uniqueTargets = (targets: RecommendationInput[]) => {
  const seen = new Set<string>()
  return targets.filter((target) => {
    if (seen.has(target.channelId)) return false
    seen.add(target.channelId)
    return true
  })
}

function pickTargets(strategy: AllocationStrategy, metrics: RecommendationInput[]) {
  const byHighShare = [...metrics].sort(
    (a, b) => b.highLtvShare - a.highLtvShare || ratioOf(b) - ratioOf(a),
  )
  const byRatioAsc = [...metrics].sort((a, b) => ratioOf(a) - ratioOf(b))
  const byValueDesc = [...metrics].sort(
    (a, b) =>
      b.avgLtv * b.acquiredCustomers - a.avgLtv * a.acquiredCustomers ||
      b.netValue - a.netValue,
  )

  if (strategy === 'maximize_revenue') {
    const positive = byValueDesc.filter((channel) => channel.netValue > 0)
    const increaseTargets = uniqueTargets(
      (positive.length ? positive : byValueDesc).slice(0, Math.max(3, Math.ceil(metrics.length / 3))),
    )
    const decreaseCandidates = byRatioAsc.filter(
      (channel) => channel.netValue <= 0 || ratioOf(channel) < 1.4,
    )
    const decreaseTargets = uniqueTargets(
      (decreaseCandidates.length ? decreaseCandidates : byRatioAsc).slice(
        0,
        Math.max(3, increaseTargets.length || 1),
      ),
    )

    return { increaseTargets, decreaseTargets }
  }

  if (strategy === 'stability') {
    const increaseTargets = uniqueTargets(
      metrics
        .filter((channel) => {
          const ratio = ratioOf(channel)
          return ratio >= 2 && ratio <= 3.5
        })
        .slice(0, 4),
    )
    if (!increaseTargets.length) {
      increaseTargets.push(...uniqueTargets(byHighShare.slice(0, Math.min(2, byHighShare.length))))
    }
    const decreaseTargets = uniqueTargets(
      byRatioAsc
        .filter((channel) => ratioOf(channel) < 1.2)
        .slice(0, Math.max(2, increaseTargets.length || 1)),
    )
    if (!decreaseTargets.length) {
      decreaseTargets.push(...uniqueTargets(byRatioAsc.slice(0, Math.min(2, byRatioAsc.length))))
    }
    return { increaseTargets, decreaseTargets }
  }

  // high_efficiency (default)
  const increaseTargets = uniqueTargets(
    byHighShare
      .filter((channel) => channel.highLtvShare >= 0.3 && ratioOf(channel) >= 2)
      .slice(0, 4),
  )
  if (!increaseTargets.length) {
    increaseTargets.push(...uniqueTargets(byHighShare.slice(0, Math.min(3, byHighShare.length))))
  }
  const decreaseTargets = uniqueTargets(
    [...byRatioAsc.filter((channel) => ratioOf(channel) < 1.2), ...byHighShare.filter((channel) => channel.highLtvShare < 0.15)].slice(
      0,
      Math.max(3, increaseTargets.length || 1),
    ),
  )
  if (!decreaseTargets.length) {
    decreaseTargets.push(...uniqueTargets(byRatioAsc.slice(0, Math.min(2, byRatioAsc.length))))
  }
  return { increaseTargets, decreaseTargets }
}

function applyAdjustments(
  map: Map<string, ActionPlanItem>,
  targets: RecommendationInput[],
  total: number,
  direction: 'increase' | 'decrease',
  rationaleBuilder: (channel: RecommendationInput, amount: number, ratio: number) => string,
  touched: Set<string>,
) {
  if (!targets.length || total <= 0) return 0
  let remaining = total
  let applied = 0
  targets.forEach((channel, index) => {
    if (remaining <= 0) return
    const item = map.get(channel.channelId)
    if (!item) return
    const availableSlots = targets.length - index
    const share = availableSlots > 0 ? remaining / availableSlots : remaining
    const ratio = ratioOf(channel)
    if (direction === 'increase') {
      item.proposedSpend = item.currentSpend + share
      item.delta = item.proposedSpend - item.currentSpend
      item.rationale = rationaleBuilder(channel, share, ratio)
      applied += share
      remaining -= share
      touched.add(channel.channelId)
    } else {
      const reducible = Math.min(share, item.proposedSpend)
      if (reducible <= 0) return
      item.proposedSpend = Math.max(0, item.proposedSpend - reducible)
      item.delta = item.proposedSpend - item.currentSpend
      item.rationale = rationaleBuilder(channel, reducible, ratio)
      applied += reducible
      remaining -= reducible
      touched.add(channel.channelId)
    }
  })
  return applied
}

export function generateRecommendations(
  channelMetrics: RecommendationInput[],
  strategy: AllocationStrategy = 'high_efficiency',
): ActionPlanItem[] {
  if (!channelMetrics.length) return []
  const totalSpend = channelMetrics.reduce((sum, channel) => sum + (channel.spend || 0), 0)
  const baseItems: ActionPlanItem[] = channelMetrics.map((channel) => ({
    channelId: channel.channelId,
    currentSpend: channel.spend,
    proposedSpend: channel.spend,
    delta: 0,
    rationale: HOLD_RATIONALE[strategy],
  }))
  const itemMap = new Map(baseItems.map((item) => [item.channelId, item]))
  const touched = new Set<string>()

  const { increaseTargets, decreaseTargets } = pickTargets(strategy, channelMetrics)
  const intendedShift = SHIFT_BY_STRATEGY[strategy] * totalSpend
  const decreaseBudget = increaseTargets.length ? intendedShift : 0
  const actualDecrease = applyAdjustments(
    itemMap,
    decreaseTargets.filter((target) => !increaseTargets.find((inc) => inc.channelId === target.channelId)),
    decreaseBudget,
    'decrease',
    (channel, amount, ratio) => {
      const share = channel.highLtvShare * 100
      if (ratio <= 0) {
        return `Trimmed ${formatDollars(amount)} because CAC data is missing or unreliable.`
      }
      if (share < 15) {
        return `Pulling ${formatDollars(amount)} due to low HIGH-segment mix (${share.toFixed(0)}%).`
      }
      return `Reducing ${formatDollars(amount)} because LTV:CAC is only ${ratio.toFixed(1)}x.`
    },
    touched,
  )

  applyAdjustments(
    itemMap,
    increaseTargets,
    actualDecrease,
    'increase',
    (channel, amount, ratio) => {
      const share = (channel.highLtvShare * 100).toFixed(0)
      if (strategy === 'maximize_revenue') {
        return `Adding ${formatDollars(amount)} because net value is positive and LTV:CAC runs ${ratio.toFixed(1)}x.`
      }
      if (strategy === 'stability') {
        return `Small boost of ${formatDollars(amount)} to keep this ${ratio.toFixed(1)}x channel near the blended CPA target.`
      }
      return `Boosting ${formatDollars(amount)} toward ${share}% HIGH-segment contribution (${ratio.toFixed(1)}x).`
    },
    touched,
  )

  baseItems.forEach((item) => {
    if (!touched.has(item.channelId)) {
      item.rationale = HOLD_RATIONALE[strategy]
    }
  })

  return baseItems
}

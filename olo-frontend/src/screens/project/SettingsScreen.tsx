import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useProjectContext } from '../../context/useProjectContext'

const scheduleStateUpdate = (fn: () => void) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn)
  } else {
    Promise.resolve().then(fn)
  }
}

export function SettingsScreen() {
  const { config, updateConfig, db, projectId } = useProjectContext()
  const [ltvWindowDays, setLtvWindowDays] = useState<string>('')
  const [churnEvents, setChurnEvents] = useState('')
  const [segmentHigh, setSegmentHigh] = useState('0.9')
  const [segmentMid, setSegmentMid] = useState('0.7')
  const [cacSource, setCacSource] = useState<'daily' | 'channel_total'>('daily')
  const [attribution, setAttribution] = useState<'channel_field' | 'acquired_via'>('channel_field')
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('UTC')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!config) return
    scheduleStateUpdate(() => {
      setLtvWindowDays(config.ltvWindowDays?.toString() ?? '')
      setChurnEvents(config.churnEventTypes.join(', '))
      setSegmentHigh(config.segmentHighQuantile.toString())
      setSegmentMid(config.segmentMidQuantile.toString())
      setCacSource(config.cacSpendSource)
      setAttribution(config.attributionMode)
      setCurrency(config.defaultCurrency)
      setTimezone(config.timezone)
    })
  }, [config])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    await updateConfig({
      ltvWindowDays: ltvWindowDays ? Number(ltvWindowDays) : null,
      churnEventTypes: churnEvents
        .split(',')
        .map((event) => event.trim())
        .filter(Boolean),
      segmentHighQuantile: Number(segmentHigh),
      segmentMidQuantile: Number(segmentMid),
      cacSpendSource: cacSource,
      attributionMode: attribution,
      defaultCurrency: currency,
      timezone,
    })
    await db.auditLog.add({
      ts: new Date().toISOString(),
      type: 'SETTINGS_CHANGE',
      projectId,
      userLabel: 'local-user',
      payload: { screen: 'settings' },
    })
    setMessage('Settings saved. Re-run recompute to apply changes.')
  }

  async function handleClearData() {
    await Promise.all([
      db.customers.clear(),
      db.transactions.clear(),
      db.channels.clear(),
      db.events.clear(),
      db.acquiredVia.clear(),
      db.channelSpendDaily.clear(),
      db.customerMetrics.clear(),
      db.channelMetrics.clear(),
      db.segmentMetrics.clear(),
      db.jobs.clear(),
      db.actionPlans.clear(),
      db.importMappings.clear(),
    ])
    await db.auditLog.add({
      ts: new Date().toISOString(),
      type: 'SETTINGS_CHANGE',
      projectId,
      userLabel: 'local-user',
      payload: { action: 'clear_data' },
    })
    setMessage('All project data cleared. Re-import to continue.')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Model settings</h1>
          <p className="page-description">
            Fine-tune definitions per project. Changes stay local to this browser profile.
          </p>
        </div>
        {message && <span className="pill">{message}</span>}
      </div>

      <form className="surface" style={{ borderRadius: 28 }} onSubmit={handleSave}>
        <h3 style={{ marginTop: 0 }}>LTV + churn</h3>
        <div className="split">
          <div>
            <label htmlFor="settings-ltv-window">LTV window (days)</label>
            <input
              id="settings-ltv-window"
              type="number"
              value={ltvWindowDays}
              placeholder="All time"
              onChange={(e) => setLtvWindowDays(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="settings-churn-events">Churn event types (comma separated)</label>
            <input
              id="settings-churn-events"
              value={churnEvents}
              onChange={(e) => setChurnEvents(e.target.value)}
            />
          </div>
        </div>

        <h3 className="section-title" style={{ marginTop: '2rem' }}>
          Segmentation
        </h3>
        <div className="split">
          <div>
            <label htmlFor="settings-segment-high">Segment high quantile</label>
            <input
              id="settings-segment-high"
              value={segmentHigh}
              onChange={(e) => setSegmentHigh(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="settings-segment-mid">Segment mid quantile</label>
            <input
              id="settings-segment-mid"
              value={segmentMid}
              onChange={(e) => setSegmentMid(e.target.value)}
            />
          </div>
        </div>

        <h3 className="section-title" style={{ marginTop: '2rem' }}>
          CAC & attribution
        </h3>
        <div className="split">
          <div>
            <label htmlFor="settings-cac-source">CAC spend source</label>
            <select
              id="settings-cac-source"
              value={cacSource}
              onChange={(e) =>
                setCacSource(
                  e.target.value === 'daily' ? 'daily' : 'channel_total',
                )
              }
            >
              <option value="daily">Daily spend table</option>
              <option value="channel_total">Channel total budget</option>
            </select>
          </div>
          <div>
            <label htmlFor="settings-attribution">Attribution mode</label>
            <select
              id="settings-attribution"
              value={attribution}
              onChange={(e) =>
                setAttribution(
                  e.target.value === 'acquired_via'
                    ? 'acquired_via'
                    : 'channel_field',
                )
              }
            >
              <option value="channel_field">Customer.channelSourceId</option>
              <option value="acquired_via">Acquired_Via edges</option>
            </select>
          </div>
        </div>

        <h3 className="section-title" style={{ marginTop: '2rem' }}>
          Locale defaults
        </h3>
        <div className="split">
          <div>
            <label htmlFor="settings-currency">Currency</label>
            <input
              id="settings-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="settings-timezone">Timezone</label>
            <input
              id="settings-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="submit">Save settings</button>
          <button type="button" className="secondary" onClick={handleClearData}>
            Clear local data
          </button>
        </div>
      </form>
    </div>
  )
}

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
    <div className="settings-shell">
      <aside className="settings-nav">
        <a href="#general" className="active">
          <span className="material-symbols-outlined">tune</span>
          General
          <span className="material-symbols-outlined">chevron_right</span>
        </a>
        <a href="#ltv">
          <span className="material-symbols-outlined">monetization_on</span>
          LTV definition
          <span className="material-symbols-outlined">chevron_right</span>
        </a>
        <a href="#cac">
          <span className="material-symbols-outlined">attribution</span>
          CAC & attribution
          <span className="material-symbols-outlined">chevron_right</span>
        </a>
        <a href="#segmentation">
          <span className="material-symbols-outlined">segment</span>
          Segment rules
          <span className="material-symbols-outlined">chevron_right</span>
        </a>
        <a href="#data">
          <span className="material-symbols-outlined">database</span>
          Data management
          <span className="material-symbols-outlined">chevron_right</span>
        </a>
      </aside>

      <form className="settings-main" onSubmit={handleSave}>
        <header className="settings-hero">
          <div>
            <h1>App settings</h1>
            <p>Fine-tune definitions per project. Changes stay local to this browser profile.</p>
          </div>
          <div className="settings-hero-actions">
            {message && <span className="pill">{message}</span>}
            <button type="submit" data-testid="save-settings">Save changes</button>
          </div>
        </header>

        <section id="general" className="settings-section">
          <h2>General preferences</h2>
          <div className="settings-card grid">
            <label>
              <span>Currency</span>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </label>
            <label>
              <span>Timezone</span>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </label>
          </div>
        </section>

        <section id="ltv" className="settings-section">
          <h2>LTV definition</h2>
          <div className="settings-card">
            <label>
              <span>LTV window (days)</span>
              <input
                type="number"
                data-testid="settings-ltv-window"
                value={ltvWindowDays}
                placeholder="All time"
                onChange={(e) => setLtvWindowDays(e.target.value)}
              />
            </label>
            <label>
              <span>Churn event types (comma separated)</span>
              <input value={churnEvents} onChange={(e) => setChurnEvents(e.target.value)} />
            </label>
          </div>
        </section>

        <section id="cac" className="settings-section">
          <h2>CAC & attribution</h2>
          <div className="settings-card grid">
            <label>
              <span>CAC spend source</span>
              <select value={cacSource} onChange={(e) => setCacSource(e.target.value === 'daily' ? 'daily' : 'channel_total')}>
                <option value="daily">Daily spend table</option>
                <option value="channel_total">Channel total budget</option>
              </select>
            </label>
            <label>
              <span>Attribution mode</span>
              <select
                value={attribution}
                onChange={(e) =>
                  setAttribution(e.target.value === 'acquired_via' ? 'acquired_via' : 'channel_field')
                }
              >
                <option value="channel_field">Customer.channelSourceId</option>
                <option value="acquired_via">Acquired_Via edges</option>
              </select>
            </label>
          </div>
        </section>

        <section id="segmentation" className="settings-section">
          <h2>Segment rules</h2>
          <div className="settings-card grid">
            <label>
              <span>Segment high quantile</span>
              <input value={segmentHigh} onChange={(e) => setSegmentHigh(e.target.value)} />
            </label>
            <label>
              <span>Segment mid quantile</span>
              <input value={segmentMid} onChange={(e) => setSegmentMid(e.target.value)} />
            </label>
          </div>
        </section>

        <section id="data" className="settings-section">
          <h2>Data management</h2>
          <div className="settings-card data">
            <div>
              <p>Clear local data</p>
              <span>
                This deletes all locally cached campaign, customer, and event data. Configuration settings are preserved.
              </span>
            </div>
            <button type="button" className="ghost" onClick={handleClearData}>
              Clear data
            </button>
          </div>
        </section>
      </form>
    </div>
  )
}

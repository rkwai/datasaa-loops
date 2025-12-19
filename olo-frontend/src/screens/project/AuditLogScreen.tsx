import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProjectContext } from '../../context/useProjectContext'
import type { AuditLogRecord } from '../../db/types'

const FILTERS = [
  { label: 'All events', value: 'ALL' },
  { label: 'Imports', value: 'IMPORT_' },
  { label: 'Recompute', value: 'RECOMPUTE' },
  { label: 'Settings', value: 'SETTINGS_CHANGE' },
  { label: 'Approvals', value: 'ACTION_PLAN_APPROVED' },
  { label: 'Exports', value: 'ACTION_PLAN_EXPORTED' },
]

export function AuditLogScreen() {
  const { db } = useProjectContext()
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const rawEntries = useLiveQuery(() => db.auditLog.orderBy('ts').reverse().limit(200).toArray(), [db])
  const entries = useMemo(() => rawEntries ?? [], [rawEntries])

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesFilter =
        filter === 'ALL' ? true : filter === 'IMPORT_' ? entry.type.startsWith('IMPORT_') : entry.type === filter
      if (!matchesFilter) return false
      if (!query) return true
      const target = [entry.userLabel, entry.type, JSON.stringify(entry.payload ?? {})].join(' ').toLowerCase()
      return target.includes(query.toLowerCase())
    })
  }, [entries, filter, query])

  const totalEvents = entries.length
  const lastSync = entries[0]?.ts ? new Date(entries[0].ts) : null
  const activeDevices = new Set(entries.map((entry) => entry.payload?.device ?? entry.userLabel ?? 'local')).size

  function formatTimestamp(ts: string) {
    const date = new Date(ts)
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
  }

  async function handleExport() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'audit-log.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="audit-shell">
      <section className="audit-hero">
        <div>
          <nav className="audit-breadcrumb">
            <span>Settings</span>
            <span className="material-symbols-outlined">chevron_right</span>
            <span>System audit log</span>
          </nav>
          <h1>Audit log</h1>
          <p>Every import, plan approval, and configuration change leaves a local breadcrumb,
            so you can prove how CAC↔LTV decisions were made.</p>
        </div>
        <button type="button" onClick={handleExport}>
          <span className="material-symbols-outlined">download</span>
          Export log
        </button>
      </section>

      <section className="dash-cards">
        <article className="dashboard-kpi-card tone-neutral">
          <div className="kpi-icon">
            <span className="material-symbols-outlined">list_alt</span>
          </div>
          <p className="kpi-label">Total events</p>
          <strong className="kpi-value">{totalEvents.toLocaleString()}</strong>
          <span className="kpi-change">Stored locally</span>
        </article>
        <article className="dashboard-kpi-card tone-neutral">
          <div className="kpi-icon">
            <span className="material-symbols-outlined">sync</span>
          </div>
          <p className="kpi-label">Last action</p>
          <strong className="kpi-value">{lastSync ? lastSync.toLocaleTimeString() : '—'}</strong>
          <span className="kpi-change">{lastSync ? lastSync.toLocaleDateString() : ''}</span>
        </article>
        <article className="dashboard-kpi-card tone-neutral">
          <div className="kpi-icon">
            <span className="material-symbols-outlined">devices</span>
          </div>
          <p className="kpi-label">Active devices</p>
          <strong className="kpi-value">{activeDevices}</strong>
          <span className="kpi-change">Based on actor labels</span>
        </article>
      </section>

      <section className="audit-filter-row">
        <div className="search-wrap">
          <span className="material-symbols-outlined">search</span>
          <input
            type="search"
            placeholder="Search user, action, or ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="chip-row">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filter === option.value ? 'chip active' : 'chip'}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="audit-table">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((entry: AuditLogRecord) => (
              <tr key={entry.id ?? entry.ts}>
                <td>{formatTimestamp(entry.ts)}</td>
                <td>
                  <div className="actor-cell">
                    <div className="icon-circle neutral">
                      <span className="material-symbols-outlined">person</span>
                    </div>
                    <div>
                      <strong>{entry.userLabel ?? 'System'}</strong>
                      <span>{(entry.payload?.device as string) ?? 'Local device'}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="badge" data-testid="audit-type">
                    {entry.type}
                  </span>
              </td>
                <td>
                  <code>{JSON.stringify(entry.payload)}</code>
                </td>
                <td className="status-cell">
                  <span className="material-symbols-outlined filled">check_circle</span>
                  Success
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredEntries.length && <p style={{ padding: '1rem' }}>No entries yet.</p>}
      </section>
    </div>
  )
}

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProjectContext } from '../../context/useProjectContext'
import type { AuditLogRecord } from '../../db/types'

const FILTERS = [
  { label: 'All events', value: 'ALL' },
  { label: 'Imports', value: 'IMPORT_CUSTOMERS' },
  { label: 'Transactions', value: 'IMPORT_TRANSACTIONS' },
  { label: 'Channels', value: 'IMPORT_CHANNELS' },
  { label: 'Events', value: 'IMPORT_EVENTS' },
  { label: 'Acquired via', value: 'IMPORT_ACQUIRED_VIA' },
  { label: 'Spend', value: 'IMPORT_SPEND' },
  { label: 'Recompute', value: 'RECOMPUTE' },
  { label: 'Settings', value: 'SETTINGS_CHANGE' },
  { label: 'Plan approved', value: 'ACTION_PLAN_APPROVED' },
  { label: 'Plan exported', value: 'ACTION_PLAN_EXPORTED' },
]

export function AuditLogScreen() {
  const { db } = useProjectContext()
  const [filter, setFilter] = useState('ALL')
  const entries =
    useLiveQuery(async () => {
      const all = await db.auditLog.orderBy('ts').reverse().limit(200).toArray()
      if (filter === 'ALL') return all
      return all.filter((entry) => entry.type === filter)
    }, [db, filter]) ?? []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Audit log</h1>
          <p className="page-description">
            Every key event stays on-device and traceable. Filter to answer governance questions quickly.
          </p>
        </div>
      </div>

      <div className="surface" style={{ borderRadius: 28, marginBottom: '1.5rem' }}>
        <div className="chip-row">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filter === option.value ? '' : 'secondary'}
              style={{ borderRadius: 999, padding: '0.35rem 0.95rem' }}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Type</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry: AuditLogRecord) => (
              <tr key={entry.id ?? entry.ts}>
                <td>{new Date(entry.ts).toLocaleString()}</td>
                <td>{entry.type}</td>
                <td>
                  <code>{JSON.stringify(entry.payload)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <p style={{ padding: '1rem' }}>No entries yet.</p>}
      </div>
    </div>
  )
}

import { useRef, useState } from 'react'
import { useProjectContext } from '../../context/useProjectContext'
import { exportProjectBundle } from '../../utils/projectTransfer'

export function ExportScreen() {
  const { projectId, db } = useProjectContext()
  const [message, setMessage] = useState<string | null>(null)
  const metricsInputRef = useRef<HTMLSelectElement | null>(null)

  async function handleProjectExport() {
    const blob = await exportProjectBundle(projectId)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${projectId}.zip`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Project bundle exported. Store it safely!')
  }

  async function handleMetricsExport() {
    const type = metricsInputRef.current?.value ?? 'customer'
    if (type === 'customer') {
      if (!downloadCsv('customer_metrics.csv', await db.customerMetrics.toArray())) {
        setMessage('No customer metrics yet.')
        return
      }
    } else if (type === 'channel') {
      if (!downloadCsv('channel_metrics.csv', await db.channelMetrics.toArray())) {
        setMessage('No channel metrics yet.')
        return
      }
    } else {
      if (!downloadCsv('segment_metrics.csv', await db.segmentMetrics.toArray())) {
        setMessage('No segment metrics yet.')
        return
      }
    }
    setMessage('Metrics CSV generated.')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Export & backups</h1>
          <p className="page-description">
            Build encrypted-ready ZIP bundles or pull materialized metrics for reporting. Nothing ever leaves
            the browser unless you download it.
          </p>
        </div>
        {message && <span className="pill">{message}</span>}
      </div>

      <div className="split">
        <section className="dimming-card">
          <h3>Full project bundle</h3>
          <p className="page-description">
            Manifest + JSONL per store with schema versioning. Ideal for cold storage or moving to another device.
          </p>
          <button type="button" onClick={handleProjectExport} style={{ marginTop: '1rem' }}>
            Export .zip
          </button>
        </section>

        <section className="surface" style={{ borderRadius: 28 }}>
          <h3>Metrics CSVs</h3>
          <p className="page-description">Grab derived tables for spreadsheets or BI tools.</p>
          <select ref={metricsInputRef} defaultValue="customer" style={{ marginTop: '0.5rem' }}>
            <option value="customer">Customer metrics</option>
            <option value="channel">Channel metrics</option>
            <option value="segment">Segment metrics</option>
          </select>
          <button type="button" style={{ marginTop: '0.75rem' }} onClick={handleMetricsExport}>
            Download CSV
          </button>
        </section>
      </div>
    </div>
  )
}

function downloadCsv(filename: string, rows: unknown[]) {
  if (!rows.length) {
    return false
  }
  const firstRow = rows[0] as Record<string, unknown>
  const columns = Object.keys(firstRow)
  const csv = [columns.join(',')]
  rows.forEach((row) => {
    const record = row as Record<string, unknown>
    csv.push(
      columns
        .map((column) => {
          const value = record[column]
          if (value === undefined || value === null) return ''
          if (typeof value === 'object') return JSON.stringify(value)
          return value
        })
        .join(','),
    )
  })
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return true
}

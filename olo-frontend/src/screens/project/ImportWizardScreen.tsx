import Papa from 'papaparse'
import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { nanoid } from 'nanoid'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProjectContext } from '../../context/useProjectContext'
import type { DatasetType } from '../../db/types'
import { DATASET_OPTIONS, DATASET_SCHEMAS } from '../../utils/datasetSchemas'
import { runComputeJob, runImportJob } from '../../utils/workers'

export function ImportWizardScreen() {
  const { db, projectId } = useProjectContext()
  const [dataset, setDataset] = useState<DatasetType>('customers')
  const [file, setFile] = useState<File | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const jobs = useLiveQuery(() => db.jobs.orderBy('updatedAt').reverse().limit(5).toArray(), [db])
  const recentAudit = useLiveQuery(() => db.auditLog.orderBy('ts').reverse().limit(200).toArray(), [db])
  const schema = DATASET_SCHEMAS[dataset]

  async function handleFileChange(newFile?: File) {
    if (!newFile) return
    setFile(newFile)
    const parsed = await parsePreview(newFile)
    setColumns(parsed.columns)
    setPreview(parsed.rows)
    setMapping(buildAutoMapping(schema.fields.map((f) => f.key), parsed.columns))
    setCurrentStep(2)
    setShowMappingModal(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Select a file to import')
      return
    }
    for (const field of schema.fields) {
      if (field.required && !mapping[field.key]) {
        setError(`Map required field: ${field.label}`)
        return
      }
    }
    setIsRunning(true)
    setError(null)
    setStatus('Preparing import…')
    try {
      const importJobId = `import-${dataset}-${nanoid(6)}`
      await db.jobs.put({
        jobId: importJobId,
        type: 'import',
        dataset,
        status: 'RUNNING',
        processedRows: 0,
        phase: 'queued',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      await runImportJob(
        { projectId, dataset, file, mapping, jobId: importJobId },
        (progress) => setStatus(`Importing ${progress.processed}/${progress.total ?? '?'} rows (${progress.phase})`),
      )
      setStatus('Import finished. Recomputing metrics…')
      setShowMappingModal(false)
      setCurrentStep(3)
      const computeJobId = `compute-${nanoid(6)}`
      await db.jobs.put({
        jobId: computeJobId,
        type: 'compute',
        status: 'RUNNING',
        processedRows: 0,
        phase: 'queued',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      await runComputeJob(
        { projectId, jobId: computeJobId },
        (progress) => setStatus(`Compute: ${progress.phase}`),
      )
      setStatus('All data processed!')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsRunning(false)
    }
  }

  const previewColumns = useMemo(() => preview.slice(0, 5), [preview])

  function triggerFilePicker() {
    fileInputRef.current?.click()
  }

  function handleDownloadTemplate() {
    const headers = schema.fields.map((field) => field.key)
    const csv = `${headers.join(',')}\n`
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${dataset}_template.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleReset() {
    setFile(null)
    setColumns([])
    setPreview([])
    setMapping({})
    setStatus(null)
    setError(null)
    setShowMappingModal(false)
    setCurrentStep(1)
  }

  function closeMappingModal() {
    setShowMappingModal(false)
    setCurrentStep(file ? Math.min(currentStep, 2) : 1)
  }

  const datasetCards = useMemo(() => {
    const auditMap = new Map<string, string>()
    ;(recentAudit ?? []).forEach((entry) => {
      if (!auditMap.has(entry.type)) {
        auditMap.set(entry.type, entry.ts)
      }
    })
    const summaries: Array<{
      type: DatasetType
      title: string
      description: string
      auditType: string
      optional?: boolean
    }> = [
      { type: 'customers', title: 'Customers', description: 'IDs, acquisition dates, channel hints', auditType: 'IMPORT_CUSTOMERS' },
      { type: 'transactions', title: 'Transactions', description: 'Revenue amounts per customer', auditType: 'IMPORT_TRANSACTIONS' },
      { type: 'channels', title: 'Channels', description: 'Channel metadata & budgets', auditType: 'IMPORT_CHANNELS' },
      { type: 'channelSpendDaily', title: 'Daily spend', description: 'Optional: granular CAC inputs', auditType: 'IMPORT_SPEND', optional: true },
      { type: 'acquiredVia', title: 'Acquired via', description: 'Optional: explicit channel edges', auditType: 'IMPORT_ACQUIRED_VIA', optional: true },
    ]
    return summaries.map((summary) => {
      const timestamp = auditMap.get(summary.auditType)
      const formatted = timestamp ? describeLastImport(timestamp) : null
      return {
        ...summary,
        lastImportedLabel: formatted?.label ?? null,
        isRecentlyUpdated: formatted?.isRecent ?? false,
      }
    })
  }, [recentAudit])

  return (
    <div className="import-shell">
      <header className="import-steps-bar">
        <div className={`import-step${currentStep === 1 ? ' active' : ''}`}>
          <span>1</span>
          Upload
        </div>
        <div className="import-step-line" />
        <div className={`import-step${currentStep === 2 ? ' active' : ''}`}>
          <span>2</span>
          Map columns
        </div>
        <div className="import-step-line" />
        <div className={`import-step${currentStep === 3 ? ' active' : ''}`}>
          <span>3</span>
          Review
        </div>
        {status && (
          <span className="pill" data-testid="import-status" style={{ marginLeft: 'auto' }}>
            {status}
          </span>
        )}
      </header>

      <main className="import-main">
        <section className="import-hero">
          <div>
            <h1 data-testid="import-hero-title">Let’s get your data in.</h1>
            <p>
              Step 1 of the CAC↔LTV loop: upload customers, transactions, channels, and spend so the compute engine can
              refresh ratios without leaving the browser. Every import reruns the pipeline automatically.
            </p>
            {status && !showMappingModal && (
              <span className="pill" data-testid="import-status-hero">
                {status}
              </span>
            )}
          </div>
          <input
            ref={fileInputRef}
            id="dataset-file-input"
            data-testid="dataset-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
          <section className="import-dataset-table">
            <div className="import-table-header">
              <div className="import-table-icon" aria-hidden="true">
                <span className="material-symbols-outlined">cloud_upload</span>
              </div>
              <div>
                <h3 style={{ margin: 0 }}>Import datasets</h3>
                <p className="page-description" style={{ margin: '0.2rem 0 0' }}>
                  Map, preview, and save each dataset to rerun the CAC↔LTV pipeline.
                </p>
              </div>
            </div>
            <div className="import-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {datasetCards.map((card) => (
                    <tr key={card.type}>
                      <td>
                        {card.title} {card.optional && <span className="tag optional">Optional</span>}
                      </td>
                      <td className="page-description">{card.description}</td>
                      <td className={card.isRecentlyUpdated ? 'status-date highlight' : 'status-date'}>
                        {card.lastImportedLabel ?? 'Not imported yet'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="accent-button primary"
                          onClick={() => {
                            setDataset(card.type)
                            triggerFilePicker()
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                            folder_open
                          </span>
                          Import
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="import-cards-row">
            <div className="import-card">
              <div>
                <h4>
                  <span className="material-symbols-outlined">table_chart</span>
                  Formatting help?
                </h4>
                <p>Download our sample template.</p>
              </div>
              <button type="button" onClick={handleDownloadTemplate}>
                Download template
              </button>
            </div>
            <div className="import-card tip">
              <div>
                <h4>
                  <span className="material-symbols-outlined">lightbulb</span>
                  Quick tip
                </h4>
                <p>Ensure your CSV has a header row—we auto-detect column names in the next step.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="import-panel">
          <h3 style={{ marginTop: 0 }}>Recent jobs</h3>
          {!jobs && <p>Loading jobs…</p>}
          {jobs && jobs.length === 0 && <p>No jobs yet.</p>}
          {jobs && jobs.length > 0 && (
            <div className="history-list">
              {jobs.map((job) => (
                <div className="log-entry" key={job.jobId}>
                  <div>
                    <strong style={{ display: 'block' }}>
                      {job.type.toUpperCase()} {job.dataset ? `· ${job.dataset}` : ''}
                    </strong>
                    <span className="page-description">
                      {job.phase} · updated {new Date(job.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <span className="tag">{job.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showMappingModal && (
        <div className="import-modal-backdrop" role="dialog" aria-modal="true">
          <form className="import-modal" data-testid="import-modal" onSubmit={handleSubmit}>
            <div className="import-modal-header">
              <div>
                <h3>Dataset & mapping</h3>
                <p className="page-description">
                  {file ? file.name : 'Choose a file to begin mapping columns.'}
                </p>
              </div>
              <button type="button" className="ghost" data-testid="import-modal-close" onClick={closeMappingModal}>
                Close
              </button>
            </div>

            <section className="import-panel">
              <label htmlFor="dataset-select">Dataset</label>
              <select
                id="dataset-select"
                data-testid="dataset-select"
                value={dataset}
                onChange={(e) => {
                  const value = e.target.value as DatasetType
                  setDataset(value)
                  if (columns.length) {
                    const targetSchema = DATASET_SCHEMAS[value]
                    setMapping(buildAutoMapping(targetSchema.fields.map((f) => f.key), columns))
                  }
                }}
              >
                {DATASET_OPTIONS.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="page-description">{schema.description}</p>
            </section>

            <section className="import-panel">
              <h3>Column mapping</h3>
              <div className="import-mapping-grid">
                {schema.fields.map((field) => (
                  <div key={field.key}>
                    <label>
                      {field.label} {field.required && <span className="badge">Required</span>}
                    </label>
                    <select
                      value={mapping[field.key] ?? ''}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select column</option>
                      {columns.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>

            {previewColumns.length > 0 && (
              <section className="import-panel">
                <h3>Preview (first {previewColumns.length} rows)</h3>
                <div className="dashboard-table" style={{ marginTop: '0.75rem' }}>
                  <table>
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewColumns.map((row, idx) => (
                        <tr key={idx}>
                          {columns.map((column) => (
                            <td key={column}>{row[column]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {error && <p className="banner warning">{error}</p>}

            <div className="import-footer">
              <button type="button" className="ghost" onClick={handleReset}>
                Cancel
              </button>
              <button type="submit" data-testid="import-submit" disabled={isRunning}>
                Commit import
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
            {status && <p className="page-description">{status}</p>}
          </form>
        </div>
      )}
    </div>
  )
}

async function parsePreview(file: File) {
  return new Promise<{ columns: string[]; rows: Record<string, string>[] }>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      preview: 10,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          columns: results.meta.fields ?? [],
          rows: results.data,
        })
      },
      error: (error) => reject(error),
    })
  })
}

function buildAutoMapping(schemaColumns: string[], csvColumns: string[]) {
  const mapping: Record<string, string> = {}
  schemaColumns.forEach((col) => {
    const match = csvColumns.find((csvColumn) => csvColumn.toLowerCase() === col.toLowerCase())
    if (match) {
      mapping[col] = match
    }
  })
  return mapping
}

function describeLastImport(timestamp: string) {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return {
      label: `Last import: ${timestamp}`,
      isRecent: false,
    }
  }
  const diffMs = Date.now() - parsed.getTime()
  if (diffMs < 60_000) {
    return { label: 'Last import: just now', isRecent: true }
  }
  if (diffMs < 3_600_000) {
    const minutes = Math.round(diffMs / 60_000)
    return {
      label: `Last import: ${minutes} min${minutes === 1 ? '' : 's'} ago`,
      isRecent: false,
    }
  }
  const formatted = parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return {
    label: `Last import: ${formatted}`,
    isRecent: false,
  }
}

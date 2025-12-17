import Papa from 'papaparse'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { nanoid } from 'nanoid'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProjectContext } from '../../context/ProjectContext'
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

  const jobs = useLiveQuery(() => db.jobs.orderBy('updatedAt').reverse().limit(5).toArray(), [db])

  const schema = DATASET_SCHEMAS[dataset]

  async function handleFileChange(newFile?: File) {
    if (!newFile) return
    setFile(newFile)
    const parsed = await parsePreview(newFile)
    setColumns(parsed.columns)
    setPreview(parsed.rows)
    setMapping(buildAutoMapping(schema.fields.map((f) => f.key), parsed.columns))
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
        (progress) => {
          setStatus(`Importing ${progress.processed}/${progress.total ?? '?'} rows (${progress.phase})`)
        },
      )
      setStatus('Import finished. Recomputing metrics...')
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Import wizard</h1>
          <p className="page-description">
            Feed customers, transactions, channels, and spend so the compute engine can keep your LTV:CAC ratio honest.
            Every import reruns the pipeline automatically.
          </p>
        </div>
        {status && <span className="pill">{status}</span>}
      </div>

      <div className="wizard-layout">
        <aside className="wizard-sidebar">
          <h3>Pipeline checklist</h3>
          <p style={{ color: 'rgba(255,255,255,0.75)' }}>
            Follow the steps to keep your ontology coherent and audit trails clean.
          </p>
          <div className="timeline">
            {['Choose dataset', 'Map canonical fields', 'Preview + validate', 'Commit & recompute'].map(
              (label, index) => (
                <div className="timeline-step" key={label}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{label}</strong>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.75)' }}>
                      {index === 0 && 'Pick which store this file belongs to.'}
                      {index === 1 && 'Map CSV headers into the OLO ontology.'}
                      {index === 2 && 'Look for missing IDs or invalid dates.'}
                      {index === 3 && 'Workers write to IndexedDB + recompute metrics.'}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        </aside>

        <form className="wizard-panel" onSubmit={handleSubmit}>
          <div className="split">
            <div>
              <label>Dataset</label>
              <select
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
            </div>
            <div>
              <label>Upload CSV</label>
              <input type="file" accept="text/csv" onChange={(e) => handleFileChange(e.target.files?.[0])} />
              <p className="page-description">Streaming parse—no file ever leaves the browser.</p>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <h3>Column mapping</h3>
            <div className="split">
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
          </div>

          {previewColumns.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3>Preview (first {previewColumns.length} rows)</h3>
              <div className="table-card" style={{ overflowX: 'auto' }}>
                <table className="table">
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
            </div>
          )}

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button type="submit" disabled={isRunning}>
              Commit import
            </button>
            {status && <span className="page-description">{status}</span>}
          </div>
          {error && <p className="banner warning" style={{ marginTop: '1rem' }}>{error}</p>}
        </form>
      </div>

      <div className="surface" style={{ marginTop: '2rem', borderRadius: 28 }}>
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
      </div>
    </div>
  )
}

function parsePreview(file: File) {
  return new Promise<{ columns: string[]; rows: Record<string, string>[] }>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      preview: 25,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          columns: results.meta.fields ?? [],
          rows: results.data.slice(0, 5),
        })
      },
      error: (err) => reject(err),
    })
  })
}

function buildAutoMapping(fieldKeys: string[], columns: string[]) {
  const mapping: Record<string, string> = {}
  fieldKeys.forEach((key) => {
    const target = columns.find((column) => column.toLowerCase().includes(key.toLowerCase()))
    if (target) {
      mapping[key] = target
    }
  })
  return mapping
}

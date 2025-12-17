import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createProject, deleteProject } from '../db/metaDb'
import { useProjects } from '../hooks/useProjects'
import { exportProjectBundle, importProjectBundle } from '../utils/projectTransfer'

export function ProjectHome() {
  const projects = useProjects()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name) {
      setError('Project name required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const id = await createProject(name, currency, timezone)
      navigate(`/project/${id}`)
    } catch (err) {
      console.error(err)
      setError('Unable to create project')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleExport(projectId: string) {
    try {
      const blob = await exportProjectBundle(projectId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `olo_${projectId}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      setError('Export failed')
    }
  }

  async function handleImport(file?: File) {
    if (!file) return
    setSubmitting(true)
    try {
      const projectId = await importProjectBundle(file)
      navigate(`/project/${projectId}`)
    } catch (err) {
      console.error(err)
      setError('Import failed')
    } finally {
      setSubmitting(false)
      fileInputRef.current && (fileInputRef.current.value = '')
    }
  }

  return (
    <div className="content" style={{ maxWidth: 1080, margin: '0 auto' }}>
      <section className="hero-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <span className="pill" style={{ color: '#cbd5f5' }}>
            Local-first workspace
          </span>
          <h1 style={{ margin: 0, fontSize: '2.5rem' }}>
            Operational Loop Optimizer
          </h1>
          <p style={{ margin: 0, maxWidth: 640, color: '#c3cee7' }}>
            Spin up isolated projects, import sensitive performance data, and keep LTV/CAC
            modeling entirely on-device. Export backups whenever you need to hop machines.
          </p>
        </div>
      </section>

      <div className="split" style={{ marginBottom: '1.5rem' }}>
        <section className="dimming-card">
          <h2 style={{ marginTop: 0 }}>Create a fresh project</h2>
          <p className="page-description">
            Each project provisions its own IndexedDB database, schema, and audit history.
          </p>
          <form className="split" onSubmit={handleCreate} style={{ marginTop: '1rem' }}>
            <div>
              <label>Project name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q1 North America"
              />
            </div>
            <div>
              <label>Currency</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
            <div>
              <label>Timezone</label>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>
            <div style={{ alignSelf: 'end', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={submitting}>
                Launch workspace
              </button>
            </div>
          </form>
          {error && <p className="banner warning" style={{ marginTop: '1rem' }}>{error}</p>}
        </section>

        <section className="surface" style={{ borderRadius: 28 }}>
          <h2 style={{ marginTop: 0 }}>Import from archive</h2>
          <p className="page-description">
            Restore from an OLO export bundle (ZIP). We&apos;ll reconstruct the database and
            reuse the saved model config.
          </p>
          <div style={{ marginTop: '1rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/zip"
              onChange={(e) => handleImport(e.target.files?.[0])}
              disabled={submitting}
            />
            <p className="page-description" style={{ marginTop: '0.5rem' }}>
              Tip: keep encrypted backups in cloud storage so you can rehydrate projects on any
              machine.
            </p>
          </div>
        </section>
      </div>

      <section className="surface" style={{ borderRadius: 28 }}>
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Projects</h2>
            <p className="page-description">
              One tab per dataset + model variant. Click in to open the full OLO workspace.
            </p>
          </div>
        </div>
        {!projects && <p>Loading projects...</p>}
        {projects && projects.length === 0 && <p>No projects yet. Create one to get started.</p>}
        {projects && projects.length > 0 && (
          <div className="card-grid">
            {projects.map((project) => (
              <div
                key={project.id}
                className="surface"
                style={{
                  borderRadius: 24,
                  padding: '1.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <span className="pill" style={{ background: 'rgba(15,23,42,0.08)' }}>
                    {project.currency} · {project.timezone}
                  </span>
                  <h3 style={{ margin: '0.5rem 0 0' }}>{project.name}</h3>
                  <p className="page-description">
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto' }}>
                  <button type="button" onClick={() => navigate(`/project/${project.id}`)}>
                    Open
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => handleExport(project.id)}
                  >
                    Export
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => deleteProject(project.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

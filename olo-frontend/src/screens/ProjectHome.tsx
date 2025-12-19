import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
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
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

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
      setShowCreateModal(false)
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
      setShowImportModal(false)
    } catch (err) {
      console.error(err)
      setError('Import failed')
    } finally {
      setSubmitting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const accentPalette = [
    'linear-gradient(120deg, #0ea5e9, #a855f7)',
    'linear-gradient(120deg, #6366f1, #ec4899)',
    'linear-gradient(120deg, #14b8a6, #0ea5e9)',
    'linear-gradient(120deg, #f97316, #ef4444)',
  ]

  useEffect(() => {
    if (showCreateModal) {
      requestAnimationFrame(() => nameInputRef.current?.focus())
    }
  }, [showCreateModal])

  const homeHeaderActions = (
    <>
      <button className="secondary" type="button">
        Projects
      </button>
      <button className="secondary" type="button">
        Settings
      </button>
    </>
  )

  return (
    <div className="home-shell">
      <AppHeader actions={homeHeaderActions} />

      <main className="home-main">
        <section className="home-hero-grid">
          <div className="home-hero-panel">
            <span className="pill" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
              CAC ↔ LTV loop lab
            </span>
            <h2 style={{ margin: '1rem 0 0.75rem', fontSize: '2.6rem', lineHeight: 1.15 }}>
              Keep LTV:CAC above 3:1
            </h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontSize: '1.05rem' }}>
              Every time a customer&apos;s lifetime value covers the cost of acquiring three more, growth compounds.<br/>This workspace
              keeps that ratio visible so you can double down on the segments and channels that fuel the loop.
            </p>
            <div className="home-hero-buttons">
              <button type="button" data-testid="open-project-modal" onClick={() => setShowCreateModal(true)}>
                Create new project
              </button>
              <button
                type="button"
                className="secondary accent-ghost"
                onClick={() => setShowImportModal(true)}
                disabled={submitting}
              >
                Import project
              </button>
            </div>
          </div>
        </section>

        <section className="home-form-card" style={{ borderRadius: 32 }}>
          <div className="home-projects-header">
            <div>
              <h2 style={{ margin: 0 }}>Your projects</h2>
              <p className="page-description" style={{ margin: '0.35rem 0 0' }}>
                {projects ? `${projects.length} local dataset${projects.length === 1 ? '' : 's'} ready to explore.` : 'Loading projects...'}
              </p>
            </div>
            <div className="home-projects-header-controls">
              <button className="secondary" type="button">
                Filter
              </button>
              <button className="secondary" type="button">
                Sort: Recent
              </button>
            </div>
          </div>
          {!projects && <p style={{ marginTop: '1.5rem' }}>Loading projects...</p>}
          {projects && projects.length === 0 && (
            <p style={{ marginTop: '1.5rem' }}>
              No projects yet. Create a workspace above or import an export bundle to get started.
            </p>
          )}
          {projects && projects.length > 0 && (
            <div className="home-projects-grid" style={{ marginTop: '1.5rem' }}>
              {projects.map((project, index) => (
                <article key={project.id} className="home-project-card">
                  <div
                    className="home-project-cover"
                    style={{ background: accentPalette[index % accentPalette.length] }}
                  >
                    <span>
                      {project.currency} · {project.timezone}
                    </span>
                  </div>
                  <div className="home-project-body">
                    <div>
                      <h3 style={{ margin: 0 }}>{project.name}</h3>
                      <p className="page-description" style={{ margin: '0.35rem 0 0' }}>
                        Created {new Date(project.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="home-project-actions">
                      <button type="button" onClick={() => navigate(`/project/${project.id}`)}>
                        Open
                      </button>
                      <button className="secondary" type="button" onClick={() => handleExport(project.id)}>
                        Export
                      </button>
                      <button className="ghost" type="button" onClick={() => deleteProject(project.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <AppFooter />

      {showCreateModal && (
        <div className="home-modal-backdrop" role="dialog" aria-modal="true">
          <div className="home-modal">
            <div className="home-modal-header">
              <div>
                <h2 style={{ margin: 0 }}>Workspace launcher</h2>
                <p className="page-description" style={{ margin: '0.35rem 0 0' }}>
                  Fill in the basics. We will spin up Dexie stores and seed default model config.
                </p>
              </div>
              <button className="ghost" type="button" onClick={() => setShowCreateModal(false)}>
                Close
              </button>
            </div>
            <form
              onSubmit={handleCreate}
              style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div>
                <label htmlFor="project-name-input">Project name</label>
                <input
                  id="project-name-input"
                  data-testid="project-name-input"
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q1 North America"
                />
              </div>
              <div>
                <label htmlFor="project-currency-input">Currency</label>
                <input
                  id="project-currency-input"
                  data-testid="project-currency-input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="project-timezone-input">Timezone</label>
                <input
                  id="project-timezone-input"
                  data-testid="project-timezone-input"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </div>
              <div className="home-modal-actions">
                <button className="secondary" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting}>
                  Launch workspace
                </button>
              </div>
            </form>
            {error && <div className="home-error">{error}</div>}
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="home-modal-backdrop" role="dialog" aria-modal="true">
          <div className="home-modal">
            <div className="home-modal-header">
              <div>
                <h2 style={{ margin: 0 }}>Archive restore</h2>
                <p className="page-description" style={{ margin: '0.35rem 0 0' }}>
                  Select an export bundle (.zip). We recreate stores, rerun migrations, and log the import.
                </p>
              </div>
              <button className="ghost" type="button" onClick={() => setShowImportModal(false)}>
                Close
              </button>
            </div>
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label htmlFor="project-import-input">Import .zip</label>
              <input
                id="project-import-input"
                ref={fileInputRef}
                type="file"
                accept="application/zip"
                onChange={(e) => handleImport(e.target.files?.[0])}
                disabled={submitting}
              />
              <p className="page-description" style={{ margin: 0 }}>
                Tip: encrypt exports before syncing through cloud drives so sensitive data never leaves your device.
              </p>
            </div>
            <div className="home-modal-actions" style={{ marginTop: '1.5rem' }}>
              <button className="secondary" type="button" onClick={() => setShowImportModal(false)}>
                Cancel
              </button>
            </div>
            {error && <div className="home-error">{error}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

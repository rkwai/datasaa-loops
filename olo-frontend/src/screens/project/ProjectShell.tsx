import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { metaDb, touchProject } from '../../db/metaDb'
import { ProjectProvider } from '../../context/ProjectContext'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'

const NAV_ITEMS = [
  { to: 'dashboard', label: 'LTV ↔ CAC view' },
  { to: 'import', label: 'Data intake' },
  { to: 'attribution', label: 'LTV→CAC map' },
  { to: 'plan', label: 'Spend plan' },
  { to: 'settings', label: 'Model settings' },
  { to: 'audit', label: 'Audit log' },
  { to: 'export', label: 'Exports' },
]

export function ProjectShell() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const [hasWriteLock, setHasWriteLock] = useState(true)
  const navigate = useNavigate()

  const meta = useLiveQuery(async () => {
    if (!projectId) return undefined
    return metaDb.projects.get(projectId)
  }, [projectId])

  useEffect(() => {
    if (projectId) {
      touchProject(projectId)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    const lockManager = (navigator as Navigator & { locks?: LockManager }).locks
    if (!lockManager?.request) return
    let release: (() => void) | null = null
    lockManager
      .request(
        `olo-project-${projectId}`,
        { ifAvailable: true },
        (lock) =>
          new Promise<void>((resolve) => {
            if (!lock) {
              setHasWriteLock(false)
              return
            }
            setHasWriteLock(true)
            release = resolve
          }),
      )
      .catch(() => setHasWriteLock(true))
    return () => {
      release?.()
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(`olo-project-${projectId}`)
    channel.postMessage({ type: 'ping' })
    channel.onmessage = (event) => {
      if (event.data?.type === 'writer-active') {
        setHasWriteLock(false)
      }
    }
    if (hasWriteLock) {
      channel.postMessage({ type: 'writer-active' })
    }
    return () => channel.close()
  }, [projectId, hasWriteLock])

  const loading = projectId && meta === undefined

  const content = useMemo(() => {
    if (!projectId) {
      return <p style={{ padding: '2rem' }}>Missing project id.</p>
    }
    if (loading) {
      return <p style={{ padding: '2rem' }}>Loading project...</p>
    }
    if (!meta) {
      return <p style={{ padding: '2rem' }}>Project not found.</p>
    }

    return (
      <ProjectProvider projectId={projectId} meta={meta}>
        <div className="layout">
          <aside className="sidebar">
            <div>
              <h2>{meta.name}</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                {meta.currency} · {meta.timezone}
              </p>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                Created {new Date(meta.createdAt).toLocaleDateString()}
              </p>
            </div>
            <nav className="nav-section">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  data-testid={`nav-${item.to}`}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  to={`/project/${projectId}/${item.to}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
          <main className="content">
            <Outlet />
          </main>
        </div>
      </ProjectProvider>
    )
  }, [projectId, meta, loading])

  const headerActions = (
    <>
      <button className="secondary" type="button" onClick={() => navigate('/')}>
        Projects
      </button>
      <button
        className="secondary"
        type="button"
        onClick={() => projectId && navigate(`/project/${projectId}/settings`)}
      >
        Settings
      </button>
    </>
  )

  return (
    <div className="app-shell">
      <AppHeader actions={headerActions} searchPlaceholder="Search workspace…" />
      <main className="app-main">{content}</main>
      <AppFooter />
    </div>
  )
}

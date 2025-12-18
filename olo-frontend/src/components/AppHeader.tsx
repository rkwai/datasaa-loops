import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

interface AppHeaderProps {
  actions?: ReactNode
  searchPlaceholder?: string
}

export function AppHeader({ actions, searchPlaceholder = 'Search projects...' }: AppHeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="home-header">
      <button
        type="button"
        className="home-brand"
        onClick={() => navigate('/')}
        style={{ background: 'transparent' }}
      >
        <div className="home-logo">
          <img src="/logo.svg" alt="Loop Analyzer logo" className="home-logo-img" />
        </div>
        <div>
          <h1 data-testid="app-title">Loop Analyzer</h1>
          <span>Local-first workspace</span>
        </div>
      </button>
      <div className="home-search">
        <div className="home-search-wrap">
          <span>⌘K</span>
          <input type="text" placeholder={searchPlaceholder} aria-label="Search" />
        </div>
      </div>
      <div className="home-header-actions">
        {actions}
        <div className="home-avatar">LW</div>
      </div>
    </header>
  )
}

import type { ReactNode } from 'react'

interface AppHeaderProps {
  actions?: ReactNode
  searchPlaceholder?: string
}

export function AppHeader({ actions, searchPlaceholder = 'Search projects...' }: AppHeaderProps) {
  return (
    <header className="home-header">
      <div className="home-brand">
        <div className="home-logo">
          <img src="/logo.svg" alt="Loop Analyzer logo" className="home-logo-img" />
        </div>
        <div>
          <h1>Loop Analyzer</h1>
          <span>Local-first workspace</span>
        </div>
      </div>
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

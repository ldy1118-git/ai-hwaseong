import { useLocation } from 'react-router-dom'

const BOTTOM_NAV_PATHS = new Set(['/home', '/district', '/schedule', '/mission', '/onboarding'])

export default function PageWrapper({ children, className = '' }) {
  const { pathname } = useLocation()
  const hasNav = BOTTOM_NAV_PATHS.has(pathname)

  return (
    <div className={`max-w-4xl mx-auto px-5 py-4 ${hasNav ? 'pb-20' : ''} ${className}`}>
      {children}
    </div>
  )
}

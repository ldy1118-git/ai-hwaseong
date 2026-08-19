import { useLocation, useNavigate } from 'react-router-dom'
import { Home, BarChart2, CalendarDays, MessageCircle, UserCircle2 } from 'lucide-react'

const BASE_TABS = [
  { icon: Home,          label: '홈',     path: '/home' },
  { icon: BarChart2,     label: null,      path: '/district' },
  { icon: CalendarDays,  label: '일정',   path: '/schedule' },
  { icon: MessageCircle, label: '챗봇',   path: '/mission' },
  { icon: UserCircle2,   label: '내 정보', path: '/onboarding' },
]

const HIDE_PATHS = new Set(['/', '/auth'])

export default function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const profile = (() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile')) } catch { return null }
  })()
  const isOwner = profile?.business_status === '운영중'

  const TABS = BASE_TABS.map(t =>
    t.path === '/district' ? { ...t, label: isOwner ? '내 매장' : '상권분석' } : t
  )

  if (HIDE_PATHS.has(pathname)) return null

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm border-t border-warm-gray/20"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-around h-16 px-2">
        {TABS.map(({ icon: Icon, label, path }) => {
          const active = pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5
                          rounded-xl transition-all duration-150 min-w-[56px]
                          ${active ? 'text-navy' : 'text-warm-gray hover:text-warm-text'}`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-[12px] leading-tight ${active ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

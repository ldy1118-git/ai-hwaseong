import { useLocation, useNavigate } from 'react-router-dom'
import { Home, BarChart2, CalendarDays, MessageCircle, UserCircle2 } from 'lucide-react'
import logoImg from '../../../design/logo.png'
import MarsAvatar from '../ui/MarsAvatar'

const BASE_TABS = [
  { icon: Home,          label: '홈',      path: '/home' },
  { icon: BarChart2,     label: null,       path: '/district' },
  { icon: CalendarDays,  label: '일정',    path: '/schedule' },
  { icon: MessageCircle, label: '챗봇',    path: '/mission' },
  { icon: UserCircle2,   label: '내 정보', path: '/onboarding' },
]

export default function Header({ onAvatarClick, className = '' }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const profile = (() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile')) } catch { return null }
  })()
  const isOwner = profile?.business_status === '운영중'

  const TABS = BASE_TABS.map(t =>
    t.path === '/district' ? { ...t, label: isOwner ? '내 매장' : '상권분석' } : t
  )

  return (
    <header
      className={[
        'w-full bg-primary-bg border-b border-warm-gray/30 sticky top-0 z-40',
        'px-5 py-2 flex items-center gap-2',
        className,
      ].join(' ')}
    >
      {/* 로고 */}
      <a href="#/" aria-label="Mars-Fit 홈" className="flex-shrink-0">
        <img src={logoImg} alt="Mars-Fit" className="h-12 object-contain" />
      </a>

      {/* 네비게이션 탭 */}
      <nav className="flex-1 flex items-center justify-around">
        {TABS.map(({ icon: Icon, label, path }) => {
          const active = pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5
                          rounded-xl transition-all duration-150 min-w-0
                          ${active ? 'text-navy' : 'text-warm-gray hover:text-warm-text'}`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-[11px] leading-tight whitespace-nowrap ${active ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* 마이다 아바타 */}
      <MarsAvatar size="md" alt="내 프로필" onClick={onAvatarClick} className="flex-shrink-0" />
    </header>
  )
}

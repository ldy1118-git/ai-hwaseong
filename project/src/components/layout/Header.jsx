import { useLocation, useNavigate } from 'react-router-dom'
import { Home, CalendarDays, MessageCircle, UserCircle2 } from 'lucide-react'
import logoImg from '../../../design/logo.png'
import MarsAvatar from '../ui/MarsAvatar'
import NotificationBell from '../ui/NotificationBell'

const TABS = [
  { icon: Home,          label: '공고',    path: '/home' },
  { icon: CalendarDays,  label: '일정',    path: '/schedule' },
  { icon: MessageCircle, label: '챗봇',    path: '/mission' },
  { icon: UserCircle2,   label: '내 정보', path: '/onboarding' },
]

export default function Header({ onAvatarClick, className = '' }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    /* 상단바가 휴대폰 하단 탭바를 그대로 위로 올려놓은 모양이었다 —
       아이콘 위에 글자, 다섯 칸을 화면 폭에 균등 분배(justify-around).
       휴대폰에서는 맞지만 넓은 화면에서는 탭이 화면 끝까지 흩어져서
       로고와 아무 관계 없어 보인다.

       좁은 화면은 그대로 두고, 넓은 화면에서만 데스크톱 머리글로 바꾼다.
         · 아이콘과 글자를 나란히(가로) 둔다
         · 균등 분배 대신 왼쪽에 모아 붙인다
         · 지금 있는 곳은 밑줄로 표시한다. 웹에서 익숙한 방식이다 */
    <header
      className={[
        'w-full bg-primary-bg border-b border-warm-gray/30 sticky top-0 z-40',
        'px-5 py-2 flex items-center gap-2 lg:gap-6 lg:px-8',
        className,
      ].join(' ')}
    >
      {/* 로고 */}
      <a href="#/" aria-label="Mars-Fit 홈" className="tap flex-shrink-0">
        {/* 폰에서는 줄인다. 48px 로 두면 로고가 폭을 먹어서 탭 다섯 칸이
              38px 씩밖에 못 가진다. */}
          <img src={logoImg} alt="Mars-Fit" className="h-9 sm:h-12 object-contain" />
      </a>

      {/* 네비게이션 탭 */}
      <nav className="flex-1 flex items-center justify-around
                      lg:justify-start lg:gap-1">
        {TABS.map(({ icon: Icon, label, path }) => {
          const active = pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex-1 lg:flex-none flex flex-col items-center justify-center gap-0.5 px-2 py-1.5',
                'rounded-xl transition-all duration-150 min-w-0',
                // 넓은 화면: 가로 배치 + 아래 밑줄
                'lg:flex-row lg:gap-2 lg:px-3.5 lg:py-2 lg:rounded-none',
                // 밑줄은 버튼 바로 밑에 둔다. 헤더 바닥선에 맞추려고
                // 음수 여백을 주면, 헤더가 items-center 라 밑줄이 내려오는
                // 대신 버튼 자체가 아래로 밀린다.
                'lg:border-b-2',
                active
                  ? 'text-navy lg:border-navy'
                  : 'text-warm-gray hover:text-warm-text lg:border-transparent lg:hover:border-warm-gray/40',
              ].join(' ')}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-[11px] lg:text-sm leading-tight whitespace-nowrap ${active ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* 알림 — 담아둔 관심공고의 마감이 다가오면 뜬다. 없으면 안 그린다. */}
      <NotificationBell className="lg:ml-auto" />

      {/* 마이다 아바타 — 넓은 화면에서는 오른쪽 끝에 붙는다 */}
      <MarsAvatar size="md" alt="내 프로필" onClick={onAvatarClick} className="flex-shrink-0 lg:ml-auto" />
    </header>
  )
}

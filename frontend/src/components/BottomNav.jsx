import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Calendar, Gift, MapPin, MessageCircle } from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: Home, label: '홈' },
  { path: '/tax', icon: Calendar, label: '세무일정' },
  { path: '/support', icon: Gift, label: '지원사업' },
  { path: '/district', icon: MapPin, label: '상권' },
  { path: '/chat', icon: MessageCircle, label: '챗봇' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  const hideOn = ['/', '/onboarding']
  if (hideOn.some(p => location.pathname === p || location.pathname.startsWith('/onboarding'))) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-bottom">
      <div className="max-w-lg mx-auto flex">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${
                active ? 'text-hwaseong-blue' : 'text-gray-400'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-xs ${active ? 'font-semibold' : 'font-normal'}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

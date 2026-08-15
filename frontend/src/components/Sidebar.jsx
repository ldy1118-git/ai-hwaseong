import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Calendar, Gift, MapPin, ArrowLeft } from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: '홈 대시보드' },
  { path: '/tax', icon: Calendar, label: '세무 신고 일정' },
  { path: '/support', icon: Gift, label: '지원사업 찾기' },
  { path: '/district', icon: MapPin, label: '상권 변화 보기' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  const hideOn = ['/', '/onboarding']
  if (hideOn.some(p => location.pathname === p || location.pathname.startsWith('/onboarding'))) return null

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-white border-r border-gray-200 z-30 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-hwaseong-blue flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">AI</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">화성 경영동행</p>
            <p className="text-[11px] text-gray-400">소상공인 AI 파트너</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 bg-hwaseong-light border-b border-blue-100">
        <p className="text-[11px] text-blue-400 mb-0.5">현재 사업장</p>
        <p className="text-sm font-semibold text-gray-800">동탄2신도시 · 음식점</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                active
                  ? 'bg-hwaseong-blue text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-sm font-medium">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="px-3 pb-4 pt-3 border-t border-gray-100">
        <button
          onClick={() => navigate('/')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 text-left transition-all"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">처음으로</span>
        </button>
      </div>
    </aside>
  )
}

import { useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, AlertCircle, Gift, MapPin, Calendar, TrendingUp } from 'lucide-react'
import { taxSchedules, supportPrograms, commercialInsights } from '../data/mockData'

function UrgentBadge({ days }) {
  if (days <= 5) return <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">D-{days}</span>
  if (days <= 14) return <span className="bg-amber-100 text-amber-600 text-xs font-bold px-2 py-0.5 rounded-full">D-{days}</span>
  return <span className="bg-gray-100 text-gray-500 text-xs font-medium px-2 py-0.5 rounded-full">D-{days}</span>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const urgent = taxSchedules.filter(t => t.daysLeft <= 5)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">안녕하세요, 사장님 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">동탄2신도시 · 음식점 · 오늘도 좋은 하루 되세요</p>
        </div>
        <button className="relative p-2 rounded-xl hover:bg-gray-50 transition-colors">
          <Bell size={22} className="text-gray-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-400 rounded-full" />
        </button>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* 긴급 배너 */}
        {urgent.length > 0 && (
          <button
            onClick={() => navigate('/tax')}
            className="w-full bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-4 text-left hover:bg-red-100 transition-colors"
          >
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertCircle size={20} className="text-red-500" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-gray-800">지금 바로 확인해야 할 일이 있어요!</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {urgent[0].title} 마감까지 <span className="text-red-600 font-bold">D-{urgent[0].daysLeft}</span>
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-400 shrink-0" />
          </button>
        )}

        {/* 빠른 메뉴 */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { icon: Calendar, label: '세무일정', color: 'text-blue-500 bg-blue-50', path: '/tax' },
            { icon: Gift, label: '지원사업', color: 'text-green-500 bg-green-50', path: '/support' },
            { icon: MapPin, label: '상권보기', color: 'text-purple-500 bg-purple-50', path: '/district' },
            { icon: TrendingUp, label: '매출진단', color: 'text-amber-500 bg-amber-50', path: '/support', disabled: true },
          ].map(({ icon: Icon, label, color, path, disabled }) => (
            <button
              key={label}
              onClick={() => !disabled && navigate(path)}
              className={`flex flex-col items-center gap-2.5 py-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
            >
              <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center`}>
                <Icon size={22} />
              </div>
              <span className="text-sm font-medium text-gray-700">{label}</span>
              {disabled && <span className="text-[10px] text-gray-400 -mt-1">2차 예정</span>}
            </button>
          ))}
        </div>

        {/* 세무 + 지원사업 2열 그리드 */}
        <div className="grid grid-cols-2 gap-6">
          {/* 세무 신고 일정 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-blue-500" />
                <span className="font-bold text-gray-800">세무 신고 일정</span>
              </div>
              <button onClick={() => navigate('/tax')} className="text-xs text-hwaseong-blue flex items-center gap-0.5 hover:underline">
                전체보기 <ChevronRight size={13} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {taxSchedules.map(t => (
                <button
                  key={t.id}
                  onClick={() => navigate('/tax')}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.urgent ? 'bg-red-100' : 'bg-blue-50'}`}>
                    <Calendar size={14} className={t.urgent ? 'text-red-500' : 'text-blue-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.deadline}</p>
                  </div>
                  <UrgentBadge days={t.daysLeft} />
                </button>
              ))}
            </div>
          </div>

          {/* 지원사업 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Gift size={16} className="text-green-600" />
                <span className="font-bold text-gray-800">신청 가능한 지원사업</span>
              </div>
              <button onClick={() => navigate('/support')} className="text-xs text-hwaseong-blue flex items-center gap-0.5 hover:underline">
                전체보기 <ChevronRight size={13} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {supportPrograms.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate('/support')}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                    <Gift size={14} className="text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 truncate">{s.title}</p>
                    <p className="text-xs text-hwaseong-green font-medium">{s.amount}</p>
                  </div>
                  <UrgentBadge days={s.daysLeft} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 상권 변화 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-purple-500" />
              <span className="font-bold text-gray-800">우리 동네 상권 변화</span>
            </div>
            <button onClick={() => navigate('/district')} className="text-xs text-hwaseong-blue flex items-center gap-0.5 hover:underline">
              전체보기 <ChevronRight size={13} />
            </button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            {commercialInsights.map(i => (
              <button
                key={i.id}
                onClick={() => navigate('/district')}
                className="flex items-start gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-2xl shrink-0">{i.icon}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-800">{i.area}</p>
                  <p className={`text-xs font-bold mt-0.5 ${i.type === '증가' ? 'text-green-600' : 'text-amber-600'}`}>
                    {i.metric} {i.change}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 leading-snug line-clamp-2">{i.detail}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

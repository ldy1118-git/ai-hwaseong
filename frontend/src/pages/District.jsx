import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { commercialInsights } from '../data/mockData'

const areaStats = [
  { area: '동탄2신도시', population: '2.3만명', stores: '1,240개', avgRevenue: '월 820만', hotBiz: '음식점·카페', trend: 'up' },
  { area: '향남읍', population: '4.1만명', stores: '890개', avgRevenue: '월 580만', hotBiz: '소매·마트', trend: 'down' },
  { area: '남양읍', population: '1.8만명', stores: '520개', avgRevenue: '월 490만', hotBiz: '카페·베이커리', trend: 'up' },
  { area: '봉담읍', population: '5.2만명', stores: '1,100개', avgRevenue: '월 620만', hotBiz: '음식점·주점', trend: 'flat' },
]

const monthlyData = [
  { month: '8월', value: 72 },
  { month: '9월', value: 68 },
  { month: '10월', value: 75 },
  { month: '11월', value: 80 },
  { month: '12월', value: 91 },
  { month: '1월', value: 100 },
]

function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.value))
  return (
    <div className="flex items-end gap-2 h-36">
      {data.map((d, i) => (
        <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-gray-500 font-medium">{d.value}</span>
          <div
            className={`w-full rounded-t transition-all ${i === data.length - 1 ? 'bg-hwaseong-blue' : 'bg-gray-200'}`}
            style={{ height: `${(d.value / max) * 108}px` }}
          />
          <span className="text-[10px] text-gray-400">{d.month}</span>
        </div>
      ))}
    </div>
  )
}

function TrendIcon({ trend, size = 18 }) {
  if (trend === 'up') return <TrendingUp size={size} className="text-green-600" />
  if (trend === 'down') return <TrendingDown size={size} className="text-red-500" />
  return <Minus size={size} className="text-gray-400" />
}

export default function District() {
  const [selectedArea, setSelectedArea] = useState('동탄2신도시')
  const area = areaStats.find(a => a.area === selectedArea)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">상권 변화 보기</h1>
        <p className="text-sm text-gray-500 mt-0.5">화성시 행정동 단위 상권 데이터</p>
      </div>

      <div className="px-8 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Left: area selector + key stats */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">지역 선택</p>
              </div>
              <div className="divide-y divide-gray-50">
                {areaStats.map(a => (
                  <button
                    key={a.area}
                    onClick={() => setSelectedArea(a.area)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-l-4 ${
                      selectedArea === a.area
                        ? 'border-hwaseong-blue bg-hwaseong-light'
                        : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      a.trend === 'up' ? 'bg-green-100' :
                      a.trend === 'down' ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                      <TrendIcon trend={a.trend} size={16} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${selectedArea === a.area ? 'text-hwaseong-blue' : 'text-gray-800'}`}>
                        {a.area}
                      </p>
                      <p className="text-xs text-gray-400">{a.hotBiz}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {area && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '유동인구', value: area.population },
                  { label: '인근 점포', value: area.stores },
                  { label: '평균 매출', value: area.avgRevenue },
                  { label: '유망 업종', value: area.hotBiz },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100">
                    <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
                    <p className="font-bold text-sm text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: trend + chart + insights */}
          <div className="col-span-2 space-y-5">
            {area && (
              <div className={`rounded-2xl p-5 ${
                area.trend === 'up' ? 'bg-green-50 border border-green-200' :
                area.trend === 'down' ? 'bg-red-50 border border-red-200' :
                'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <TrendIcon trend={area.trend} size={20} />
                  <span className={`font-bold text-base ${
                    area.trend === 'up' ? 'text-green-700' :
                    area.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {area.area} — {area.trend === 'up' ? '상권 활성화 중' : area.trend === 'down' ? '상권 주의 구간' : '보합 추세'}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  현재 <strong>{area.hotBiz}</strong> 업종이 강세예요.
                  {area.trend === 'down' && ' 소매업종은 대형마트 영향으로 매출 감소세에 주의가 필요해요.'}
                </p>
              </div>
            )}

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <p className="text-sm font-bold text-gray-800 mb-5">최근 6개월 방문객 추이</p>
              <BarChart data={monthlyData} />
              <p className="text-xs text-gray-400 mt-3 text-right">출처: 소상공인시장진흥공단 상권정보시스템</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">최근 변화 알림</p>
              <div className="grid grid-cols-2 gap-3">
                {commercialInsights.map(insight => (
                  <div key={insight.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${
                    insight.type === '증가' ? 'border-green-100' : 'border-amber-100'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{insight.icon}</span>
                      <span className={`font-bold text-sm ${insight.type === '증가' ? 'text-green-700' : 'text-amber-700'}`}>
                        {insight.metric} {insight.change}
                      </span>
                      <span className="text-xs text-gray-400 ml-auto">{insight.period}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{insight.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

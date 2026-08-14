import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, BarChart2, Bell, FileCheck, MapPin } from 'lucide-react'
import { businessTypes } from '../data/mockData'

const features = [
  { icon: Bell, color: 'bg-blue-100 text-blue-600', title: '먼저 알려줘요', desc: '세무 마감, 지원사업을 사전에 알림으로 전달' },
  { icon: MapPin, color: 'bg-green-100 text-green-600', title: '화성시 맞춤 정보', desc: '동탄·향남·남양읍 등 우리 동네 데이터' },
  { icon: FileCheck, color: 'bg-amber-100 text-amber-600', title: '신청까지 함께', desc: '서류 체크리스트로 신청 완료까지 동행' },
  { icon: BarChart2, color: 'bg-purple-100 text-purple-600', title: '상권 변화 알림', desc: '우리 동네 매출·유동인구 변화 한눈에' },
]

export default function Landing() {
  const navigate = useNavigate()
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState([])

  function toggleSelect(id) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev
    )
  }

  const selectedItems = businessTypes.filter(b => selected.includes(b.id))

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <header className="border-b border-gray-100 px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-hwaseong-blue flex items-center justify-center">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
          <span className="font-bold text-gray-900">화성 경영동행 AI</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/map')} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            서비스 구조도
          </button>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            먼저 둘러보기
          </button>
          <button
            onClick={() => navigate('/onboarding')}
            className="bg-hwaseong-blue text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            시작하기
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-hwaseong-blue to-blue-800 text-white py-20 px-10">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl">
            <span className="text-blue-200 text-sm font-medium tracking-wide">화성시 소상공인 전용 AI 서비스</span>
            <h1 className="text-4xl font-bold mt-3 mb-4 leading-tight">
              물어보지 않아도<br />
              <span className="text-blue-200">먼저 알려드려요</span>
            </h1>
            <p className="text-blue-100 text-lg leading-relaxed mb-8">
              세무 마감, 지원사업 신청, 상권 변화까지.<br />
              화성시 소상공인을 위한 AI 경영 파트너가 먼저 챙겨드립니다.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/onboarding')}
                className="bg-white text-hwaseong-blue px-8 py-3.5 rounded-2xl font-bold text-base hover:bg-blue-50 transition-colors shadow-lg"
              >
                1분 만에 시작하기 →
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="text-white border border-white/30 px-6 py-3.5 rounded-2xl font-medium text-sm hover:bg-white/10 transition-colors"
              >
                로그인 없이 둘러보기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-10 py-16">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-8 text-center">주요 기능</p>
        <div className="grid grid-cols-4 gap-6">
          {features.map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="bg-gray-50 rounded-2xl p-6 hover:shadow-md transition-shadow">
              <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center mb-4`}>
                <Icon size={20} />
              </div>
              <p className="font-bold text-gray-800 mb-2">{title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 업종 비교 */}
      <div className="bg-gray-50 py-16 px-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">예비창업자</p>
              <h2 className="text-2xl font-bold text-gray-900">관심 업종을 비교해보세요</h2>
            </div>
            {!compareMode && (
              <button
                onClick={() => setCompareMode(true)}
                className="bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-medium text-sm hover:shadow-md transition-shadow"
              >
                업종 비교하기 →
              </button>
            )}
          </div>

          {compareMode && (
            <div>
              <div className="grid grid-cols-6 gap-3 mb-6">
                {businessTypes.map(b => {
                  const isSelected = selected.includes(b.id)
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggleSelect(b.id)}
                      className={`flex flex-col items-center py-4 rounded-2xl border-2 transition-all ${
                        isSelected
                          ? 'border-hwaseong-blue bg-white shadow-md'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className="text-2xl mb-2">{b.icon}</span>
                      <span className="text-sm font-medium text-gray-700">{b.label}</span>
                    </button>
                  )
                })}
              </div>

              {selected.length >= 2 && (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {selectedItems.map(b => (
                      <div key={b.id} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-3xl">{b.icon}</span>
                          <p className="font-bold text-gray-800">{b.label}</p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">평균 매출</span>
                            <span className="text-sm font-semibold text-gray-800">{b.avgRevenue}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">경쟁 강도</span>
                            <span className={`text-sm font-bold ${
                              b.competitionLevel === '높음' ? 'text-red-500' :
                              b.competitionLevel === '중간' ? 'text-amber-500' : 'text-green-500'
                            }`}>{b.competitionLevel}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">지원사업</span>
                            <span className="text-sm font-semibold text-gray-800">{b.supportPrograms}개</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {selectedItems.length < 3 && (
                      <div className="bg-gray-50 rounded-2xl p-5 border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-sm">
                        업종을 추가 선택하세요
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <button
                      onClick={() => navigate('/onboarding')}
                      className="bg-hwaseong-blue text-white px-8 py-3.5 rounded-2xl font-bold text-base hover:bg-blue-700 transition-colors"
                    >
                      선택한 업종으로 시작하기 →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

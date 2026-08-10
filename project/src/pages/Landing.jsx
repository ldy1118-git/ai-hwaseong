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
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 3
          ? [...prev, id]
          : prev
    )
  }

  const selectedItems = businessTypes.filter(b => selected.includes(b.id))

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-lg mx-auto">
      {/* Hero */}
      <div className="bg-hwaseong-blue text-white px-6 pt-12 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <span className="text-sm font-bold">AI</span>
          </div>
          <span className="text-sm font-medium text-blue-100">화성시 경영동행 AI</span>
        </div>
        <h1 className="text-2xl font-bold leading-tight mb-2">
          물어보지 않아도<br />
          <span className="text-blue-200">먼저 알려드려요</span>
        </h1>
        <p className="text-blue-100 text-sm leading-relaxed">
          화성시 소상공인을 위한 AI 경영 파트너.<br />
          세무·지원사업·상권 정보를 알아서 챙겨드립니다.
        </p>
      </div>

      {/* Main CTA */}
      <div className="px-6 py-6 space-y-3">
        <button
          onClick={() => navigate('/onboarding')}
          className="w-full bg-hwaseong-blue text-white py-4 rounded-2xl font-bold text-base flex items-center justify-between px-6 shadow-md"
        >
          <span>지금 시작하기 (1분 설정)</span>
          <ChevronRight size={20} />
        </button>
        <button
          onClick={() => setCompareMode(!compareMode)}
          className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3.5 rounded-2xl font-medium text-sm flex items-center justify-between px-6"
        >
          <span>업종 먼저 비교해보기 (예비창업자)</span>
          <ChevronRight size={18} className="text-gray-400" />
        </button>
      </div>

      {/* 업종 비교 패널 */}
      {compareMode && (
        <div className="px-6 pb-6">
          <div className="bg-gray-50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">관심 업종을 최대 3개 선택하세요</p>
            <div className="grid grid-cols-3 gap-2">
              {businessTypes.map(b => {
                const isSelected = selected.includes(b.id)
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleSelect(b.id)}
                    className={`flex flex-col items-center py-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-hwaseong-blue bg-hwaseong-light'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className="text-xl mb-1">{b.icon}</span>
                    <span className="text-xs font-medium text-gray-700">{b.label}</span>
                  </button>
                )
              })}
            </div>

            {selected.length >= 2 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">비교 결과</p>
                {selectedItems.map(b => (
                  <div key={b.id} className="bg-white rounded-xl p-3 flex items-center gap-3 border border-gray-100">
                    <span className="text-2xl">{b.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800">{b.label}</p>
                      <p className="text-xs text-gray-500">{b.avgRevenue}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        b.competitionLevel === '높음' ? 'bg-red-100 text-red-600' :
                        b.competitionLevel === '중간' ? 'bg-amber-100 text-amber-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        경쟁 {b.competitionLevel}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">지원사업 {b.supportPrograms}개</p>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => navigate('/onboarding')}
                  className="w-full mt-2 bg-hwaseong-blue text-white py-3 rounded-xl font-semibold text-sm"
                >
                  이 업종으로 시작하기 →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 기능 소개 */}
      <div className="px-6 pb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">주요 기능</p>
        <div className="grid grid-cols-2 gap-3">
          {features.map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="bg-gray-50 rounded-2xl p-4">
              <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-2`}>
                <Icon size={18} />
              </div>
              <p className="font-semibold text-sm text-gray-800 mb-0.5">{title}</p>
              <p className="text-xs text-gray-500 leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 비로그인 체험 */}
      <div className="px-6 pb-10 mt-auto space-y-1">
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full text-center text-sm text-gray-400 py-2 underline"
        >
          로그인 없이 먼저 둘러보기
        </button>
        <button
          onClick={() => navigate('/map')}
          className="w-full text-center text-xs text-gray-300 py-1 underline"
        >
          서비스 구조도 보기
        </button>
      </div>
    </div>
  )
}

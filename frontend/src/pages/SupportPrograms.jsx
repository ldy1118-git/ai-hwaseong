import { useState } from 'react'
import { Gift, ExternalLink, Check, AlertCircle } from 'lucide-react'
import { supportPrograms } from '../data/mockData'

const CATEGORIES = ['전체', '자금', '디지털', '지역', '창업']

function MatchBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${score >= 90 ? 'bg-green-500' : score >= 80 ? 'bg-blue-500' : 'bg-amber-400'}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-bold ${score >= 90 ? 'text-green-600' : score >= 80 ? 'text-blue-600' : 'text-amber-600'}`}>
        {score}%
      </span>
    </div>
  )
}

function ProgramDetail({ item }) {
  const [step, setStep] = useState(0)
  const steps = ['자격 확인', '서류 준비', '신청 제출', '결과 대기']
  const [checkedReqs, setCheckedReqs] = useState([])

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12">
        <Gift size={52} strokeWidth={1} className="text-gray-200 mb-4" />
        <p className="text-base font-medium text-gray-400">지원사업을 선택하면</p>
        <p className="text-sm text-gray-300 mt-1">상세 정보와 신청 동행 안내가 표시됩니다</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8 space-y-6">
      <div>
        <span className="text-xs bg-blue-100 text-blue-600 px-2.5 py-1 rounded-full font-medium">{item.category}</span>
        <h2 className="text-xl font-bold text-gray-900 mt-3 leading-snug">{item.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{item.org} · {item.region}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">지원 금액</p>
          <p className="font-bold text-hwaseong-green">{item.amount}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">마감</p>
          <p className="font-bold text-hwaseong-blue">D-{item.daysLeft}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">매칭도</p>
          <p className="font-bold text-purple-600">{item.matchScore}%</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">사업 소개</p>
        <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-3">신청 동행 단계</p>
        <div className="flex gap-1.5 mb-5">
          {steps.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                i === step ? 'bg-hwaseong-blue text-white' :
                i < step ? 'bg-blue-100 text-blue-600' :
                'bg-gray-100 text-gray-400'
              }`}
            >
              {i < step ? '✓' : i + 1}. {s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-2">
            {item.requirements.map(req => (
              <button
                key={req}
                onClick={() => setCheckedReqs(prev => prev.includes(req) ? prev.filter(r => r !== req) : [...prev, req])}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                  checkedReqs.includes(req) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  checkedReqs.includes(req) ? 'border-green-500 bg-green-500' : 'border-gray-300'
                }`}>
                  {checkedReqs.includes(req) && <Check size={12} className="text-white" />}
                </div>
                <span className="text-sm text-gray-700">{req}</span>
              </button>
            ))}
            {checkedReqs.length === item.requirements.length && (
              <div className="mt-2 bg-green-50 rounded-xl p-3 flex items-center gap-2">
                <Check size={16} className="text-green-600" />
                <p className="text-sm text-green-700 font-medium">자격 요건을 모두 충족했어요!</p>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="space-y-1.5 mb-4">
              {['사업자등록증 사본', '신분증 사본', '통장 사본', '최근 3개월 매출 증빙'].map(doc => (
                <div key={doc} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                  <div className="w-4 h-4 rounded border border-gray-300 shrink-0" />
                  <span className="text-sm text-gray-700">{doc}</span>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">서류는 신청일 기준 3개월 이내 발급본이어야 해요.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center py-4">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-bold text-gray-800 mb-1">신청 준비 완료!</p>
            <p className="text-sm text-gray-500 mb-5">아래 버튼을 눌러 공식 사이트에서 신청하세요.</p>
            <a
              href={item.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-hwaseong-blue text-white py-4 rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors"
            >
              신청 페이지로 이동 <ExternalLink size={16} />
            </a>
          </div>
        )}

        {step === 3 && (
          <div className="bg-blue-50 rounded-2xl p-6 text-center">
            <p className="text-3xl mb-3">⏳</p>
            <p className="font-bold text-gray-800 mb-1">결과 발표 대기 중</p>
            <p className="text-sm text-gray-500">결과 발표일: <strong>{item.deadline}</strong></p>
            <p className="text-xs text-gray-400 mt-2">발표일에 알림을 드릴게요.</p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3 border border-gray-300 rounded-2xl font-semibold text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              이전
            </button>
          )}
          {step < steps.length - 1 && (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-1 py-3 bg-hwaseong-blue text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors"
            >
              다음 단계
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SupportPrograms() {
  const [activeCategory, setActiveCategory] = useState('전체')
  const [selected, setSelected] = useState(null)

  const filtered = (activeCategory === '전체'
    ? supportPrograms
    : supportPrograms.filter(p => p.category === activeCategory)
  ).sort((a, b) => b.matchScore - a.matchScore)

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">지원사업 찾기</h1>
        <p className="text-sm text-gray-500 mt-0.5">내 업종·지역에 맞는 사업만 모았어요</p>
      </div>

      {/* Master-detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: filter + list */}
        <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 flex gap-2 overflow-x-auto">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-hwaseong-blue text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <p className="flex-shrink-0 text-xs text-gray-400 px-5 py-2 border-b border-gray-50">{filtered.length}건 · 매칭도 순</p>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filtered.map(item => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className={`w-full px-5 py-4 text-left hover:bg-gray-50 transition-colors border-l-4 ${
                  selected?.id === item.id ? 'bg-hwaseong-light border-hwaseong-blue' : 'border-transparent'
                }`}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    item.category === '자금' ? 'bg-green-100 text-green-700' :
                    item.category === '디지털' ? 'bg-blue-100 text-blue-700' :
                    item.category === '지역' ? 'bg-purple-100 text-purple-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>{item.category}</span>
                  <span className={`text-xs font-bold ${item.daysLeft <= 14 ? 'text-red-500' : 'text-gray-400'}`}>
                    D-{item.daysLeft}
                  </span>
                </div>
                <p className="font-semibold text-sm text-gray-800 leading-snug mb-1">{item.title}</p>
                <p className="text-xs text-gray-400 mb-2">{item.org}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-hwaseong-green">{item.amount}</span>
                  <div className="flex items-center gap-1.5 w-24">
                    <span className="text-xs text-gray-400 shrink-0">매칭</span>
                    <MatchBar score={item.matchScore} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: detail */}
        <div className="flex-1 bg-white overflow-hidden">
          <ProgramDetail key={selected?.id} item={selected} />
        </div>
      </div>
    </div>
  )
}

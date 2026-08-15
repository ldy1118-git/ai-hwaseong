import { useState } from 'react'
import { Calendar, ExternalLink, FileText, Check } from 'lucide-react'
import { taxSchedules } from '../data/mockData'

function DaysBadge({ days }) {
  if (days <= 5) return <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full">D-{days} 긴급</span>
  if (days <= 14) return <span className="bg-amber-100 text-amber-600 text-xs font-bold px-2.5 py-1 rounded-full">D-{days}</span>
  return <span className="bg-gray-100 text-gray-500 text-xs font-medium px-2.5 py-1 rounded-full">D-{days}</span>
}

function TaxDetail({ item }) {
  const [checked, setChecked] = useState([])

  function toggleCheck(doc) {
    setChecked(prev => prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc])
  }

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <Calendar size={52} strokeWidth={1} className="text-gray-200 mb-4" />
        <p className="text-base font-medium text-gray-400">항목을 선택하면</p>
        <p className="text-sm text-gray-300 mt-1">세부 내용과 서류 체크리스트가 표시됩니다</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      <div>
        <DaysBadge days={item.daysLeft} />
        <h2 className="text-2xl font-bold text-gray-900 mt-3">{item.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{item.description}</p>
      </div>

      <div className="bg-gray-50 rounded-2xl p-5 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
          <Calendar size={18} className="text-blue-500" />
        </div>
        <div>
          <p className="text-xs text-gray-400">신고 마감일</p>
          <p className="font-bold text-gray-800 text-lg">{item.deadline}</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <FileText size={15} className="text-blue-500" />
          준비 서류 체크리스트
        </p>
        <div className="space-y-2">
          {item.docs.map(doc => (
            <button
              key={doc}
              onClick={() => toggleCheck(doc)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                checked.includes(doc)
                  ? 'border-hwaseong-blue bg-hwaseong-light'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                checked.includes(doc) ? 'border-hwaseong-blue bg-hwaseong-blue' : 'border-gray-300'
              }`}>
                {checked.includes(doc) && <Check size={12} className="text-white" />}
              </div>
              <span className={`text-sm ${checked.includes(doc) ? 'text-hwaseong-blue font-medium line-through opacity-60' : 'text-gray-700'}`}>
                {doc}
              </span>
            </button>
          ))}
        </div>
        {checked.length === item.docs.length && (
          <p className="text-center text-green-600 font-semibold text-sm mt-4">✅ 서류 준비 완료!</p>
        )}
      </div>

      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-hwaseong-blue text-white py-4 rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors"
      >
        홈택스에서 신고하기 <ExternalLink size={16} />
      </a>
    </div>
  )
}

export default function TaxSchedule() {
  const [selected, setSelected] = useState(null)

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">세무 신고 일정</h1>
        <p className="text-sm text-gray-500 mt-0.5">마감 전에 미리 알려드려요</p>
      </div>

      {/* Master-detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: list */}
        <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">전체 신고 일정</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[...taxSchedules].sort((a, b) => a.daysLeft - b.daysLeft).map(item => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className={`w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors border-l-4 ${
                  selected?.id === item.id
                    ? 'bg-hwaseong-light border-hwaseong-blue'
                    : 'border-transparent'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  item.urgent ? 'bg-red-100' : 'bg-blue-50'
                }`}>
                  <Calendar size={18} className={item.urgent ? 'text-red-500' : 'text-blue-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.deadline}</p>
                </div>
                <DaysBadge days={item.daysLeft} />
              </button>
            ))}
          </div>
        </div>

        {/* Right: detail */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden">
          <TaxDetail key={selected?.id} item={selected} />
        </div>
      </div>
    </div>
  )
}

import { Check } from 'lucide-react'

// 창업 여정 4단계 매크로 진행 표시
// currentStep: 1=정보입력, 2=상권추천, 3=창업준비, 4=공고탐색
const STAGES = [
  { label: '정보 입력' },
  { label: '상권 추천' },
  { label: '창업 준비' },
  { label: '공고 탐색' },
]

export default function JourneyProgress({ currentStep }) {
  return (
    <div className="bg-white border-b border-warm-gray/20 px-5 py-3">
      <div className="max-w-lg mx-auto flex items-center justify-between relative">
        {/* 연결선 */}
        <div className="absolute inset-x-5 top-3.5 h-px bg-warm-gray/20" />
        <div
          className="absolute top-3.5 left-5 h-px bg-navy transition-all duration-500"
          style={{ width: `calc(${((currentStep - 1) / (STAGES.length - 1)) * 100}% - 40px + 10px)` }}
        />

        {STAGES.map((s, i) => {
          const num     = i + 1
          const done    = num < currentStep
          const active  = num === currentStep

          return (
            <div key={num} className="flex flex-col items-center gap-1 relative z-10">
              <div className={[
                'w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all',
                done   ? 'bg-navy border-navy'           : '',
                active ? 'bg-white border-navy shadow-sm' : '',
                !done && !active ? 'bg-white border-warm-gray/30' : '',
              ].join(' ')}>
                {done
                  ? <Check size={13} className="text-white" strokeWidth={3} />
                  : <span className={`text-[11px] font-bold ${active ? 'text-navy' : 'text-warm-gray/40'}`}>{num}</span>
                }
              </div>
              <span className={`text-[10px] font-semibold whitespace-nowrap ${
                active ? 'text-navy' : done ? 'text-navy/50' : 'text-warm-gray/40'
              }`}>
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

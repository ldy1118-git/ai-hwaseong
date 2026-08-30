import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { getJourney, inferCurrentStep, getProgress, STEPS } from '../../utils/journey'

// 각 STEP에서 다음에 할 일 한 줄
const NEXT_ACTIONS = {
  1: { text: '상권분석에서 창업 후보를 저장해보세요', path: '/district' },
  2: { text: '업종과 초기 예산 계획을 세워보세요',    path: null },
  3: { text: '사업장 계약 전 상권을 다시 확인하세요', path: '/district' },
  4: { text: '업종별 필수 교육·자격을 확인하세요',   path: '/guide' },
  5: { text: '관할 시청·구청에 영업신고를 하세요',   path: '/guide' },
  6: { text: '홈택스에서 사업자등록을 신청하세요',   path: '/guide' },
  7: { text: '나에게 맞는 지원사업을 확인해보세요',  path: '/home' },
}

// 업종 이모지
const CATEGORY_EMOJI = {
  카페:  '☕', 음식점: '🍜', 소매업: '🛍',
  제조업: '🔧', 기타:  '🎨',
}

export default function JourneyWidget({ profile }) {
  const navigate  = useNavigate()
  const journey   = getJourney()
  const step      = inferCurrentStep(profile, journey)
  const progress  = getProgress(profile, journey)
  const [open, setOpen] = useState(false)

  const candidate  = journey.candidate
  const action     = NEXT_ACTIONS[step]
  const stepInfo   = STEPS.find(s => s.num === step)
  const completed  = journey.completedSteps ?? {}

  // 예비창업자도 운영중도 아닌 경우(프로필 없음)는 숨김
  if (!profile) return null

  return (
    <div className="mx-5 mb-3">
      <div className="bg-white border border-warm-gray/20 rounded-2xl shadow-sm overflow-hidden">

        {/* ── 헤더: 현재 단계 + 진행률 ── */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-widest text-navy/50 uppercase">
                나의 창업 항해
              </span>
              <span className="text-[11px] font-bold bg-navy text-white px-2 py-0.5 rounded-full">
                STEP {step} / 7
              </span>
            </div>
            <span className="text-sm font-bold text-sunset-orange">{progress}%</span>
          </div>

          {/* 진행 바 */}
          <div className="h-1.5 bg-warm-gray/20 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-navy to-sunset-orange rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 창업 후보 */}
          {candidate ? (
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-base">{CATEGORY_EMOJI[candidate.category] ?? '🚀'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-navy truncate">
                  {candidate.category}
                  {candidate.region || candidate.address
                    ? ` · ${candidate.address ?? candidate.region}`
                    : ''}
                </p>
                {candidate.score != null && (
                  <p className="text-xs text-warm-text">창업 적합도 {candidate.score}점</p>
                )}
              </div>
              <button
                onClick={() => navigate('/district')}
                className="text-xs text-navy/60 hover:text-navy font-medium shrink-0">
                변경
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-base">🔍</span>
              <p className="text-sm text-warm-text">아직 창업 후보가 없어요</p>
              <button
                onClick={() => navigate('/district')}
                className="text-xs font-bold text-navy underline underline-offset-2 shrink-0">
                탐색하기
              </button>
            </div>
          )}

          {/* 현재 단계 + 다음 할 일 */}
          <div className="bg-navy/[0.04] rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <div className="shrink-0 w-7 h-7 rounded-full bg-navy flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">{step}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-navy/60 mb-0.5">{stepInfo?.label}</p>
              <p className="text-xs font-semibold text-navy truncate">{action?.text}</p>
            </div>
            {action?.path && (
              <button
                onClick={() => navigate(action.path)}
                className="shrink-0 w-7 h-7 rounded-full bg-navy/10 hover:bg-navy/20
                           flex items-center justify-center transition-colors">
                <ArrowRight size={13} className="text-navy" />
              </button>
            )}
          </div>
        </div>

        {/* ── 로드맵 펼치기 토글 ── */}
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5
                     border-t border-warm-gray/15 text-xs font-semibold text-warm-text
                     hover:text-navy hover:bg-warm-gray/5 transition-colors">
          {open ? (
            <><ChevronUp size={13} /> 로드맵 접기</>
          ) : (
            <><ChevronDown size={13} /> 전체 로드맵 보기</>
          )}
        </button>

        {/* ── 로드맵 전체 목록 ── */}
        {open && (
          <div className="border-t border-warm-gray/15 px-4 pt-3 pb-4 space-y-1"
               inert={open ? undefined : ''}>
            {STEPS.map((s, i) => {
              const isDone    = completed[s.num] || s.num < step
              const isCurrent = s.num === step
              const isNext    = s.num > step

              return (
                <div key={s.num} className="flex items-center gap-3">
                  {/* 연결선 */}
                  <div className="flex flex-col items-center shrink-0">
                    {isDone ? (
                      <CheckCircle2 size={18} className="text-navy" />
                    ) : isCurrent ? (
                      <div className="w-[18px] h-[18px] rounded-full border-2 border-navy
                                      bg-navy flex items-center justify-center">
                        <span className="text-white text-[9px] font-bold">{s.num}</span>
                      </div>
                    ) : (
                      <Circle size={18} className="text-warm-gray/40" />
                    )}
                    {i < STEPS.length - 1 && (
                      <div className={`w-px h-5 mt-0.5 ${
                        isDone ? 'bg-navy/30' : 'bg-warm-gray/20'
                      }`} />
                    )}
                  </div>

                  {/* 레이블 */}
                  <p className={[
                    'text-xs font-semibold pb-4 flex-1',
                    isCurrent ? 'text-navy' : isDone ? 'text-navy/50 line-through' : 'text-warm-gray/60',
                  ].join(' ')}>
                    {s.label}
                    {isCurrent && (
                      <span className="ml-1.5 text-sunset-orange text-[10px] font-bold">← 지금 여기</span>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

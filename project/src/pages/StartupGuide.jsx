import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, ChevronDown, ChevronUp, CheckCircle2, Circle } from 'lucide-react'
import Header from '../components/layout/Header'
import { EDUCATION, PERMIT, REGISTRATION, REG_STEPS, REG_DOCS } from '../data/startupGuide'
import { getJourney, inferCurrentStep, completeStep, STEPS } from '../utils/journey'

// 업종 이모지
const CATEGORY_EMOJI = {
  카페: '☕', 음식점: '🍜', 소매업: '🛍', 제조업: '🔧', 기타: '🎨',
}

// 단계 색상
const STEP_COLOR = {
  4: 'bg-amber-50 border-amber-200 text-amber-700',
  5: 'bg-blue-50 border-blue-200 text-blue-700',
  6: 'bg-emerald-50 border-emerald-200 text-emerald-700',
}
const STEP_ICON = { 4: '🎓', 5: '📋', 6: '📄' }

/* ── 안내 카드 ── */
function GuideCard({ item, isEducation }) {
  const [docOpen, setDocOpen] = useState(false)

  return (
    <div className="bg-white border border-warm-gray/20 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {item.required === true && (
              <span className="text-[10px] font-bold bg-sunset-orange/10 text-sunset-orange
                               border border-sunset-orange/20 px-2 py-0.5 rounded-full">
                필수
              </span>
            )}
            {item.required === false && (
              <span className="text-[10px] font-bold bg-warm-gray/10 text-warm-text
                               border border-warm-gray/20 px-2 py-0.5 rounded-full">
                해당 없음
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-navy leading-snug">{item.title}</p>
        </div>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer"
             className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-navy
                        bg-navy/5 border border-navy/15 rounded-full px-3 py-1.5
                        hover:bg-navy/10 transition-colors">
            바로가기 <ExternalLink size={10} />
          </a>
        )}
      </div>

      <p className="text-xs text-warm-text leading-relaxed mb-3">{item.desc}</p>

      <div className="flex flex-wrap gap-3 text-xs text-warm-text">
        {item.where && item.where !== '-' && (
          <span className="flex items-center gap-1">
            <span className="text-navy/50">📍</span> {item.where}
          </span>
        )}
        {item.duration && item.duration !== '-' && (
          <span className="flex items-center gap-1">
            <span className="text-navy/50">⏱</span> {item.duration}
          </span>
        )}
        {item.timing && item.timing !== '-' && (
          <span className="flex items-center gap-1">
            <span className="text-navy/50">📅</span> {item.timing}
          </span>
        )}
      </div>

      {item.docs && item.docs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-warm-gray/15">
          <button
            onClick={() => setDocOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-navy/70 hover:text-navy">
            {docOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            필요 서류 {item.docs.length}가지
          </button>
          {docOpen && (
            <ul className="mt-2 space-y-1">
              {item.docs.map((d, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-warm-text">
                  <span className="w-1.5 h-1.5 rounded-full bg-navy/30 shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {item.tip && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <p className="text-[11px] text-amber-700 font-medium">💡 {item.tip}</p>
        </div>
      )}
    </div>
  )
}

/* ── STEP 섹션 ── */
function StepSection({ stepNum, title, children, isCurrentStep, isDone, onComplete }) {
  const [open, setOpen] = useState(isCurrentStep)

  return (
    <div className={`border-2 rounded-2xl overflow-hidden mb-3 ${
      isCurrentStep
        ? 'border-navy shadow-sm'
        : isDone
          ? 'border-warm-gray/20'
          : 'border-warm-gray/15'
    }`}>
      {/* 헤더 */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${
          isCurrentStep ? 'bg-navy/[0.03]' : 'bg-white'
        }`}>
        <span className="text-xl">{STEP_ICON[stepNum]}</span>
        <div className="flex-1">
          <p className={`text-[11px] font-bold tracking-wider mb-0.5 ${
            isCurrentStep ? 'text-navy' : 'text-warm-text'
          }`}>
            STEP {stepNum}
          </p>
          <p className={`text-sm font-bold ${
            isCurrentStep ? 'text-navy' : isDone ? 'text-navy/40' : 'text-gray-500'
          }`}>
            {title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDone && (
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600
                             border border-emerald-200 px-2 py-0.5 rounded-full">
              완료
            </span>
          )}
          {isCurrentStep && !isDone && (
            <span className="text-[10px] font-bold bg-navy text-white px-2 py-0.5 rounded-full">
              진행 중
            </span>
          )}
          {open ? <ChevronUp size={16} className="text-warm-text" /> : <ChevronDown size={16} className="text-warm-text" />}
        </div>
      </button>

      {/* 내용 */}
      {open && (
        <div className="px-4 pb-4 pt-1 bg-white border-t border-warm-gray/10">
          {children}
          {!isDone && (
            <button
              onClick={() => onComplete(stepNum)}
              className="mt-4 w-full py-3 bg-navy text-white text-sm font-bold rounded-xl
                         hover:bg-navy/90 transition-colors">
              ✓ {title} 완료했어요
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── 사업자등록 STEP 6 내용 ── */
function RegistrationContent({ category }) {
  const info = REGISTRATION[category] ?? REGISTRATION['기타']
  const [docOpen, setDocOpen] = useState(false)

  return (
    <div className="space-y-3">
      {/* 업태·업종 카드 */}
      <div className="bg-navy/[0.04] rounded-xl px-4 py-3">
        <p className="text-xs font-bold text-navy/60 mb-2">예상 업태 / 업종</p>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-[10px] text-warm-text mb-0.5">업태</p>
            <p className="text-sm font-bold text-navy">{info.bizType}</p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-warm-text mb-0.5">업종</p>
            <p className="text-sm font-bold text-navy">{info.bizItem}</p>
          </div>
        </div>
        {info.vatHint && (
          <p className="text-[11px] text-warm-text mt-2 pt-2 border-t border-warm-gray/15">
            💡 {info.vatHint}
          </p>
        )}
      </div>

      {/* 절차 */}
      <div className="bg-white border border-warm-gray/20 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-bold text-navy mb-3">신청 절차</p>
        <div className="space-y-2">
          {REG_STEPS.map((s, i) => (
            <div key={s.num} className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-navy text-white
                               text-[10px] font-bold flex items-center justify-center mt-0.5">
                {s.num}
              </span>
              <p className="text-xs text-gray-700 leading-relaxed flex-1">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 서류 + 링크 */}
      <div className="bg-white border border-warm-gray/20 rounded-2xl p-4 shadow-sm">
        <button
          onClick={() => setDocOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-navy/70 hover:text-navy w-full">
          {docOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          필요 서류 {REG_DOCS.length}가지
        </button>
        {docOpen && (
          <ul className="mt-2 space-y-1">
            {REG_DOCS.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-warm-text">
                <span className="w-1.5 h-1.5 rounded-full bg-navy/30 shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 pt-3 border-t border-warm-gray/15 flex gap-2">
          <a href="https://www.hometax.go.kr" target="_blank" rel="noopener noreferrer"
             className="flex-1 flex items-center justify-center gap-1.5 py-2.5
                        bg-navy text-white text-xs font-bold rounded-xl hover:bg-navy/90">
            홈택스 바로가기 <ExternalLink size={11} />
          </a>
          <a href="https://www.gov.kr" target="_blank" rel="noopener noreferrer"
             className="flex-1 flex items-center justify-center gap-1.5 py-2.5
                        border border-navy/20 text-navy text-xs font-bold rounded-xl hover:bg-navy/5">
            정부24 바로가기 <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  )
}

/* ── 메인 페이지 ── */
export default function StartupGuide({ defaultStep = null }) {
  const navigate  = useNavigate()
  const journey   = getJourney()
  const profile   = (() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile') || 'null') } catch { return null }
  })()

  // defaultStep 이 있으면 그 단계를 현재로 강조, 없으면 자동 추론
  const currentStep = defaultStep ?? inferCurrentStep(profile, journey)
  const category    = profile?.category ?? '기타'
  const emoji       = CATEGORY_EMOJI[category] ?? '🚀'
  const completed   = journey.completedSteps ?? {}

  const education = EDUCATION[category] ?? EDUCATION['기타']
  const permit    = PERMIT[category]    ?? PERMIT['기타']

  function handleComplete(stepNum) {
    completeStep(stepNum)
    // 화면 갱신을 위해 강제 리렌더
    window.dispatchEvent(new Event('mars-journey-updated'))
    navigate('/home')
  }

  return (
    <div className="min-h-screen bg-primary-bg">
      <Header onAvatarClick={() => navigate('/onboarding')} />

      <main className="mx-auto max-w-2xl px-4 pt-4 pb-24">
        {/* 상단 타이틀 */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{emoji}</span>
            <h1 className="text-lg font-bold text-navy">{category} 창업 안내</h1>
          </div>
          <p className="text-xs text-warm-text">
            영업 시작 전 필요한 교육·사업자등록·인허가를 순서대로 안내해드려요.
          </p>
        </div>

        {/* STEP 4: 필수 교육·자격 */}
        <StepSection
          stepNum={4}
          title="필수 교육·자격 확인"
          isCurrentStep={currentStep === 4}
          isDone={!!completed[4]}
          onComplete={handleComplete}>
          <div className="space-y-3 mt-3">
            {education.map((item, i) => (
              <GuideCard key={i} item={item} isEducation />
            ))}
          </div>
        </StepSection>

        {/* STEP 5: 사업자등록 */}
        <StepSection
          stepNum={5}
          title="사업자등록"
          isCurrentStep={currentStep === 5}
          isDone={!!completed[5]}
          onComplete={handleComplete}>
          <div className="mt-3">
            <RegistrationContent category={category} />
          </div>
        </StepSection>

        {/* STEP 6: 인허가·영업신고 */}
        <StepSection
          stepNum={6}
          title="인허가·영업신고"
          isCurrentStep={currentStep === 6}
          isDone={!!completed[6]}
          onComplete={handleComplete}>
          <div className="space-y-3 mt-3">
            {permit.map((item, i) => (
              <GuideCard key={i} item={item} />
            ))}
          </div>
        </StepSection>

        {/* 하단 안내 */}
        <div className="mt-4 bg-navy/[0.04] rounded-2xl px-4 py-3.5 text-center">
          <p className="text-xs text-warm-text leading-relaxed">
            궁금한 게 있으면 마이다에게 물어보세요!<br />
            <span className="text-navy font-semibold">"카페 영업신고 어떻게 해요?"</span> 같은 질문도 바로 답해드려요.
          </p>
          <button
            onClick={() => navigate('/mission')}
            className="mt-2.5 text-xs font-bold text-navy underline underline-offset-2">
            마이다에게 물어보기 →
          </button>
        </div>
      </main>
    </div>
  )
}

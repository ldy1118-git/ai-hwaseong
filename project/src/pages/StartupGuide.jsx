import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Check, ChevronDown, ChevronUp } from 'lucide-react'
import Header from '../components/layout/Header'
import JourneyProgress from '../components/ui/JourneyProgress'
import { EDUCATION, PERMIT, REG_STEPS } from '../data/startupGuide'
import { getJourney, inferCurrentStep, completeStep, STEPS } from '../utils/journey'

const CATEGORY_EMOJI = {
  카페: '☕', 음식점: '🍜', 소매업: '🛍', 제조업: '🔧', 기타: '🎨',
}

// ── 체크리스트 아이템 ────────────────────────────────────────────
function CheckItem({ title, desc, url, checked, onToggle }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-warm-gray/10 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className={[
          'w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
          checked ? 'bg-navy border-navy' : 'border-warm-gray/40 hover:border-navy/40',
        ].join(' ')}>
        {checked && <Check size={13} className="text-white" strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${checked ? 'line-through text-warm-gray/50' : 'text-navy'}`}>
          {title}
        </p>
        {desc && <p className="text-xs text-warm-text mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
           onClick={e => e.stopPropagation()}
           className="flex-shrink-0 flex items-center gap-1 text-[11px] font-bold text-navy
                      border border-navy/20 rounded-full px-2.5 py-1 hover:bg-navy/5 transition-colors">
          바로가기 <ExternalLink size={9} />
        </a>
      )}
    </div>
  )
}

// ── 단계 카드 ────────────────────────────────────────────────────
function StepCard({ stepNum, icon, label, items, isDone, isActive, onComplete }) {
  const [checked, setChecked] = useState(() =>
    items.map(item => item.autoCheck || false)
  )
  const [open, setOpen] = useState(isActive)
  const progress = checked.filter(Boolean).length
  const allChecked = progress === items.length

  function toggle(i) {
    setChecked(prev => prev.map((v, idx) => idx === i ? !v : v))
  }

  return (
    <div className={[
      'bg-white rounded-2xl border-2 overflow-hidden transition-all',
      isActive ? 'border-navy shadow-sm' : isDone ? 'border-warm-gray/20' : 'border-warm-gray/15',
    ].join(' ')}>

      {/* 헤더 */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${isActive ? 'bg-navy/[0.03]' : 'bg-white'}`}>
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-bold tracking-wider mb-0.5 ${isActive ? 'text-navy' : 'text-warm-text'}`}>
            STEP {stepNum}
          </p>
          <p className={`text-sm font-bold ${isActive ? 'text-navy' : isDone ? 'text-navy/40' : 'text-gray-400'}`}>
            {label}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isDone && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-600
                             border border-emerald-200 px-2 py-0.5 rounded-full">
              <Check size={10} strokeWidth={3} /> 완료
            </span>
          )}
          {isActive && !isDone && (
            <span className="text-[10px] font-bold bg-navy text-white px-2 py-0.5 rounded-full">
              진행 중
            </span>
          )}
          {open ? <ChevronUp size={15} className="text-warm-text" /> : <ChevronDown size={15} className="text-warm-text" />}
        </div>
      </button>

      {/* 체크리스트 */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-warm-gray/10">

          {/* 진행률 */}
          {!isDone && (
            <div className="mb-3 mt-2">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-warm-text">
                  {allChecked ? '모두 완료했어요!' : `${progress} / ${items.length} 완료`}
                </p>
                <span className={`text-xs font-bold ${allChecked ? 'text-emerald-600' : 'text-navy'}`}>
                  {Math.round((progress / items.length) * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-warm-gray/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-navy rounded-full transition-all duration-300"
                  style={{ width: `${(progress / items.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* 체크리스트 아이템 */}
          <div className="mb-3">
            {items.map((item, i) => (
              <CheckItem
                key={i}
                title={item.title}
                desc={item.desc}
                url={item.url}
                checked={isDone || checked[i]}
                onToggle={() => !isDone && toggle(i)}
              />
            ))}
          </div>

          {/* 완료 버튼 */}
          {!isDone && (
            <button
              type="button"
              onClick={onComplete}
              disabled={!allChecked}
              className={[
                'w-full py-3 rounded-xl text-sm font-bold transition-all',
                allChecked
                  ? 'bg-navy text-white hover:bg-navy/90 active:scale-[0.99]'
                  : 'bg-warm-gray/15 text-warm-text cursor-not-allowed',
              ].join(' ')}>
              {allChecked ? `✓ ${label} 완료했어요` : `항목을 모두 체크하면 완료할 수 있어요`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── 단계별 체크리스트 아이템 생성 ────────────────────────────────
function makeStep4Items(education) {
  return education.map(e => ({
    title:     e.title,
    desc:      [e.duration !== '-' && e.duration, e.where !== '-' && e.where].filter(Boolean).join(' · '),
    url:       e.url,
    autoCheck: e.required === false,
  }))
}

function makeStep5Items() {
  return [
    { title: '임대차계약서(또는 건물 소유 서류) 준비', desc: null, url: null },
    { title: '홈택스에서 사업자등록 신청', desc: '공인인증서 또는 간편인증 필요', url: 'https://www.hometax.go.kr' },
    { title: '사업자등록증 수령', desc: '신청 후 3일 이내 발급', url: null },
  ]
}

function makeStep6Items(permit) {
  return permit.map(p => ({
    title: p.title,
    desc:  p.where,
    url:   p.url,
  }))
}

// ── 메인 페이지 ──────────────────────────────────────────────────
export default function StartupGuide({ defaultStep = null }) {
  const navigate   = useNavigate()
  const journey    = getJourney()
  const profile    = (() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile') || 'null') } catch { return null }
  })()

  const inferredStep = inferCurrentStep(profile, journey)
  // 현재 단계가 4 미만이면 STEP 4부터 시작
  const initialActive = defaultStep ?? (inferredStep < 4 ? 4 : inferredStep <= 6 ? inferredStep : 6)
  const [activeStep, setActiveStep] = useState(initialActive)

  const category  = profile?.category ?? '기타'
  const emoji     = CATEGORY_EMOJI[category] ?? '🚀'
  const completed = journey.completedSteps ?? {}

  const education = EDUCATION[category] ?? EDUCATION['기타']
  const permit    = PERMIT[category]    ?? PERMIT['기타']

  const step4Items = makeStep4Items(education)
  const step5Items = makeStep5Items()
  const step6Items = makeStep6Items(permit)

  function handleComplete(stepNum) {
    completeStep(stepNum)
    window.dispatchEvent(new Event('mars-journey-updated'))
    if (stepNum === 4) setActiveStep(5)
    else if (stepNum === 5) setActiveStep(6)
    else navigate('/home')   // STEP 6 완료 → 공고 탐색으로
  }

  const STEP_DEFS = [
    { num: 4, icon: '🎓', label: '교육·자격 확인',   items: step4Items },
    { num: 5, icon: '📋', label: '사업자등록',        items: step5Items },
    { num: 6, icon: '📄', label: '인허가·영업신고',   items: step6Items },
  ]

  return (
    <div className="min-h-screen bg-primary-bg">
      <Header onAvatarClick={() => navigate('/onboarding')} />

      {/* 매크로 진행 표시 (창업 준비 = 3단계) */}
      <JourneyProgress currentStep={3} />

      <main className="mx-auto max-w-2xl px-4 pt-4 pb-24 space-y-3">

        {/* 상단 타이틀 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{emoji}</span>
          <div>
            <h1 className="text-base font-bold text-navy leading-tight">{category} 창업 준비</h1>
            <p className="text-xs text-warm-text">
              교육 이수 → 사업자등록 → 인허가·영업신고 순서로 진행해요
            </p>
          </div>
        </div>

        {/* 3단계 카드 */}
        {STEP_DEFS.map(({ num, icon, label, items }) => (
          <StepCard
            key={num}
            stepNum={num}
            icon={icon}
            label={label}
            items={items}
            isDone={!!completed[num]}
            isActive={activeStep === num && !completed[num]}
            onComplete={() => handleComplete(num)}
          />
        ))}

        {/* 모두 완료했으면 홈으로 */}
        {completed[4] && completed[5] && completed[6] && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <p className="text-sm font-bold text-emerald-700 mb-2">🎉 창업 준비 완료!</p>
            <p className="text-xs text-emerald-600 mb-3">이제 나에게 맞는 지원사업을 확인해보세요.</p>
            <button
              onClick={() => navigate('/home')}
              className="px-5 py-2.5 bg-navy text-white text-sm font-bold rounded-xl hover:bg-navy/90">
              지원사업 탐색하기 →
            </button>
          </div>
        )}

        {/* 챗봇 안내 */}
        <div className="bg-navy/[0.04] rounded-2xl px-4 py-3.5 text-center">
          <p className="text-xs text-warm-text leading-relaxed">
            궁금한 게 있으면 마이다에게 물어보세요!
          </p>
          <button
            onClick={() => navigate('/mission')}
            className="mt-1.5 text-xs font-bold text-navy underline underline-offset-2">
            챗봇 열기 →
          </button>
        </div>
      </main>
    </div>
  )
}

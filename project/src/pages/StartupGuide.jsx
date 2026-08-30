import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, ExternalLink, X } from 'lucide-react'
import JourneyProgress from '../components/ui/JourneyProgress'
import { EDUCATION, PERMIT, REG_DOCS } from '../data/startupGuide'
import { getJourney, completeStep } from '../utils/journey'

const CATEGORY_EMOJI = {
  카페: '☕', 음식점: '🍜', 소매업: '🛍', 제조업: '🔧', 기타: '🎨',
}

const STEP_META = {
  4: { icon: '🎓', label: '교육·자격 확인' },
  5: { icon: '📋', label: '사업자등록' },
  6: { icon: '📄', label: '인허가·영업신고' },
}

// ── 사이트별 진행 순서 ─────────────────────────────────────────────
function educationSteps(e) {
  if (!e.url) return []
  if (e.url.includes('kfia21.or.kr') || e.url.includes('kfia.or.kr')) return [
    '한국식품산업협회 사이트 접속 → 우측 상단 로그인 (또는 회원가입)',
    '메뉴 → 식품위생교육 → 신규영업자 위생교육 신청',
    '교육 일정 선택 후 수강료 결제 (온라인 약 10,000원)',
    '온라인 영상 6시간 시청 완료',
    '수료증 출력 또는 PDF 저장 → 영업신고 제출용으로 보관',
  ]
  if (e.url.includes('q-net.or.kr')) return [
    'Q-net 접속 → 로그인 후 자격시험 → 미용사(일반) 검색',
    '시험 일정 확인 → 원서접수 기간에 필기 신청',
    '필기 합격 후 실기 시험 신청',
    '실기 합격 → 면허 신청 (수수료 5,500원)',
    '면허증 발급 (약 2주) → 영업신고 전 지참',
  ]
  return []
}

function permitSteps(p) {
  if (!p.url) return []
  if (p.url.includes('gov.kr')) return [
    '정부24(gov.kr) 접속 → 로그인 (카카오·네이버 간편인증 가능)',
    '검색창에 영업 신고 업종 입력 (예: "일반음식점 영업신고") → 선택',
    '"신청하기" 클릭 → 영업자·사업장 정보 입력',
    '식품위생교육 이수증·임대차계약서·신분증 파일 첨부',
    '"민원신청하기" 클릭 → 3~7일 내 영업신고증 발급',
  ]
  return []
}

// ── 항목 데이터 생성 ──────────────────────────────────────────────
function buildItems(category) {
  const education = EDUCATION[category] ?? EDUCATION['기타']
  const permit    = PERMIT[category]    ?? PERMIT['기타']
  return {
    4: education.map(e => ({
      title: e.title, desc: e.desc,
      where: e.where !== '-' ? e.where : null,
      duration: e.duration !== '-' ? e.duration : null,
      timing: e.timing !== '-' ? e.timing : null,
      docs: e.docs ?? [], url: e.url, tip: null,
      notRequired: e.required === false,
      steps: educationSteps(e),
    })),
    5: [
      {
        title: '임대차계약서 또는 건물 소유 서류 준비',
        desc: '사업장 계약 주소가 등록 주소가 됩니다. 자가라면 건물 등기부등본이 필요해요.',
        where: null, duration: null, timing: null,
        docs: ['임대차계약서 (임차인 경우)', '건물 등기부등본 (자가 경우)', '신분증'],
        url: null, tip: '사업장 주소는 실제 영업 장소여야 해요. 자택은 원칙적으로 불가해요.',
        notRequired: false, steps: [],
      },
      {
        title: '홈택스에서 사업자등록 신청',
        desc: '공인인증서 또는 카카오·네이버 간편인증으로 신청할 수 있어요.',
        where: '홈택스 온라인 또는 관할 세무서 방문',
        duration: '세무서 방문 당일 · 온라인 신청 3영업일 이내', timing: '사업 시작 전',
        docs: REG_DOCS, url: 'https://www.hometax.go.kr',
        tip: '연 예상 매출이 1억 400만원 미만이면 간이과세 선택 가능해요.',
        notRequired: false,
        steps: [
          '홈택스 접속 → 우측 상단 로그인 (카카오·네이버 간편인증 가능)',
          '상단 메뉴 → 국세청서비스 → "사업자등록 신청" 클릭',
          '인적사항 확인 → 사업장 주소·업태·종목 입력',
          '임대차계약서 파일 첨부 (스캔본 또는 사진, 5MB 이하)',
          '"신청하기" 클릭 → 접수번호 저장 (세무서 방문 시 당일, 온라인 3영업일 이내 발급)',
        ],
      },
      {
        title: '사업자등록증 수령 확인',
        desc: '세무서 방문 시 당일, 홈택스 온라인 신청 시 3영업일 이내 발급돼요.',
        where: '홈택스 → 사업자등록 신청/정정 현황',
        duration: '세무서 방문 당일 · 온라인 3영업일 이내', timing: null,
        docs: [], url: 'https://www.hometax.go.kr',
        tip: '사업자등록번호는 카드단말기 등록·세금계산서 발행에 필요해요.',
        notRequired: false,
        steps: [
          '홈택스 로그인 → 상단 국세청서비스 탭 클릭',
          '"사업자등록 신청·정정 현황" 클릭',
          '처리 상태 "완료" 확인 → "사업자등록증 출력" 클릭',
          'PDF 저장 또는 인쇄 → 지원사업 신청·영업신고에 사용',
        ],
      },
    ],
    6: permit.map(p => ({
      title: p.title, desc: p.desc, where: p.where,
      duration: null, timing: null,
      docs: p.docs ?? [], url: p.url, tip: p.tip ?? null,
      notRequired: false,
      steps: permitSteps(p),
    })),
  }
}

// 국세청·정부24 등 X-Frame-Options: DENY 사이트
const IFRAME_BLOCKED = ['hometax.go.kr', 'gov.kr', 'mss.go.kr', 'nhis.or.kr', 'minwon.go.kr']
function isIframeBlocked(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    return IFRAME_BLOCKED.some(d => host === d || host.endsWith('.' + d))
  } catch { return false }
}

// ── 사이트 + 진행 순서 동시 표시 가이드 ────────────────────────────
function WebGuide({ url, title, steps, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const hasSteps = steps?.length > 0
  const blocked  = isIframeBlocked(url)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">

      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-warm-gray/20 flex-shrink-0 shadow-sm">
        <button onClick={onClose}
          className="tap flex items-center gap-1.5 text-sm font-semibold text-warm-text hover:text-navy">
          <X size={16} /> 닫기
        </button>
        <p className="flex-1 text-sm font-bold text-navy truncate">{title}</p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-bold text-navy border border-navy/25
                     px-2.5 py-1.5 rounded-full hover:bg-navy/5 flex-shrink-0">
          새 탭 <ExternalLink size={10} />
        </a>
      </div>

      {/* 바디 */}
      {blocked ? (
        /* ─── iframe 차단 사이트: 순서 + 새탭 버튼 ─── */
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

            {/* 진행 순서 — 전체 너비 */}
            {hasSteps && (
              <div className="bg-white rounded-2xl border border-warm-gray/20 p-5 space-y-3 shadow-sm">
                <p className="text-[11px] font-bold text-navy/60 tracking-wider">진행 순서</p>
                <ol className="space-y-3">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-navy text-white text-xs font-bold
                                       flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-700 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* 새탭 CTA */}
            <div className="bg-white rounded-2xl border border-warm-gray/20 p-5 shadow-sm text-center space-y-4">
              <p className="text-2xl">🖥</p>
              <div className="space-y-1">
                <p className="text-sm font-bold text-navy">이 창 안에서는 바로 열 수 없어요</p>
                <p className="text-xs text-warm-text">보안 설정(X-Frame-Options)으로 인해 새 탭에서만 열려요</p>
              </div>
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5
                           bg-navy text-white font-bold rounded-xl text-sm hover:bg-navy/90">
                새 탭에서 열기 <ExternalLink size={13} />
              </a>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                <p className="text-xs text-amber-700 leading-relaxed">
                  💡 <strong>팁:</strong> 새 탭을 열고 이 안내 창을 옆에 나란히 두면<br/>
                  순서를 보면서 진행할 수 있어요
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ─── iframe 표시 가능: 모바일 상하 / 데스크탑 좌우 ─── */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* 진행 순서 패널 */}
          {hasSteps && (
            <div className="bg-navy/[0.02] border-b lg:border-b-0 lg:border-r border-warm-gray/20
                            lg:w-72 lg:flex-shrink-0 overflow-y-auto
                            h-44 lg:h-auto flex-shrink-0">
              <div className="p-4 space-y-3">
                <p className="text-[11px] font-bold text-navy/60 tracking-wider">진행 순서</p>
                <ol className="space-y-2.5">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-navy text-white text-[10px] font-bold
                                       flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs text-gray-700 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[10px] text-warm-text/50 pt-1">
                  화면이 열리지 않으면 우측 상단 <strong>새 탭</strong>을 눌러주세요
                </p>
              </div>
            </div>
          )}

          {/* iframe */}
          <iframe
            src={url}
            title={title}
            className="flex-1 w-full border-0 min-h-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
          />
        </div>
      )}
    </div>
  )
}

// ── 상세 패널 ─────────────────────────────────────────────────────
function DetailPanel({
  stepNum, item,
  isStepDone, isItemChecked, onCheck,
  isStepAllChecked, onComplete,
  navigate, onSiteOpen,
}) {
  const meta = STEP_META[stepNum]
  return (
    <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm overflow-hidden">

      <div className="bg-navy/[0.03] border-b border-warm-gray/10 px-5 py-3 flex items-center gap-2">
        <span className="text-lg">{meta?.icon}</span>
        <div>
          <p className="text-[10px] font-bold text-warm-text/60 tracking-wider">STEP {stepNum} · {meta?.label}</p>
          <p className="text-base font-bold text-navy leading-tight">{item.title}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">

        {item.desc && <p className="text-sm text-gray-700 leading-relaxed">{item.desc}</p>}

        {(item.where || item.duration || item.timing) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-warm-text">
            {item.where    && <span className="flex items-center gap-1.5"><span className="text-sm">📍</span>{item.where}</span>}
            {item.duration && <span className="flex items-center gap-1.5"><span className="text-sm">⏱</span>{item.duration}</span>}
            {item.timing   && <span className="flex items-center gap-1.5"><span className="text-sm">📅</span>{item.timing}</span>}
          </div>
        )}

        {item.docs?.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-3.5">
            <p className="text-[11px] font-bold text-navy mb-2 tracking-wide">필요 서류</p>
            <ul className="space-y-1.5">
              {item.docs.map((d, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-navy/40 flex-shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.tip && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
            <p className="text-xs text-amber-800 font-medium leading-relaxed">💡 {item.tip}</p>
          </div>
        )}

        {/* 사이트 열기: 진행 순서 미리보기 + 버튼 */}
        {item.url && (
          <div className="border border-navy/15 rounded-xl overflow-hidden">
            {item.steps?.length > 0 && (
              <div className="bg-navy/[0.03] px-4 py-3 border-b border-navy/10">
                <p className="text-[11px] font-bold text-navy/60 tracking-wide mb-2">진행 순서</p>
                <ol className="space-y-1.5">
                  {item.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-navy/10 text-navy text-[9px] font-bold
                                       flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[11px] text-gray-600 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <button
              type="button"
              onClick={() => onSiteOpen({ url: item.url, title: item.title, steps: item.steps })}
              className="flex items-center justify-center gap-2 w-full py-3 px-4
                         bg-navy text-white text-sm font-bold hover:bg-navy/90 transition-colors active:scale-[0.99]">
              사이트 열어서 진행하기 →
            </button>
          </div>
        )}

        {!item.notRequired && (
          <div className="pt-2 border-t border-warm-gray/15 flex items-center justify-between">
            <button type="button" onClick={onCheck} disabled={isStepDone}
              className="flex items-center gap-2 text-sm font-semibold text-navy disabled:opacity-40">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                isItemChecked ? 'bg-navy border-navy' : 'border-navy/40'
              }`}>
                {isItemChecked && <Check size={11} className="text-white" strokeWidth={3} />}
              </div>
              {isItemChecked ? '완료 ✓' : '완료했어요'}
            </button>
            {isStepAllChecked && !isStepDone && (
              <button onClick={onComplete}
                className="px-4 py-2 bg-navy text-white text-xs font-bold rounded-xl hover:bg-navy/90 transition-colors">
                {STEP_META[stepNum]?.label} 완료 →
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-warm-gray/10 bg-gray-50 px-5 py-3 text-center">
        <p className="text-xs text-warm-text">모르는 게 있으면 마이다에게 물어보세요!</p>
        <button onClick={() => navigate('/mission')}
          className="mt-0.5 text-xs font-bold text-navy underline underline-offset-2">
          챗봇 열기 →
        </button>
      </div>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────
export default function StartupGuide({ defaultStep = null }) {
  const navigate = useNavigate()
  const journey  = getJourney()
  const profile  = (() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile') || 'null') } catch { return null }
  })()

  const category = profile?.category ?? '기타'
  const allItems = buildItems(category)

  const [completedSteps, setCompletedSteps] = useState(() => {
    const steps = { ...(journey.completedSteps ?? {}) }
    const hasReg = profile?.hasRegistration === true || profile?.business_status === '운영중'
    const hasPmt = profile?.hasPermit === true      || profile?.business_status === '운영중'
    if (hasReg && !steps[5]) { completeStep(5); steps[5] = true }
    if (hasPmt && !steps[6]) { completeStep(6); steps[6] = true }
    return steps
  })

  const firstActive = [4, 5, 6].find(n => !completedSteps[n]) ?? 6

  // { url, title, steps } — 사이트 가이드 모달
  const [webGuide, setWebGuide] = useState(null)
  const [checked,  setChecked]  = useState({})
  const [selected, setSelected] = useState(() => {
    const items = allItems[firstActive] ?? []
    return items.length > 0 ? { stepNum: firstActive, itemIdx: 0 } : null
  })

  function isChecked(stepNum, itemIdx) {
    const item = allItems[stepNum]?.[itemIdx]
    if (item?.notRequired || completedSteps[stepNum]) return true
    return !!checked[`${stepNum}_${itemIdx}`]
  }

  function toggleCheck(stepNum, itemIdx) {
    if (completedSteps[stepNum]) return
    const key = `${stepNum}_${itemIdx}`
    setChecked(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function isStepAllChecked(stepNum) {
    return (allItems[stepNum] ?? []).every((_, idx) => isChecked(stepNum, idx))
  }

  function handleComplete(stepNum) {
    completeStep(stepNum)
    const next = { ...completedSteps, [stepNum]: true }
    setCompletedSteps(next)
    window.dispatchEvent(new Event('mars-journey-updated'))
    const nextStep = [4, 5, 6].find(n => !next[n])
    if (nextStep) setSelected({ stepNum: nextStep, itemIdx: 0 })
    else navigate('/home')
  }

  // 완료했어요 클릭 → 다음 미완료 항목으로 이동, 스텝 내 모두 완료 시 다음 스텝으로
  function handleCheckAndAdvance(stepNum, itemIdx) {
    if (completedSteps[stepNum]) return
    const key = `${stepNum}_${itemIdx}`
    const alreadyChecked = !!checked[key]

    if (alreadyChecked) {
      setChecked(prev => ({ ...prev, [key]: false }))
      return
    }

    const newChecked = { ...checked, [key]: true }
    setChecked(newChecked)

    const items = allItems[stepNum] ?? []
    // 현재 항목 이후 중 필수·미완료 항목 탐색
    const nextIdx = items.findIndex((it, i) =>
      i > itemIdx && !it.notRequired && !newChecked[`${stepNum}_${i}`]
    )

    if (nextIdx !== -1) {
      setSelected({ stepNum, itemIdx: nextIdx })
    } else {
      // 스텝 내 모든 필수 항목 완료 → 자동 스텝 완료
      const allDone = items.every((it, i) => it.notRequired || newChecked[`${stepNum}_${i}`])
      if (allDone) setTimeout(() => handleComplete(stepNum), 200)
    }
  }

  const selectedItem = selected ? allItems[selected.stepNum]?.[selected.itemIdx] : null
  const panelOpen    = !!selected && !!selectedItem

  return (
    <div className="min-h-screen bg-primary-bg">
      {webGuide && (
        <WebGuide
          url={webGuide.url}
          title={webGuide.title}
          steps={webGuide.steps}
          onClose={() => setWebGuide(null)}
        />
      )}

      <JourneyProgress currentStep={3} />

      <div className={`mx-auto px-4 pt-4 pb-24 transition-all duration-300 ${
        panelOpen ? 'max-w-5xl' : 'max-w-lg'
      }`}>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">{CATEGORY_EMOJI[category] ?? '🚀'}</span>
          <div>
            <h1 className="text-base font-bold text-navy leading-tight">{category} 창업 준비</h1>
            <p className="text-xs text-warm-text">교육 이수 → 사업자등록 → 인허가·영업신고 순서로 진행해요</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">

          {/* ─── 좌측 체크리스트 ─── */}
          <div className={`space-y-3 transition-all duration-300 ${
            panelOpen ? 'lg:w-72 lg:flex-shrink-0' : 'w-full'
          }`}>
            {[4, 5, 6].map(stepNum => {
              const meta  = STEP_META[stepNum]
              const items = allItems[stepNum] ?? []
              const isDone   = !!completedSteps[stepNum]
              const isActive = !isDone && stepNum <= firstActive + 1

              return (
                <div key={stepNum} className={`bg-white rounded-2xl border-2 overflow-hidden ${
                  isActive && !isDone ? 'border-navy shadow-sm' : isDone ? 'border-warm-gray/20' : 'border-warm-gray/15'
                }`}>
                  <div className={`flex items-center gap-3 px-4 py-3 ${isActive && !isDone ? 'bg-navy/[0.03]' : ''}`}>
                    <span className="text-lg flex-shrink-0">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-warm-text/60 tracking-wider">STEP {stepNum}</p>
                      <p className={`text-sm font-bold ${isDone ? 'text-navy/40' : isActive ? 'text-navy' : 'text-gray-400'}`}>
                        {meta.label}
                      </p>
                    </div>
                    {isDone ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50
                                       text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0">
                        <Check size={9} strokeWidth={3} /> 완료
                      </span>
                    ) : isActive && isStepAllChecked(stepNum) ? (
                      <button onClick={() => handleComplete(stepNum)}
                        className="text-[10px] font-bold bg-navy text-white px-2 py-0.5 rounded-full flex-shrink-0">
                        완료 →
                      </button>
                    ) : null}
                  </div>

                  <div className="divide-y divide-warm-gray/10">
                    {items.map((item, idx) => {
                      const chk  = isDone || isChecked(stepNum, idx)
                      const isSel = selected?.stepNum === stepNum && selected?.itemIdx === idx
                      return (
                        <button key={idx} type="button"
                          onClick={() => setSelected({ stepNum, itemIdx: idx })}
                          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-all ${
                            isSel ? 'bg-navy/5' : 'hover:bg-gray-50'
                          }`}>
                          <div role="checkbox" aria-checked={chk}
                            onClick={e => { e.stopPropagation(); toggleCheck(stepNum, idx) }}
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              chk ? 'bg-navy border-navy' : 'border-warm-gray/40'
                            }`}>
                            {chk && <Check size={9} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className={`flex-1 text-xs font-semibold leading-snug ${
                            chk ? 'text-warm-text/50 line-through' : isSel ? 'text-navy' : 'text-gray-700'
                          }`}>
                            {item.title}
                          </span>
                          <ChevronRight size={12} className={`flex-shrink-0 ${isSel ? 'text-navy' : 'text-warm-gray/30'}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {completedSteps[4] && completedSteps[5] && completedSteps[6] && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                <p className="text-sm font-bold text-emerald-700 mb-1">🎉 창업 준비 완료!</p>
                <button onClick={() => navigate('/home')}
                  className="text-xs font-bold text-emerald-700 underline underline-offset-2">
                  지원사업 탐색하기 →
                </button>
              </div>
            )}
          </div>

          {/* ─── 우측 상세 패널 ─── */}
          {panelOpen && (
            <div className="flex-1 min-w-0 order-first lg:order-last">
              <DetailPanel
                stepNum={selected.stepNum}
                item={selectedItem}
                isStepDone={!!completedSteps[selected.stepNum]}
                isItemChecked={isChecked(selected.stepNum, selected.itemIdx)}
                onCheck={() => handleCheckAndAdvance(selected.stepNum, selected.itemIdx)}
                isStepAllChecked={isStepAllChecked(selected.stepNum)}
                onComplete={() => handleComplete(selected.stepNum)}
                navigate={navigate}
                onSiteOpen={({ url, title, steps }) => setWebGuide({ url, title, steps })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

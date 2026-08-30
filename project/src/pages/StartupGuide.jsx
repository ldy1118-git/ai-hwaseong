import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Check, ChevronRight } from 'lucide-react'
import Header from '../components/layout/Header'
import JourneyProgress from '../components/ui/JourneyProgress'
import { EDUCATION, PERMIT, REG_DOCS } from '../data/startupGuide'
import { getJourney, inferCurrentStep, completeStep } from '../utils/journey'

const CATEGORY_EMOJI = {
  카페: '☕', 음식점: '🍜', 소매업: '🛍', 제조업: '🔧', 기타: '🎨',
}

const STEP_META = {
  4: { icon: '🎓', label: '교육·자격 확인' },
  5: { icon: '📋', label: '사업자등록' },
  6: { icon: '📄', label: '인허가·영업신고' },
}

function buildItems(category) {
  const education = EDUCATION[category] ?? EDUCATION['기타']
  const permit    = PERMIT[category]    ?? PERMIT['기타']
  return {
    4: education.map(e => ({
      title:       e.title,
      desc:        e.desc,
      where:       e.where !== '-' ? e.where : null,
      duration:    e.duration !== '-' ? e.duration : null,
      timing:      e.timing !== '-' ? e.timing : null,
      docs:        e.docs ?? [],
      url:         e.url,
      tip:         null,
      notRequired: e.required === false,
    })),
    5: [
      {
        title:    '임대차계약서 또는 건물 소유 서류 준비',
        desc:     '사업장 계약 주소가 등록 주소가 됩니다. 자가라면 건물 등기부등본이 필요해요.',
        where:    null,
        duration: null,
        timing:   null,
        docs:     ['임대차계약서 (임차인 경우)', '건물 등기부등본 (자가 경우)', '신분증'],
        url:      null,
        tip:      '사업장 주소는 실제 영업 장소여야 해요. 자택은 원칙적으로 불가해요.',
        notRequired: false,
      },
      {
        title:    '홈택스에서 사업자등록 신청',
        desc:     '공인인증서 또는 카카오·네이버 간편인증으로 신청할 수 있어요. 방문 신청은 관할 세무서에서도 가능해요.',
        where:    '홈택스 온라인 또는 관할 세무서',
        duration: '온라인 신청 후 3영업일 이내',
        timing:   '사업 시작 전',
        docs:     REG_DOCS,
        url:      'https://www.hometax.go.kr',
        tip:      '연 예상 매출이 1억 400만원 미만이면 간이과세 선택 가능해요.',
        notRequired: false,
      },
      {
        title:    '사업자등록증 수령 확인',
        desc:     '홈택스에서 신청 후 3영업일 이내 발급돼요. PDF로 다운로드해서 보관하세요.',
        where:    '홈택스 → 사업자등록 신청/정정 현황',
        duration: '신청 후 3영업일 이내',
        timing:   null,
        docs:     [],
        url:      'https://www.hometax.go.kr',
        tip:      '사업자등록번호는 카드단말기 등록·세금계산서 발행에 필요해요.',
        notRequired: false,
      },
    ],
    6: permit.map(p => ({
      title:       p.title,
      desc:        p.desc,
      where:       p.where,
      duration:    null,
      timing:      null,
      docs:        p.docs ?? [],
      url:         p.url,
      tip:         p.tip ?? null,
      notRequired: false,
    })),
  }
}

// ── 상세 패널 ─────────────────────────────────────────────────────
function DetailPanel({ stepNum, itemIdx, item, isStepDone, isItemChecked, onToggle, onComplete, isStepAllChecked, navigate }) {
  const meta = STEP_META[stepNum]
  const items = null // placeholder
  return (
    <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm overflow-hidden">
      {/* 상단 배지 */}
      <div className="bg-navy/[0.03] border-b border-warm-gray/10 px-5 py-3 flex items-center gap-2">
        <span className="text-lg">{meta?.icon}</span>
        <div>
          <p className="text-[10px] font-bold text-warm-text/60 tracking-wider">
            STEP {stepNum} · {meta?.label}
          </p>
          <p className="text-base font-bold text-navy leading-tight">{item.title}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* 설명 */}
        {item.desc && (
          <p className="text-sm text-gray-700 leading-relaxed">{item.desc}</p>
        )}

        {/* 메타 정보 */}
        {(item.where || item.duration || item.timing) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-warm-text">
            {item.where && (
              <span className="flex items-center gap-1.5">
                <span className="text-navy/50 text-sm">📍</span> {item.where}
              </span>
            )}
            {item.duration && (
              <span className="flex items-center gap-1.5">
                <span className="text-navy/50 text-sm">⏱</span> {item.duration}
              </span>
            )}
            {item.timing && (
              <span className="flex items-center gap-1.5">
                <span className="text-navy/50 text-sm">📅</span> {item.timing}
              </span>
            )}
          </div>
        )}

        {/* 필요 서류 */}
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

        {/* 팁 */}
        {item.tip && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
            <p className="text-xs text-amber-800 font-medium leading-relaxed">💡 {item.tip}</p>
          </div>
        )}

        {/* 바로가기 버튼 */}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                       bg-navy text-white text-sm font-bold hover:bg-navy/90 transition-colors">
            바로가기 <ExternalLink size={13} />
          </a>
        )}

        {/* 완료 체크 */}
        {!item.notRequired && (
          <div className="pt-2 border-t border-warm-gray/15 flex items-center justify-between">
            <button
              type="button"
              onClick={onToggle}
              disabled={isStepDone}
              className="flex items-center gap-2 text-sm font-semibold text-navy disabled:opacity-40">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                isItemChecked ? 'bg-navy border-navy' : 'border-navy/40'
              }`}>
                {isItemChecked && <Check size={11} className="text-white" strokeWidth={3} />}
              </div>
              완료했어요
            </button>

            {isStepAllChecked && !isStepDone && (
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-navy text-white text-xs font-bold rounded-xl hover:bg-navy/90 transition-colors">
                {meta?.label} 완료 →
              </button>
            )}
          </div>
        )}
      </div>

      {/* 챗봇 안내 */}
      <div className="border-t border-warm-gray/10 bg-gray-50 px-5 py-3 text-center">
        <p className="text-xs text-warm-text">모르는 게 있으면 마이다에게 물어보세요!</p>
        <button
          onClick={() => navigate('/mission')}
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

  const inferredStep = inferCurrentStep(profile, journey)
  const initialActive = defaultStep ?? (inferredStep < 4 ? 4 : inferredStep <= 6 ? inferredStep : 6)

  const category  = profile?.category ?? '기타'
  const emoji     = CATEGORY_EMOJI[category] ?? '🚀'
  const completed = journey.completedSteps ?? {}
  const allItems  = buildItems(category)

  // 체크 상태: { "4_0": true, ... }
  const [checked, setChecked] = useState({})
  // 선택된 아이템 (상세 패널 표시)
  const [selected, setSelected] = useState(() => {
    const items = allItems[initialActive] ?? []
    return items.length > 0 ? { stepNum: initialActive, itemIdx: 0 } : null
  })

  function isChecked(stepNum, itemIdx) {
    const item = allItems[stepNum]?.[itemIdx]
    if (item?.notRequired) return true
    return !!checked[`${stepNum}_${itemIdx}`]
  }

  function toggleCheck(stepNum, itemIdx) {
    if (completed[stepNum]) return
    setChecked(prev => {
      const key = `${stepNum}_${itemIdx}`
      return { ...prev, [key]: !prev[key] }
    })
  }

  function isStepAllChecked(stepNum) {
    return (allItems[stepNum] ?? []).every((_, idx) => isChecked(stepNum, idx))
  }

  function handleComplete(stepNum) {
    completeStep(stepNum)
    window.dispatchEvent(new Event('mars-journey-updated'))
    if (stepNum === 4) setSelected({ stepNum: 5, itemIdx: 0 })
    else if (stepNum === 5) setSelected({ stepNum: 6, itemIdx: 0 })
    else navigate('/home')
  }

  const selectedItem = selected ? allItems[selected.stepNum]?.[selected.itemIdx] : null
  const panelOpen = !!selected && !!selectedItem

  return (
    <div className="min-h-screen bg-primary-bg">
      <Header onAvatarClick={() => navigate('/onboarding')} />
      <JourneyProgress currentStep={3} />

      <div className={`mx-auto px-4 pt-4 pb-24 transition-all duration-300 ${
        panelOpen ? 'max-w-5xl' : 'max-w-lg'
      }`}>

        {/* 상단 타이틀 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">{emoji}</span>
          <div>
            <h1 className="text-base font-bold text-navy leading-tight">{category} 창업 준비</h1>
            <p className="text-xs text-warm-text">교육 이수 → 사업자등록 → 인허가·영업신고 순서로 진행해요</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">

          {/* ─── 좌측: 체크리스트 ─── */}
          <div className={`space-y-3 transition-all duration-300 ${
            panelOpen ? 'lg:w-72 lg:flex-shrink-0' : 'w-full'
          }`}>

            {[4, 5, 6].map(stepNum => {
              const meta  = STEP_META[stepNum]
              const items = allItems[stepNum] ?? []
              const isDone   = !!completed[stepNum]
              const isActive = !isDone && stepNum <= initialActive + 1

              return (
                <div key={stepNum} className={`bg-white rounded-2xl border-2 overflow-hidden ${
                  isActive && !isDone ? 'border-navy shadow-sm' : isDone ? 'border-warm-gray/20' : 'border-warm-gray/15'
                }`}>

                  {/* 단계 헤더 */}
                  <div className={`flex items-center gap-3 px-4 py-3 ${isActive && !isDone ? 'bg-navy/[0.03]' : ''}`}>
                    <span className="text-lg flex-shrink-0">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-warm-text/60 tracking-wider">STEP {stepNum}</p>
                      <p className={`text-sm font-bold ${
                        isDone ? 'text-navy/40' : isActive ? 'text-navy' : 'text-gray-400'
                      }`}>
                        {meta.label}
                      </p>
                    </div>
                    {isDone ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50
                                       text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0">
                        <Check size={9} strokeWidth={3} /> 완료
                      </span>
                    ) : isActive && isStepAllChecked(stepNum) ? (
                      <button
                        onClick={() => handleComplete(stepNum)}
                        className="text-[10px] font-bold bg-navy text-white px-2 py-0.5 rounded-full flex-shrink-0">
                        완료 →
                      </button>
                    ) : null}
                  </div>

                  {/* 아이템 목록 */}
                  <div className="divide-y divide-warm-gray/10">
                    {items.map((item, idx) => {
                      const chk  = isDone || isChecked(stepNum, idx)
                      const isSel = selected?.stepNum === stepNum && selected?.itemIdx === idx

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelected({ stepNum, itemIdx: idx })}
                          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-all ${
                            isSel ? 'bg-navy/5' : 'hover:bg-gray-50'
                          }`}>
                          {/* 미니 체크박스 */}
                          <div
                            role="checkbox"
                            aria-checked={chk}
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

                          <ChevronRight size={12} className={`flex-shrink-0 transition-colors ${
                            isSel ? 'text-navy' : 'text-warm-gray/30'
                          }`} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* 모두 완료 */}
            {completed[4] && completed[5] && completed[6] && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                <p className="text-sm font-bold text-emerald-700 mb-1">🎉 창업 준비 완료!</p>
                <button
                  onClick={() => navigate('/home')}
                  className="text-xs font-bold text-emerald-700 underline underline-offset-2">
                  지원사업 탐색하기 →
                </button>
              </div>
            )}
          </div>

          {/* ─── 우측: 상세 패널 ─── */}
          {panelOpen && (
            <div className="flex-1 min-w-0 order-first lg:order-last">
              <DetailPanel
                stepNum={selected.stepNum}
                itemIdx={selected.itemIdx}
                item={selectedItem}
                isStepDone={!!completed[selected.stepNum]}
                isItemChecked={isChecked(selected.stepNum, selected.itemIdx)}
                onToggle={() => toggleCheck(selected.stepNum, selected.itemIdx)}
                isStepAllChecked={isStepAllChecked(selected.stepNum)}
                onComplete={() => handleComplete(selected.stepNum)}
                navigate={navigate}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

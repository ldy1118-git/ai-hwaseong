import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import OrbitProgressBar from '../components/ui/OrbitProgressBar'
import ChecklistSection from '../components/sections/ChecklistSection'
import DocumentStepDrawer from '../components/ui/DocumentStepDrawer'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'
import { generateChecklistV1 } from '../utils/llm/generateChecklist'
import termsData from '../data/terms.json'
import searchImg from '../../design/search.png'
import marsImg from '../../design/mars.png'

// API 키는 서버에만 둔다. VITE_ 환경변수는 빌드 결과물에 그대로 박혀서
// 배포하면 누구나 꺼낼 수 있다. LLM 호출은 llmProvider 가 /api/llm 으로 넘긴다.

const STATIC_ITEMS = [
  { id: 1, label: '사업자등록증 사본',     desc: '주소·업종 변경 여부 확인 후 제출',  issueUrl: 'https://www.hometax.go.kr', checked: false },
  { id: 2, label: '신분증 사본',           desc: '대표자 신분증 앞면',                issueUrl: null,                       checked: false },
  { id: 3, label: '납세 완납 증명서',      desc: '홈택스 → 민원증명 → 납세증명서',   issueUrl: 'https://www.hometax.go.kr', checked: false },
  { id: 4, label: '사업용 통장 사본',      desc: '지원금 수령용 사업자 명의 계좌',    issueUrl: null,                       checked: false },
  { id: 5, label: '최근 3개월 매출 내역',  desc: '카드 단말기 또는 홈택스 출력본',   issueUrl: 'https://www.hometax.go.kr', checked: false },
  { id: 6, label: '임대차계약서 사본',     desc: '사업장을 임차한 경우 해당',         issueUrl: null,                       checked: false },
]

/* ── 마이다 가이드 말풍선 ──────────────────────────── */
function MarsGuide({ message }) {
  return (
    <div className="px-5 py-3 flex items-start gap-3">
      <img
        src={marsImg}
        alt="마이다"
        className="w-12 h-12 rounded-full object-cover flex-shrink-0 shadow-sm"
      />
      <div className="relative bg-white rounded-2xl rounded-tl-sm border border-warm-gray/30 px-4 py-3 shadow-sm flex-1">
        {/* 말풍선 꼬리 – 테두리 */}
        <span className="absolute top-3.5" style={{
          left: '-9px', width: 0, height: 0,
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          borderRight: '9px solid #D1D5DB',
        }} />
        {/* 말풍선 꼬리 – 흰색 채움 */}
        <span className="absolute top-3.5" style={{
          left: '-7px', width: 0, height: 0,
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          borderRight: '9px solid white',
        }} />
        <p className="text-sm text-navy font-medium leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

/* ── 서류 발급 바텀시트 ────────────────────────────── */
function PrepSheet({ items, onClose }) {
  const linkItems = items.filter(it => it.issueUrl)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-4xl mx-auto"
        style={{ animation: 'slideUp 0.22s ease' }}
      >
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

        <div className="px-5 pt-4 pb-4 border-b border-warm-gray/20">
          <div className="w-10 h-1 bg-warm-gray/40 rounded-full mx-auto mb-4" />
          <p className="text-base font-bold text-navy">서류 발급 바로가기</p>
          <p className="text-xs text-warm-text mt-0.5">탭하면 해당 발급 페이지로 이동해요</p>
        </div>

        <div className="px-5 py-4 space-y-2 max-h-64 overflow-y-auto">
          {linkItems.map(it => (
            <a
              key={it.id}
              href={it.issueUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-navy/5 hover:bg-navy/10 transition-colors"
            >
              <span className="text-xl flex-shrink-0">📄</span>
              <p className="flex-1 text-sm font-semibold text-navy">{it.label}</p>
              <span className="text-navy/40 text-sm flex-shrink-0">→</span>
            </a>
          ))}
          <a
            href="https://www.gov.kr"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-sunset-orange/10 hover:bg-sunset-orange/20 transition-colors"
          >
            <span className="text-xl flex-shrink-0">🏛</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-sunset-orange">정부24 전체 서류 발급</p>
              <p className="text-xs text-warm-text">공공서류 원스톱 발급 포털</p>
            </div>
            <span className="text-sunset-orange text-sm flex-shrink-0">→</span>
          </a>
        </div>

        <div className="px-5 pb-7">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-warm-gray/20 text-navy text-sm font-semibold"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  )
}

/* ── 완료 배너 ─────────────────────────────────────── */
function AllDoneBanner() {
  return (
    <div
      className="mx-5 mt-2 rounded-2xl px-4 py-4 flex items-center gap-3"
      style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
    >
      <span className="text-2xl">🎉</span>
      <div>
        <p className="text-white text-sm font-bold">서류 준비 완료!</p>
        <p className="text-white/80 text-xs mt-0.5">신청서 작성 단계로 넘어갈 수 있어요</p>
      </div>
    </div>
  )
}

/* ── 메인 페이지 ─────────────────────────────────────── */
export default function ApplicationGuide() {
  const navigate = useNavigate()

  const [items,       setItems]       = useState(STATIC_ITEMS)
  const [programName, setProgramName] = useState('')
  const [program,     setProgram]     = useState(null)
  const [notes,       setNotes]       = useState([])
  const [pending,     setPending]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [statusMsg,   setStatusMsg]   = useState('')
  const [drawerItem,  setDrawerItem]  = useState(null)
  const [showPrep,    setShowPrep]    = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('mars-fit-selected-match')
    if (raw) {
      try { setProgram(JSON.parse(raw)) } catch {}
    }
    loadAIChecklist()
  }, [])

  async function loadAIChecklist() {
    setLoading(true)
    setStatusMsg('매칭 결과를 불러오는 중...')

    try {
      let matched = null
      const selected = localStorage.getItem('mars-fit-selected-match')
      if (selected) {
        matched = JSON.parse(selected)
      }

      if (!matched) {
        const saved   = localStorage.getItem('mars-fit-profile')
        const profile = saved ? JSON.parse(saved) : DEFAULT_PROFILE
        const { results } = await fetchMatches(profile)
        matched = results.find(
          r => r.overall_status !== '대상아님' && Array.isArray(r.expected_documents) && r.expected_documents.length > 0
        )
      }

      if (!matched) { setLoading(false); setStatusMsg(''); return }

      setStatusMsg('마이다가 필요한 서류 목록을 탐구 중...')

      const noticeJson = {
        title:        matched.notice_title,
        apply_period: matched.apply_period ?? {},
        apply_method: matched.apply_method ?? null,
        contact:      matched.contact      ?? null,
        operator:     matched.operator     ?? null,
        summary:      matched.application_detail ?? matched.notice_title,
      }

      // 제공자를 고르지 않는다. 서버가 키 꽂힌 것 중에서 고르고, 하나가
      // 실패하면 다음 것으로 넘어간다. 여기서 못박으면 그 폴백이 죽는다.
      const result = await generateChecklistV1(matched, noticeJson, termsData)

      if (result.parsed?.checklist?.length) {
        setItems(
          result.parsed.checklist.map((it, i) => ({
            id:       i + 1,
            label:    it.document,
            desc:     [
              it.how_to_get,
              it.fee            ? `수수료: ${it.fee}`              : null,
              it.estimated_time ? `소요시간: ${it.estimated_time}` : null,
            ].filter(Boolean).join(' · ') || it.required_type,
            issueUrl: it.url ?? null,
            checked:  false,
          }))
        )
        setProgramName(result.parsed.program_name      ?? '')
        setNotes(result.parsed.important_notes         ?? [])
        setPending(result.parsed.pending_conditions    ?? [])
      }
    } catch (err) {
      console.error('AI checklist error:', err)
    } finally {
      setLoading(false)
      setStatusMsg('')
    }
  }

  // 체크박스 직접 토글 (즉시 반영)
  function handleToggle(id) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, checked: !it.checked } : it))
  }

  // DocumentStepDrawer 에서 모든 단계 완료 후 호출
  function handleComplete(id) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, checked: true } : it))
  }

  const checkedCount = items.filter(it => it.checked).length
  const totalCount   = items.length
  const allDone      = checkedCount === totalCount

  const marsMessage =
    checkedCount === 0
      ? '사장님, 이 서류들만 챙기면 미션 성공이에요! 하나씩 체크해봐요 💪'
      : allDone
      ? '완벽해요! 이제 신청서 작성 단계로 넘어갈 수 있어요 🎉'
      : `벌써 ${checkedCount}개나 챙기셨네요! 거의 다 왔어요 ✨`

  return (
    <div className="min-h-screen bg-primary-bg flex flex-col">
      <Header />

      <div className="flex-1 overflow-y-auto pb-36">
        <div className="max-w-4xl mx-auto">

          {/* 프로그램명 */}
          {(program?.title || programName) && (
            <div className="px-5 pt-4 pb-1">
              <p className="text-[11px] text-warm-text font-medium tracking-wide uppercase">선택하신 지원사업</p>
              <h1 className="text-base font-bold text-navy mt-1 line-clamp-2 leading-snug">
                {program?.title ?? programName}
              </h1>
            </div>
          )}

          {loading ? (
            /* ── 로딩 상태 ── */
            <div className="flex flex-col items-center justify-center py-16">
              <style>{`
                @keyframes marsFloat {
                  0%, 100% { transform: translateY(0); }
                  50%       { transform: translateY(-12px); }
                }
                @keyframes shadowPulse {
                  0%, 100% { transform: scaleX(1); opacity: 0.15; }
                  50%       { transform: scaleX(0.7); opacity: 0.07; }
                }
              `}</style>
              <div className="relative flex flex-col items-center">
                <img
                  src={searchImg}
                  alt="서류 탐색 중인 마이다"
                  className="w-44 h-44 object-contain"
                  style={{ animation: 'marsFloat 2s ease-in-out infinite' }}
                />
                <div
                  className="w-24 h-3 bg-navy rounded-full blur-sm mt-1"
                  style={{ animation: 'shadowPulse 2s ease-in-out infinite' }}
                />
              </div>
              <p className="mt-5 text-sm font-semibold text-navy">{statusMsg}</p>
              <div className="flex gap-1 mt-2">
                {[0, 0.2, 0.4].map((delay, i) => (
                  <span key={i}
                    className="w-1.5 h-1.5 rounded-full bg-warm-gray animate-bounce"
                    style={{ animationDelay: `${delay}s` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* 궤도 진행 바 */}
              <OrbitProgressBar checked={checkedCount} total={totalCount} />

              {/* 진행 카운터 */}
              <div className="px-5 pb-1 flex items-center justify-between">
                <p className="text-xs text-warm-text">서류 준비 현황</p>
                <p className="text-sm font-bold text-sunset-orange">
                  {checkedCount} <span className="text-warm-text font-normal">/ {totalCount}</span>
                </p>
              </div>

              {/* 마이다 말풍선 */}
              <MarsGuide message={marsMessage} />

              {/* 완료 배너 */}
              {allDone && <AllDoneBanner />}

              {/* 확인 필요 조건 */}
              {pending.length > 0 && (
                <div className="mx-5 mt-4 bg-star-yellow/20 border border-star-yellow/40 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-navy">확인이 필요한 조건</p>
                  {pending.map((p, i) => (
                    <p key={i} className="text-sm text-gray-700">{p.ask_user}</p>
                  ))}
                </div>
              )}

              {/* 서류 체크리스트 */}
              <div className="mt-3">
                <ChecklistSection
                  items={items}
                  onToggle={handleToggle}
                  onDetail={setDrawerItem}
                />
              </div>

              {/* 유의사항 */}
              {notes.length > 0 && (
                <div className="mx-5 mt-2 mb-4 bg-sunset-orange/10 border border-sunset-orange/30 rounded-2xl p-4 space-y-1.5">
                  <p className="text-xs font-bold text-sunset-orange">유의사항</p>
                  {notes.map((n, i) => (
                    <p key={i} className="text-sm text-gray-700">{n}</p>
                  ))}
                </div>
              )}

              {/* 신청 전 확인사항 */}
              <div className="px-5 pt-2 pb-2">
                <div className="bg-navy/5 rounded-2xl px-4 py-4">
                  <p className="text-xs font-bold text-navy mb-2 flex items-center gap-1.5">
                    <span>📋</span> 신청 전 확인사항
                  </p>
                  <ul className="text-xs text-warm-text space-y-1.5 list-disc list-inside leading-relaxed">
                    <li>서류 발급일로부터 <strong className="text-navy">3개월 이내</strong> 서류만 인정됩니다</li>
                    <li>원본 제출 요구 시 발급 기관에 별도 문의하세요</li>
                    <li>조건 충족 여부는 마이다와 대화로 재확인 가능해요</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 고정 하단 버튼 */}
      {!loading && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-primary-bg/95 backdrop-blur-sm border-t border-warm-gray/20 px-5 py-4">
          <div className="max-w-4xl mx-auto flex flex-col gap-2.5">

            {/* 신청서 작성 버튼 – 모든 서류 완료 시 노출 */}
            {allDone && (
              <button
                onClick={() => {
                  const url = program?.applyUrl ?? program?.raw?.apply_url
                  if (url) window.open(url, '_blank')
                }}
                className="w-full py-3.5 rounded-2xl bg-navy text-white text-sm font-bold shadow-lg
                           hover:bg-navy/90 active:scale-[0.98] transition-all"
              >
                신청서 작성하러 가기 →
              </button>
            )}

            {/* 서류 한번에 준비하기 */}
            <button
              onClick={() => setShowPrep(true)}
              className="w-full py-3.5 rounded-2xl text-white text-sm font-bold shadow-lg
                         hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #F97316, #FB923C)' }}
            >
              서류 한번에 준비하기 📄
            </button>
          </div>
        </div>
      )}

      {/* 서류 상세 드로어 */}
      <DocumentStepDrawer
        item={drawerItem}
        termsData={termsData}
        onClose={() => setDrawerItem(null)}
        onComplete={handleComplete}
      />

      {/* 서류 발급 바텀시트 */}
      {showPrep && <PrepSheet items={items} onClose={() => setShowPrep(false)} />}
    </div>
  )
}

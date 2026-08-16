import { useState, useEffect } from 'react'
import Header from '../components/layout/Header'
import PageWrapper from '../components/layout/PageWrapper'
import OrbitProgressBar from '../components/ui/OrbitProgressBar'
import ChecklistSection from '../components/sections/ChecklistSection'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'
import { generateChecklistV1 } from '../utils/llm/generateChecklist'
import termsData from '../data/terms.json'
import searchImg from '../../design/search.png'

// API 키는 서버에만 둔다. VITE_ 환경변수는 빌드 결과물에 그대로 박혀서
// 배포하면 누구나 꺼낼 수 있다. LLM 호출은 llmProvider 가 /api/llm 으로 넘긴다.
const GEMINI_KEY = null

const STATIC_ITEMS = [
  { id: 1, label: '사업자등록증 사본',     desc: '주소·업종 변경 여부 확인 후 제출', checked: false },
  { id: 2, label: '신분증 사본',           desc: '대표자 신분증 앞면',              checked: false },
  { id: 3, label: '최근 3개월 매출 내역',  desc: '카드 단말기 또는 홈택스 출력본',   checked: false },
  { id: 4, label: '임대차계약서 사본',     desc: '사업장을 임차한 경우 해당',        checked: false },
  { id: 5, label: '부가세 과세표준증명원', desc: '홈택스 → 민원증명에서 발급',      checked: false },
  { id: 6, label: '통장 사본',            desc: '지원금 수령용 계좌',              checked: false },
]

export default function ApplicationGuide() {
  const [items, setItems]         = useState(STATIC_ITEMS)
  const [programName, setProgramName] = useState('')
  const [notes, setNotes]         = useState([])
  const [pending, setPending]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => {
    loadAIChecklist()
  }, [])

  async function loadAIChecklist() {
    setLoading(true)
    setStatusMsg('매칭 결과를 불러오는 중...')

    try {
      // 대시보드에서 선택된 항목이 있으면 우선 사용
      let matched = null
      const selected = localStorage.getItem('mars-fit-selected-match')
      if (selected) {
        matched = JSON.parse(selected)
        localStorage.removeItem('mars-fit-selected-match')
      }

      if (!matched) {
        const saved = localStorage.getItem('mars-fit-profile')
        const profile = saved ? JSON.parse(saved) : DEFAULT_PROFILE
        const { results } = await fetchMatches(profile)
        matched = results.find(
          r => r.overall_status !== '대상아님' && Array.isArray(r.expected_documents) && r.expected_documents.length > 0
        )
      }

      if (!matched) {
        setStatusMsg('')
        setLoading(false)
        return
      }

      setStatusMsg('Mars가 필요한 서류 목록 탐구 중...')

      const noticeJson = {
        title:        matched.notice_title,
        apply_period: matched.apply_period ?? {},
        apply_method: matched.apply_method ?? null,
        contact:      matched.contact      ?? null,
        operator:     matched.operator     ?? null,
        summary:      matched.application_detail ?? matched.notice_title,
      }

      const result = await generateChecklistV1(matched, noticeJson, termsData, GEMINI_KEY, 'gemini')

      if (result.parsed?.checklist?.length) {
        setItems(
          result.parsed.checklist.map((item, i) => ({
            id:      i + 1,
            label:   item.document,
            desc:    [
              item.how_to_get,
              item.fee            ? `수수료: ${item.fee}`           : null,
              item.estimated_time ? `소요시간: ${item.estimated_time}` : null,
            ].filter(Boolean).join(' · ') || item.required_type,
            url:     item.url ?? null,
            checked: false,
          }))
        )
        setProgramName(result.parsed.program_name ?? '')
        setNotes(result.parsed.important_notes   ?? [])
        setPending(result.parsed.pending_conditions ?? [])
      }
    } catch (err) {
      console.error('AI checklist error:', err)
    } finally {
      setLoading(false)
      setStatusMsg('')
    }
  }

  function handleToggle(id) {
    setItems(prev =>
      prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item)
    )
  }

  const checkedCount = items.filter(i => i.checked).length

  return (
    <div className="min-h-screen bg-primary-bg">
      <Header />
      <PageWrapper>
        <div className="mt-4 mb-1">
          <h1 className="text-xl font-bold text-navy">신청 동행</h1>
          <p className="text-sm text-warm-text mt-0.5">
            {programName || 'Mars와 함께 서류를 하나씩 준비해봐요'}
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <style>{`
              @keyframes marsFloat {
                0%, 100% { transform: translateY(0px); }
                50%       { transform: translateY(-12px); }
              }
              @keyframes shadowPulse {
                0%, 100% { transform: scaleX(1); opacity: 0.15; }
                50%       { transform: scaleX(0.7); opacity: 0.07; }
              }
            `}</style>

            {/* Mars 캐릭터 + 그림자 */}
            <div className="relative flex flex-col items-center">
              <img
                src={searchImg}
                alt="서류 탐색 중인 Mars"
                className="w-44 h-44 object-contain"
                style={{ animation: 'marsFloat 2s ease-in-out infinite' }}
              />
              <div
                className="w-24 h-3 bg-navy rounded-full blur-sm mt-1"
                style={{ animation: 'shadowPulse 2s ease-in-out infinite' }}
              />
            </div>

            {/* 메시지 + 점 애니메이션 */}
            <p className="mt-5 text-sm font-semibold text-navy">{statusMsg}</p>
            <div className="flex gap-1 mt-2">
              {[0, 0.2, 0.4].map((delay, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-warm-gray animate-bounce"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <OrbitProgressBar checked={checkedCount} total={items.length} />

            {pending.length > 0 && (
              <div className="mt-4 bg-star-yellow/20 border border-star-yellow/40 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-navy">확인이 필요한 조건</p>
                {pending.map((p, i) => (
                  <p key={i} className="text-sm text-gray-700">{p.ask_user}</p>
                ))}
              </div>
            )}

            <ChecklistSection items={items} onToggle={handleToggle} />

            {notes.length > 0 && (
              <div className="mt-4 mb-6 bg-sunset-orange/10 border border-sunset-orange/30 rounded-2xl p-4 space-y-1.5">
                <p className="text-xs font-bold text-sunset-orange">유의사항</p>
                {notes.map((n, i) => (
                  <p key={i} className="text-sm text-gray-700">{n}</p>
                ))}
              </div>
            )}
          </>
        )}
      </PageWrapper>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { cleanDocName } from '../utils/docName'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import Button from '../components/ui/Button'
import { fetchMatches, lookupTerms, DEFAULT_PROFILE } from '../utils/api'

/**
 * 공고 상세.
 *
 * 전에는 대시보드에서 "자세히 →" 를 누르면 공고를 못 보고 서류 목록으로
 * 바로 넘어갔다. 공고 자체를 읽는 화면이 없었다.
 *
 * 이 화면의 핵심은 맨 아래 **접수처** 다. 수집한 공고 25건 전부 문의처가
 * 공고를 낸 기관과 다르다. 시청에 전화하면 "저희 소관 아닙니다" 를 듣는
 * 문제인데, 그걸 화면에서 풀어주는 자리다.
 */

function StatusPill({ status }) {
  const style = {
    '신청가능': 'text-emerald-700 bg-emerald-50',
    '조건부':   'text-sunset-orange bg-sunset-orange/10',
    '확인필요': 'text-warm-text bg-warm-gray/20',
  }[status] ?? 'text-warm-text bg-warm-gray/20'
  return <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${style}`}>{status}</span>
}

function dDay(end) {
  if (!end) return null
  return Math.ceil((new Date(end) - new Date()) / 86400000)
}

function TermTooltip({ term }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative" style={{ display: 'inline-block' }}>
      <span
        className="border-b-2 border-dotted border-navy text-navy font-semibold cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {term.term}
      </span>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-navy text-white text-xs rounded-xl p-3 shadow-xl z-50 pointer-events-none">
          <p className="font-bold mb-1">{term.term}</p>
          <p className="leading-relaxed">{term.easy}</p>
          {term.caution && (
            <p className="text-yellow-300 mt-1.5 leading-relaxed">주의 · {term.caution}</p>
          )}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-navy rotate-45" />
        </div>
      )}
    </span>
  )
}

function annotate(text, terms) {
  if (!text || !terms.length) return text
  const escaped = terms.map(t => t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g')
  return text.split(pattern).map((part, i) => {
    const term = terms.find(t => t.term === part)
    return term ? <TermTooltip key={i} term={term} /> : part
  })
}

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-xs font-bold text-navy uppercase tracking-wider mb-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-navy" />
        {title}
      </h2>
      {children}
    </section>
  )
}

const BOX = 'bg-white border border-warm-gray/40 rounded-2xl p-4'

export default function NoticeDetail() {
  const navigate = useNavigate()
  const [item, setItem]     = useState(null)
  const [terms, setTerms]   = useState([])
  const [docs, setDocs]     = useState([])
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    let dead = false

    async function load() {
      try {
        // 대시보드에서 고른 공고. 새로고침 등으로 없으면 매칭을 다시 돌린다.
        let picked = null
        const saved = localStorage.getItem('mars-fit-selected-match')
        if (saved) picked = JSON.parse(saved)

        if (!picked) {
          const profile = JSON.parse(localStorage.getItem('mars-fit-profile') || 'null')
          const { results } = await fetchMatches(profile ?? DEFAULT_PROFILE)
          picked = results.find(r => r.overall_status !== '대상아님')
        }
        if (!picked) throw new Error('공고를 찾을 수 없어요')
        if (dead) return
        setItem(picked)

        // 이 공고에 실제로 나온 용어만 골라온다. 사전 전체를 쓰지 않는다.
        const text = [picked.notice_title, picked.summary].filter(Boolean).join('\n')
        const names = (picked.expected_documents ?? []).map(d => d.name)
        const found = await lookupTerms(text, names)
        if (dead) return
        setTerms(found.terms ?? [])
        setDocs(found.documents ?? [])
      } catch (err) {
        if (!dead) setError(err.message)
      } finally {
        if (!dead) setLoad(false)
      }
    }
    load()
    return () => { dead = true }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-primary-bg">
        <Header />
        <div className="max-w-2xl mx-auto px-5 py-16 flex flex-col items-center gap-3">
          <span className="w-8 h-8 rounded-full border-4 border-warm-gray/30 border-t-navy animate-spin" />
          <p className="text-sm text-warm-text">공고를 불러오고 있어요</p>
        </div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-primary-bg">
        <Header />
        <div className="max-w-2xl mx-auto px-5 py-16 text-center">
          <p className="text-sm text-sunset-orange mb-4">{error || '공고를 찾을 수 없어요'}</p>
          <Button variant="navy" onClick={() => navigate('/home')}>목록으로 돌아가기</Button>
        </div>
      </div>
    )
  }

  const days = dDay(item.apply_period?.end)
  const urgent = days !== null && days <= 14
  const period = item.apply_period ?? {}

  return (
    <div className="min-h-screen bg-primary-bg">
      <Header />

      <main className="max-w-2xl mx-auto px-5 pb-36">
        <button
          onClick={() => navigate('/home')}
          className="mt-4 text-sm font-medium text-navy hover:underline"
        >
          ← 목록으로
        </button>

        <div className="flex items-center gap-3 mt-4 mb-2">
          <StatusPill status={item.overall_status} />
          {days !== null && (
            <span className={`text-base font-bold ${urgent ? 'text-sunset-orange' : 'text-navy'}`}>
              D-{days}
            </span>
          )}
          <span className="text-xs text-warm-text">{item.application_status}</span>
        </div>

        <h1 className="text-lg font-bold text-navy leading-snug">{annotate(item.notice_title, terms)}</h1>

        {item.summary && (
          <p className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {annotate(item.summary, terms)}
          </p>
        )}

        {/* 조건 판정 — 왜 이 공고가 나에게 떴는지 */}
        <Section title="내 조건과 맞춰본 결과">
          <div className={BOX}>
            {(item.condition_results ?? []).length === 0 ? (
              <p className="text-sm text-warm-text">판정할 조건이 없어요.</p>
            ) : (
              item.condition_results.map((c, i) => {
                const ok = c.status === '충족'
                const bad = c.status === '불충족'
                return (
                  <div key={i} className={`flex items-start gap-3 py-2.5 ${i > 0 ? 'border-t border-warm-gray/20' : ''}`}>
                    <span className={[
                      'w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center',
                      'text-xs font-bold text-white',
                      ok ? 'bg-emerald-600' : bad ? 'bg-red-500' : 'bg-sunset-orange',
                    ].join(' ')}>
                      {ok ? '✓' : bad ? '✕' : '!'}
                    </span>
                    <p className="text-sm text-gray-700 leading-relaxed pt-0.5">{c.detail}</p>
                  </div>
                )
              })
            )}
          </div>
        </Section>

        {/* 서류 — 어디서 어떻게 떼는지까지 */}
        {docs.length > 0 && (
          <Section title="필요한 서류">
            <div className={BOX}>
              {docs.map((d, i) => (
                <div key={d.name} className={`py-2.5 ${i > 0 ? 'border-t border-warm-gray/20' : ''}`}>
                  <p className="text-sm font-semibold text-navy">{cleanDocName(d.name).name}</p>
                  {d.easy && <p className="text-xs text-warm-text mt-0.5 leading-relaxed">{d.easy}</p>}
                  {d.issue && (
                    <p className="text-xs text-gray-700 mt-1 leading-relaxed">
                      {(d.issue.online ?? []).join(' / ')}
                      {d.issue.fee && ` · ${d.issue.fee}`}
                      {d.issue.time && ` · ${d.issue.time}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 여기가 이 화면의 핵심 */}
        <Section title="어디에 내나">
          <div className={BOX}>
            {[
              ['접수 방법', item.apply_method],
              // 날짜가 없는 공고가 절반이 넘는다(59건 중 30건). 그럴 때는
              // 원문 문구를 그대로 쓴다. 비워두면 언제까지인지 알 길이 없다.
              ['접수 기간', period.start || period.end
                ? `${period.start ?? '?'} ~ ${period.end ?? '?'}`
                : period.note ?? null],
              ['소관기관', item.organizer],
              ['수행기관', item.operator],
            ].filter(([, v]) => v).map(([label, value], i) => (
              <div key={label} className={`flex justify-between gap-4 py-2 ${i > 0 ? 'border-t border-warm-gray/20' : ''}`}>
                <span className="text-sm text-warm-text flex-shrink-0">{label}</span>
                <span className="text-sm font-medium text-navy text-right">{value}</span>
              </div>
            ))}

            {item.contact && (
              <div className="mt-3 bg-sunset-orange/10 border border-sunset-orange/40 rounded-xl p-3">
                <p className="text-xs font-bold text-sunset-orange">문의처가 따로 있어요</p>
                <p className="text-sm text-gray-700 leading-relaxed mt-1">{item.contact}</p>
                <p className="text-xs text-warm-text mt-1.5">
                  공고를 낸 기관과 접수·문의를 받는 곳이 달라요. 여기로 물어보세요.
                </p>
              </div>
            )}
          </div>
        </Section>

      </main>

      {/* 하단 고정 액션 */}
      <div className="fixed bottom-0 left-0 right-0 bg-primary-bg/95 backdrop-blur border-t border-warm-gray/30 px-4 py-2">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noreferrer" className="w-full">
              <Button variant="ghost" size="sm" fullWidth>공고문 원문 보기 →</Button>
            </a>
          )}
        <div className="flex gap-3">
          <Button
            variant="outline" size="sm" fullWidth className="flex-1"
            onClick={() => {
              localStorage.setItem('mars-fit-selected-match', JSON.stringify(item))
              navigate('/apply')
            }}
          >
            서류 준비하기
          </Button>
          {item.apply_url ? (
            <a href={item.apply_url} target="_blank" rel="noreferrer" className="flex-1">
              <Button variant="sunset-orange" size="sm" fullWidth>신청하러 가기</Button>
            </a>
          ) : (
            <Button variant="sunset-orange" size="sm" fullWidth disabled className="flex-1">
              {item.apply_method ? '문의처로 접수' : '접수처 확인 필요'}
            </Button>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

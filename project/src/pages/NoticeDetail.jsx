import { useEffect, useState, useRef } from 'react'
import { cleanDocName } from '../utils/docName'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import Button from '../components/ui/Button'
import { fetchMatches, lookupTerms, DEFAULT_PROFILE } from '../utils/api'
import FavoriteButton from '../components/ui/FavoriteButton'
import { summarizeNoticeEasy } from '../utils/llm/summarizeNoticeEasy'

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

/* 마우스가 있는 기기인가.
 *
 * 전에는 onMouseEnter 로만 열었다. 데스크톱에서는 됐지만 **누를 수는
 * 없었다.** 마우스를 얹고 있어야만 보이니 손을 떼면 사라지고, 터치
 * 화면에서는 아예 안 열렸다. 발표에서 「탭 한 번으로 풀린다」고 말하는
 * 기능이라 말과 화면이 어긋났다.
 *
 * 그렇다고 탭 처리를 그냥 얹으면 안 된다. 터치 브라우저는 탭 한 번에
 * mouseenter 와 click 을 같이 쏘기 때문에, 열렸다가 곧바로 닫힌다.
 * 그래서 마우스가 있는 기기에서만 hover 를 붙이고, 나머지는 탭만 쓴다.
 * 어느 쪽이든 **눌러서 열고 눌러서 닫는 것**은 똑같이 된다. */
const CAN_HOVER = typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover)').matches

function TermTooltip({ term }) {
  const [show, setShow] = useState(false)
  const wrap = useRef(null)

  // 탭으로 열었으면 탭으로 닫을 수 있어야 한다. 바깥을 누르거나 Esc.
  useEffect(() => {
    if (!show) return
    const away = e => { if (wrap.current && !wrap.current.contains(e.target)) setShow(false) }
    const esc = e => { if (e.key === 'Escape') setShow(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [show])

  const hover = CAN_HOVER
    ? { onMouseEnter: () => setShow(true), onMouseLeave: () => setShow(false) }
    : {}

  return (
    <span className="relative" style={{ display: 'inline-block' }} ref={wrap}>
      <button
        type="button"
        aria-expanded={show}
        aria-label={`${term.term} 뜻 보기`}
        onClick={() => setShow(v => !v)}
        {...hover}
        className="border-b-2 border-dotted border-navy text-navy font-semibold cursor-help
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 rounded-sm"
      >
        {term.term}
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                        w-[min(14rem,72vw)] bg-navy text-white text-xs rounded-xl p-3
                        shadow-xl z-50 pointer-events-none">
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


// terms.json의 easy 텍스트가 사전체("~있다.", "~서류." 등)라
// 화면에서만 친근한 말투로 바꿔준다. 원본 데이터는 건드리지 않는다.
function toFriendly(text) {
  if (!text) return text
  return text
    .replace(/쓴다\./g, '써요.')
    .replace(/있다\./g, '있어요.')
    .replace(/된다\./g, '돼요.')
    .replace(/한다\./g, '해요.')
    .replace(/받는다\./g, '받아요.')
    .replace(/(서류|종이|증서|자료|문서|계약서|장부|용도)\./g, '$1예요.')
    .replace(/(사진|서식|증명|양식)\./g, '$1이에요.')
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

// 조건 그룹별 스타일
const COND_STYLE = {
  '충족':    { bg: 'bg-emerald-600', icon: '✓', label: '충족', labelColor: 'text-emerald-700', rowBg: 'bg-emerald-50/60' },
  '확인필요': { bg: 'bg-sunset-orange', icon: '!', label: '확인 필요', labelColor: 'text-sunset-orange', rowBg: 'bg-sunset-orange/5' },
  '불충족':  { bg: 'bg-red-500', icon: '✕', label: '미충족', labelColor: 'text-red-600', rowBg: 'bg-red-50/60' },
}

function matchExplanation(item) {
  const conds  = (item.condition_results ?? []).filter(c => c.status !== '대상아님')
  const met    = conds.filter(c => c.status === '충족').length
  const check  = conds.filter(c => c.status === '확인필요').length
  const status = item.overall_status
  if (status === '신청가능') {
    if (check > 0)
      return `${met}개 조건이 충족됐고, ${check}개는 신청 전에 직접 확인해보세요. 나머지 조건은 모두 맞아요.`
    return `확인된 ${met}개 조건이 모두 충족돼서 신청 가능으로 판정됐어요.`
  }
  if (status === '확인필요')
    return `${check}개 조건을 직접 확인해야 신청 가능 여부를 알 수 있어요. 불확실한 것을 신청했다가 탈락하면 시간이 아까우니, 아래 문의처에 먼저 물어보세요.`
  return null
}

export default function NoticeDetail() {
  const navigate = useNavigate()
  const [item, setItem]         = useState(null)
  const [terms, setTerms]       = useState([])
  const [docs, setDocs]         = useState([])
  const [loading, setLoad]      = useState(true)
  const [error, setError]       = useState('')
  const [easyInfo, setEasyInfo] = useState(null)
  const [easyLoading, setEasyLoading] = useState(true)

  useEffect(() => {
    let dead = false

    async function load() {
      let picked = null
      try {
        // 대시보드에서 고른 공고. 새로고침 등으로 없으면 매칭을 다시 돌린다.
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

      // LLM 쉬운 요약 — phase 1 완료 후 별도로 실행. 실패해도 카드만 안 뜬다.
      if (!picked || dead) { if (!dead) setEasyLoading(false); return }
      try {
        const easy = await summarizeNoticeEasy(picked)
        if (!dead) setEasyInfo(easy)
      } catch {
        // silent
      } finally {
        if (!dead) setEasyLoading(false)
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
          {/* ★ 관심공고. 담아두면 마감 전에 알림이 온다 */}
          <FavoriteButton notice={item} className="ml-auto" />
        </div>

        <h1 className="text-lg font-bold text-navy leading-snug">{annotate(item.notice_title, terms)}</h1>

        {/* 마이다 쉬운 설명 카드 */}
        <div className="mt-3 rounded-2xl overflow-hidden border border-navy/10 shadow-sm">
          <div className="bg-navy px-4 py-2.5 flex items-center gap-2">
            <span className="text-base">✨</span>
            <span className="text-white text-sm font-bold">마이다가 쉽게 정리했어요</span>
          </div>
          <div className="bg-white px-4 py-4">
            {easyLoading ? (
              <div className="space-y-2.5 animate-pulse">
                <div className="h-3 bg-warm-gray/30 rounded-full w-full" />
                <div className="h-3 bg-warm-gray/30 rounded-full w-11/12" />
                <div className="h-3 bg-warm-gray/30 rounded-full w-4/6" />
                <div className="mt-4 h-3 bg-warm-gray/20 rounded-full w-2/5" />
                <div className="h-8 bg-warm-gray/20 rounded-xl w-full" />
                <div className="h-8 bg-warm-gray/20 rounded-xl w-full" />
              </div>
            ) : easyInfo ? (
              <>
                <p className="text-sm text-gray-700 leading-relaxed">{easyInfo.what}</p>

                {easyInfo.benefits?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-navy uppercase tracking-wider mb-2.5">
                      내가 받을 수 있는 혜택
                    </p>
                    <div className="space-y-2">
                      {easyInfo.benefits.map((b, i) => (
                        <div key={i} className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                          <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                            ✓
                          </span>
                          <span className="text-sm font-semibold text-gray-800">{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {easyInfo.caution && (
                  <div className="mt-3 flex items-start gap-2 bg-sunset-orange/8 border border-sunset-orange/20 rounded-xl px-3 py-2.5">
                    <span className="text-sunset-orange text-sm flex-shrink-0 mt-px">⚠</span>
                    <p className="text-xs text-gray-700 leading-relaxed">{easyInfo.caution}</p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>


        {/* 나와의 매칭 분석 */}
        {(() => {
          const conds   = (item.condition_results ?? []).filter(c => c.status !== '대상아님')
          const metList = conds.filter(c => c.status === '충족')
          const chkList = conds.filter(c => c.status === '확인필요')
          const notList = conds.filter(c => c.status === '불충족')
          const expl    = matchExplanation(item)
          if (conds.length === 0) return null

          const scoreNum = item.match_score
          const scoreBar = scoreNum != null
            ? Math.min(100, Math.max(0, scoreNum))
            : null

          const GROUPS = [
            { list: metList, key: '충족' },
            { list: chkList, key: '확인필요' },
            { list: notList, key: '불충족' },
          ].filter(g => g.list.length > 0)

          return (
            <Section title="나와의 매칭 분석">
              {/* 점수 + 상태 헤더 */}
              <div className={`${BOX} mb-3`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-warm-text uppercase tracking-wider mb-1.5">
                      종합 판정
                    </p>
                    <StatusPill status={item.overall_status} />
                  </div>
                  {scoreBar != null && (
                    <div className="text-right">
                      <p className="text-3xl font-extrabold text-navy leading-none">{scoreNum}</p>
                      <p className="text-[10px] text-warm-text mt-0.5">매칭 점수</p>
                    </div>
                  )}
                </div>
                {scoreBar != null && (
                  <div className="h-2 bg-warm-gray/15 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${scoreBar}%`,
                        background: scoreBar >= 70
                          ? 'linear-gradient(to right, #2a3c77, #059669)'
                          : scoreBar >= 50
                          ? 'linear-gradient(to right, #2a3c77, #cb6b3d)'
                          : 'linear-gradient(to right, #2a3c77, #ef4444)',
                      }}
                    />
                  </div>
                )}
                {/* 충족/확인/미충족 요약 칩 */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {metList.length > 0 && (
                    <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      ✓ 충족 {metList.length}개
                    </span>
                  )}
                  {chkList.length > 0 && (
                    <span className="text-[11px] font-semibold bg-orange-100 text-sunset-orange px-2 py-0.5 rounded-full">
                      ! 확인필요 {chkList.length}개
                    </span>
                  )}
                  {notList.length > 0 && (
                    <span className="text-[11px] font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                      ✕ 미충족 {notList.length}개
                    </span>
                  )}
                </div>
              </div>

              {/* 조건별 그룹 */}
              <div className={`${BOX} space-y-4`}>
                {GROUPS.map(({ list, key }) => {
                  const s = COND_STYLE[key]
                  return (
                    <div key={key}>
                      <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${s.labelColor}`}>
                        {s.label} ({list.length}개)
                      </p>
                      <div className="space-y-2">
                        {list.map((c, i) => (
                          <div key={i} className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${s.rowBg}`}>
                            <span className={[
                              'w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center',
                              'text-[11px] font-bold text-white mt-0.5',
                              s.bg,
                            ].join(' ')}>
                              {s.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              {c.label && (
                                <p className={`text-[10px] font-bold mb-0.5 ${s.labelColor}`}>{c.label}</p>
                              )}
                              <p className="text-sm text-gray-700 leading-relaxed">{c.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* 추천 이유 설명 */}
                {expl && (
                  <div className="border-t border-warm-gray/20 pt-3">
                    <p className="text-[10px] font-bold text-warm-text uppercase tracking-wider mb-1">
                      왜 이 공고를 추천했나요?
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed">{expl}</p>
                  </div>
                )}
              </div>
            </Section>
          )
        })()}

        {/* 서류 — 어디서 어떻게 떼는지까지 */}
        {docs.length > 0 && (
          <Section title="필요한 서류">
            <div className={BOX}>
              {docs.map((d, i) => (
                <div key={d.name} className={`py-2.5 ${i > 0 ? 'border-t border-warm-gray/20' : ''}`}>
                  <p className="text-sm font-semibold text-navy">{cleanDocName(d.name).name}</p>
                  {d.easy && <p className="text-xs text-warm-text mt-0.5 leading-relaxed">{toFriendly(d.easy)}</p>}
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
                <span className="text-sm font-medium text-navy text-right min-w-0 break-words">{value}</span>
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
      <div className="fixed bottom-0 left-0 right-0 bg-primary-bg/95 backdrop-blur border-t border-warm-gray/30 px-4 py-3">
        {/* 전에는 두 버튼이 fullWidth + flex-1 이라 바 절반씩을 통째로
            차지했다. 넓은 화면에서 가로로만 길고 납작한 띠 두 개가 되어
            버튼처럼 보이지 않았다. 글자 크기에 맞춰 폭을 줄이고 높이를
            키워서 비율을 되돌린다. 좁은 화면에서는 손가락이 닿을 면적이
            필요하니 예전처럼 반씩 나눠 채운다. */}
        <div className="max-w-2xl mx-auto flex flex-col gap-2
                        sm:flex-row sm:items-center sm:justify-between">
          {item.source_url ? (
            <a href={item.source_url} target="_blank" rel="noreferrer"
               className="text-sm text-warm-text hover:text-navy underline underline-offset-4
                          decoration-warm-gray/50 self-start sm:self-auto px-1">
              공고문 원문 보기 →
            </a>
          ) : <span />}

          <div className="flex gap-2.5 sm:flex-shrink-0">
            <Button
              variant="outline" size="md" className="flex-1 sm:flex-none sm:px-6"
              onClick={() => {
                localStorage.setItem('mars-fit-selected-match', JSON.stringify(item))
                navigate('/apply')
              }}
            >
              서류 준비하기
            </Button>
            {item.apply_url ? (
              <a href={item.apply_url} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none">
                <Button variant="sunset-orange" size="md" fullWidth className="sm:w-auto sm:px-6">
                  신청하러 가기
                </Button>
              </a>
            ) : (
              <Button variant="sunset-orange" size="md" disabled className="flex-1 sm:flex-none sm:px-6">
                {item.apply_method ? '문의처로 접수' : '접수처 확인 필요'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

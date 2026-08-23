import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, FileText, MapPin, ChevronRight, ChevronDown,
  AlertTriangle, ExternalLink, Pencil, Lock,
} from 'lucide-react'
import Header from '../components/layout/Header'
import CommercialAnalysisView from '../components/sections/CommercialAnalysisView'
import { useNavigate } from 'react-router-dom'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'
import { taxSchedule, holidaysKnown } from '../utils/taxSchedule'
import { nextTaxDeadline } from '../utils/taxCalendar'
import { todayISO } from '../utils/today'
import calendar from '../data/tax_calendar.json'
import TaxProfileHint from '../components/ui/TaxProfileHint'
// 세무 한 줄과 날짜 표기는 달력 화면과 같은 것을 쓴다. 여기에만 있던
// 시절에는 /schedule 에서 같은 신고를 봐도 제목과 D-day 뿐이었다.
import TaxRow, { korDate, dDay, dDayLabel, MovedNote } from '../components/ui/TaxRow'
import { listTaxDone, subscribeTaxDone, taxDoneKey } from '../utils/taxDone'

/**
 * 내 매장 현황.
 *
 * **이 화면에는 출처 없는 숫자를 두지 않는다.**
 * 전에는 매출 3,650만원 · 재방문율 38% · 별점 4.3 · 업종 내 상위 28% 를
 * 그렸는데 전부 지어낸 값이었다. POS 도 카드매출도 연동한 적이 없다.
 * 하단에 "목업" 이라고 적어둬도, 그 한 줄을 읽은 사람은 이 서비스의 다른
 * 숫자까지 의심하게 된다. 그래서 지웠다.
 *
 * 지금 여기 있는 것은 셋 다 실제 값이다.
 *   1. 프로필     — 사장님이 온보딩에서 직접 답한 것
 *   2. 세무일정   — 국세청 원문으로 대조한 14건 (tax_calendar.json)
 *   3. 지원사업   — /api/match 가 돌려준 실제 공고 판정
 *
 * 매출 분석을 넣고 싶으면 POS 나 카드매출을 실제로 연동한 뒤에 넣을 것.
 *
 * 사업자가 아닌 사람에게 보이는 상권분석 화면은
 * components/sections/CommercialAnalysisView.jsx 에 있다.
 */

// ── 공통 조각 ────────────────────────────────────────────────────

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-warm-gray/20 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ children, sub }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-bold text-navy">{children}</h2>
      {sub && <p className="text-[12px] text-warm-text mt-0.5 leading-relaxed">{sub}</p>}
    </div>
  )
}

// ── 프로필 요약 ──────────────────────────────────────────────────

function ProfileCard({ profile, onEdit }) {
  const chips = [
    profile?.category,
    profile?.region,
    profile?.business_status,
    profile?.business_period_months ? `영업 ${profile.business_period_months}개월째` : null,
    profile?.entity_type,
    profile?.vat_type,
    profile?.has_employee === true ? '직원 있음'
      : profile?.has_employee === false ? '혼자 운영' : null,
  ].filter(Boolean)

  // 세무일정을 거르는 데 쓰는 답이 빠져 있으면, 해당 없는 일정까지 다 보인다.
  const missing = ['entity_type', 'vat_type'].filter(k => !profile?.[k]).length
    + (profile?.has_employee == null ? 1 : 0)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <SectionTitle sub="온보딩에서 답해주신 내용이에요">내 정보</SectionTitle>
        <button onClick={onEdit}
          className="flex items-center gap-1 text-[12px] text-navy font-semibold flex-shrink-0">
          <Pencil size={10} /> 고치기
        </button>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(c => (
            <span key={c} className="text-[13px] font-medium text-navy bg-primary-bg rounded-full px-2.5 py-1">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-warm-text">아직 알려주신 게 없어요.</p>
      )}

      {missing > 0 && (
        <div className="mt-3 flex items-start gap-2 bg-sunset-orange/5 rounded-xl px-3 py-2.5">
          <AlertTriangle size={12} className="text-sunset-orange mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-warm-text leading-relaxed">
            세무 질문 {missing}개를 아직 안 하셨어요. 모른다고 빼버리면 해야 할 신고를
            통째로 놓칠 수 있어서, <b className="text-navy">일단 다 보여드리고 있어요.</b>{' '}
            <button onClick={onEdit} className="text-navy font-semibold underline underline-offset-2">
              답해주시면
            </button>{' '}
            해당되는 것만 남습니다.
          </p>
        </div>
      )}
    </Card>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────

export default function MyStore() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [matches, setMatches] = useState(null)   // null = 아직 안 옴
  const [failed, setFailed]   = useState(false)
  const [openId, setOpenId]   = useState(null)
  const [showIf, setShowIf]     = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [doneMap, setDoneMap]   = useState(listTaxDone)

  useEffect(() => subscribeTaxDone(() => setDoneMap(listTaxDone())), [])

  useEffect(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('mars-fit-profile')) } catch { return null }
    })()
    setProfile(saved)

    fetchMatches(saved ?? DEFAULT_PROFILE)
      .then(r => setMatches(r?.results ?? []))
      .catch(() => setFailed(true))
  }, [])

  // 브라우저 시간대가 아니라 한국 날짜로 자른다. 자정 근처에 하루가
  // 어긋나면 지난 신고가 남은 신고로 보인다.
  const today = todayISO()
  const year  = Number(today.slice(0, 4))

  // holidaysKnown 은 import 한 함수와 이름이 겹친다. 그대로 구조분해하면
  // 함수가 불리언으로 덮여서 아래 호출이 터진다. 이름을 갈라둔다.
  const { mustDo, ifApplicable, holidaysKnown: thisYearKnown } = useMemo(
    () => taxSchedule(profile, year), [profile, year],
  )
  const next = useMemo(() => nextTaxDeadline(profile), [profile])

  // 지난 신고와 남은 신고를 나눈다. 섞어 놓으면 건수가 사장님에게 거짓말을
  // 한다. 8월에 열면 「반드시 해야 하는 것 5건」인데 그 중 4건이 이미
  // 지난 것이고 실제로 챙길 건 하나뿐이었다.
  //
  // 원천세는 「매월 10일」이라 dueDate 가 없다. 지난 것도 남은 것도 아니고
  // 늘 다음 달이 온다. undefined 는 두 비교에서 다 false 라, 그냥 두면
  // 어느 목록에도 안 들어가서 화면에서 통째로 사라진다.
  const past  = useMemo(() => mustDo.filter(e => e.dueDate && e.dueDate < today), [mustDo, today])
  const left  = useMemo(() => mustDo.filter(e => !e.dueDate || e.dueDate >= today), [mustDo, today])

  // 올해 남은 게 없으면 내년으로 넘긴다. 11월부터는 남은 게 0건인데 지난
  // 5건만 떠 있고, 정작 다음에 할 신고는 목록 어디에도 없었다.
  // 날짜가 있는 게 하나도 안 남았으면 넘긴다. left.length 로 재면 매월
  // 반복이 늘 하나 들어 있어서 12월에도 안 넘어간다.
  const rolled = left.every(e => !e.dueDate)
  const nextYr = useMemo(
    () => (rolled ? taxSchedule(profile, year + 1) : null), [rolled, profile, year],
  )
  const upcoming  = rolled ? nextYr.mustDo        : left
  const optional  = rolled ? nextYr.ifApplicable  : ifApplicable
  const listYear  = rolled ? year + 1 : year
  const listKnown = rolled ? nextYr.holidaysKnown : thisYearKnown

  // 공고 판정 집계. 대상아님은 애초에 세지 않는다.
  const counts = useMemo(() => {
    if (!matches) return null
    const live = matches.filter(r => r.overall_status !== '대상아님')
    const soon = live.filter(r => {
      const n = dDay(r.apply_period?.end)
      return r.application_status === '접수중' && n != null && n >= 0 && n <= 14
    })
    // 숫자만 보여주면 뭘 먼저 해야 할지 모른다. 제일 급한 한 건을 집어준다.
    const upcoming = live
      .filter(r => {
        const n = dDay(r.apply_period?.end)
        return r.application_status === '접수중' && n != null && n >= 0
      })
      .sort((a, b) => dDay(a.apply_period?.end) - dDay(b.apply_period?.end))

    return {
      total:   live.length,
      can:     live.filter(r => r.overall_status === '신청가능').length,
      maybe:   live.filter(r => r.overall_status === '조건부').length,
      check:   live.filter(r => r.overall_status === '확인필요').length,
      soon:    soon.length,
      nearest: upcoming[0] ?? null,
    }
  }, [matches])

  const nextN = next ? dDay(next.dueDate) : null
  const isOwner = profile?.business_status === '운영중'

  return (
    <div className="min-h-screen bg-primary-bg pb-24">
      <Header />

      <div className="max-w-4xl mx-auto px-5 pt-4 pb-2 lg:max-w-6xl lg:pt-6">
        <h1 className="text-lg font-extrabold text-navy">
          {isOwner ? '내 매장 현황' : '상권 분석'}
        </h1>
        <p className="text-xs text-warm-text mt-0.5">
          {isOwner
            ? '챙겨야 할 신고와 받을 수 있는 지원사업을 한 곳에 모았어요'
            : '화성시 주요 상권 현황과 업종별 경쟁 밀도를 확인해보세요'}
        </p>
      </div>

      {!isOwner && <CommercialAnalysisView profile={profile} />}

      {isOwner && <div className="max-w-4xl mx-auto px-5 space-y-5
                                  lg:max-w-6xl lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]
                                  lg:gap-5 lg:items-start">

        {/* ── 왼쪽: 세무 ── */}
        <div className="space-y-5">

        {/* ① 프로필 */}
        <ProfileCard profile={profile} onEdit={() => navigate('/onboarding')} />

        {/* 사업자 형태·과세유형을 안 정하면 아래 목록에 해당될 수 있는 게
            전부 뜬다. 법인세와 종합소득세가 같이 뜨는 식이다. */}
        <TaxProfileHint profile={profile} />

        {/* ② 다음 세무일정 — 이 화면에서 제일 급한 것 */}
        {next && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock size={14} className="text-sunset-orange" />
              <h2 className="text-sm font-bold text-navy">다음 세무일정</h2>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-extrabold text-navy leading-snug">{next.title}</p>
                <p className="text-xs text-warm-text mt-1">{korDate(next.dueDate)}</p>
                {next.moved && <MovedNote legal={next.due} actual={next.dueDate} />}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-2xl font-extrabold leading-none ${
                  nextN != null && nextN <= 14 ? 'text-sunset-orange' : 'text-navy'
                }`}>
                  {dDayLabel(nextN)}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-gray-700 leading-relaxed mt-3 bg-primary-bg rounded-xl px-3 py-2.5">
              {next.easy}
            </p>

            {/* 다음 일정이 내년으로 넘어갔는데 그 해 공휴일을 안 적어뒀으면
                주말만 반영된 날짜다. 틀린 날을 확정처럼 보여주면 안 된다. */}
            {next.dueDate && !holidaysKnown(Number(next.dueDate.slice(0, 4))) && (
              <div className="mt-2 flex items-start gap-2 bg-sunset-orange/5 rounded-xl px-3 py-2.5">
                <AlertTriangle size={12} className="text-sunset-orange mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-warm-text leading-relaxed">
                  {next.dueDate.slice(0, 4)}년 공휴일이 아직 등록되지 않아 주말만 반영된
                  날짜예요. 연말에 확인해 주세요.
                </p>
              </div>
            )}
          </Card>
        )}

        {/* ③ 앞으로 챙길 신고 */}
        <Card className="p-4">
          <SectionTitle sub={`${listYear}년 · 사장님께 해당되는 것만 골랐어요`}>
            앞으로 챙길 신고
          </SectionTitle>

          {upcoming.length > 0 ? (
            <>
              <p className="text-[10px] font-bold text-navy mb-1">
                반드시 해야 하는 것 {upcoming.length}건
                {rolled && (
                  <span className="font-normal text-warm-text"> · {year}년 것은 다 지났어요</span>
                )}
              </p>
              <div className="mb-1">
                {upcoming.map(e => (
                  <TaxRow key={`u${e.id}`} item={e} done={Boolean(doneMap[taxDoneKey(e.id, e.dueDate)])} open={openId === `u${e.id}`}
                    onToggle={() => setOpenId(openId === `u${e.id}` ? null : `u${e.id}`)} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-warm-text py-2">해당되는 신고가 없어요.</p>
          )}

          {/* 올해 지난 것 — 접어서 남긴다. 아예 지우면 「내가 저걸 했던가」를
              확인할 데가 없어진다. 다만 남은 신고와 같은 목록에 두지는 않는다.
              섞어 놓으면 위의 건수가 사장님에게 거짓말을 한다. */}
          {past.length > 0 && (
            <div className="mt-3 pt-3 border-t border-warm-gray/15">
              <button onClick={() => setShowPast(v => !v)}
                className="w-full flex items-center justify-between text-left">
                <span className="text-[10px] font-bold text-warm-text">
                  {year}년에 지난 것 {past.length}건
                </span>
                <ChevronDown size={14}
                  className={`text-warm-gray transition-transform ${showPast ? 'rotate-180' : ''}`} />
              </button>

              {showPast && (
                <div className="mt-1 opacity-70">
                  {past.map(e => (
                    <TaxRow key={`p${e.id}`} item={e} done={Boolean(doneMap[taxDoneKey(e.id, e.dueDate)])} open={openId === `p${e.id}`}
                      onToggle={() => setOpenId(openId === `p${e.id}` ? null : `p${e.id}`)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 해당되면 이것도 — 반드시 따로 그린다.
              섞으면 종합소득세가 5월·6월 두 번 뜨고 원천세가 매월·반기 둘 다 뜬다. */}
          {optional.length > 0 && (
            <div className="mt-3 pt-3 border-t border-warm-gray/15">
              <button onClick={() => setShowIf(v => !v)}
                className="w-full flex items-center justify-between text-left">
                <span className="text-[10px] font-bold text-warm-text">
                  해당되면 이것도 {optional.length}건
                </span>
                <ChevronDown size={14}
                  className={`text-warm-gray transition-transform ${showIf ? 'rotate-180' : ''}`} />
              </button>

              {showIf && (
                <div className="mt-1">
                  <p className="text-[10px] text-warm-text leading-relaxed mb-2">
                    답해주신 것만으로는 해당되는지 알 수 없는 신고예요. 조건을 읽어보고
                    본인 얘기면 챙기세요.
                  </p>
                  {optional.map(e => (
                    <div key={`o${e.id}`}>
                      <p className="text-[10px] text-sunset-orange pt-2">{e.conditional}</p>
                      <TaxRow item={e} done={Boolean(doneMap[taxDoneKey(e.id, e.dueDate)])} open={openId === `o${e.id}`}
                        onToggle={() => setOpenId(openId === `o${e.id}` ? null : `o${e.id}`)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!listKnown && (
            <div className="mt-3 flex items-start gap-2 bg-sunset-orange/5 rounded-xl px-3 py-2.5">
              <AlertTriangle size={12} className="text-sunset-orange mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-warm-text leading-relaxed">
                {listYear}년 공휴일이 아직 등록되지 않아 주말만 반영된 날짜예요.
                설·추석은 음력이라 자동 계산이 안 됩니다.
              </p>
            </div>
          )}
        </Card>

        </div>

        {/* ── 오른쪽: 지원사업과 안내 ── */}
        <div className="space-y-5">

        {/* ④ 내 지원사업 */}
        <Card className="p-4">
          <SectionTitle sub="지금 열려 있는 공고를 사장님 조건으로 판정한 결과예요">
            내 지원사업
          </SectionTitle>

          {failed ? (
            <p className="text-[11px] text-warm-text py-2">
              공고를 불러오지 못했어요. 잠시 뒤 다시 열어주세요.
            </p>
          ) : !counts ? (
            <div className="grid grid-cols-3 gap-2 animate-pulse">
              {[0, 1, 2].map(i => <div key={i} className="h-14 bg-warm-gray/15 rounded-xl" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '신청가능', value: counts.can,   color: 'text-emerald-600' },
                  { label: '조건부',   value: counts.maybe, color: 'text-sunset-orange' },
                  { label: '확인필요', value: counts.check, color: 'text-warm-text' },
                ].map(d => (
                  <div key={d.label} className="bg-primary-bg rounded-xl py-3 text-center">
                    <p className={`text-xl font-extrabold leading-none ${d.color}`}>{d.value}</p>
                    <p className="text-[10px] text-warm-text mt-1">{d.label}</p>
                  </div>
                ))}
              </div>

              {counts.nearest && (
                <button
                  onClick={() => {
                    localStorage.setItem('mars-fit-selected-match', JSON.stringify(counts.nearest))
                    navigate('/notice')
                  }}
                  className="mt-3 w-full flex items-center gap-3 text-left bg-primary-bg
                             rounded-xl px-3 py-2.5 hover:bg-warm-gray/20 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-warm-text">가장 먼저 마감돼요</p>
                    <p className="text-xs font-semibold text-navy truncate mt-0.5">
                      {counts.nearest.notice_title}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-sunset-orange flex-shrink-0">
                    {dDayLabel(dDay(counts.nearest.apply_period?.end))}
                  </span>
                  <ChevronRight size={14} className="text-warm-gray flex-shrink-0" />
                </button>
              )}

              {counts.soon > 0 && (
                <p className="text-[11px] text-sunset-orange font-semibold mt-2">
                  2주 안에 마감되는 공고가 {counts.soon}건 있어요
                </p>
              )}

              <button
                onClick={() => navigate('/home')}
                className="mt-3 w-full flex items-center justify-center gap-1
                           text-xs text-navy font-semibold py-2.5 rounded-xl
                           bg-primary-bg hover:bg-warm-gray/20 transition-colors"
              >
                공고 {counts.total}건 보러가기 <ChevronRight size={14} />
              </button>
            </>
          )}
        </Card>

        {/* ⑤ 아직 못 채운 것.
            비워둔 자리를 숨기면 "기능이 없다" 로 보이고, 가짜 숫자로 채우면
            나머지 숫자까지 의심받는다. 그래서 이름만 걸어두고 무엇이 있어야
            열리는지 적는다. 여기에는 숫자를 한 개도 쓰지 않는다. */}
        <Card className="p-4">
          <SectionTitle sub="지어낸 숫자로 채우지 않고 비워뒀어요">
            아직 못 보여드리는 것
          </SectionTitle>

          <div className="space-y-2.5">
            {[
              { name: '매출 · 방문자 · 객단가 추이', need: 'POS 또는 카드매출을 연결해야 알 수 있어요. 사업자등록증에는 매출이 적혀 있지 않아요.' },
              { name: '재방문율 · 단골 비중',        need: 'POS 연결이 필요해요' },
              { name: '별점 · 리뷰',                 need: '네이버·카카오 플레이스 연결이 필요해요' },
              { name: '주변 동종업체 · 신규개업 · 폐업', need: '지자체 인허가 공공데이터를 붙이면 열려요' },
              { name: '업종 내 내 매출 위치',        need: '업종별 매출 통계가 있어야 계산돼요' },
              { name: '받은 지원금 이력',            need: '신청 기록 기능이 열리면 자동으로 쌓여요' },
              { name: '사업자등록증으로 자동 입력',  need: 'OCR 등록 시 과세유형·개업일을 자동으로 채워요. 지금은 온보딩에서 직접 여쭤보고 있어요.' },
            ].map(f => (
              <div key={f.name} className="flex items-start gap-2.5">
                <Lock size={11} className="text-warm-gray mt-1 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-warm-text">{f.name}</p>
                  <p className="text-[10px] text-warm-text/70 leading-relaxed mt-0.5">{f.need}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ⑥ 출처 */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={12} className="text-warm-text" />
            <h2 className="text-[11px] font-bold text-navy">이 화면의 숫자는 어디서 왔나</h2>
          </div>

          <ul className="space-y-1.5 text-[10px] text-warm-text leading-relaxed">
            <li className="flex gap-1.5">
              <MapPin size={10} className="mt-0.5 flex-shrink-0" />
              <span>내 정보 — 온보딩에서 직접 답해주신 내용</span>
            </li>
            <li className="flex gap-1.5">
              <CalendarClock size={10} className="mt-0.5 flex-shrink-0" />
              <span>
                세무일정 {calendar.events.length}건 — 국세청 원문으로 전부 대조했어요
                (기준 {calendar.version}). 신고기한이 공휴일·토요일이면 다음 날로
                밀리는 규칙까지 계산해서 보여드려요.
              </span>
            </li>
            <li className="flex gap-1.5">
              <FileText size={10} className="mt-0.5 flex-shrink-0" />
              <span>지원사업 — 기업마당 공고 원문을 매일 새벽에 새로 받아옵니다</span>
            </li>
          </ul>

          <a
            href="https://www.nts.go.kr/nts/ad/taxSchdul/selectList.do"
            target="_blank" rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[10px] text-navy font-semibold
                       underline underline-offset-2"
          >
            국세청 세무일정 원문 확인 <ExternalLink size={9} />
          </a>
        </Card>

        </div>

      </div>}

    </div>
  )
}

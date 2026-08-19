import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import MarsGreeting from '../components/sections/MarsGreeting'
import OrbitDashboard from '../components/sections/OrbitDashboard'
import FloatingChatButton from '../components/ui/FloatingChatButton'
import DeadlineCalendar from '../components/ui/DeadlineCalendar'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'

/* ── 유틸 ───────────────────────────────────────── */

function calcDDay(end) {
  if (!end) return null
  return Math.ceil((new Date(end) - new Date()) / 86400000)
}

function mapMatch(r) {
  return {
    id:        r.notice_id,
    title:     r.notice_title,
    summary:   r.summary   ?? null,
    organizer: r.organizer ?? null,
    status:    r.overall_status,
    score:     r.match_score,
    dDay:      calcDDay(r.apply_period?.end),
    applyUrl:  r.apply_url ?? null,
    appStatus: r.application_status,
    raw:       r,
  }
}

/** 온보딩 유형 결정
 *  1 = 운영중 (사업 소유주)
 *  2 = 예비창업자 — 업종 확정
 *  3 = 예비창업자 — 탐색 단계
 */
function getRole(p) {
  if (p?.business_status === '운영중') return 1
  if (p?.category) return 2
  return 3
}

/** 미입력 항목 레이블 목록 */
function getMissing(p) {
  return [
    ['age',               '나이'],
    ['region',            '지역'],
    ['career_experience', '창업 경험'],
    ['asset_group',       '소득 분위'],
  ].filter(([k]) => !p?.[k]).map(([, l]) => l)
}

/* ── 프로필 칩 ──────────────────────────────────── */

function ProfileChips({ profile, onEdit }) {
  const chips = [
    profile.region                 && { label: `📍 ${profile.region}`,                        field: 'region' },
    profile.category               && { label: `🏷 ${profile.category}`,                       field: 'category' },
    profile.age                    && { label: `${profile.age}세`,                             field: 'age' },
    profile.business_period_months && { label: `${profile.business_period_months}개월 운영`,   field: 'business_period_months' },
  ].filter(Boolean)

  if (!chips.length) return null
  return (
    <div className="px-5 pb-5 flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <button key={i}
          onClick={() => onEdit(c.field)}
          className="text-xs bg-white border border-warm-gray/30 text-navy rounded-full
                     px-3 py-1.5 font-medium hover:border-navy/50 hover:shadow-sm transition-all">
          {c.label} <span className="text-warm-gray ml-0.5">✎</span>
        </button>
      ))}
    </div>
  )
}

/* ── 프로필 인라인 편집 드로어 ───────────────────── */

const EDIT_CONFIG = {
  region: {
    title: '지역을 변경할게요',
    type: 'choice',
    options: [
      { value: '화성시', label: '화성시',        emoji: '📍' },
      { value: '경기도', label: '경기도 (화성시 외)', emoji: '🗺' },
      { value: '타지역', label: '그 외 지역',    emoji: '✈️' },
    ],
  },
  category: {
    title: '업종을 변경할게요',
    type: 'choice',
    options: [
      { value: '카페',   label: '카페·음료·디저트', emoji: '☕' },
      { value: '음식점', label: '식당·밥집·분식',   emoji: '🍜' },
      { value: '소매업', label: '소매·판매',        emoji: '🛍' },
      { value: '기타',   label: '기타',            emoji: '🎨' },
    ],
  },
  age: {
    title: '나이를 변경할게요',
    type: 'age',
  },
  business_period_months: {
    title: '운영 기간을 변경할게요',
    type: 'number',
    unit: '개월',
    min: 0,
    max: 600,
  },
}

function ProfileEditDrawer({ field, profile, onSave, onClose }) {
  const config = EDIT_CONFIG[field]
  const [draft, setDraft] = useState(profile?.[field] ?? '')
  if (!config) return null

  function confirm(value) { onSave(field, value) }

  return (
    <>
      {/* 딤 */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* 시트 */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-4xl mx-auto"
           style={{ animation: 'slideUp 0.22s ease' }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

        {/* 헤더 */}
        <div className="px-5 pt-4 pb-4 border-b border-warm-gray/20">
          <div className="w-10 h-1 bg-warm-gray/40 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-navy">{config.title}</h3>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-warm-gray/15 flex items-center justify-center
                         text-warm-text hover:bg-warm-gray/30 transition-colors text-sm">
              ✕
            </button>
          </div>
        </div>

        <div className="px-5 py-5">
          {/* 선택지 */}
          {config.type === 'choice' && (
            <div className="flex flex-col gap-2">
              {config.options.map(opt => (
                <button key={opt.value}
                  onClick={() => confirm(opt.value)}
                  className={[
                    'flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all',
                    String(draft) === opt.value
                      ? 'border-navy bg-navy/5'
                      : 'border-warm-gray/30 bg-white hover:border-navy/40 hover:shadow-sm',
                  ].join(' ')}>
                  <span className="text-xl flex-shrink-0">{opt.emoji}</span>
                  <span className={`text-sm font-semibold flex-1
                    ${String(draft) === opt.value ? 'text-navy' : 'text-gray-700'}`}>
                    {opt.label}
                  </span>
                  {String(draft) === opt.value && <span className="text-navy text-sm flex-shrink-0">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* 나이 */}
          {config.type === 'age' && (
            <>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[['20대', 25], ['30대', 35], ['40대', 45], ['50대+', 55]].map(([label, val]) => (
                  <button key={label}
                    onClick={() => setDraft(val)}
                    className={[
                      'py-3 rounded-xl border-2 text-sm font-semibold transition-all',
                      draft === val
                        ? 'border-navy bg-navy/5 text-navy'
                        : 'border-warm-gray/30 bg-white text-gray-700 hover:border-navy/40',
                    ].join(' ')}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-5">
                <input type="number" min="10" max="99"
                  value={typeof draft === 'number' && ![25, 35, 45, 55].includes(draft) ? draft : ''}
                  onChange={e => setDraft(Number(e.target.value))}
                  placeholder="직접 입력"
                  className="flex-1 border border-warm-gray/50 rounded-xl px-3 py-2.5 text-sm text-navy
                             focus:outline-none focus:border-navy/50" />
                <span className="text-sm text-gray-600 flex-shrink-0">세</span>
              </div>
              <button onClick={() => confirm(draft)} disabled={!draft}
                className="w-full py-3.5 rounded-2xl bg-navy text-white text-sm font-bold
                           disabled:opacity-40 disabled:pointer-events-none">
                저장
              </button>
            </>
          )}

          {/* 숫자 입력 (운영 기간 등) */}
          {config.type === 'number' && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <input type="number"
                  min={config.min ?? 0} max={config.max ?? 9999}
                  value={draft}
                  onChange={e => setDraft(Number(e.target.value))}
                  placeholder="숫자 입력"
                  className="flex-1 border border-warm-gray/50 rounded-xl px-4 py-3 text-base
                             text-navy focus:outline-none focus:border-navy/50" />
                <span className="text-sm text-gray-600 flex-shrink-0">{config.unit}</span>
              </div>
              <button onClick={() => confirm(draft)}
                disabled={draft === '' || draft === null || draft === undefined}
                className="w-full py-3.5 rounded-2xl bg-navy text-white text-sm font-bold
                           disabled:opacity-40 disabled:pointer-events-none">
                저장
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/* ── 유형 1: 사업 소유주 ────────────────────────── */

function BusinessOwnerSection({ profile }) {
  const months   = profile.business_period_months || 0
  const category = profile.category || '업종'
  const region   = profile.region   || '화성시'

  return (
    <section className="px-5 mb-6">
      {/* 운영 기간 뱃지 */}
      {months > 0 && (
        <div className="inline-flex items-center gap-2 bg-sunset-orange/10 border border-sunset-orange/20
                        rounded-full px-4 py-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-sunset-orange animate-pulse flex-shrink-0" />
          <span className="text-sm font-bold text-sunset-orange">개업 후 {months}개월 운영 중</span>
        </div>
      )}

      {/* 내 상권 현황 */}
      <h3 className="text-sm font-bold text-navy mb-2">내 상권 현황</h3>
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: '🏪', top: `${region} 동종업종`, mid: `${category} 87개`,  sub: '내 상권 기준' },
          { icon: '👥', top: '주간 유동인구',       mid: '1,200명',           sub: '동탄2 평균'  },
          { icon: '🏆', top: '지원 수혜 사례',      mid: '평균 3개월',        sub: '신청→수령'   },
        ].map((d, i) => (
          <div key={i}
            className="bg-white border border-warm-gray/20 rounded-2xl p-3 text-center shadow-sm">
            <span className="text-2xl">{d.icon}</span>
            <p className="text-[12px] text-warm-text mt-1 leading-tight">{d.top}</p>
            <p className="text-xs font-bold text-navy mt-0.5">{d.mid}</p>
            <p className="text-[13px] text-warm-text/70 mt-0.5">{d.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── 유형 2: 예비창업자 (구상 있음) ─────────────── */

const ORBIT_STEPS = ['업종 확정', '지원사업 선택', '서류 준비', '신청 완료']

function StartupPlannerSection({ profile }) {
  const step = profile.category ? 1 : 0

  return (
    <section className="px-5 mb-6 space-y-4">
      {/* 청년·초기창업자 전용 강조 카드 */}
      <div className="bg-navy rounded-2xl p-4">
        <span className="inline-block text-xs bg-white/20 text-white rounded-full
                         px-2.5 py-0.5 font-semibold">
          청년·초기창업자 전용
        </span>
        <p className="text-lg font-bold text-white mt-2 leading-snug">
          초기 창업비<br />최대 500만원 지원
        </p>
        <p className="text-xs text-white/60 mt-1.5">
          {profile.category || '관심 업종'} · 화성시 전용 공모 우선 매칭
        </p>
      </div>

      {/* 창업 궤도 스텝 진행 바 */}
      <div className="bg-white border border-warm-gray/20 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-bold text-navy mb-4">창업 궤도 진행 현황</p>
        <div className="relative flex items-center justify-between mb-3">
          {/* 배경 트랙 */}
          <div className="absolute inset-x-3.5 top-3.5 h-0.5 bg-warm-gray/20" />
          {/* 채워진 트랙 */}
          {step > 0 && (
            <div className="absolute top-3.5 h-0.5 bg-navy transition-all duration-700"
                 style={{ left: '14px', width: `calc(${step / (ORBIT_STEPS.length - 1) * 100}% - 28px)` }} />
          )}
          {/* 원 */}
          {ORBIT_STEPS.map((_, i) => (
            <div key={i}
              className={[
                'relative z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center text-[13px] font-bold bg-white',
                i <  step ? 'border-navy bg-navy text-white' :
                i === step ? 'border-navy text-navy' :
                             'border-warm-gray/30 text-warm-text',
              ].join(' ')}>
              {i < step ? '✓' : i + 1}
            </div>
          ))}
        </div>
        {/* 레이블 */}
        <div className="flex justify-between">
          {ORBIT_STEPS.map((s, i) => (
            <p key={i} className={`text-[13px] text-center flex-1 leading-tight
              ${i <= step ? 'text-navy font-semibold' : 'text-warm-text'}`}>
              {s}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── 유형 3: 예비창업자 (탐색) ──────────────────── */

const EXPLORE_CATS = [
  { emoji: '☕', label: '카페'  },
  { emoji: '🍜', label: '음식점' },
  { emoji: '🛍', label: '소매'  },
  { emoji: '📚', label: '교육'  },
  { emoji: '✂️', label: '미용'  },
  { emoji: '🎨', label: '기타'  },
]

function ExplorerSection({ profile, navigate }) {
  const missing = getMissing(profile)

  return (
    <section className="px-5 mb-6 space-y-4">
      {/* 정보 보완 유도 배너 */}
      {missing.length > 0 && (
        <div className="bg-star-yellow/25 border border-star-yellow/50 rounded-2xl p-4">
          <p className="text-sm font-bold text-navy">
            정보를 더 입력하면 맞춤 지원사업이 정확해져요
          </p>
          <p className="text-xs text-warm-text mt-0.5 leading-relaxed">
            미입력 항목: {missing.join(' · ')}
          </p>
          <button onClick={() => navigate('/onboarding')}
            className="mt-2.5 text-xs text-navy font-bold underline underline-offset-2
                       hover:opacity-70 transition-opacity">
            지금 입력하기 →
          </button>
        </div>
      )}

      {/* 관심 분야 탐색 그리드 */}
      <div className="bg-white border border-warm-gray/20 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-bold text-navy mb-3">관심 분야 탐색</p>
        <div className="grid grid-cols-3 gap-2">
          {EXPLORE_CATS.map(c => (
            <div key={c.label}
              className={[
                'flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all',
                profile.category === c.label
                  ? 'bg-navy/5 border-navy'
                  : 'bg-warm-gray/5 border-warm-gray/20',
              ].join(' ')}>
              <span className="text-2xl">{c.emoji}</span>
              <span className={`text-[12px] font-semibold
                ${profile.category === c.label ? 'text-navy' : 'text-warm-text'}`}>
                {c.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── 내가 신청한 사업 섹션 ──────────────────────── */

function AppliedProgramsSection({ programs }) {
  return (
    <section className="px-5 pb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <h2 className="text-sm font-bold text-navy">내가 신청한 사업</h2>
      </div>
      <div className="space-y-3">
        {programs.map(p => (
          <div key={p.notice_id}
            className="bg-white border border-warm-gray/20 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-navy line-clamp-2 leading-snug flex-1">
                {p.notice_title}
              </p>
              <span className="flex-shrink-0 text-xs font-bold text-emerald-600
                               bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                신청 완료
              </span>
            </div>
            {p.organizer && (
              <p className="text-xs text-warm-text mt-1.5">{p.organizer}</p>
            )}
            <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-warm-gray/15">
              <p className="text-[13px] text-warm-text">{p.applied_at} 신청</p>
              {p.apply_period?.end && (
                <p className="text-[13px] text-warm-text">마감 {p.apply_period.end}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── 메인 페이지 ─────────────────────────────────── */

export default function Home() {
  const navigate = useNavigate()

  const [profile,          setProfile]          = useState(null)
  const [allMatches,       setAllMatches]       = useState([])
  const [matchLoading,     setMatchLoading]     = useState(true)
  const [editingField,     setEditingField]     = useState(null)
  const [matchError,       setMatchError]       = useState('')
  const [appliedPrograms,  setAppliedPrograms]  = useState([])

  /* 진입 가드 + 프로필 로드 */
  useEffect(() => {
    const saved = localStorage.getItem('mars-fit-profile')
    if (!saved) { navigate('/onboarding', { replace: true }); return }
    try { setProfile(JSON.parse(saved)) }
    catch { navigate('/onboarding', { replace: true }) }

    try {
      const applied = JSON.parse(localStorage.getItem('mars-fit-applied-programs') ?? '[]')
      setAppliedPrograms(applied)
    } catch {}
  }, [navigate])

  /* 매칭 데이터 한 번만 fetch */
  useEffect(() => {
    if (!profile) return
    setMatchLoading(true)
    setMatchError('')
    fetchMatches(profile ?? DEFAULT_PROFILE)
      .then(({ results }) => {
        setAllMatches(
          results
            .filter(r => r.overall_status !== '대상아님')
            .map(mapMatch)
            .filter(r => r.dDay === null || r.dDay >= 0)
            .sort((a, b) => (a.dDay ?? 999) - (b.dDay ?? 999))
        )
      })
      .catch(err => setMatchError(err?.message || '지원사업을 불러오지 못했어요'))
      .finally(() => setMatchLoading(false))
  }, [profile])

  function handleSave(field, value) {
    const newProfile = { ...profile, [field]: value }
    localStorage.setItem('mars-fit-profile', JSON.stringify(newProfile))
    setProfile(newProfile)
    setEditingField(null)
  }

  if (!profile) return null

  const role = getRole(profile)
  const userName =
    role === 1 ? `${profile.category || ''} 사장님` :
    role === 2 ? `예비 ${profile.category || ''} 창업자님` :
                 '사장님'

  return (
    <div className="min-h-screen bg-primary-bg">
      <Header onAvatarClick={() => navigate('/onboarding')} />

      <main className="max-w-4xl mx-auto">
        {/* 마이다 인사 */}
        <MarsGreeting userName={userName} />

        {/* 프로필 요약 칩 */}
        <ProfileChips profile={profile} onEdit={setEditingField} />

        {/* 유형별 위젯 */}
        {role === 1 && <BusinessOwnerSection profile={profile} />}
        {role === 2 && <StartupPlannerSection profile={profile} />}
        {role === 3 && <ExplorerSection profile={profile} navigate={navigate} />}

        {matchError && (
          <div className="mx-5 mb-3 flex items-start gap-2.5 bg-sunset-orange/5
                          border border-sunset-orange/20 rounded-2xl px-3.5 py-3">
            <span className="text-sunset-orange text-sm leading-none mt-0.5">!</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-navy">지원사업을 불러오지 못했어요</p>
              <p className="text-[12px] text-warm-text mt-0.5 leading-relaxed">{matchError}</p>
            </div>
            <button
              onClick={() => setProfile(p => ({ ...p }))}
              className="text-[12px] font-bold text-navy underline underline-offset-2 flex-shrink-0"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 공통: 지원사업 목록 (pre-fetched 전달로 이중 호출 방지) */}
        <OrbitDashboard
          userProfile={profile}
          prefetchedMatches={allMatches}
          prefetchedLoading={matchLoading}
        />

        {/* 신청한 사업이 있으면 캘린더 대신 표시 */}
        {appliedPrograms.length > 0
          ? <AppliedProgramsSection programs={appliedPrograms} />
          : <DeadlineCalendar matches={allMatches} loading={matchLoading} />
        }
      </main>

      {/* 마이다 FAB */}
      <FloatingChatButton onClick={() => navigate('/mission')} />

      {/* 인라인 프로필 편집 드로어 */}
      {editingField && (
        <ProfileEditDrawer
          field={editingField}
          profile={profile}
          onSave={handleSave}
          onClose={() => setEditingField(null)}
        />
      )}
    </div>
  )
}

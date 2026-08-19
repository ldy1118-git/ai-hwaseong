import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, FileText, MapPin, ChevronRight, ChevronDown,
  AlertTriangle, ExternalLink, Pencil, Lock,
  TrendingUp, TrendingDown, Minus, Users, ShoppingBag, RefreshCw, Star, Info,
} from 'lucide-react'
import Header from '../components/layout/Header'
import { useNavigate } from 'react-router-dom'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'
import { taxSchedule, nextDeadline, holidaysKnown } from '../utils/taxSchedule'
import calendar from '../data/tax_calendar.json'

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
 */

// ── 날짜 유틸 ────────────────────────────────────────────────────

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 'YYYY-MM-DD' → '1월 26일 (월)'.
 * 올해가 아니면 연도를 붙인다. 안 붙이면 내년 1월 일정이 이번 달 것처럼 보인다.
 */
function korDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const y = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}년 `
  return `${y}${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`
}

/** 'MM-DD' → '1/25' */
function shortLegal(due) {
  if (!due || !due.includes('-')) return due
  const [m, d] = due.split('-')
  return `${Number(m)}/${Number(d)}`
}

function dDay(iso, today = new Date()) {
  if (!iso) return null
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = new Date(iso + 'T00:00:00')
  return Math.round((d - t) / 86400000)
}

function dDayLabel(n) {
  if (n == null) return ''
  if (n === 0) return '오늘'
  if (n < 0) return `${-n}일 지남`
  return `D-${n}`
}

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
      {sub && <p className="text-[10px] text-warm-text mt-0.5 leading-relaxed">{sub}</p>}
    </div>
  )
}

/** 법정기한이 휴일이라 밀린 경우에만 붙인다. 안 붙이면 사장님이 하루 늦게 안다. */
function MovedNote({ legal, actual }) {
  return (
    <p className="text-[10px] text-sunset-orange mt-1 leading-relaxed">
      법정기한 {shortLegal(legal)} 이 휴일이라 {korDate(actual)} 로 밀렸어요
    </p>
  )
}

// ── 세무일정 한 줄 ───────────────────────────────────────────────

function TaxRow({ item, open, onToggle }) {
  const n = dDay(item.dueDate)
  const urgent = n != null && n >= 0 && n <= 14

  return (
    <div className="border-b border-warm-gray/10 last:border-0">
      <button onClick={onToggle} className="w-full flex items-center gap-3 py-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-navy">{item.title}</p>
          <p className="text-[10px] text-warm-text mt-0.5">
            {item.recurrence === 'monthly' ? '매월 10일' : korDate(item.dueDate)}
            {item.moved && <span className="text-sunset-orange"> · 밀림</span>}
          </p>
        </div>
        {item.recurrence !== 'monthly' && (
          <span className={`text-[10px] font-bold flex-shrink-0 ${urgent ? 'text-sunset-orange' : 'text-warm-text'}`}>
            {dDayLabel(n)}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-warm-gray flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="pb-3 space-y-2">
          <p className="text-[11px] text-gray-700 leading-relaxed">{item.easy}</p>

          {item.moved && <MovedNote legal={item.due} actual={item.dueDate} />}

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-primary-bg rounded-lg px-2.5 py-2">
              <p className="text-[9px] text-warm-text">어디서</p>
              <p className="text-[11px] font-semibold text-navy mt-0.5">{item.where}</p>
            </div>
            <div className="bg-primary-bg rounded-lg px-2.5 py-2">
              <p className="text-[9px] text-warm-text">기간</p>
              <p className="text-[11px] font-semibold text-navy mt-0.5 leading-snug">{item.covers}</p>
            </div>
          </div>

          {item.docs?.length > 0 && (
            <div>
              <p className="text-[9px] text-warm-text mb-1">준비할 것</p>
              <div className="flex flex-wrap gap-1">
                {item.docs.map(d => (
                  <span key={d} className="text-[10px] text-navy bg-navy/5 rounded-full px-2 py-0.5">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {item.caution && (
            <p className="text-[10px] text-warm-text leading-relaxed bg-warm-gray/10 rounded-lg px-2.5 py-2">
              {item.caution}
            </p>
          )}

          <p className="text-[10px] text-sunset-orange leading-relaxed">
            안 하면 — {item.penalty}
          </p>
          <p className="text-[9px] text-warm-text/70">근거 {item.source}</p>
        </div>
      )}
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
          className="flex items-center gap-1 text-[10px] text-navy font-semibold flex-shrink-0">
          <Pencil size={10} /> 고치기
        </button>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(c => (
            <span key={c} className="text-[11px] font-medium text-navy bg-primary-bg rounded-full px-2.5 py-1">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-warm-text">아직 알려주신 게 없어요.</p>
      )}

      {missing > 0 && (
        <div className="mt-3 flex items-start gap-2 bg-sunset-orange/5 rounded-xl px-3 py-2.5">
          <AlertTriangle size={12} className="text-sunset-orange mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-warm-text leading-relaxed">
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

// ── 상권분석 뷰 (예비창업자·탐색자용, 목업 데이터) ──────────────

const AREA_NAMES = ['동탄2신도시', '향남읍내', '봉담읍내', '남양뉴타운']
const AREA_MONTHS = ['3월', '4월', '5월', '6월', '7월', '8월']

const AREA_DATA = {
  동탄2신도시: {
    traffic:   [28500, 29800, 31200, 32400, 30800, 32000],
    compCount: [198,   203,   210,   215,   212,   218  ],
    rent:      [165,   165,   170,   175,   175,   180  ],
    score: 92, scoreLabel: '창업 유망',
    daily: '일 3.2만명', nearby: 218, rentRange: '월 180만원~',
    newOpen: 8, closed: 3, density: '높음',
    peak: '12~14시', mainAge: '30대 38%',
  },
  향남읍내: {
    traffic:   [12000, 12500, 13100, 14000, 13600, 14200],
    compCount: [88,    91,    92,    94,    93,    95   ],
    rent:      [85,    85,    88,    90,    90,    92   ],
    score: 78, scoreLabel: '성장 중',
    daily: '일 1.4만명', nearby: 95, rentRange: '월 90만원~',
    newOpen: 4, closed: 2, density: '보통',
    peak: '11~13시', mainAge: '40대 41%',
  },
  봉담읍내: {
    traffic:   [9800, 10200, 10500, 11000, 10700, 11200],
    compCount: [54,   55,    57,    58,    57,    59   ],
    rent:      [70,   70,    72,    75,    75,    76   ],
    score: 71, scoreLabel: '진입 기회',
    daily: '일 1.1만명', nearby: 59, rentRange: '월 75만원~',
    newOpen: 2, closed: 1, density: '낮음',
    peak: '12~14시', mainAge: '40대 37%',
  },
  남양뉴타운: {
    traffic:   [7500, 7800,  8200,  8700,  8400,  9000 ],
    compCount: [38,   40,    42,    44,    43,    46   ],
    rent:      [60,   60,    62,    65,    65,    66   ],
    score: 65, scoreLabel: '개발 중',
    daily: '일 0.9만명', nearby: 46, rentRange: '월 65만원~',
    newOpen: 3, closed: 0, density: '낮음',
    peak: '10~12시', mainAge: '30대 32%',
  },
}

function areaDelta(arr) {
  const cur  = arr[arr.length - 1]
  const prev = arr[arr.length - 2]
  const pct  = ((cur - prev) / prev * 100).toFixed(1)
  return { cur, prev, pct: Number(pct) }
}

function TrendChip({ pct }) {
  if (pct > 0) return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
      <TrendingUp size={11} /> +{pct}%
    </span>
  )
  if (pct < 0) return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold text-sunset-orange">
      <TrendingDown size={11} /> {pct}%
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold text-warm-text">
      <Minus size={11} /> 보합
    </span>
  )
}

function BarChart({ data, months, color = 'bg-navy' }) {
  const max = Math.max(...data)
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((v, i) => {
        const isLast = i === data.length - 1
        const pct    = Math.round((v / max) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            {isLast && (
              <span className="text-[8px] font-bold text-navy leading-none mb-0.5">
                {v.toLocaleString()}
              </span>
            )}
            <div className="w-full flex-1 flex items-end">
              <div
                className={`w-full rounded-t-md transition-all ${isLast ? color : color + '/30'}`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className={`text-[9px] font-medium ${isLast ? 'text-navy' : 'text-warm-gray'}`}>
              {months[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const CHART_TABS = ['유동인구', '경쟁업체', '임대료']

function CommercialAnalysisView({ profile }) {
  const [areaIdx, setAreaIdx] = useState(0)
  const [chartTab, setChartTab] = useState(0)

  const areaName = AREA_NAMES[areaIdx]
  const area = AREA_DATA[areaName]

  const chartData  = [area.traffic, area.compCount, area.rent][chartTab]
  const chartColor = ['bg-navy', 'bg-emerald-500', 'bg-sunset-orange'][chartTab]
  const chartUnit  = ['명', '개', '만원'][chartTab]

  const trafficD = areaDelta(area.traffic)
  const compD    = areaDelta(area.compCount)
  const rentD    = areaDelta(area.rent)
  const curDeltas = [trafficD, compD, rentD]

  const densityColor = area.density === '높음'
    ? 'text-red-500'
    : area.density === '보통' ? 'text-sunset-orange' : 'text-emerald-600'

  return (
    <div className="max-w-4xl mx-auto px-5 space-y-5 pb-8">

      {/* 목업 안내 */}
      <div className="flex items-start gap-2 bg-star-yellow/20 border border-star-yellow/50 rounded-xl px-3.5 py-2.5">
        <Info size={12} className="text-navy/50 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-warm-text leading-relaxed">
          아래 데이터는 <strong className="text-navy">목업(샘플)</strong>이에요.
          실제 창업 전 현장 조사를 꼭 병행하세요.
        </p>
      </div>

      {/* 상권 선택 탭 */}
      <div className="flex gap-2">
        {AREA_NAMES.map((name, i) => (
          <button key={name} onClick={() => { setAreaIdx(i); setChartTab(0) }}
            className={`flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all
              ${areaIdx === i
                ? 'bg-navy text-white shadow'
                : 'bg-white border border-warm-gray/30 text-warm-text hover:bg-warm-gray/10'
              }`}
          >{name}</button>
        ))}
      </div>

      {/* ① 상권 헤더 카드 */}
      <Card className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-navy animate-pulse" />
              <span className="text-xs font-bold text-navy">{areaName}</span>
              {profile?.category && (
                <span className="text-[10px] text-warm-text bg-warm-gray/15 rounded-full px-2 py-0.5">
                  {profile.category}
                </span>
              )}
            </div>
            <p className="text-base font-extrabold text-navy">{area.scoreLabel}</p>
            <p className="text-xs text-warm-text mt-0.5">{area.daily}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-warm-text">창업 적합도</p>
            <p className="text-xl font-extrabold text-navy leading-tight">
              {area.score}
              <span className="text-xs font-medium text-warm-text ml-0.5">점</span>
            </p>
            <TrendChip pct={trafficD.pct} />
          </div>
        </div>
      </Card>

      {/* ② 핵심 지표 3칸 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Users,       label: '일 유동인구', value: (trafficD.cur / 10000).toFixed(1), unit: '만명', pct: trafficD.pct },
          { icon: ShoppingBag, label: '동종업체 수', value: String(compD.cur),                 unit: '개',   pct: compD.pct   },
          { icon: MapPin,      label: '평균 임대료', value: String(rentD.cur),                 unit: '만원', pct: rentD.pct   },
        ].map(({ icon: Icon, label, value, unit, pct }, i) => (
          <Card key={i} className="p-3 text-center">
            <Icon size={16} className="mx-auto text-warm-text mb-1.5" />
            <p className="text-[10px] text-warm-text leading-tight">{label}</p>
            <p className="text-sm font-extrabold text-navy mt-0.5 leading-none">
              {value}
              <span className="text-[9px] font-medium text-warm-text ml-0.5">{unit}</span>
            </p>
            <div className="mt-0.5 flex justify-center">
              <TrendChip pct={pct} />
            </div>
          </Card>
        ))}
      </div>

      {/* ③ 추이 차트 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle sub="최근 6개월 추이">상권 트렌드</SectionTitle>
          <span className="text-[10px] text-warm-text">전월 대비</span>
        </div>

        <div className="flex gap-1 mb-4">
          {CHART_TABS.map((t, i) => (
            <button key={t} onClick={() => setChartTab(i)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${chartTab === i ? 'bg-navy text-white' : 'bg-warm-gray/15 text-warm-text hover:bg-warm-gray/30'}`}
            >{t}</button>
          ))}
        </div>

        <BarChart data={chartData} months={AREA_MONTHS} color={chartColor} />

        <div className="mt-4 pt-3 border-t border-warm-gray/15 flex items-center justify-between">
          <p className="text-[10px] text-warm-text">
            7월 대비&nbsp;
            <span className={`font-bold ${curDeltas[chartTab].pct > 0 ? 'text-emerald-600' : 'text-sunset-orange'}`}>
              {curDeltas[chartTab].pct > 0 ? '+' : ''}{curDeltas[chartTab].pct}%
            </span>
          </p>
          <p className="text-[10px] text-warm-text">
            {curDeltas[chartTab].prev.toLocaleString()} → {curDeltas[chartTab].cur.toLocaleString()} {chartUnit}
          </p>
        </div>
      </Card>

      {/* ④ 창업 적합도 게이지 */}
      <Card className="p-4">
        <SectionTitle sub="화성시 4개 상권 비교">창업 적합도 위치</SectionTitle>

        <div className="flex items-end justify-between mb-2">
          <p className="text-2xl font-extrabold text-navy">
            <span className="text-sunset-orange">{area.score}</span>점
          </p>
          <p className="text-[10px] text-warm-text text-right leading-relaxed">
            {area.scoreLabel}<br />
            임대료 {area.rentRange}
          </p>
        </div>

        <div className="relative h-3 bg-warm-gray/20 rounded-full overflow-hidden mb-3">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-400 to-navy transition-all duration-700"
            style={{ width: `${area.score}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-navy shadow"
            style={{ left: `calc(${area.score}% - 6px)` }}
          />
        </div>

        <div className="flex justify-between text-[9px] text-warm-text mb-3">
          <span>100점 (최상)</span>
          <span>0점</span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-warm-gray/15">
          {[
            { label: '이달 신규 개업', value: `${area.newOpen}곳`, color: 'text-sunset-orange' },
            { label: '이달 폐업',      value: `${area.closed}곳`,  color: 'text-warm-text'    },
            { label: '경쟁 밀도',      value: area.density,         color: densityColor        },
          ].map((d, i) => (
            <div key={i} className="text-center">
              <p className={`text-base font-extrabold ${d.color}`}>{d.value}</p>
              <p className="text-[9px] text-warm-text mt-0.5">{d.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ⑤ 상권 특성 */}
      <Card className="p-4">
        <SectionTitle sub="최근 3개월 기준">상권 특성</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: RefreshCw,   label: '방문 피크',  value: area.peak,       sub: '방문자 집중 시간대' },
            { icon: Users,       label: '주 연령대',  value: area.mainAge,    sub: '핵심 소비층'       },
            { icon: Star,        label: '동종업체',   value: `${area.nearby}개`, sub: '화성시 내 추정' },
            { icon: ShoppingBag, label: '임대료',     value: area.rentRange,  sub: '3.3㎡당 월 기준'   },
          ].map(({ icon: Icon, label, value, sub }, i) => (
            <div key={i} className="flex items-center gap-3 bg-primary-bg rounded-xl px-3 py-3">
              <div className="w-8 h-8 rounded-full bg-white border border-warm-gray/20 flex items-center justify-center flex-shrink-0">
                <Icon size={14} className="text-navy" />
              </div>
              <div>
                <p className="text-[10px] text-warm-text">{label}</p>
                <p className="text-xs font-extrabold text-navy leading-tight">{value}</p>
                <p className="text-[9px] text-warm-text/70">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ⑥ 창업 준비 체크 */}
      <div className="bg-navy rounded-2xl p-4">
        <p className="text-xs font-bold text-white mb-3">창업 전 확인 리스트</p>
        <div className="space-y-2">
          {[
            '현장 방문 — 평일·주말 유동인구 직접 확인',
            '경쟁 업소 조사 — 반경 500m 내 동종 업소 수',
            '임대차 계약 — 권리금·보증금·월세 협상',
            '소상공인 지원사업 신청 — 초기 비용 절감',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-4 h-4 rounded-full border border-white/40 flex-shrink-0 flex items-center justify-center text-[9px] text-white/60 mt-0.5">{i + 1}</span>
              <p className="text-xs text-white/80 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────

export default function MyStore() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [matches, setMatches] = useState(null)   // null = 아직 안 옴
  const [failed, setFailed]   = useState(false)
  const [openId, setOpenId]   = useState(null)
  const [showIf, setShowIf]   = useState(false)

  useEffect(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('mars-fit-profile')) } catch { return null }
    })()
    setProfile(saved)

    fetchMatches(saved ?? DEFAULT_PROFILE)
      .then(r => setMatches(r?.results ?? []))
      .catch(() => setFailed(true))
  }, [])

  const year = new Date().getFullYear()
  // holidaysKnown 은 import 한 함수와 이름이 겹친다. 그대로 구조분해하면
  // 함수가 불리언으로 덮여서 아래 호출이 터진다. 이름을 갈라둔다.
  const { mustDo, ifApplicable, holidaysKnown: thisYearKnown } = useMemo(
    () => taxSchedule(profile, year), [profile, year],
  )
  const next = useMemo(() => nextDeadline(profile), [profile])

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

      <div className="max-w-4xl mx-auto px-5 pt-4 pb-2">
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

      {isOwner && <div className="max-w-4xl mx-auto px-5 space-y-5">

        {/* ① 프로필 */}
        <ProfileCard profile={profile} onEdit={() => navigate('/onboarding')} />

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

        {/* ③ 올해 해야 할 신고 */}
        <Card className="p-4">
          <SectionTitle sub={`${year}년 · 사장님께 해당되는 것만 골랐어요`}>
            올해 해야 할 신고
          </SectionTitle>

          {mustDo.length > 0 ? (
            <>
              <p className="text-[10px] font-bold text-navy mb-1">
                반드시 해야 하는 것 {mustDo.length}건
              </p>
              <div className="mb-1">
                {mustDo.map(e => (
                  <TaxRow key={e.id} item={e} open={openId === e.id}
                    onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-warm-text py-2">해당되는 신고가 없어요.</p>
          )}

          {/* 해당되면 이것도 — 반드시 따로 그린다.
              섞으면 종합소득세가 5월·6월 두 번 뜨고 원천세가 매월·반기 둘 다 뜬다. */}
          {ifApplicable.length > 0 && (
            <div className="mt-3 pt-3 border-t border-warm-gray/15">
              <button onClick={() => setShowIf(v => !v)}
                className="w-full flex items-center justify-between text-left">
                <span className="text-[10px] font-bold text-warm-text">
                  해당되면 이것도 {ifApplicable.length}건
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
                  {ifApplicable.map(e => (
                    <div key={e.id}>
                      <p className="text-[10px] text-sunset-orange pt-2">{e.conditional}</p>
                      <TaxRow item={e} open={openId === e.id}
                        onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!thisYearKnown && (
            <div className="mt-3 flex items-start gap-2 bg-sunset-orange/5 rounded-xl px-3 py-2.5">
              <AlertTriangle size={12} className="text-sunset-orange mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-warm-text leading-relaxed">
                {year}년 공휴일이 아직 등록되지 않아 주말만 반영된 날짜예요.
                설·추석은 음력이라 자동 계산이 안 됩니다.
              </p>
            </div>
          )}
        </Card>

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

      </div>}

    </div>
  )
}

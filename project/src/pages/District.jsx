import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Minus,
  Users, ShoppingBag, RefreshCw, Star,
  ChevronRight, Info,
} from 'lucide-react'
import Header from '../components/layout/Header'
import { useNavigate } from 'react-router-dom'

// ── 목업 데이터 ─────────────────────────────────────────────────────

const STORE_PROFILE = {
  name:     '나의 카페',
  category: '카페·음료',
  region:   '동탄2동',
  openedAt: '2024-08',   // 개업 월
}

const MONTHS = ['3월', '4월', '5월', '6월', '7월', '8월']

// 월별 추이 데이터 (단위: 만원 / 명)
const MONTHLY = {
  revenue:  [2820, 3050, 2940, 3380, 3190, 3650],
  visitors: [830,  880,  855,  975,  910,  1045],
  avgSpend: [34.0, 34.7, 34.4, 34.7, 35.1, 34.9],
}

// 업종 내 상대 위치 (상위 %)
const RANK = { pct: 28, label: '상위 28%', total: 87, better: 62 }

// 올해 수령한 지원사업
const SUPPORTS = [
  { name: '화성시 소상공인 경영안정자금',   amount: 500,  date: '2025-03', status: '수령 완료' },
  { name: '경기도 청년창업 육성지원',        amount: 300,  date: '2025-05', status: '수령 완료' },
  { name: '소상공인 스마트화 지원',           amount: 400,  date: '2025-07', status: '수령 완료' },
]

// 경쟁 환경 요약
const COMPETITION = {
  nearby:    87,    // 동탄 내 동종업체 수
  newOpen:   5,     // 이번 달 신규 개업
  closedCnt: 2,     // 이번 달 폐업
  myScore:   74,    // 경쟁력 점수 (0~100)
}

// ── 유틸 ──────────────────────────────────────────────────────────

function delta(arr) {
  const cur  = arr[arr.length - 1]
  const prev = arr[arr.length - 2]
  const pct  = ((cur - prev) / prev * 100).toFixed(1)
  return { cur, prev, pct: Number(pct), up: pct > 0 }
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

// ── 바 차트 ──────────────────────────────────────────────────────

function BarChart({ data, months, color = 'bg-navy', unit = '' }) {
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
                {unit === '만원' ? `${v.toLocaleString()}` : v.toLocaleString()}
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

// ── 섹션 래퍼 ────────────────────────────────────────────────────

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
      {sub && <p className="text-[10px] text-warm-text mt-0.5">{sub}</p>}
    </div>
  )
}

// ── 탭 ───────────────────────────────────────────────────────────

const TABS = ['매출', '방문자', '객단가']

// ── 메인 페이지 ──────────────────────────────────────────────────

export default function MyStore() {
  const navigate  = useNavigate()
  const [tab, setTab] = useState(0)

  // 현재 탭에 맞는 데이터
  const chartData = [MONTHLY.revenue, MONTHLY.visitors, MONTHLY.avgSpend][tab]
  const chartUnit = ['만원', '명', '만원'][tab]
  const chartColor = ['bg-navy', 'bg-emerald-500', 'bg-sunset-orange'][tab]

  const revD  = delta(MONTHLY.revenue)
  const visD  = delta(MONTHLY.visitors)
  const spnD  = delta(MONTHLY.avgSpend)

  const totalSupport = SUPPORTS.reduce((s, x) => s + x.amount, 0)

  // 개업 개월수 계산
  const openDate = new Date(STORE_PROFILE.openedAt + '-01')
  const months   = Math.max(1,
    (new Date().getFullYear() - openDate.getFullYear()) * 12 +
    (new Date().getMonth() - openDate.getMonth())
  )

  return (
    <div className="min-h-screen bg-primary-bg pb-24">
      <Header />

      <div className="max-w-4xl mx-auto px-5 pt-4 pb-2">
        <h1 className="text-lg font-extrabold text-navy">내 매장 현황</h1>
        <p className="text-xs text-warm-text mt-0.5">목업 데이터 · 실제 POS 연동 예정</p>
      </div>

      <div className="max-w-4xl mx-auto px-5 space-y-5">

        {/* ① 매장 요약 헤더 카드 */}
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-emerald-600">영업 중</span>
                <span className="text-[10px] text-warm-text bg-warm-gray/15 rounded-full px-2 py-0.5">
                  {months}개월째
                </span>
              </div>
              <p className="text-base font-extrabold text-navy">{STORE_PROFILE.category}</p>
              <p className="text-xs text-warm-text mt-0.5">{STORE_PROFILE.region}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-warm-text">이번 달 매출</p>
              <p className="text-xl font-extrabold text-navy leading-tight">
                {revD.cur.toLocaleString()}
                <span className="text-xs font-medium text-warm-text ml-0.5">만원</span>
              </p>
              <TrendChip pct={revD.pct} />
            </div>
          </div>
        </Card>

        {/* ② 핵심 지표 3칸 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: ShoppingBag, label: '이달 매출',   value: `${revD.cur.toLocaleString()}`, unit: '만원', pct: revD.pct  },
            { icon: Users,       label: '이달 방문자', value: `${visD.cur.toLocaleString()}`, unit: '명',   pct: visD.pct  },
            { icon: Star,        label: '평균 객단가', value: `${spnD.cur.toFixed(1)}`,       unit: '만원', pct: spnD.pct  },
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
            <SectionTitle sub="최근 6개월">추이 분석</SectionTitle>
            <span className="text-[10px] text-warm-text">전월 대비</span>
          </div>

          {/* 탭 */}
          <div className="flex gap-1 mb-4">
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${tab === i ? 'bg-navy text-white' : 'bg-warm-gray/15 text-warm-text hover:bg-warm-gray/30'}`}
              >{t}</button>
            ))}
          </div>

          <BarChart
            data={chartData}
            months={MONTHS}
            color={chartColor}
            unit={chartUnit}
          />

          {/* 전월 대비 요약 */}
          <div className="mt-4 pt-3 border-t border-warm-gray/15 flex items-center justify-between">
            <p className="text-[10px] text-warm-text">
              7월 대비 &nbsp;
              <span className={`font-bold ${
                [revD, visD, spnD][tab].pct > 0 ? 'text-emerald-600' : 'text-sunset-orange'
              }`}>
                {[revD, visD, spnD][tab].pct > 0 ? '+' : ''}{[revD, visD, spnD][tab].pct}%
              </span>
            </p>
            <p className="text-[10px] text-warm-text">
              {[revD, visD, spnD][tab].prev.toLocaleString()} → {[revD, visD, spnD][tab].cur.toLocaleString()} {chartUnit}
            </p>
          </div>
        </Card>

        {/* ④ 업종 내 상대적 위치 */}
        <Card className="p-4">
          <SectionTitle sub={`${STORE_PROFILE.region} ${STORE_PROFILE.category} ${COMPETITION.nearby}개 업체 중`}>
            업종 내 위치
          </SectionTitle>

          <div className="flex items-end justify-between mb-2">
            <p className="text-2xl font-extrabold text-navy">
              상위 <span className="text-sunset-orange">{RANK.pct}%</span>
            </p>
            <p className="text-[10px] text-warm-text text-right leading-relaxed">
              {COMPETITION.nearby}개 업체 중<br />
              상위 {COMPETITION.better}위
            </p>
          </div>

          {/* 게이지 바 */}
          <div className="relative h-3 bg-warm-gray/20 rounded-full overflow-hidden mb-3">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-400 to-navy transition-all duration-700"
              style={{ width: `${100 - RANK.pct}%` }}
            />
            {/* 내 위치 마커 */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-navy shadow"
              style={{ left: `calc(${100 - RANK.pct}% - 6px)` }}
            />
          </div>

          <div className="flex justify-between text-[9px] text-warm-text mb-3">
            <span>최상위</span>
            <span>하위</span>
          </div>

          {/* 경쟁 환경 요약 */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-warm-gray/15">
            {[
              { label: '이달 신규 개업', value: COMPETITION.newOpen,     unit: '곳', color: 'text-sunset-orange' },
              { label: '이달 폐업',      value: COMPETITION.closedCnt,   unit: '곳', color: 'text-warm-text'    },
              { label: '경쟁력 점수',    value: COMPETITION.myScore,      unit: '점', color: 'text-navy'         },
            ].map((d, i) => (
              <div key={i} className="text-center">
                <p className={`text-base font-extrabold ${d.color}`}>
                  {d.value}
                  <span className="text-[9px] font-medium text-warm-text ml-0.5">{d.unit}</span>
                </p>
                <p className="text-[9px] text-warm-text mt-0.5">{d.label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* ⑤ 재방문·충성 고객 */}
        <Card className="p-4">
          <SectionTitle sub="최근 3개월 기준">고객 현황</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: RefreshCw, label: '재방문율',      value: '38',  unit: '%',   sub: '전월 +2%p' },
              { icon: Users,     label: '신규 고객',     value: '648', unit: '명',  sub: '전월 대비 +8%' },
              { icon: Star,      label: '평균 별점',     value: '4.3', unit: '점',  sub: '리뷰 127건' },
              { icon: ShoppingBag, label: '피크 시간대', value: '14시', unit: '',   sub: '~16시 최다 방문' },
            ].map(({ icon: Icon, label, value, unit, sub }, i) => (
              <div key={i} className="flex items-center gap-3 bg-primary-bg rounded-xl px-3 py-3">
                <div className="w-8 h-8 rounded-full bg-white border border-warm-gray/20 flex items-center justify-center flex-shrink-0">
                  <Icon size={14} className="text-navy" />
                </div>
                <div>
                  <p className="text-[10px] text-warm-text">{label}</p>
                  <p className="text-sm font-extrabold text-navy leading-tight">
                    {value}<span className="text-[9px] font-medium text-warm-text ml-0.5">{unit}</span>
                  </p>
                  <p className="text-[9px] text-warm-text/70">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ⑥ 지원사업 수혜 현황 */}
        <Card className="p-4">
          <div className="flex items-start justify-between mb-3">
            <SectionTitle sub="올해 누적">지원사업 수혜 현황</SectionTitle>
            <div className="text-right">
              <p className="text-[10px] text-warm-text">총 수혜액</p>
              <p className="text-lg font-extrabold text-sunset-orange">
                {totalSupport.toLocaleString()}
                <span className="text-xs font-medium text-warm-text ml-0.5">만원</span>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {SUPPORTS.map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-warm-gray/10 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-navy truncate">{s.name}</p>
                  <p className="text-[10px] text-warm-text">{s.date}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-navy">{s.amount.toLocaleString()}만원</p>
                  <p className="text-[10px] text-emerald-600 font-medium">{s.status}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate('/home')}
            className="mt-3 w-full flex items-center justify-center gap-1
                       text-xs text-navy font-semibold py-2.5 rounded-xl
                       bg-primary-bg hover:bg-warm-gray/20 transition-colors"
          >
            신청 가능한 지원사업 보기 <ChevronRight size={14} />
          </button>
        </Card>

        {/* 안내 */}
        <div className="flex items-start gap-2 bg-navy/5 rounded-xl px-3 py-2.5">
          <Info size={12} className="text-navy/50 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-warm-text leading-relaxed">
            현재 표시되는 데이터는 목업 데이터입니다. 실제 POS·카드 매출 데이터 연동 시 정확한 현황을 확인할 수 있습니다.
          </p>
        </div>

      </div>
    </div>
  )
}

import { useMemo, useState, useEffect, useRef } from 'react'
import { DEMO_PROFILES } from '../utils/demoMode'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import logoImg from '../../design/logo.png'
import marsImg from '../../design/mars.png'
import findImg from '../../design/find.png'
import searchImg from '../../design/search.png'
import { getToken, clearToken, saveOnboarding, patchOnboarding, apiUrl, mockOcrResult,
         deleteOnboarding, clearLocalData, fetchOcrReady, fetchMatches, DEFAULT_PROFILE } from '../utils/api'
import { saveJourney, getJourney, getProgress, inferCurrentStep } from '../utils/journey'
import { generateText } from '../utils/llm/llmProvider'
import { RotateCcw, LogOut, ChevronRight, AlertTriangle, Trash2 } from 'lucide-react'
import Header from '../components/layout/Header'
import FavoriteNotices from '../components/sections/FavoriteNotices'
import NotifySettings from '../components/ui/NotifySettings'

/**
 * 온보딩 — 성현 기획서(docs/온보딩_기획서.txt) 구조.
 *   Q1 상황 → 경로 A·B·C → 공통 기본정보 6문항 → 완료
 *
 * 원칙
 *   · 한 화면에 질문 하나
 *   · 왜 묻는지 한 줄로 밝힌다
 *   · 스킵 허용. 스킵한 값은 매칭에서 "확인필요" 로 남는다.
 */

// 매칭 엔진이 아는 업종
const FIELDS = [
  { key: '요리',   emoji: '🍳', label: '요리·음식',    sub: true },
  { key: '교육',   emoji: '📚', label: '교육·가르치기', category: '기타' },
  { key: '미용',   emoji: '✂️', label: '미용·서비스',   category: '기타' },
  { key: '소매',   emoji: '🛍', label: '소매·판매',    category: '소매업' },
  { key: '제조',   emoji: '🔧', label: '제조·공방',    category: '제조업' },
  { key: '예술',   emoji: '🎨', label: '예술·창작',    category: '기타' },
]

const KEYWORDS = ['카페', '음식점', '공방', '학원', '미용실', '온라인쇼핑', '편의점', '배달']

// 2-C 준비 체크리스트 항목 (STEP 순서대로)
const PREP_ITEMS = [
  { key: 'hasCategory',    label: '업종을 정했어요' },
  { key: 'hasBizPlan',     label: '사업계획을 세웠어요' },
  { key: 'hasLocation',    label: '사업장을 알아봤어요' },
  { key: 'hasContract',    label: '사업장을 계약했어요' },
  { key: 'hasEducation',   label: '필요한 교육을 받았어요' },
  { key: 'hasRegistration',label: '사업자등록을 했어요' },
  { key: 'hasPermit',      label: '영업신고·인허가를 받았어요' },
]

// 단계별 마이다 말풍선 메시지
const MARS_MESSAGES = {
  q1:        '화성시 소상공인 지원사업을 같이 찾아드릴게요! 먼저 지금 상황을 알려주세요 🚀',
  field:     '어떤 분야가 끌리세요? 관심 분야부터 가볍게 탐색해봐요!',
  sub:       '요리 쪽이군요! 조금 더 알려주시면 딱 맞는 사업을 찾아드려요!',
  wish:      '어떤 창업을 꿈꾸고 계세요? 키워드로 알려주시면 마이다가 바로 분석해드려요!',
  prep:      '어디까지 준비하셨는지 알려주세요! 딱 맞는 다음 단계를 안내해드릴게요 🗺️',
  biz:       '사업자등록증을 올려주시면 정보를 자동으로 읽어드려요! 📄',
  'biz-review': '이렇게 읽었어요! 틀린 게 있으면 수정해주세요 ✏️',
  'biz-manual': '직접 입력해주시면 바로 매칭해드릴게요!',
  age:     '나이별로 청년·시니어 전용 지원사업이 따로 있어요!',
  region:  '화성시 소재 여부에 따라 신청 가능한 사업이 달라져요!',
  career:  '첫 창업자만 신청할 수 있는 전용 지원사업이 꽤 많아요!',
  asset:   '소득 수준에 맞는 특별 지원을 추가로 찾아드려요!',
  marital: '가족 구성에 따른 특별 지원사업이 일부 있어요!',
  parents: '부모님 동거 여부를 확인하는 지원사업이 있어요. 몰랐죠? 😊',
}

async function classifyCategory(text) {
  const raw = await generateText({
    jsonMode: true,
    userPrompt: `창업 희망 내용: "${text}"\n\n아래 다섯 중 하나로만 분류해서 JSON 으로 답하세요.\n카페 / 음식점 / 소매업 / 제조업 / 기타\n\n제조업은 공방·수제품·가공식품 제조처럼 물건을 만들어 파는 경우예요.\n\n{"category": "카페", "reason": "한 문장"}`,
  })
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(cleaned)
  const known = ['카페', '음식점', '소매업', '제조업', '기타']
  return known.includes(parsed.category) ? parsed.category : '기타'
}

const INCOME_THRESHOLD = {
  1: { low: 67,  mid: 111 },
  2: { low: 110, mid: 183 },
  3: { low: 141, mid: 235 },
  4: { low: 172, mid: 286 },
  5: { low: 201, mid: 335 },
  6: { low: 229, mid: 382 },
}

async function estimateIncomeGroup(text, memberCount = 4) {
  const n    = Math.min(Math.max(1, memberCount), 6)
  const t    = INCOME_THRESHOLD[n]
  const raw = await generateText({
    jsonMode: true,
    userPrompt: `가구원수: ${memberCount}명
가구 상황: "${text}"

2026년 기준 중위소득 기준 (${memberCount}인 가구 월 소득):
- 기초생활수급자: ${t.low}만원 이하이고 실제 정부 수급 중인 가구
- 차상위계층: ${t.mid}만원 이하 (수급 여부 무관, 소득이 낮은 가구)
- 일반: ${t.mid}만원 초과

직업별 2025년 한국 평균 월 소득을 참고해서 가구 총 소득을 추정하세요.
대학생·학생·무직은 소득 0으로 계산하세요.

JSON 형식으로만 답하세요:
{"asset_group": "일반", "reason": "추정 근거 두 문장 이내", "estimated_monthly": "약 OOO만원"}`,
  })
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(cleaned)
  const known = ['일반', '차상위', '기초생활수급자']
  return {
    asset_group: known.includes(parsed.asset_group) ? parsed.asset_group : '일반',
    reason: parsed.reason || '',
    estimated_monthly: parsed.estimated_monthly || '',
  }
}

function monthsFromOpen(yyyymmdd) {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return 0
  const year = +yyyymmdd.slice(0, 4), month = +yyyymmdd.slice(4, 6)
  const today = new Date()
  return Math.max(0, (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month))
}

export function ageFromBirth(digits) {
  if (!/^\d{8}$/.test(digits)) return null
  const year = +digits.slice(0, 4), month = +digits.slice(4, 6), day = +digits.slice(6, 8)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const today = new Date()
  let age = today.getFullYear() - year
  const beforeBirthday =
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day)
  if (beforeBirthday) age -= 1
  return age >= 0 && age <= 120 ? age : null
}

// 보내기 전에 사진을 줄인다.
//
// Vercel 함수는 요청 본문을 4.5MB 까지만 받는다. 사진을 base64 로 바꾸면
// 1.33배가 되므로 원본이 3.4MB 만 넘어도 413 으로 튕긴다. 요즘 폰 사진은
// 대부분 그보다 크다 — 줄이지 않으면 실제 사장님 사진은 거의 다 실패한다.
//
// 긴 변 1600px 이면 등록증 글자는 충분히 읽히고 보통 300~600KB 로 떨어진다.
// 캔버스를 거치면 EXIF 도 같이 떨어져 나간다. 촬영 위치가 안 실린다.
const MAX_EDGE = 1600

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('사진을 열 수 없어요. 다른 파일로 시도해주세요.'))
    }
    img.src = url
  })
}

/* ───────────── 공용 UI 조각 ───────────── */

function Progress({ current, total }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
          i < current - 1 ? 'bg-navy' : i === current - 1 ? 'bg-sunset-orange' : 'bg-warm-gray/30'
        }`} />
      ))}
    </div>
  )
}

function MarsBubble({ message }) {
  return (
    <div className="flex items-end gap-3 mb-7">
      {/* 마이다 캐릭터 */}
      <img
        src={marsImg}
        alt="마이다"
        className="w-14 h-14 object-contain flex-shrink-0"
        style={{ filter: 'drop-shadow(0 2px 6px rgba(42,60,119,0.18))' }}
      />
      {/* 말풍선 */}
      <div className="relative bg-white border border-warm-gray/30 rounded-2xl rounded-bl-none
                      px-4 py-3 shadow-sm flex-1">
        <p className="text-sm text-navy leading-relaxed font-medium">{message}</p>
        {/* 꼬리 */}
        <span className="absolute -left-2 bottom-3 w-0 h-0
                         border-t-[6px] border-t-transparent
                         border-r-[8px] border-r-white
                         border-b-[6px] border-b-transparent" />
        <span className="absolute -left-[10px] bottom-[11px] w-0 h-0
                         border-t-[6px] border-t-transparent
                         border-r-[8px] border-r-warm-gray/30
                         border-b-[6px] border-b-transparent" />
      </div>
    </div>
  )
}

function Ask({ title, why, children }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-navy leading-snug mb-1.5">{title}</h2>
      {why && (
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          <span className="text-sunset-orange font-semibold">왜 묻나요?</span> {why}
        </p>
      )}
      {children}
    </div>
  )
}

function Choice({ emoji, label, desc, selected, onClick }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      className={[
        'w-full text-left p-4 rounded-2xl border-2 transition-all duration-150 flex items-start gap-3',
        selected ? 'border-navy bg-navy/5' : 'border-warm-gray/30 bg-white hover:border-navy/40 hover:shadow-sm',
      ].join(' ')}
    >
      {emoji && <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{emoji}</span>}
      <span className="flex-1">
        <span className={`block text-sm font-semibold ${selected ? 'text-navy' : 'text-gray-700'}`}>{label}</span>
        {desc && <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>}
      </span>
      {selected && <span className="text-navy mt-0.5 flex-shrink-0">✓</span>}
    </button>
  )
}

function SkipLink({ onClick, children = '잘 모르겠어요' }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-4 w-full text-sm text-gray-500 hover:text-navy underline underline-offset-2 transition-colors">
      {children}
    </button>
  )
}

/* ───────────── 슬라이드 전환 래퍼 ───────────── */
function Slide({ stageKey, children }) {
  const [visible, setVisible] = useState(false)
  const prev = useRef(stageKey)

  useEffect(() => {
    if (prev.current !== stageKey) {
      setVisible(false)
      const t = setTimeout(() => { setVisible(true); prev.current = stageKey }, 60)
      return () => clearTimeout(t)
    } else {
      setVisible(true)
    }
  }, [stageKey])

  return (
    <div style={{
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
    }}>
      {children}
    </div>
  )
}

/* ───────────── Shell (껍데기) ───────────── */
function Shell({ current, total, onBack, marsMessage, stageKey, children }) {
  return (
    <div className="min-h-screen bg-primary-bg flex flex-col">
      {/* 헤더 */}
      <div className="px-5 pt-6 pb-2 flex items-center justify-between max-w-2xl mx-auto w-full">
        {onBack
          ? <button onClick={onBack} aria-label="이전"
              className="w-8 h-8 flex items-center justify-center text-navy text-lg font-bold -ml-1
                         hover:bg-navy/10 rounded-full transition-colors">←</button>
          : <span className="w-8" />
        }
        <img src={logoImg} alt="Mars-Fit" className="h-12 object-contain" />
        <span className="text-xs text-warm-text w-8 text-right font-medium">{current}/{total}</span>
      </div>

      <div className="flex-1 px-5 pt-3 pb-16 max-w-2xl mx-auto w-full">
        <Progress current={current} total={total} />
        <Slide stageKey={stageKey}>
          {marsMessage && <MarsBubble message={marsMessage} />}
          {children}
        </Slide>
        {/* 단계마다 Shell 을 따로 그리기 때문에 여기가 모든 단계에
            공통으로 걸리는 유일한 자리다. */}
        <DemoSkip />
      </div>
    </div>
  )
}

/* ───────────── 온보딩 환영 화면 ───────────── */
function WelcomeScreen({ onStart }) {
  return (
    <div className="min-h-screen bg-primary-bg flex flex-col items-center justify-center px-5 gap-6"
         style={{ animation: 'fadeIn 0.4s ease' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
               @keyframes welcomeFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}`}</style>

      <img src={marsImg} alt="마이다" className="w-32 h-32 object-contain"
           style={{ animation: 'welcomeFloat 3s ease-in-out infinite',
                    filter: 'drop-shadow(0 6px 12px rgba(42,60,119,0.18))' }} />

      <div className="w-full max-w-sm bg-white rounded-3xl border border-warm-gray/20 shadow-lg px-6 py-7 text-center">
        <p className="text-base font-bold text-navy leading-relaxed mb-1">
          안녕하세요! 저는 마이다예요 👋
        </p>
        <p className="text-sm text-warm-text leading-relaxed mt-2">
          사장님의 몇 가지 정보만 입력해주시면<br />
          마이다가 잘 기억하고<br />
          딱 맞는 정책을 알려드릴게요!
        </p>
      </div>

      <div className="w-full max-w-sm">
        <Button variant="navy" size="lg" fullWidth onClick={onStart}>
          입력하러 가기 →
        </Button>
      </div>
    </div>
  )
}

/* ───────────── 완료 화면 ───────────── */
function DoneScreen({ count, onConfirm }) {
  const [phase,      setPhase]      = useState('loading') // 'loading' | 'result'
  const [matchCount, setMatchCount] = useState(null)

  const profile  = (() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile') || 'null') } catch { return null }
  })()
  const journey  = getJourney()
  const progress = getProgress(profile, journey)
  const step     = inferCurrentStep(profile, journey)
  const hasToken = !!getToken()
  const status   = profile?.business_status ?? '예비창업자'
  const category = profile?.category ?? ''

  // 공고 수 비동기 조회 + 1.8초 후 결과 화면 전환
  useEffect(() => {
    let cancelled = false
    fetchMatches(profile ?? DEFAULT_PROFILE)
      .then(({ results }) => {
        if (cancelled) return
        const available = results.filter(r => r.overall_status === '신청가능').length
        setMatchCount(available)
      })
      .catch(() => {})

    const t = setTimeout(() => { if (!cancelled) setPhase('result') }, 1800)
    return () => { cancelled = true; clearTimeout(t) }
  }, [])

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-primary-bg flex flex-col items-center justify-center px-5 gap-5">
        <style>{`@keyframes doneFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}`}</style>
        <img src={searchImg} alt="" aria-hidden className="w-40 h-40 object-contain"
             style={{ animation: 'doneFloat 2s ease-in-out infinite' }} />
        <div className="text-center">
          <p className="text-lg font-bold text-navy">Ma-DA가 준비 중이에요</p>
          <p className="text-sm text-warm-text mt-1">맞춤 지원사업을 탐색하고 있어요</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 0.15, 0.3].map((d, i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-warm-gray animate-bounce"
                  style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-bg flex flex-col items-center justify-center px-5 gap-5 pb-10"
         style={{ animation: 'fadeIn 0.5s ease' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* 마이다 + 말풍선 */}
      <div className="flex items-end gap-3 w-full max-w-sm">
        <img src={findImg} alt="마이다" className="w-16 h-16 object-contain flex-shrink-0"
             style={{ filter: 'drop-shadow(0 4px 8px rgba(42,60,119,0.2))' }} />
        <div className="relative bg-white border border-warm-gray/30 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex-1">
          <p className="text-sm font-bold text-navy">Ma-DA가 준비됐어요! 🚀</p>
          <p className="text-xs text-warm-text mt-0.5">
            {category ? `${category} 창업 여정을 함께 시작해요` : '창업 여정을 함께 시작해요'}
          </p>
          <span className="absolute -left-2 bottom-3 w-0 h-0
                           border-t-[6px] border-t-transparent border-r-[8px] border-r-white border-b-[6px] border-b-transparent" />
          <span className="absolute -left-[10px] bottom-[11px] w-0 h-0
                           border-t-[6px] border-t-transparent border-r-[8px] border-r-warm-gray/30 border-b-[6px] border-b-transparent" />
        </div>
      </div>

      {/* 준비도 카드 */}
      <div className="w-full max-w-sm bg-white rounded-3xl border border-warm-gray/20 shadow-lg p-5">

        {/* 창업 준비도 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-navy/60 tracking-wider">창업 준비도</p>
            <p className="text-base font-bold text-sunset-orange">{progress}%</p>
          </div>
          <div className="h-2 bg-warm-gray/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-navy to-sunset-orange rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-warm-text mt-1.5">
            STEP {step} / 7 — {
              step === 1 ? '업종·입지 탐색 단계' :
              step === 2 ? '사업 계획 구체화 단계' :
              step === 3 ? '사업장 준비 단계' :
              step === 4 ? '필수 교육·자격 단계' :
              step === 5 ? '사업자등록 단계' :
              step === 6 ? '인허가·영업신고 단계' :
              '사업 운영 시작'
            }
          </p>
        </div>

        <div className="border-t border-warm-gray/10 pt-4 space-y-3">

          {/* 신청 가능 공고 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <p className="text-sm font-semibold text-navy">신청 가능한 지원사업</p>
            </div>
            <span className="text-sm font-bold text-navy">
              {matchCount !== null ? `${matchCount}개` : '탐색 중...'}
            </span>
          </div>

          {/* 공고 자동 매칭 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🔍</span>
              <p className="text-sm font-semibold text-navy">공고 자동 매칭</p>
            </div>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-600
                             border border-emerald-200 px-2.5 py-1 rounded-full">
              ON
            </span>
          </div>

          {/* 카카오 알림 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🔔</span>
              <p className="text-sm font-semibold text-navy">카카오톡 알림</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
              hasToken
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-warm-gray/10 text-warm-text border-warm-gray/20'
            }`}>
              {hasToken ? 'ON' : '로그인 후 가능'}
            </span>
          </div>
        </div>
      </div>

      {/* 로드맵 한 줄 요약 */}
      <div className="w-full max-w-sm bg-navy/[0.04] border border-navy/10 rounded-2xl px-4 py-3">
        <p className="text-xs font-bold text-navy/60 mb-2 tracking-wider">창업 로드맵 자동 생성</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {['탐색', '계획', '사업장', '교육', '인허가', '사업자등록', '운영'].map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                i + 1 < step  ? 'bg-navy/20 text-navy/50' :
                i + 1 === step ? 'bg-navy text-white' :
                'bg-warm-gray/15 text-warm-text'
              }`}>
                {s}
              </span>
              {i < 6 && <span className="text-warm-gray/40 text-[10px]">›</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-sm">
        <Button variant="navy" size="lg" fullWidth onClick={onConfirm}>
          항해 시작하기 🚀
        </Button>
      </div>
    </div>
  )
}

/* ───────────── 프로필 요약 대시보드 ───────────── */

const FIELD_LABELS = {
  category:               { label: '업종',       emoji: '🏷' },
  business_status:        { label: '사업 상태',   emoji: '🏪' },
  business_period_months: { label: '운영 기간',   emoji: '📅' },
  age:                    { label: '나이',        emoji: '👤' },
  region:                 { label: '지역',        emoji: '📍' },
  career_experience:      { label: '창업 경험',   emoji: '🔄' },
  asset_group:            { label: '소득 분위',   emoji: '💰' },
  marital_status:         { label: '결혼 여부',   emoji: '💍' },
  living_with_parents:    { label: '부모 동거',   emoji: '🏠' },
  annual_revenue_krw:     { label: '연매출',     emoji: '💵' },
  entity_type:            { label: '사업자 형태', emoji: '🏢' },
  vat_type:               { label: '과세 유형',   emoji: '🧾' },
  has_employee:           { label: '직원',        emoji: '👥' },
  withholding_half:       { label: '원천세 납부', emoji: '📆' },
}

function displayValue(key, val) {
  if (val === undefined || val === null || val === '') return null
  if (key === 'business_period_months') return `${val}개월`
  if (key === 'age') return `${val}세`
  if (key === 'living_with_parents') return val ? '함께 거주' : '별거'
  if (key === 'annual_revenue_krw') {
    // 원 단위로 저장하고 사람이 읽는 단위로 보여준다. 8000만원을
    // 「80000000원」으로 띄우면 0을 세게 된다.
    const won = Number(val)
    if (!Number.isFinite(won)) return null
    if (won >= 100_000_000) return `${Number((won / 100_000_000).toFixed(1))}억원`
    return `${Math.round(won / 10_000).toLocaleString()}만원`
  }
  if (key === 'has_employee') return val ? '있음' : '혼자 운영'
  if (key === 'withholding_half') return val ? '반기납부 (1·7월)' : '매월 10일'
  if (key === 'career_experience') return val === '없음' ? '첫 창업' : '경험 있음'
  return String(val)
}

// 편집 가능한 필드의 드로어 설정 (Home.jsx 와 동일)
const EDIT_CFG = {
  region: {
    title: '지역 변경',
    type: 'choice',
    options: [
      { value: '화성시', label: '화성시',        emoji: '📍' },
      { value: '경기도', label: '경기도 (화성시 외)', emoji: '🗺' },
      { value: '타지역', label: '그 외 지역',    emoji: '✈️' },
    ],
  },
  category: {
    title: '업종 변경',
    type: 'choice',
    options: [
      { value: '카페',   label: '카페·음료·디저트', emoji: '☕' },
      { value: '음식점', label: '식당·밥집·분식',   emoji: '🍜' },
      { value: '소매업', label: '소매·판매',        emoji: '🛍' },
      { value: '제조업', label: '제조·공방',        emoji: '🔧' },
      { value: '기타',   label: '기타',            emoji: '🎨' },
    ],
  },
  business_status: {
    title: '사업 상태 변경',
    type: 'choice',
    options: [
      { value: '예비창업자', label: '예비창업자', emoji: '💡' },
      { value: '운영중',     label: '운영 중',    emoji: '🏪' },
    ],
  },
  age: { title: '나이 변경', type: 'age' },
  entity_type: {
    title: '사업자 형태 변경',
    type: 'choice',
    options: [
      { value: '개인', label: '개인사업자', emoji: '🙍' },
      { value: '법인', label: '법인사업자', emoji: '🏢' },
    ],
  },
  vat_type: {
    title: '과세 유형 변경',
    type: 'choice',
    options: [
      { value: '일반과세', label: '일반과세', emoji: '🧾' },
      { value: '간이과세', label: '간이과세', emoji: '🧾' },
      { value: '면세',     label: '면세',     emoji: '🧾' },
    ],
  },
  has_employee: {
    title: '직원 여부 변경',
    type: 'choice',
    options: [
      { value: 'true',  label: '직원이 있어요', emoji: '👥' },
      { value: 'false', label: '저 혼자예요',   emoji: '🙋' },
    ],
  },
  withholding_half: {
    title: '원천세를 언제 내세요?',
    type: 'choice',
    options: [
      { value: 'false', label: '매월 10일',      emoji: '📆' },
      { value: 'true',  label: '1월·7월 두 번',  emoji: '🗓' },
    ],
  },
  business_period_months: { title: '운영 기간 변경', type: 'number', unit: '개월', min: 0, max: 600 },
  // 원 단위로 받으면 0을 여덟 개 쳐야 한다. 만원으로 받고 scale 로 되돌린다.
  annual_revenue_krw: {
    title: '작년 연매출 변경', type: 'number', unit: '만원',
    min: 0, max: 10_000_000, scale: 10_000,
    hint: '작년 한 해 매출이에요. 부가세 신고한 금액이면 돼요. 대략이어도 괜찮아요.',
  },
  career_experience: {
    title: '창업 경험 변경',
    type: 'choice',
    options: [
      { value: '없음', label: '처음이에요',      emoji: '🙋' },
      { value: '있음', label: '경험이 있어요',   emoji: '🔄' },
    ],
  },
  asset_group: {
    title: '소득 분위 변경',
    type: 'choice',
    options: [
      { value: '일반',         label: '일반',         emoji: '' },
      { value: '차상위',       label: '차상위',       emoji: '' },
      { value: '기초생활수급자', label: '기초생활수급자', emoji: '' },
    ],
  },
  marital_status: {
    title: '결혼 여부 변경',
    type: 'choice',
    options: [
      { value: '미혼', label: '미혼', emoji: '💍' },
      { value: '기혼', label: '기혼', emoji: '💑' },
    ],
  },
  living_with_parents: {
    title: '부모 동거 여부 변경',
    type: 'choice',
    options: [
      { value: 'true',  label: '함께 거주', emoji: '🏠' },
      { value: 'false', label: '별거',      emoji: '🏡' },
    ],
  },
}

function InlineEditDrawer({ field, profile, onSave, onClose }) {
  const cfg = EDIT_CFG[field]
  const [draft, setDraft] = useState(() => {
    const v = profile?.[field]
    if (v === undefined || v === null) return ''
    // 저장은 원 단위인데 입력칸은 만원이다. 안 나누면 8000만원이 다음에
    // 열었을 때 80000000 만원으로 보인다.
    return cfg?.scale ? String(v / cfg.scale) : String(v)
  })
  // 소득분위 LLM 추정 (field === 'asset_group' 일 때만 사용)
  const [assetMode, setAssetMode] = useState('choice')  // 'choice'|'help'|'loading'|'result'
  const [assetHelpText, setAssetHelpText] = useState('')
  const [assetEstimate, setAssetEstimate] = useState(null)
  const [assetMemberCount, setAssetMemberCount] = useState(4)
  // 가운데 창은 Esc 로 닫히는 게 기본 기대다. 시트일 때는 아래로 쓸어내려
  // 닫았지만 이제 그 동작이 없다.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!cfg) return null

  function confirm(raw) {
    let val = raw
    if (['living_with_parents', 'has_employee', 'withholding_half'].includes(field))
      val = raw === 'true'
    else if (cfg.scale) val = Math.round(Number(raw) * cfg.scale)
    else if (field === 'age' || field === 'business_period_months') val = Number(raw)
    onSave(field, val)
  }

  // 아래에서 올라오는 시트였는데 가운데로 옮겼다. 목록에서 한 줄을 눌러
  // 고치는 흐름이라, 시선이 목록 가운데에 있는데 창은 화면 맨 아래에서
  // 올라오면 눈이 두 번 움직인다. 손잡이(드래그 바)도 뺐다 — 가운데
  // 창에서는 끌어내릴 데가 없어서 뜻 없는 장식이 된다.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
         style={{ animation: 'popIn 0.16s ease-out' }}>
      <style>{`@keyframes popIn{from{opacity:0}to{opacity:1}}
               @keyframes cardIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto
                      bg-white rounded-3xl shadow-2xl"
           style={{ animation: 'cardIn 0.18s ease-out' }}
           role="dialog" aria-modal="true" aria-label={cfg.title}>
        <div className="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-warm-gray/20 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-navy">{cfg.title}</h3>
            <button onClick={onClose} aria-label="닫기"
              className="w-8 h-8 rounded-full bg-warm-gray/15 flex items-center justify-center
                         text-warm-text hover:bg-warm-gray/30 transition-colors text-sm">✕</button>
          </div>
          {/* 무엇을 적어야 하는지 한 줄. 연매출처럼 「어느 해의 어느 금액을
              말하는 건가」가 걸리는 항목이 있다. */}
          {cfg.hint && (
            <p className="mt-1.5 text-[13px] text-warm-text leading-relaxed">{cfg.hint}</p>
          )}
        </div>

        <div className="px-5 py-5">
          {cfg.type === 'choice' && (
            <div className="flex flex-col gap-2">
              {cfg.options.map(opt => (
                <button key={opt.value} onClick={() => confirm(opt.value)}
                  className={[
                    'flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all',
                    draft === opt.value
                      ? 'border-navy bg-navy/5'
                      : 'border-warm-gray/30 bg-white hover:border-navy/40 hover:shadow-sm',
                  ].join(' ')}>
                  {opt.emoji && <span className="text-xl flex-shrink-0">{opt.emoji}</span>}
                  <span className={`text-sm font-semibold flex-1 ${draft === opt.value ? 'text-navy' : 'text-gray-700'}`}>
                    {opt.label}
                  </span>
                  {draft === opt.value && <span className="text-navy text-sm flex-shrink-0">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* 소득분위 LLM 추정 — 내 정보 편집 창 전용 */}
          {cfg.type === 'choice' && field === 'asset_group' && (
            <>
              {assetMode === 'result' && assetEstimate && (
                <div className="mt-3 bg-navy/5 border border-navy/20 rounded-2xl px-4 py-3">
                  <p className="text-xs font-bold text-navy mb-1">
                    💡 마이다 추정 — {assetEstimate.estimated_monthly}
                  </p>
                  <p className="text-xs text-warm-text leading-relaxed">{assetEstimate.reason}</p>
                  <p className="text-[11px] text-warm-text/70 mt-1.5">
                    위 선택지를 탭하면 바로 저장돼요. 다르면 바꿔주세요.
                  </p>
                </div>
              )}

              {assetMode === 'result' && (
                <button type="button"
                  onClick={() => { setAssetMode('help'); setAssetEstimate(null) }}
                  className="mt-2 w-full text-xs text-gray-400 hover:text-navy underline underline-offset-2 transition-colors">
                  다시 물어볼게요
                </button>
              )}

              {assetMode === 'help' && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-navy mb-2">가구원수</p>
                  <div className="flex gap-2 mb-3">
                    {[1, 2, 3, 4, 5, 6].map(n => (
                      <button key={n} type="button"
                        onClick={() => setAssetMemberCount(n)}
                        className={[
                          'flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-all',
                          assetMemberCount === n
                            ? 'border-navy bg-navy/5 text-navy'
                            : 'border-warm-gray/30 bg-white text-gray-600 hover:border-navy/40',
                        ].join(' ')}>
                        {n === 6 ? '6+' : n}
                      </button>
                    ))}
                  </div>
                  {/* 선택한 가구원수 기준 소득 분위 안내 */}
                  <div className="mb-4 rounded-xl bg-primary-bg border border-warm-gray/30 px-3 py-2.5 text-xs text-warm-text space-y-1.5">
                    <p className="font-bold text-navy mb-1">{assetMemberCount}인 가구 기준 (월 소득)</p>
                    <div className="flex justify-between">
                      <span>기초생활수급자</span>
                      <span className="font-semibold text-navy">{INCOME_THRESHOLD[Math.min(assetMemberCount,6)].low}만원 이하 + 수급 중</span>
                    </div>
                    <div className="flex justify-between">
                      <span>차상위계층</span>
                      <span className="font-semibold text-navy">{INCOME_THRESHOLD[Math.min(assetMemberCount,6)].mid}만원 이하</span>
                    </div>
                    <div className="flex justify-between">
                      <span>일반</span>
                      <span className="font-semibold text-navy">{INCOME_THRESHOLD[Math.min(assetMemberCount,6)].mid}만원 초과</span>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-navy mb-2">가족 구성과 직업을 적어주세요</p>
                  <textarea
                    value={assetHelpText}
                    onChange={e => setAssetHelpText(e.target.value)}
                    placeholder="예) 아버지는 택시 운전을 하시고, 어머니는 간호사로 일하세요. 동생은 대학생이에요."
                    rows={3}
                    className="w-full border border-warm-gray/50 bg-white rounded-xl px-4 py-3 text-sm
                               text-navy placeholder:text-warm-gray/50 resize-none
                               focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
                  />
                  <button
                    disabled={!assetHelpText.trim()}
                    onClick={async () => {
                      setAssetMode('loading')
                      try {
                        const result = await estimateIncomeGroup(assetHelpText.trim(), assetMemberCount)
                        setAssetEstimate(result)
                        setDraft(result.asset_group)
                        setAssetMode('result')
                      } catch {
                        setAssetMode('help')
                      }
                    }}
                    className="mt-3 w-full py-3 rounded-2xl bg-navy text-white text-sm font-bold
                               disabled:opacity-40 transition-opacity">
                    마이다에게 추정 부탁하기
                  </button>
                  <button type="button"
                    onClick={() => setAssetMode('choice')}
                    className="mt-2 w-full text-xs text-gray-400 hover:text-navy underline underline-offset-2 transition-colors">
                    직접 고를게요
                  </button>
                </div>
              )}

              {assetMode === 'loading' && (
                <div className="mt-4 flex flex-col items-center gap-2 py-2">
                  <p className="text-sm font-bold text-navy">마이다가 분석 중이에요...</p>
                  <div className="flex gap-1.5">
                    {[0, 0.15, 0.3].map((d, i) => (
                      <span key={i} className="w-2 h-2 rounded-full bg-warm-gray animate-bounce"
                            style={{ animationDelay: `${d}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {assetMode === 'choice' && (
                <button type="button"
                  onClick={() => setAssetMode('help')}
                  className="mt-3 w-full text-sm text-sunset-orange font-semibold
                             hover:text-navy underline underline-offset-2 transition-colors">
                  잘 모르겠어요 → 마이다가 도와드릴게요
                </button>
              )}
            </>
          )}

          {cfg.type === 'age' && (
            <>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[['20대', 25], ['30대', 35], ['40대', 45], ['50대+', 55]].map(([label, val]) => (
                  <button key={label} onClick={() => setDraft(String(val))}
                    className={[
                      'py-3 rounded-xl border-2 text-sm font-semibold transition-all',
                      draft === String(val) ? 'border-navy bg-navy/5 text-navy' : 'border-warm-gray/30 bg-white text-gray-700 hover:border-navy/40',
                    ].join(' ')}>{label}</button>
                ))}
              </div>
              <input type="number" min="10" max="99"
                value={![25,35,45,55].includes(Number(draft)) ? draft : ''}
                onChange={e => setDraft(e.target.value)}
                placeholder="직접 입력 (세)"
                className="w-full border border-warm-gray/50 rounded-xl px-4 py-3 text-sm text-navy mb-4
                           focus:outline-none focus:border-navy/50" />
              <button onClick={() => confirm(draft)} disabled={!draft}
                className="w-full py-3.5 rounded-2xl bg-navy text-white text-sm font-bold disabled:opacity-40">저장</button>
            </>
          )}

          {cfg.type === 'number' && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <input type="number" min={cfg.min ?? 0} max={cfg.max ?? 9999}
                  value={draft} onChange={e => setDraft(e.target.value)}
                  placeholder="숫자 입력"
                  className="flex-1 border border-warm-gray/50 rounded-xl px-4 py-3 text-base text-navy
                             focus:outline-none focus:border-navy/50" />
                <span className="text-sm text-gray-600 flex-shrink-0">{cfg.unit}</span>
              </div>
              <button onClick={() => confirm(draft)}
                className="w-full py-3.5 rounded-2xl bg-navy text-white text-sm font-bold">저장</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// 목록에 그리는 순서
const COMMON_GRID_KEYS = [
  'business_status', 'category',        'business_period_months',
  'age',             'region',           'career_experience',
  'asset_group',     'marital_status',   'living_with_parents',
]

/* 「내 정보」에 그릴 칸.
 *
 * 세무 질문 넷은 온보딩에서 묻기만 하고 여기에는 없었다. 그런데
 * `ui/TaxProfileHint.jsx` 가 「사업자 형태를 정해주시면」 하면서 보내는
 * 곳이 바로 여기다. 도착하면 고칠 데가 없는 막다른 길이었다.
 *
 * 사업 상태에 따라 칸 수가 달라진다. 예비창업자에게 과세유형을 물으면
 * 답할 수가 없고(사업자등록이 아직 없다), 혼자 하는 사장님에게 원천세
 * 반기납부를 물으면 뜻이 없다. 영영 못 채우는 빈 칸을 두면 「9개 중
 * 2개가 비어 있어요」가 거짓말이 된다. */
function gridKeys(profile) {
  if (profile?.business_status !== '운영중') return COMMON_GRID_KEYS
  // 연매출은 운영중인 사장님에게만. 예비창업자는 아직 매출이 없다.
  // 온보딩에서는 안 묻는다 — 지금 공고 81건 중 매출을 조건으로 쓰는 건
  // 「소상공인 경영안정 바우처」 1건뿐이라, 그거 하나 때문에 모두에게
  // 민감한 질문을 던질 값이 안 된다. 매출 조건 공고가 서너 건으로 늘면
  // 그때 온보딩으로 올릴 것.
  const tax = ['annual_revenue_krw', 'entity_type', 'vat_type', 'has_employee']
  if (profile.has_employee === true) tax.push('withholding_half')
  return [...COMMON_GRID_KEYS, ...tax]
}

/* 화면을 성격별로 가르는 머리글.
 *
 * 전에는 머리글이 「내 정보」 하나뿐이었다. 그 아래로 조건 아홉 칸, 카톡
 * 알림, 관심공고, 계정 정리가 구분 없이 쭉 이어져서 어디까지가 무엇인지
 * 알 수가 없었다. 알림 설정이 더해지면서 더 뒤엉켰다. */
function SectionTitle({ children, right = null, className = '' }) {
  return (
    <div className={`flex items-baseline gap-2 mb-2 ${className}`}>
      <h3 className="text-sm font-bold text-navy">{children}</h3>
      {right}
    </div>
  )
}

function ProfileDashboard({ profile: initProfile, onReset, navigate }) {
  const [profile, setProfile] = useState(initProfile)
  const [editing, setEditing] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving]       = useState(false)
  const [leaveError, setLeaveError] = useState('')

  function handleSave(field, value) {
    const next = { ...profile, [field]: value }
    localStorage.setItem('mars-fit-profile', JSON.stringify(next))
    setProfile(next)
    setEditing(null)

    // 서버에도 올린다. 이게 없으면 고친 조건이 이 기기에만 남는다.
    // 카톡 알림은 새벽에 **서버 프로필**로 매칭하므로, 업종을 바꿔도
    // 옛 조건으로 공고가 골라져서 나간다. 화면과 카톡이 다른 말을 한다.
    //
    // 실패해도 화면은 그대로 둔다 — 기기에는 이미 저장됐고, 로그인이
    // 풀렸을 뿐일 수도 있다. 여기서 오류를 띄우면 고친 게 안 된 줄 안다.
    if (getToken()) {
      patchOnboarding({ [field]: value }).catch(() => {})
    }
  }

  function handleLogout() {
    // 전에는 지울 키를 세 개만 적어뒀다. 그 사이 신청목록과 체크리스트
    // 진행상황이 늘었는데 거기 안 들어가서, 로그아웃하고 다른 사람으로
    // 들어와도 앞사람 흔적이 남았다. 접두어로 훑어 통째로 지운다.
    clearLocalData()
    clearToken()
    navigate('/')
  }

  /** 탈퇴 — 서버에 저장된 온보딩 답변까지 지운다.
   *
   *  로그아웃은 이 기기에서만 나가는 것이라, 다시 로그인하면 서버에 있던
   *  답변이 그대로 돌아온다. 시연을 다시 찍거나 남에게 넘길 때는 그게
   *  곤란하다. 여기서는 서버 기록까지 지워서 온보딩 첫 질문으로 돌린다.
   *
   *  users 행은 남긴다 — 사용자가 「탈퇴」로 기대하는 것은 자기가 답한
   *  내용이 사라지는 것이지 로그인 이력이 아니다.
   *
   *  서버가 실패해도 기기의 것은 지운다. 반대로 하면 화면에는 남아 있는데
   *  서버에는 없는 어긋난 상태가 된다. */
  async function handleLeave() {
    setLeaving(true)
    setLeaveError('')
    try {
      await deleteOnboarding()
    } catch (err) {
      // 로그인이 풀렸거나 서버가 죽어도 이 기기는 비워주는 게 낫다.
      setLeaveError(err.message)
    }
    clearLocalData()
    clearToken()
    navigate('/')
  }

  const keys = useMemo(() => gridKeys(profile), [profile])

  const filledCount = keys.filter(k => {
    const v = profile[k]
    return v !== undefined && v !== null && v !== ''
  }).length

  const missing = keys.length - filledCount

  // 빈 칸 먼저, 그다음 채운 칸. 각 무리 안에서는 원래 순서를 지킨다 —
  // 매번 순서가 바뀌면 어디를 눌렀는지 기억할 수가 없다.
  const orderedKeys = useMemo(() => {
    const empty = keys.filter(k => displayValue(k, profile[k]) === null)
    const filled = keys.filter(k => displayValue(k, profile[k]) !== null)
    return [...empty, ...filled]
  }, [keys, profile])

  return (
    <div className="min-h-screen bg-primary-bg pb-24">
      {/* 상단바가 이 화면에만 없었다. 헤더 메뉴의 「내 정보」가 여기로
          오는데, 정작 도착하면 헤더가 사라져서 다른 화면으로 갈 수가 없었다. */}
      <Header />

      {/* 넓은 화면에서 줄이 1150px 까지 늘어나 허전했다. 폭을 잡는다. */}
      <div className="max-w-3xl mx-auto px-5 pt-4 lg:pt-6">

        {/* ── 머리 ── */}
        <h2 className="text-lg font-extrabold text-navy mb-5">내 정보</h2>

        {/* ── 내 조건 ── */}
        <SectionTitle right={
          <span className="ml-auto text-xs font-bold text-warm-text tabular-nums">
            {filledCount} / {keys.length}
          </span>
        }>
          내 조건
        </SectionTitle>
        <p className="text-xs text-warm-text mb-3 leading-relaxed">
          조건이 정확할수록 나에게 맞는 공고만 걸러져요. 탭하면 바로 고칠 수 있어요.
        </p>

        {/* ── 목록 ──
            전에는 88px 정사각 타일 아홉 개였는데 값이 잘렸다. 「기초생활수급자」,
            「예비창업자」 같은 건 칸에 안 들어간다. 게다가 이모지 20px · 라벨 13px ·
            값 12px 라 **값이 제일 작았다** — 값을 보러 온 화면인데.
            줄로 펴면 값에 폭을 다 줄 수 있고 위계도 바로 선다. */}
        {/* 한 줄짜리 목록을 통으로 두면 넓은 화면에서 아홉 줄이 세로로
            길게 늘어진다. 두 칸으로 접으면 화면을 채우면서도 값에 폭을
            충분히 줄 수 있다. 줄마다 따로 떼어놓아 어디를 누르는지가
            더 분명해진다. */}
        {/* 비어 있는 것을 위로 올린다.
            값이 찬 칸과 빈 칸이 섞여 있으면 아홉 줄을 다 훑어야 뭘 채워야
            하는지 알 수 있다. 아래 경고에서야 「2개가 비어 있어요」를
            알게 되는데, 그때는 이미 목록을 다 지나온 뒤다. */}
        <ul className="grid gap-2 sm:grid-cols-2">
          {orderedKeys.map(key => {
            const meta = FIELD_LABELS[key]
            const disp = displayValue(key, profile[key])
            const filled = disp !== null

            return (
              <li key={key}>
                <button
                  onClick={() => setEditing(key)}
                  className={[
                    'w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-2xl border',
                    'transition-colors',
                    filled
                      ? 'bg-white border-warm-gray/30 hover:border-navy/40'
                      : 'bg-white border-dashed border-sunset-orange/40 hover:border-sunset-orange',
                  ].join(' ')}>
                  <span className="w-6 text-center text-base leading-none flex-shrink-0">{meta.emoji}</span>
                  <span className="text-sm text-warm-text flex-shrink-0">{meta.label}</span>
                  <span className={[
                    'flex-1 text-right text-sm truncate',
                    filled ? 'font-extrabold text-navy' : 'font-bold text-sunset-orange',
                  ].join(' ')}>
                    {filled ? disp : '입력하기'}
                  </span>
                  <ChevronRight size={16} className="text-warm-gray flex-shrink-0" />
                </button>
              </li>
            )
          })}
        </ul>

        {/* 비어 있으면 **왜** 채워야 하는지 말해준다. 「미입력」 세 글자만
            띄우면 안 채워도 되는 줄 안다. */}
        {missing > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-warm-text leading-relaxed">
            <AlertTriangle size={14} className="text-sunset-orange flex-shrink-0 mt-px" />
            <span>
              <b className="text-navy">{missing}개</b>가 비어 있어요. 채우면 「확인필요」로 남는 공고가 줄고,
              신청 가능한 것만 더 정확히 걸러집니다.
            </span>
          </p>
        )}

        {/* 「내 지원사업 보러가기」 버튼이 여기 있었다. 조건 섹션 끝인지
            화면 전체의 마무리인지 갈리지 않았다 — 아래로 더 내려가면 알림과
            관심공고가 또 나와서, 그게 끝이 아니었다는 게 뒤늦게 드러난다.
            홈은 상단바에 늘 있으니 뺀다. */}

        {/* ── 알림 ──
            앱 안의 종과 카톡이 같은 설정을 본다. 여기서 끄면 둘 다 안 온다. */}
        <div className="mt-8">
          <SectionTitle>알림</SectionTitle>
          {/* 카톡(어디로 받을지)까지 이 안에 들어 있다. */}
          <NotifySettings profile={profile} />
        </div>

        {/* ── 관심공고 ──
            홈에 같은 목록이 있어서 여기서는 몇 건인지만 알려주고 보낸다.
            담아둔 게 없으면 스스로 안 그린다. */}
        <div className="mt-8">
          <FavoriteNotices variant="summary" />
        </div>

        {/* ── 되돌리는 것들 ──
            전에는 재설정과 로그아웃이 같은 크기로 나란히 있었다. 둘 다
            되돌릴 수 없는 일인데 눈에 제일 먼저 들어왔다. 밑으로 내리고
            글자만 남긴다. */}
        <div className="mt-8 pt-4 border-t border-warm-gray/25 flex items-center justify-between">
          <button onClick={onReset}
            className="flex items-center gap-1.5 text-xs font-semibold text-warm-text
                       hover:text-navy transition-colors">
            <RotateCcw size={13} /> 처음부터 다시 입력
          </button>
          <div className="flex items-center gap-4">
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-semibold text-warm-text
                         hover:text-sunset-orange transition-colors">
              <LogOut size={13} /> 로그아웃
            </button>
            <button onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-warm-text
                         hover:text-red-600 transition-colors">
              <Trash2 size={13} /> 탈퇴
            </button>
          </div>
        </div>
      </div>

      {/* 탈퇴 확인 — 되돌릴 수 없는 일이라 한 번 더 묻는다.
          window.confirm 은 브라우저마다 생김새가 달라서 시연 영상에 그대로
          찍힌다. 편집창과 같은 모양으로 맞춘다. */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
             role="dialog" aria-modal="true" aria-label="탈퇴 확인">
          <div className="absolute inset-0 bg-navy/40" onClick={() => !leaving && setConfirming(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <p className="text-base font-extrabold text-navy">정말 탈퇴할까요?</p>
            <p className="mt-2 text-sm text-warm-text leading-relaxed">
              온보딩에서 답해주신 내용과 관심공고·달력 메모·
              서류 진행상황·신청 목록이 모두 지워져요. 이 기기뿐 아니라
              다른 기기에서 보던 것도 함께 지워지고, 카카오톡 알림도 꺼져요.
              <span className="block mt-1.5 font-semibold text-navy">
                되돌릴 수 없어요.
              </span>
            </p>

            {leaveError && (
              <p className="mt-3 text-xs text-sunset-orange leading-relaxed">
                서버 기록을 지우지 못했어요 ({leaveError}). 이 기기에 있는 것만 지웁니다.
              </p>
            )}

            <div className="mt-5 flex gap-2.5">
              <button onClick={() => setConfirming(false)} disabled={leaving}
                className="flex-1 py-3 rounded-2xl border border-warm-gray/40 text-sm
                           font-bold text-warm-text hover:bg-primary-bg transition disabled:opacity-50">
                취소
              </button>
              <button onClick={handleLeave} disabled={leaving}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-bold
                           hover:brightness-110 transition disabled:opacity-50">
                {leaving ? '지우는 중…' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <InlineEditDrawer
          field={editing}
          profile={profile}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/* ───────────── 본체 ───────────── */
const COMMON_STEPS = ['age', 'region', 'career', 'asset', 'marital', 'parents']

// 세무일정용 3개. 사업자등록이 있어야 답할 수 있어서 **운영중·신규사업자에게만**
// 묻는다. 예비창업자는 아직 과세유형이 없다.
const TAX_STEPS = ['entity', 'vat', 'employee']

// 사업자등록이 완료된 상태 (신규사업자 + 운영중)
const BIZ_STATUSES = ['운영중', '신규사업자']

const EMPTY = {
  category: '', business_status: '', age: '', region: '',
  business_period_months: '', career_experience: '', asset_group: '',
  marital_status: '', living_with_parents: undefined,
  entity_type: '', vat_type: '', has_employee: undefined,
  withholding_half: undefined,
}

/* 시연용 건너뛰기.
 *
 * 카메라 앞에서 질문 10개를 채우면 20~30초가 그냥 지나간다. 미리 채운
 * 프로필로 바로 넘어가는 버튼을 둔다.
 *
 * 대회가 끝나면 지운다. 그때까지는 늘 보인다. */
function DemoSkip() {
  const navigate = useNavigate()

  async function fill(profile) {
    localStorage.setItem('mars-fit-profile', JSON.stringify(profile))

    // 로그인했으면 서버에도 올린다. 시연용이라고 기기에만 두면, 카톡
    // 알림이 새벽에 서버 프로필로 매칭하기 때문에 「프로필 없음」으로
    // 건너뛴다. 시연 중에 카톡이 안 오는 게 제일 곤란하다.
    if (getToken()) {
      try { await saveOnboarding(profile) } catch { /* 기기 저장으로 충분하다 */ }
    }
    navigate('/home')
  }

  return (
    <div className="mt-10 pt-5 border-t border-warm-gray/30">
      <p className="text-xs font-bold tracking-widest text-warm-gray mb-2.5">시연용 · 바로 채우기</p>
      <div className="grid grid-cols-2 gap-2.5">
        {DEMO_PROFILES.map(d => (
          <button key={d.key} type="button" onClick={() => fill(d.profile)}
            className="text-left bg-white border border-warm-gray/40 rounded-xl px-3.5 py-2.5
                       hover:border-navy/50 transition">
            <span className="block text-sm font-bold text-navy leading-snug">{d.label}</span>
            <span className="block text-xs text-warm-text mt-0.5">{d.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()

  // 이미 프로필이 있으면 요약 대시보드 표시
  const [showDashboard, setShowDashboard] = useState(() => {
    const saved = localStorage.getItem('mars-fit-profile')
    if (!saved) return false
    try { JSON.parse(saved); return true } catch { return false }
  })
  // 프로필이 없는 첫 방문자에게만 환영 화면 표시
  // 개발자 도구에서 'mars-fit-dev-welcome' 플래그를 세우면 강제 표시 (프로필 유지)
  const [showWelcome, setShowWelcome] = useState(() => {
    if (localStorage.getItem('mars-fit-dev-welcome') === '1') {
      localStorage.removeItem('mars-fit-dev-welcome')
      return true
    }
    return !localStorage.getItem('mars-fit-profile')
  })
  const savedProfile = (() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile') || 'null') } catch { return null }
  })()

  const [path, setPath]       = useState(null)
  const [stage, setStage]     = useState('q1')
  // 2-C 준비 체크리스트 상태
  const [prepChecklist, setPrepChecklist] = useState({
    hasCategory: false, hasBizPlan: false, hasLocation: false,
    hasContract: false, hasEducation: false, hasPermit: false,
  })
  const [common, setCommon]   = useState(0)
  const [data, setData]       = useState(EMPTY)
  const [wish, setWish]       = useState('')
  const [birth, setBirth]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)
  // 소득분위 LLM 추정 상태
  const [assetMode, setAssetMode]               = useState('choice')  // 'choice'|'help'|'loading'|'result'
  const [assetHelpText, setAssetHelpText]       = useState('')
  const [assetEstimate, setAssetEstimate]       = useState(null)
  const [assetMemberCount, setAssetMemberCount] = useState(4)
  // Path C — OCR
  const [bizMode, setBizMode]     = useState('upload')   // 'upload'|'loading'|'review'|'manual'
  // null = 아직 모름. 모르는 동안에는 사진 쪽을 그대로 둔다.
  const [ocrReady, setOcrReady]   = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  const [ocrError, setOcrError]   = useState('')
  const [openDate, setOpenDate]   = useState('')         // 개업일 수정용 (YYYYMMDD)

  const set = (key, value) => setData(prev => ({ ...prev, [key]: value }))

  /* 사진 읽는 서버가 붙어 있는지 **온보딩을 열자마자** 물어본다.
     사업자등록증 화면은 몇 걸음 뒤라, 도착할 즈음이면 답이 와 있다.
     화면에 닿아서 묻기 시작하면 그 사이에 사진 버튼이 먼저 보인다. */
  useEffect(() => { fetchOcrReady().then(setOcrReady) }, [])

  /* 서버가 「안 붙어 있다」고 하면 사진 화면을 아예 안 낸다.
     사진을 고르고 줄이고 올린 다음에야 안 된다는 말을 듣는 것보다,
     처음부터 직접 입력으로 안내하는 편이 낫다.
     모르는 동안(null)에는 그대로 둔다 — 점검이 안 됐다고 되는 기능을
     감추면 성현이가 서버를 올린 날 아무도 사진을 못 쓴다. */
  useEffect(() => {
    if (ocrReady === false) setBizMode(m => (m === 'upload' ? 'manual' : m))
  }, [ocrReady, bizMode])

  // DevTools에서 이미 마운트된 상태에서 환영 화면 강제 표시
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem('mars-fit-dev-welcome')
      setShowDashboard(false)
      setShowWelcome(true)
    }
    window.addEventListener('dev:show-welcome', handler)
    return () => window.removeEventListener('dev:show-welcome', handler)
  }, [])

  // 운영중이면 세무 질문 3개가 붙는다
  // 원천세 반기납부는 **직원이 있다고 답한 사람에게만** 묻는다. 혼자
  // 하는 사장님에게는 원천세 자체가 없어서 물어도 답할 게 없다.
  //
  // 목록이 답에 따라 늘어난다. 「네, 있어요」를 누르면 그 순간 칸이 하나
  // 붙고 다음 화면이 생긴다. nextCommon 이 이 배열을 ref 로 읽는 이유다 —
  // 클릭 시점 클로저를 그대로 쓰면 늘어난 걸 모르고 끝내버린다.
  const steps = useMemo(() => {
    if (!BIZ_STATUSES.includes(data.business_status)) return COMMON_STEPS
    const tax = [...TAX_STEPS]
    if (data.has_employee === true) tax.push('withholding')
    return [...COMMON_STEPS, ...tax]
  }, [data.business_status, data.has_employee])

  // 선택지를 누르면 setTimeout 으로 다음 칸에 간다. 그 함수는 **누른
  // 시점의 값**을 들고 있어서, 마지막 질문이면 방금 고른 답이 빠진 채로
  // 저장됐다. 「직원을 두고 계세요?」가 바로 그 마지막이었다.
  const dataRef = useRef(data)
  const stepsRef = useRef(steps)
  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { stepsRef.current = steps }, [steps])

  /* 진행률: 경로마다 화면 수가 다르다.
     **칸 수는 바를 실제로 그리는 화면 수와 같아야 한다.** 전에는 뒤에 +1 이
     붙어 있었는데 그 몫이 완료 화면이었다. 완료 화면은 Shell 을 안 써서
     바가 아예 없다 — 그래서 마지막 칸이 네 갈래 전부에서 영영 회색이었다.

     공통 질문 앞에 오는 화면 수도 경로마다 다르다. A 는 q1·분야·세부 셋,
     B·C 는 q1 과 하나씩 둘이다. 이 수를 안 더해줘서 「하고 싶은 게 있어요」
     (B)와 사업자등록증(C) 화면이 첫 공통 질문과 **같은 칸을 썼다.** 등록증
     사진을 올리고 읽는 내내 2번에 머물다가 나이 질문에서도 2번이라,
     진행이 멈춘 것처럼 보였다. */
  const lead = path === 'A' ? 3 : 2          // 공통 질문 앞 화면 수
  const total = useMemo(() => lead + steps.length, [lead, steps])
  const current = useMemo(() => {
    if (stage === 'q1') return 1
    if (stage === 'common') return lead + 1 + common
    if (path === 'A' && stage === 'sub') return 3
    return 2  // wish / prep / biz
  }, [stage, common, path, lead])

  // 읽어낸 값을 프로필에 옮긴다. mock 과 실제가 같은 것을 쓰게 한 곳이다.
  // 예전에는 두 벌로 적혀 있었고, mock 쪽만 키가 영문이라 조용히 아무것도
  // 안 채워졌다.
  //
  // 사장님이 다음 화면에서 고칠 수 있으므로, 읽은 값은 정답이 아니라
  // 기본값으로만 넣는다.
  function applyOcr(r, profile = {}) {
    setOcrResult(r)
    if (r.업종) set('category', r.업종)
    if (r.개업일) {
      setOpenDate(r.개업일)
      set('business_period_months', monthsFromOpen(r.개업일))
    }
    // 사업자등록증에 찍혀 있는 것. 세무일정이 이 값으로 갈린다 —
    // 간이과세자는 부가세 신고가 1년에 한 번뿐이다.
    const vat = { 일반과세자: '일반과세', 간이과세자: '간이과세' }[r.과세유형]
    if (vat) set('vat_type', vat)
    // profile 에서 추가로 채울 수 있는 필드
    if (profile.age)  set('age', profile.age)
    // region 은 화성시만 확정 가능 — 주소가 화성이 아닐 때는 경기도/타지역 구분 불가
    if (profile.region === '화성시') set('region', '화성시')
    setBizMode('review')
  }

  // Path C OCR 업로드
  function uploadOcr(file) {
    setBizMode('loading')
    setOcrError('')

    if (localStorage.getItem('mars-mock') === 'true') {
      mockOcrResult().then(applyOcr)
      return
    }

    // 원본을 그대로 보내지 않는다. shrinkImage 의 주석을 볼 것.
    shrinkImage(file)
      .then(async (image) => {
        const res = await fetch(apiUrl('/api/ocr'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, mimeType: 'image/jpeg' }),
        })
        const json = await res.json()
        if (!res.ok || json.error) throw new Error(json.error || 'OCR 실패')
        applyOcr(json.result, json.profile || {})
      })
      .catch((err) => {
        setOcrError(err.message || 'OCR에 실패했어요. 다시 시도하거나 직접 입력해주세요.')
        setBizMode('upload')
      })
  }

  // 현재 단계의 마이다 말풍선
  const marsMsgKey = stage === 'biz'
    ? (bizMode === 'review' ? 'biz-review' : bizMode === 'manual' ? 'biz-manual' : 'biz')
    : stage === 'common' ? COMMON_STEPS[common] : stage
  const marsMsg = MARS_MESSAGES[marsMsgKey]

  function startCommon(nextPath, patch) {
    setData(prev => ({ ...prev, ...patch }))
    setPath(nextPath)
    setStage('common')
    setCommon(0)
    // 경로와 체크리스트를 journey에 저장
    saveJourney({ onboardingPath: nextPath, prepChecklist })
  }

  function nextCommon() {
    if (common < stepsRef.current.length - 1) { setCommon(c => c + 1); return }
    finish()
  }

  async function finish() {
    const profile = dataRef.current
    localStorage.setItem('mars-fit-profile', JSON.stringify(profile))
    if (getToken()) {
      try { await saveOnboarding(profile) } catch { /* 로컬 저장으로 대체 */ }
    }
    setDone(true)
  }

  function handleConfirm() {
    const profile = (() => {
      try { return JSON.parse(localStorage.getItem('mars-fit-profile') || 'null') } catch { return null }
    })()
    const isPreStartup = profile?.business_status === '예비창업자'
    navigate(isPreStartup ? '/district' : '/home')
  }

  /* ── 내 정보 대시보드 ── */
  if (showDashboard && savedProfile) {
    return (
      <ProfileDashboard
        profile={savedProfile}
        onReset={() => { setShowDashboard(false); setShowWelcome(false) }}
        navigate={navigate}
      />
    )
  }

  /* ── 환영 화면 (첫 방문자) ── */
  if (showWelcome) {
    return <WelcomeScreen onStart={() => setShowWelcome(false)} />
  }

  /* ── 완료 화면 ── */
  if (done) {
    return <DoneScreen count={null} onConfirm={handleConfirm} />
  }

  /* ── Q1 ── */
  if (stage === 'q1') {
    return (
      <Shell current={current} total={total} marsMessage={marsMsg} stageKey="q1">
        <Ask title="지금 어디까지 준비하셨나요?"
             why="상황에 따라 받을 수 있는 지원사업이 완전히 달라져요.">
          <div className="flex flex-col gap-3">
            <Choice emoji="🌱" label="아직 뭘 할지 모르겠어요"
              desc="관심 분야부터 가볍게 탐색해봐요"
              onClick={() => { setPath('A'); setStage('field') }} />
            <Choice emoji="💡" label="하고 싶은 게 있어요"
              desc="구체적인 창업 아이디어가 있어요"
              onClick={() => { setPath('B'); setStage('wish') }} />
            <Choice emoji="📋" label="창업을 준비하고 있어요"
              desc="업종·장소·교육 등 준비 중이에요"
              onClick={() => { setPath('C'); setStage('prep') }} />
            <Choice emoji="📄" label="사업자등록까지 했어요"
              desc="사업자등록증이 발급됐어요"
              onClick={() => { setPath('D'); setStage('biz') }} />
            <Choice emoji="🏪" label="이미 운영 중이에요"
              desc="사업자등록증이 있고 운영 중이에요"
              onClick={() => { setPath('E'); setStage('biz') }} />
          </div>
        </Ask>
      </Shell>
    )
  }

  /* ── C 창업 준비 체크리스트 ── */
  if (stage === 'prep') {
    function startFromPrep() {
      // 체크된 항목 중 가장 앞선 단계를 기준으로 업종 묻기
      const needCategory = !prepChecklist.hasCategory
      const category = needCategory ? '' : (data.category || '')
      startCommon('C', {
        category,
        business_status: '예비창업자',
      })
    }

    return (
      <Shell current={current} total={total} onBack={() => setStage('q1')}
             marsMessage={marsMsg} stageKey="prep">
        <Ask title="어디까지 준비하셨어요?"
             why="완료한 단계를 건너뛰고 딱 필요한 다음 단계부터 안내해드려요.">
          <div className="flex flex-col gap-2.5 mb-6">
            {PREP_ITEMS.map(item => {
              const checked = prepChecklist[item.key]
              return (
                <button
                  key={item.key}
                  onClick={() => setPrepChecklist(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={[
                    'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
                    checked
                      ? 'border-navy bg-navy/5 text-navy'
                      : 'border-warm-gray/30 bg-white text-gray-700 hover:border-navy/30',
                  ].join(' ')}>
                  <span className={[
                    'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                    checked ? 'border-navy bg-navy' : 'border-warm-gray/50',
                  ].join(' ')}>
                    {checked && <span className="text-white text-xs font-bold">✓</span>}
                  </span>
                  <span className="text-sm font-semibold">{item.label}</span>
                </button>
              )
            })}
          </div>

          <p className="text-xs text-warm-text mb-4 text-center">
            아직 아무것도 안 하셨어도 괜찮아요. 처음부터 같이 해요!
          </p>

          <Button variant="navy" fullWidth onClick={startFromPrep}>
            {Object.values(prepChecklist).some(Boolean)
              ? '다음 단계로 이어서 →'
              : '처음부터 시작할게요 →'}
          </Button>
        </Ask>
      </Shell>
    )
  }

  /* ── A-1 분야 ── */
  if (stage === 'field') {
    return (
      <Shell current={current} total={total} onBack={() => setStage('q1')}
             marsMessage={marsMsg} stageKey="field">
        <Ask title="어떤 분야가 끌리세요?"
             why="관심 분야에 맞는 창업 지원사업을 찾아드려요.">
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <Choice key={f.key} emoji={f.emoji} label={f.label}
                onClick={() => {
                  if (f.sub) { setStage('sub'); return }
                  startCommon('A', { category: f.category, business_status: '예비창업자' })
                }} />
            ))}
          </div>
        </Ask>
      </Shell>
    )
  }

  /* ── A-2 세부 (요리) ── */
  if (stage === 'sub') {
    return (
      <Shell current={current} total={total} onBack={() => setStage('field')}
             marsMessage={marsMsg} stageKey="sub">
        <Ask title="요리 쪽이군요! 조금 더 알려주세요">
          <div className="flex flex-col gap-3">
            <Choice emoji="☕" label="카페·음료·디저트"
              onClick={() => startCommon('A', { category: '카페', business_status: '예비창업자' })} />
            <Choice emoji="🍜" label="식당·밥집·분식"
              onClick={() => startCommon('A', { category: '음식점', business_status: '예비창업자' })} />
          </div>
        </Ask>
      </Shell>
    )
  }

  /* ── B 자유 입력 ── */
  if (stage === 'wish') {
    async function submitWish(text) {
      setError(''); setBusy(true)
      try {
        const category = await classifyCategory(text)
        startCommon('B', { category, business_status: '예비창업자' })
      } catch {
        setError('업종을 알아보지 못했어요. 아래에서 직접 골라주세요.')
      } finally {
        setBusy(false)
      }
    }
    return (
      <Shell current={current} total={total} onBack={() => setStage('q1')}
             marsMessage={marsMsg} stageKey="wish">
        <Ask title="어떤 창업을 생각하고 계세요?"
             why="업종에 따라 받을 수 있는 지원이 달라요.">
          <input
            value={wish} onChange={e => setWish(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && wish.trim()) submitWish(wish.trim()) }}
            placeholder="예) 동탄에서 카페를 열고 싶어요"
            className="w-full border border-warm-gray/50 bg-white rounded-xl px-4 py-3 text-sm
                       text-navy placeholder:text-warm-gray/60
                       focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
          />
          <Button variant="navy" fullWidth className="mt-3"
            disabled={!wish.trim() || busy}
            onClick={() => submitWish(wish.trim())}>
            {busy ? '마이다가 읽고 있어요...' : '이걸로 찾아보기'}
          </Button>
          {error && <p className="text-xs text-sunset-orange mt-2">{error}</p>}

          <p className="text-xs font-semibold text-gray-500 mt-6 mb-2">자주 찾는 업종</p>
          <div className="flex flex-wrap gap-2">
            {KEYWORDS.map(word => (
              <button key={word} onClick={() => submitWish(word)} disabled={busy}
                className="text-xs border border-navy/30 text-navy rounded-full px-3 py-1.5
                           hover:bg-navy/5 transition-colors disabled:opacity-50">
                {word}
              </button>
            ))}
          </div>
        </Ask>
      </Shell>
    )
  }

  /* ── D·E 사업 정보 (OCR 업로드 → 확인 → 또는 직접 입력) ── */
  if (stage === 'biz') {
    // D = 신규사업자(등록 완료, 아직 운영 전), E = 운영중
    const bizStatus = path === 'E' ? '운영중' : '신규사업자'

    const bizBack = bizMode === 'upload' || bizMode === 'manual'
      ? () => { setBizMode('upload'); setStage('q1') }
      : () => setBizMode('upload')

    /* 업로드 중 로딩 */
    if (bizMode === 'loading') {
      return (
        <Shell current={current} total={total} marsMessage={null} stageKey="biz-loading">
          <div className="flex flex-col items-center justify-center py-16 gap-5">
            <div className="w-16 h-16 rounded-full bg-navy/10 flex items-center justify-center">
              <span className="text-3xl animate-spin-slow">📄</span>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-navy">마이다가 사업자등록증을</p>
              <p className="text-base font-bold text-navy">읽고 있어요...</p>
            </div>
            <div className="flex gap-1.5">
              {[0, 0.15, 0.3].map((d, i) => (
                <span key={i} className="w-2 h-2 rounded-full bg-warm-gray animate-bounce"
                      style={{ animationDelay: `${d}s` }} />
              ))}
            </div>
          </div>
        </Shell>
      )
    }

    /* OCR 결과 확인 */
    if (bizMode === 'review') {
      const months = monthsFromOpen(openDate)
      return (
        <Shell current={current} total={total} onBack={bizBack}
               marsMessage={marsMsg} stageKey="biz-review">
          <Ask title="정보를 확인해주세요" why="틀린 내용이 있으면 바로 수정하세요.">

            {/* 상호명 */}
            {ocrResult?.상호명 && (
              <div className="mb-4 bg-navy/5 rounded-2xl px-4 py-3">
                <p className="text-xs text-warm-text font-semibold mb-0.5">상호명</p>
                <p className="text-base font-bold text-navy">{ocrResult.상호명}</p>
              </div>
            )}

            {/* 업종 */}
            <div className="mb-4">
              <p className="text-sm font-semibold text-navy mb-2">업종</p>
              <div className="grid grid-cols-2 gap-2">
                {['카페', '음식점', '소매업', '제조업', '기타'].map(v => (
                  <button key={v}
                    onClick={() => set('category', v)}
                    className={[
                      'py-2.5 rounded-xl border-2 text-sm font-semibold transition-all',
                      data.category === v
                        ? 'border-navy bg-navy/5 text-navy'
                        : 'border-warm-gray/30 bg-white text-gray-700 hover:border-navy/40',
                    ].join(' ')}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* 개업일 */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-navy mb-1.5">
                개업일 <span className="text-warm-text font-normal">(8자리, YYYYMMDD)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  inputMode="numeric" maxLength={8} value={openDate}
                  onChange={e => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 8)
                    setOpenDate(d)
                    if (/^\d{8}$/.test(d)) set('business_period_months', monthsFromOpen(d))
                  }}
                  className="w-36 border border-warm-gray/50 rounded-xl px-3 py-2.5 text-sm
                             text-navy tracking-widest focus:outline-none focus:border-navy/50"
                  placeholder="20200315"
                />
                {months > 0 && (
                  <span className="text-sm font-bold text-sunset-orange">{months}개월 운영</span>
                )}
              </div>
            </div>

            {/* 주소 */}
            {ocrResult?.주소 && (
              <div className="mb-5 text-xs text-warm-text bg-warm-gray/10 rounded-xl px-3 py-2.5">
                📍 {ocrResult.주소}
              </div>
            )}

            <Button variant="navy" fullWidth disabled={!data.category}
              onClick={() => startCommon(path, { business_status: bizStatus })}>
              이대로 맞아요 →
            </Button>
            <button onClick={() => setBizMode('upload')}
              className="mt-3 w-full text-sm text-gray-500 hover:text-navy underline underline-offset-2">
              다시 업로드할게요
            </button>
          </Ask>
        </Shell>
      )
    }

    /* 직접 입력 (manual) */
    if (bizMode === 'manual') {
      return (
        <Shell current={current} total={total} onBack={bizBack}
               marsMessage={marsMsg} stageKey="biz-manual">
          <Ask title="어떤 업종을 하고 계세요?"
               why="업종과 운영 기간에 따라 신청할 수 있는 사업이 달라져요.">
            <div className="grid grid-cols-2 gap-3 mb-5">
              {['카페', '음식점', '소매업', '제조업', '기타'].map(v => (
                <Choice key={v} label={v} selected={data.category === v}
                  onClick={() => set('category', v)} />
              ))}
            </div>

            <label className="block text-sm font-semibold text-navy mb-1.5">
              개업일 <span className="text-warm-text font-normal">(8자리)</span>
            </label>
            <div className="flex items-center gap-3 mb-6">
              <input
                inputMode="numeric" maxLength={8} value={openDate}
                onChange={e => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 8)
                  setOpenDate(d)
                  if (/^\d{8}$/.test(d)) set('business_period_months', monthsFromOpen(d))
                }}
                placeholder="20200315"
                className="w-36 border border-warm-gray/50 rounded-xl px-3 py-2.5 text-sm
                           text-navy tracking-widest focus:outline-none focus:border-navy/50"
              />
              {data.business_period_months > 0 && (
                <span className="text-sm font-bold text-sunset-orange">
                  {data.business_period_months}개월 운영
                </span>
              )}
            </div>

            <Button variant="navy" fullWidth disabled={!data.category}
              onClick={() => startCommon(path, { business_status: bizStatus })}>
              다음
            </Button>
          </Ask>
        </Shell>
      )
    }

    /* 기본: 업로드 화면 */
    return (
      <Shell current={current} total={total} onBack={bizBack}
             marsMessage={marsMsg} stageKey="biz-upload">
        <Ask title="사업자등록증을 올려주세요"
             why="자동으로 업종·개업일을 읽어서 입력해드려요.">

          <label className="relative flex flex-col items-center justify-center w-full
                            border-2 border-dashed border-navy/30 rounded-3xl
                            bg-white hover:border-navy/60 hover:bg-navy/[0.02]
                            transition-all cursor-pointer min-h-[180px] gap-3 px-6">
            <input type="file" accept="image/*,.pdf" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadOcr(f) }} />
            <span className="text-4xl">📄</span>
            <div className="text-center">
              <p className="text-sm font-bold text-navy">여기를 눌러 파일 선택</p>
              <p className="text-xs text-warm-text mt-1">JPG · PNG · PDF 지원</p>
            </div>
            <span className="text-xs bg-navy/5 text-navy px-3 py-1.5 rounded-full font-medium">
              📷 카메라로 촬영해도 돼요
            </span>
          </label>

          {ocrError && (
            <div className="mt-3 bg-sunset-orange/10 border border-sunset-orange/30 rounded-xl px-4 py-3">
              <p className="text-xs text-sunset-orange font-semibold">⚠ {ocrError}</p>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-warm-gray/30" />
            <span className="text-xs text-warm-text">또는</span>
            <div className="flex-1 h-px bg-warm-gray/30" />
          </div>

          <button onClick={() => setBizMode('manual')}
            className="mt-4 w-full text-sm text-navy hover:underline underline-offset-2 font-medium">
            직접 입력할게요 →
          </button>
        </Ask>
      </Shell>
    )
  }

  /* ── 공통 기본정보 ── */
  const step = steps[common]
  const back = common > 0
    ? () => setCommon(c => c - 1)
    : () => setStage(
        path === 'A' ? 'field'
        : path === 'B' ? 'wish'
        : path === 'C' ? 'prep'
        : 'biz'  // D, E
      )

  const stageKey = `common-${step}`

  return (
    <Shell current={current} total={total} onBack={back} marsMessage={marsMsg} stageKey={stageKey}>

      {/* 나이 */}
      {step === 'age' && (
        <Ask title="나이를 알려주세요"
             why="청년·시니어 전용 지원사업이 따로 있어요.">
          <label className="block text-sm font-semibold text-navy mb-1.5">생년월일 8자리</label>
          <div className="relative">
            <input
              inputMode="numeric" maxLength={8} value={birth}
              onChange={e => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
                setBirth(digits)
                const age = ageFromBirth(digits)
                if (age !== null) set('age', age)
              }}
              placeholder="19950315"
              className="w-full border border-warm-gray/50 bg-white rounded-xl px-4 py-3 text-base
                         text-navy tracking-widest placeholder:text-warm-gray/50
                         focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
            />
            {ageFromBirth(birth) !== null && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-sunset-orange">
                만 {ageFromBirth(birth)}세
              </span>
            )}
          </div>

          <p className="text-xs font-semibold text-gray-500 mt-5 mb-2">또는 대략만 골라주세요</p>
          <div className="grid grid-cols-4 gap-2">
            {[['20대', 25], ['30대', 35], ['40대', 45], ['50대+', 55]].map(([label, age]) => (
              <button key={label}
                onClick={() => { setBirth(''); set('age', age) }}
                className={`rounded-xl border-2 py-2.5 text-xs font-semibold transition-all ${
                  data.age === age
                    ? 'border-navy bg-navy/5 text-navy'
                    : 'border-warm-gray/30 bg-white text-gray-700 hover:border-navy/40'}`}>
                {label}
              </button>
            ))}
          </div>

          <Button variant="navy" fullWidth className="mt-6" disabled={!data.age} onClick={nextCommon}>
            다음
          </Button>
          <SkipLink onClick={() => { set('age', ''); nextCommon() }} />
        </Ask>
      )}

      {/* 지역 */}
      {step === 'region' && (
        <Ask title="어디에 계세요?"
             why="화성시 전용 지원인지 확인해드려요.">
          <div className="flex flex-col gap-3">
            {[
              ['화성시', '화성시 내 소재', '📍'],
              ['경기도', '화성시 외 경기도', '🗺'],
              ['타지역', '그 외 지역', '✈️'],
            ].map(([value, desc, emoji]) => (
              <Choice key={value} emoji={emoji} label={value} desc={desc}
                selected={data.region === value}
                onClick={() => { set('region', value); setTimeout(nextCommon, 150) }} />
            ))}
          </div>
          <SkipLink onClick={() => { set('region', ''); nextCommon() }} />
        </Ask>
      )}

      {/* 창업 경험 */}
      {step === 'career' && (
        <Ask title="전에 창업해본 적 있으세요?"
             why="첫 창업자 전용 지원이 많아요.">
          <div className="grid grid-cols-2 gap-3">
            <Choice emoji="🙋" label="처음이에요" desc="창업이 처음이에요"
              selected={data.career_experience === '없음'}
              onClick={() => { set('career_experience', '없음'); setTimeout(nextCommon, 150) }} />
            <Choice emoji="🔄" label="해본 적 있어요" desc="창업 경험이 있어요"
              selected={data.career_experience === '있음'}
              onClick={() => { set('career_experience', '있음'); setTimeout(nextCommon, 150) }} />
          </div>
          <SkipLink onClick={() => { set('career_experience', ''); nextCommon() }} />
        </Ask>
      )}

      {/* 소득 분위 */}
      {step === 'asset' && (
        <Ask title="가구 소득 분위를 알려주세요"
             why="저소득 가구 전용 지원이 따로 있어요.">

          {/* 선택지 — 항상 표시. result 모드에서는 추정된 값이 미리 선택됨 */}
          <div className="flex flex-col gap-3">
            {[
              ['일반', '해당 없음'],
              ['차상위', '기준 중위소득 50% 이하'],
              ['기초생활수급자', '기초생활수급자'],
            ].map(([value, desc]) => (
              <Choice key={value} label={value} desc={desc}
                selected={data.asset_group === value}
                onClick={() => {
                  set('asset_group', value)
                  // result 모드에서 직접 고르면 바로 다음 단계로
                  if (assetMode === 'result') { setTimeout(nextCommon, 150); return }
                  setTimeout(nextCommon, 150)
                }} />
            ))}
          </div>

          {/* result 모드: LLM 추정 결과 카드 */}
          {assetMode === 'result' && assetEstimate && (
            <div className="mt-4 bg-navy/5 border border-navy/20 rounded-2xl px-4 py-3">
              <p className="text-xs font-bold text-navy mb-1">
                💡 마이다 추정 — {assetEstimate.estimated_monthly}
              </p>
              <p className="text-xs text-warm-text leading-relaxed">{assetEstimate.reason}</p>
              <p className="text-[11px] text-warm-text/70 mt-1.5">
                위 선택지를 탭하면 바로 다음으로 넘어가요. 다르다고 생각되면 바꿔주세요.
              </p>
            </div>
          )}

          {/* result 모드: 다시 물어보기 */}
          {assetMode === 'result' && (
            <button type="button"
              onClick={() => { setAssetMode('help'); setAssetEstimate(null) }}
              className="mt-3 w-full text-xs text-gray-400 hover:text-navy underline underline-offset-2 transition-colors">
              다시 물어볼게요
            </button>
          )}

          {/* help 모드: 가족 상황 입력 */}
          {assetMode === 'help' && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-navy mb-2">가구원수</p>
              <div className="flex gap-2 mb-3">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button key={n} type="button"
                    onClick={() => setAssetMemberCount(n)}
                    className={[
                      'flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all',
                      assetMemberCount === n
                        ? 'border-navy bg-navy/5 text-navy'
                        : 'border-warm-gray/30 bg-white text-gray-600 hover:border-navy/40',
                    ].join(' ')}>
                    {n === 6 ? '6+' : n}
                  </button>
                ))}
              </div>
              {/* 선택한 가구원수 기준 소득 분위 안내 */}
              <div className="mb-4 rounded-xl bg-primary-bg border border-warm-gray/30 px-3 py-2.5 text-xs text-warm-text space-y-1.5">
                <p className="font-bold text-navy mb-1">{assetMemberCount}인 가구 기준 (월 소득)</p>
                <div className="flex justify-between">
                  <span>기초생활수급자</span>
                  <span className="font-semibold text-navy">{INCOME_THRESHOLD[Math.min(assetMemberCount,6)].low}만원 이하 + 수급 중</span>
                </div>
                <div className="flex justify-between">
                  <span>차상위계층</span>
                  <span className="font-semibold text-navy">{INCOME_THRESHOLD[Math.min(assetMemberCount,6)].mid}만원 이하</span>
                </div>
                <div className="flex justify-between">
                  <span>일반</span>
                  <span className="font-semibold text-navy">{INCOME_THRESHOLD[Math.min(assetMemberCount,6)].mid}만원 초과</span>
                </div>
              </div>
              <p className="text-sm font-semibold text-navy mb-2">
                가족 구성과 직업을 적어주세요
              </p>
              <textarea
                value={assetHelpText}
                onChange={e => setAssetHelpText(e.target.value)}
                placeholder="예) 아버지는 택시 운전을 하시고, 어머니는 간호사로 일하세요. 동생은 대학생이에요."
                rows={3}
                className="w-full border border-warm-gray/50 bg-white rounded-xl px-4 py-3 text-sm
                           text-navy placeholder:text-warm-gray/50 resize-none
                           focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
              />
              <Button variant="navy" fullWidth className="mt-3"
                disabled={!assetHelpText.trim()}
                onClick={async () => {
                  setAssetMode('loading')
                  try {
                    const result = await estimateIncomeGroup(assetHelpText.trim(), assetMemberCount)
                    setAssetEstimate(result)
                    set('asset_group', result.asset_group)
                    setAssetMode('result')
                  } catch {
                    setAssetMode('help')
                  }
                }}>
                마이다에게 추정 부탁하기
              </Button>
              <button type="button"
                onClick={() => setAssetMode('choice')}
                className="mt-3 w-full text-xs text-gray-400 hover:text-navy underline underline-offset-2 transition-colors">
                직접 고를게요
              </button>
            </div>
          )}

          {/* loading 모드 */}
          {assetMode === 'loading' && (
            <div className="mt-5 flex flex-col items-center gap-3 py-4">
              <p className="text-sm font-bold text-navy">마이다가 분석 중이에요...</p>
              <div className="flex gap-1.5">
                {[0, 0.15, 0.3].map((d, i) => (
                  <span key={i} className="w-2 h-2 rounded-full bg-warm-gray animate-bounce"
                        style={{ animationDelay: `${d}s` }} />
                ))}
              </div>
            </div>
          )}

          {/* choice 모드: 스킵 / 도움 요청 */}
          {assetMode === 'choice' && (
            <>
              <button type="button"
                onClick={() => setAssetMode('help')}
                className="mt-4 w-full text-sm text-sunset-orange font-semibold
                           hover:text-navy underline underline-offset-2 transition-colors">
                잘 모르겠어요 → 마이다가 도와드릴게요
              </button>
              <SkipLink onClick={() => { set('asset_group', '일반'); nextCommon() }}>
                건너뛸게요 (일반으로 볼게요)
              </SkipLink>
            </>
          )}
        </Ask>
      )}

      {/* 결혼 여부 */}
      {step === 'marital' && (
        <Ask title="결혼하셨나요?"
             why="한부모·다자녀 대상 지원이 일부 있어요.">
          <div className="grid grid-cols-2 gap-3">
            {[['미혼', '💍', '아직 미혼이에요'], ['기혼', '💑', '결혼했어요']].map(([v, emoji, desc]) => (
              <Choice key={v} emoji={emoji} label={v} desc={desc}
                selected={data.marital_status === v}
                onClick={() => { set('marital_status', v); setTimeout(nextCommon, 150) }} />
            ))}
          </div>
          <SkipLink onClick={() => { set('marital_status', ''); nextCommon() }}>
            말하고 싶지 않아요
          </SkipLink>
        </Ask>
      )}

      {step === 'entity' && (
        <Ask title="사업자 형태가 어떻게 되세요?" why="내야 하는 세금 종류가 달라져요.">
          <div className="grid grid-cols-2 gap-3">
            <Choice emoji="🙍" label="개인사업자" desc="대부분 여기예요"
              selected={data.entity_type === '개인'}
              onClick={() => { set('entity_type', '개인'); setTimeout(nextCommon, 120) }} />
            <Choice emoji="🏢" label="법인사업자" desc="주식회사·유한회사"
              selected={data.entity_type === '법인'}
              onClick={() => { set('entity_type', '법인'); setTimeout(nextCommon, 120) }} />
          </div>
          <SkipLink onClick={() => { set('entity_type', ''); nextCommon() }}>
            잘 모르겠어요
          </SkipLink>
        </Ask>
      )}

      {step === 'vat' && (
        <Ask title="부가세는 어떻게 내세요?"
             why="이거 하나로 1년에 몇 번 신고하는지가 정해져요.">
          <div className="flex flex-col gap-3">
            {[
              ['일반과세', '연 매출 1억 400만원 이상이면 대개 여기'],
              ['간이과세', '연 1회만 신고하면 돼요'],
              ['면세', '학원·병원·농축수산물 등'],
            ].map(([value, desc]) => (
              <Choice key={value} label={value} desc={desc} selected={data.vat_type === value}
                onClick={() => { set('vat_type', value); setTimeout(nextCommon, 120) }} />
            ))}
          </div>
          <SkipLink onClick={() => { set('vat_type', ''); nextCommon() }}>
            잘 모르겠어요 (사업자등록증에 적혀 있어요)
          </SkipLink>
        </Ask>
      )}

      {step === 'employee' && (
        <Ask title="직원을 두고 계세요?" why="직원이 있으면 매달 챙길 신고가 하나 더 있어요.">
          <div className="grid grid-cols-2 gap-3">
            <Choice emoji="👥" label="네, 있어요" desc="아르바이트 포함"
              selected={data.has_employee === true}
              onClick={() => { set('has_employee', true); setTimeout(nextCommon, 120) }} />
            <Choice emoji="🙋" label="저 혼자예요" selected={data.has_employee === false}
              onClick={() => { set('has_employee', false); setTimeout(nextCommon, 120) }} />
          </div>
          <SkipLink onClick={() => { set('has_employee', undefined); nextCommon() }}>
            건너뛰기
          </SkipLink>
        </Ask>
      )}

      {step === 'withholding' && (
        <Ask title="원천세를 언제 내세요?"
             why="반기납부 승인을 받으셨으면 1년에 열두 번이 두 번으로 줄어요.">
          <div className="flex flex-col gap-3">
            <Choice emoji="📆" label="매월 10일" desc="따로 신청한 적 없으면 여기예요"
              selected={data.withholding_half === false}
              onClick={() => { set('withholding_half', false); setTimeout(nextCommon, 120) }} />
            <Choice emoji="🗓" label="1월·7월 두 번" desc="반기납부 승인을 받았어요"
              selected={data.withholding_half === true}
              onClick={() => { set('withholding_half', true); setTimeout(nextCommon, 120) }} />
          </div>
          {/* 승인은 신청해서 받는 것이라 「자동으로 되는 게 아니다」를
              알려준다. 안 받았는데 두 번만 내면 열 달치가 납부지연이 된다. */}
          <p className="mt-3 text-[13px] text-warm-text leading-relaxed">
            반기납부는 상시 근로자 20명 이하인 사업장이 <b className="text-navy">신청해서
            승인을 받아야</b> 해요. 신청한 적이 없으면 매월 10일이에요.
          </p>
          <SkipLink onClick={() => { set('withholding_half', undefined); nextCommon() }}>
            잘 모르겠어요
          </SkipLink>
        </Ask>
      )}

      {step === 'parents' && (
        <Ask title="부모님과 함께 사세요?"
             why="일부 공모에서 확인하는 조건이에요.">
          <div className="grid grid-cols-2 gap-3">
            <Choice emoji="🏠" label="네, 함께 살아요"
              selected={data.living_with_parents === true}
              onClick={() => { set('living_with_parents', true); setTimeout(nextCommon, 150) }} />
            <Choice emoji="🏡" label="아니요, 따로요"
              selected={data.living_with_parents === false}
              onClick={() => { set('living_with_parents', false); setTimeout(nextCommon, 150) }} />
          </div>
          <SkipLink onClick={() => { set('living_with_parents', undefined); nextCommon() }}>
            건너뛸게요
          </SkipLink>
        </Ask>
      )}
    </Shell>
  )
}

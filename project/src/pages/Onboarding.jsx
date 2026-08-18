import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import logoImg from '../../design/logo.png'
import findImg from '../../design/find.png'
import { getToken, saveOnboarding } from '../utils/api'
import { generateText } from '../utils/llm/llmProvider'

/**
 * 온보딩 — 성현 기획서(docs/온보딩_기획서.txt) 구조.
 *
 *   Q1 상황 → 경로 A·B·C → 공통 기본정보 6문항 → 완료
 *
 * 원칙
 *   · 한 화면에 질문 하나
 *   · 왜 묻는지 한 줄로 밝힌다 (안 밝히면 왜 답해야 하는지 모른다)
 *   · 스킵 허용. 스킵한 값은 매칭에서 "확인필요" 로 남는다.
 *     매칭 엔진이 빈 값을 불충족이 아니라 확인필요로 처리한다.
 *
 * 기획서의 경로 C 는 사업자등록증을 찍어 자동 입력하는 흐름인데, 1차
 * 예선에서는 직접 입력으로 간다. easyocr 이 Vercel 용량 한도(250MB)를
 * 넘어서 배포본에서 못 돌린다. 화면에 "준비 중" 안내를 남겨두면 미완성으로
 * 보이므로 그 자리는 비웠다. OCR 서버(backend/OCR.py)는 그대로 있다.
 */

// 매칭 엔진이 아는 업종은 이 넷뿐이다 (policy_data/schema.md).
// 기획서의 분야 6개를 여기에 맞춰 넘긴다.
const FIELDS = [
  { key: '요리',   emoji: '🍳', label: '요리·음식',    sub: true },
  { key: '교육',   emoji: '📚', label: '교육·가르치기', category: '기타' },
  { key: '미용',   emoji: '✂️', label: '미용·서비스',   category: '기타' },
  { key: '소매',   emoji: '🛍', label: '소매·판매',    category: '소매업' },
  { key: '제조',   emoji: '🔧', label: '제조·공방',    category: '기타' },
  { key: '예술',   emoji: '🎨', label: '예술·창작',    category: '기타' },
]

const KEYWORDS = ['카페', '음식점', '공방', '학원', '미용실', '온라인쇼핑', '편의점', '배달']

/** 자유 입력을 매칭 엔진이 아는 업종으로 분류한다. */
async function classifyCategory(text) {
  const raw = await generateText({
    jsonMode: true,
    userPrompt: `창업 희망 내용: "${text}"

아래 넷 중 하나로만 분류해서 JSON 으로 답하세요.
카페 / 음식점 / 소매업 / 기타

{"category": "카페", "reason": "한 문장"}`,
  })
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(cleaned)
  const known = ['카페', '음식점', '소매업', '기타']
  return known.includes(parsed.category) ? parsed.category : '기타'
}

/** 8자리 생년월일(YYYYMMDD)로 만 나이를 센다. 생일이 안 지났으면 한 살 뺀다. */
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

/* ─────────────────────────── 조각들 ─────────────────────────── */

function Progress({ current, total }) {
  return (
    <div className="flex items-center gap-1.5 mb-7">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
          i < current - 1 ? 'bg-navy' : i === current - 1 ? 'bg-sunset-orange' : 'bg-warm-gray/30'
        }`} />
      ))}
    </div>
  )
}

function Ask({ title, why, children }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-navy leading-snug mb-1.5">{title}</h2>
      {why && (
        <p className="text-sm text-gray-700 mb-6 leading-relaxed">
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
        'w-full text-left p-4 rounded-2xl border-2 transition-all duration-150',
        'flex items-start gap-3',
        selected ? 'border-navy bg-navy/5' : 'border-warm-gray/30 bg-white hover:border-navy/40',
      ].join(' ')}
    >
      {emoji && <span className="text-2xl leading-none mt-0.5">{emoji}</span>}
      <span className="flex-1">
        <span className={`block text-sm font-semibold ${selected ? 'text-navy' : 'text-gray-700'}`}>
          {label}
        </span>
        {desc && <span className="block text-xs text-gray-600 mt-0.5">{desc}</span>}
      </span>
    </button>
  )
}

function SkipLink({ onClick, children = '잘 모르겠어요' }) {
  return (
    <button
      type="button" onClick={onClick}
      className="mt-4 w-full text-sm text-gray-600 hover:text-navy underline underline-offset-2"
    >
      {children}
    </button>
  )
}

/* ─────────────────────────── 본체 ─────────────────────────── */

const COMMON_STEPS = ['age', 'region', 'career', 'asset', 'marital', 'parents']

// 세무일정용 3개. 사업자등록이 있어야 답할 수 있어서 **운영중인 사장님에게만**
// 묻는다. 예비창업자는 아직 과세유형이 없다.
//
// 이걸 안 물으면 세무일정 14건이 통째로 나온다. 간이과세 카페 사장님은
// 실제로 2건만 하면 되는데 법인세·원천세까지 다 보이게 된다.
const TAX_STEPS = ['entity', 'vat', 'employee']

const EMPTY = {
  category: '', business_status: '', age: '', region: '',
  business_period_months: '', career_experience: '', asset_group: '',
  marital_status: '', living_with_parents: undefined,
  entity_type: '', vat_type: '', has_employee: undefined,
}

export default function Onboarding() {
  const navigate = useNavigate()

  const [path, setPath]   = useState(null)     // 'A' | 'B' | 'C'
  const [stage, setStage] = useState('q1')     // q1 | field | sub | wish | biz | common | done
  const [common, setCommon] = useState(0)      // COMMON_STEPS 안에서의 위치
  const [data, setData]   = useState(EMPTY)

  const [wish, setWish]     = useState('')
  const [birth, setBirth]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')

  const set = (key, value) => setData(prev => ({ ...prev, [key]: value }))

  // 운영중이면 세무 질문 3개가 붙는다
  const steps = useMemo(
    () => data.business_status === '운영중' ? [...COMMON_STEPS, ...TAX_STEPS] : COMMON_STEPS,
    [data.business_status],
  )

  // 진행률: 경로마다 화면 수가 다르다
  const total = useMemo(() => (path === 'A' ? 2 : 1) + steps.length + 1, [path, steps])
  const current = useMemo(() => {
    if (stage === 'q1') return 1
    if (stage === 'common') return (path === 'A' ? 3 : 2) + common
    return path === 'A' && stage === 'sub' ? 3 : 2
  }, [stage, common, path])

  function startCommon(nextPath, patch) {
    setData(prev => ({ ...prev, ...patch }))
    setPath(nextPath)
    setStage('common')
    setCommon(0)
  }

  function nextCommon() {
    if (common < steps.length - 1) { setCommon(c => c + 1); return }
    finish()
  }

  async function finish() {
    setStage('done')
    // 스킵한 값은 빈 채로 둔다. 매칭 엔진이 불충족이 아니라 확인필요로 본다.
    localStorage.setItem('mars-fit-profile', JSON.stringify(data))
    if (getToken()) {
      try { await saveOnboarding(data) } catch { /* 로컬에 남아 있으니 화면은 돈다 */ }
    }
    setTimeout(() => navigate('/home'), 1400)
  }

  /* ── Q1 ── */
  if (stage === 'q1') {
    return (
      <Shell current={current} total={total}>
        <Ask title="지금 어떤 상황이신가요?" why="상황에 따라 신청할 수 있는 사업이 완전히 달라져요.">
          <div className="flex flex-col gap-3">
            <Choice emoji="🌱" label="아직 구체적인 계획은 없어요"
              desc="뭘 잘하는지 먼저 찾아볼게요"
              onClick={() => { setPath('A'); setStage('field') }} />
            <Choice emoji="💡" label="하고 싶은 게 있어요"
              desc="창업 아이디어가 있어요"
              onClick={() => { setPath('B'); setStage('wish') }} />
            <Choice emoji="🏪" label="이미 시작했어요"
              desc="사업자등록증이 있어요"
              onClick={() => { setPath('C'); setStage('biz') }} />
          </div>
        </Ask>
      </Shell>
    )
  }

  /* ── A-1 분야 ── */
  if (stage === 'field') {
    return (
      <Shell current={current} total={total} onBack={() => setStage('q1')}>
        <Ask title="어떤 분야가 끌리세요?" why="관심 분야에 맞는 창업 지원사업을 골라드려요.">
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
      <Shell current={current} total={total} onBack={() => setStage('field')}>
        <Ask title="요리 쪽이군요! 조금 더 알려주세요">
          <div className="flex flex-col gap-3">
            <Choice emoji="☕" label="카페·음료·디저트"
              onClick={() => startCommon('A', { category: '카페', business_status: '예비창업자' })} />
            <Choice emoji="🍜" label="식당·밥집"
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
        setError('업종을 알아보지 못했어요. 아래에서 골라주세요.')
      } finally {
        setBusy(false)
      }
    }
    return (
      <Shell current={current} total={total} onBack={() => setStage('q1')}>
        <Ask title="어떤 창업을 생각하고 계세요?" why="업종에 따라 받을 수 있는 지원이 달라요.">
          <input
            value={wish} onChange={e => setWish(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && wish.trim()) submitWish(wish.trim()) }}
            placeholder="예) 동탄에서 카페를 열고 싶어요"
            className="w-full border border-warm-gray/50 bg-white rounded-xl px-4 py-3 text-sm text-navy
                       placeholder:text-warm-gray/60 focus:outline-none focus:border-navy/50
                       focus:ring-1 focus:ring-navy/20"
          />
          <Button variant="navy" fullWidth className="mt-3"
            disabled={!wish.trim() || busy}
            onClick={() => submitWish(wish.trim())}>
            {busy ? 'Mars가 읽고 있어요...' : '이걸로 찾아보기'}
          </Button>

          {error && <p className="text-xs text-sunset-orange mt-2">{error}</p>}

          <p className="text-xs font-semibold text-gray-600 mt-6 mb-2">자주 찾는 업종</p>
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

  /* ── C 사업자등록증 ── */
  if (stage === 'biz') {
    return (
      <Shell current={current} total={total} onBack={() => setStage('q1')}>
        <Ask title="어떤 업종을 하고 계세요?" why="업종과 운영 기간에 따라 신청할 수 있는 사업이 달라져요.">
          <div className="grid grid-cols-2 gap-3">
            {['카페', '음식점', '소매업', '기타'].map(v => (
              <Choice key={v} label={v} selected={data.category === v}
                onClick={() => set('category', v)} />
            ))}
          </div>

          <div className="mt-5">
            <label className="block text-sm font-semibold text-navy mb-1.5">운영 기간</label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="600" value={data.business_period_months}
                onChange={e => set('business_period_months', Number(e.target.value))}
                placeholder="18"
                className="w-28 border border-warm-gray/50 rounded-xl px-3 py-2.5 text-sm text-navy
                           focus:outline-none focus:border-navy/50" />
              <span className="text-sm text-gray-700">개월째 운영 중</span>
            </div>
          </div>

          <Button variant="navy" fullWidth className="mt-6" disabled={!data.category}
            onClick={() => startCommon('C', { business_status: '운영중' })}>
            다음
          </Button>
        </Ask>
      </Shell>
    )
  }

  /* ── 완료 ── */
  if (stage === 'done') {
    return (
      <div className="min-h-screen bg-primary-bg flex flex-col items-center justify-center px-5">
        <style>{`@keyframes doneFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}`}</style>
        <img src={findImg} alt="" aria-hidden="true" className="w-44 h-44 object-contain"
             style={{ animation: 'doneFloat 2s ease-in-out infinite' }} />
        <p className="mt-5 text-lg font-bold text-navy text-center leading-snug">
          Mars가 딱 맞는<br />지원사업을 찾고 있어요
        </p>
        <div className="flex gap-1 mt-3">
          {[0, 0.15, 0.3].map((d, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-warm-gray animate-bounce"
                  style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
      </div>
    )
  }

  /* ── 공통 기본정보 ── */
  const step = steps[common]
  const back = common > 0
    ? () => setCommon(c => c - 1)
    : () => setStage(path === 'A' ? 'field' : path === 'B' ? 'wish' : 'biz')

  return (
    <Shell current={current} total={total} onBack={back}>
      {step === 'age' && (
        <Ask title="나이를 알려주세요" why="청년·시니어 전용 지원사업이 따로 있어요.">
          <label className="block text-sm font-semibold text-navy mb-1.5">생년월일 8자리</label>
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
                       focus:outline-none focus:border-navy/50"
          />
          {ageFromBirth(birth) !== null && (
            <p className="mt-2 text-sm font-semibold text-navy">만 {ageFromBirth(birth)}세</p>
          )}

          <p className="text-xs font-semibold text-gray-600 mt-5 mb-2">또는 대략만 골라주세요</p>
          <div className="grid grid-cols-4 gap-2">
            {[['20대', 25], ['30대', 35], ['40대', 45], ['50대+', 55]].map(([label, age]) => (
              <button key={label}
                onClick={() => { setBirth(''); set('age', age) }}
                className={`rounded-xl border-2 py-2.5 text-xs font-semibold transition ${
                  data.age === age ? 'border-navy bg-navy/5 text-navy'
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

      {step === 'region' && (
        <Ask title="어디에 계세요?" why="화성시 전용 지원인지 확인해드려요.">
          <div className="flex flex-col gap-3">
            {[
              ['화성시', '화성시 내 소재'],
              ['경기도', '화성시 외 경기도'],
              ['타지역', '그 외 지역'],
            ].map(([value, desc]) => (
              <Choice key={value} emoji="📍" label={value} desc={desc}
                selected={data.region === value}
                onClick={() => { set('region', value); setTimeout(nextCommon, 120) }} />
            ))}
          </div>
        </Ask>
      )}

      {step === 'career' && (
        <Ask title="전에 창업해본 적 있으세요?" why="첫 창업자 전용 지원이 많아요.">
          <div className="grid grid-cols-2 gap-3">
            <Choice emoji="🙋" label="처음이에요" selected={data.career_experience === '없음'}
              onClick={() => { set('career_experience', '없음'); setTimeout(nextCommon, 120) }} />
            <Choice emoji="🔄" label="해본 적 있어요" selected={data.career_experience === '있음'}
              onClick={() => { set('career_experience', '있음'); setTimeout(nextCommon, 120) }} />
          </div>
        </Ask>
      )}

      {step === 'asset' && (
        <Ask title="가구 소득 분위를 알려주세요" why="저소득 가구 전용 지원이 따로 있어요.">
          <div className="flex flex-col gap-3">
            {[
              ['일반', '해당 없음'],
              ['차상위', '기준 중위소득 50% 이하'],
              ['기초생활수급자', ''],
            ].map(([value, desc]) => (
              <Choice key={value} label={value} desc={desc} selected={data.asset_group === value}
                onClick={() => { set('asset_group', value); setTimeout(nextCommon, 120) }} />
            ))}
          </div>
          <SkipLink onClick={() => { set('asset_group', '일반'); nextCommon() }}>
            잘 모르겠어요 (일반으로 볼게요)
          </SkipLink>
        </Ask>
      )}

      {step === 'marital' && (
        <Ask title="결혼하셨나요?" why="한부모·다자녀 대상 지원이 일부 있어요.">
          <div className="grid grid-cols-2 gap-3">
            {['미혼', '기혼'].map(v => (
              <Choice key={v} label={v} selected={data.marital_status === v}
                onClick={() => { set('marital_status', v); setTimeout(nextCommon, 120) }} />
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

      {step === 'parents' && (
        <Ask title="부모님과 함께 사세요?" why="일부 공모에서 확인하는 조건이에요.">
          <div className="grid grid-cols-2 gap-3">
            <Choice label="네, 함께 살아요" selected={data.living_with_parents === true}
              onClick={() => { set('living_with_parents', true); setTimeout(nextCommon, 120) }} />
            <Choice label="아니요, 따로요" selected={data.living_with_parents === false}
              onClick={() => { set('living_with_parents', false); setTimeout(nextCommon, 120) }} />
          </div>
          <SkipLink onClick={() => { set('living_with_parents', undefined); nextCommon() }}>
            건너뛰기
          </SkipLink>
        </Ask>
      )}
    </Shell>
  )
}

/** 로고·진행률·뒤로가기를 두른 껍데기 */
function Shell({ current, total, onBack, children }) {
  return (
    <div className="min-h-screen bg-primary-bg flex flex-col">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between max-w-lg mx-auto w-full">
        {onBack ? (
          <button onClick={onBack} aria-label="이전"
            className="text-navy text-lg font-bold w-8 h-8 -ml-1">←</button>
        ) : <span className="w-8" />}
        <img src={logoImg} alt="Mars-Fit" className="h-14 object-contain" />
        <span className="text-xs text-warm-text w-8 text-right">{current}/{total}</span>
      </div>

      <div className="flex-1 px-5 pt-4 pb-12 max-w-lg mx-auto w-full">
        <Progress current={current} total={total} />
        {children}
      </div>
    </div>
  )
}

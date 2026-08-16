import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import logoImg from '../../design/logo.png'

const TOTAL_STEPS = 4

function ProgressBar({ step }) {
  return (
    <div className="flex items-center gap-1.5 mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
            i < step - 1
              ? 'bg-navy'
              : i === step - 1
              ? 'bg-sunset-orange'
              : 'bg-warm-gray/30'
          }`}
        />
      ))}
    </div>
  )
}

function SelectCard({ label, desc, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left p-4 rounded-2xl border-2 transition-all duration-150',
        selected
          ? 'border-navy bg-navy/5'
          : 'border-warm-gray/30 bg-white hover:border-navy/40',
      ].join(' ')}
    >
      <p className={`text-sm font-semibold ${selected ? 'text-navy' : 'text-gray-700'}`}>{label}</p>
      {desc && <p className="text-xs text-warm-gray mt-0.5">{desc}</p>}
    </button>
  )
}

function Step1({ data, onChange }) {
  const options = [
    { value: '카페',   desc: '커피·음료·디저트' },
    { value: '음식점', desc: '한식·중식·양식 등' },
    { value: '소매업', desc: '의류·잡화·편의점 등' },
    { value: '기타',   desc: '서비스업·교육·미용 등' },
  ]
  return (
    <div>
      <h2 className="text-xl font-bold text-navy mb-1">어떤 업종인가요?</h2>
      <p className="text-sm text-warm-gray mb-6">운영 중이거나 준비 중인 업종을 선택해주세요</p>
      <div className="grid grid-cols-2 gap-3">
        {options.map(o => (
          <SelectCard key={o.value} label={o.value} desc={o.desc}
            selected={data.category === o.value}
            onClick={() => onChange('category', o.value)} />
        ))}
      </div>
    </div>
  )
}

function Step2({ data, onChange }) {
  const options = [
    { value: '예비창업자', desc: '아직 사업자등록 전이에요' },
    { value: '운영중',     desc: '현재 사업장을 운영 중이에요' },
  ]
  return (
    <div>
      <h2 className="text-xl font-bold text-navy mb-1">창업 상태를 알려주세요</h2>
      <p className="text-sm text-warm-gray mb-6">현재 상황에 맞는 항목을 선택해주세요</p>
      <div className="flex flex-col gap-3">
        {options.map(o => (
          <SelectCard key={o.value} label={o.value} desc={o.desc}
            selected={data.business_status === o.value}
            onClick={() => onChange('business_status', o.value)} />
        ))}
      </div>
    </div>
  )
}

function Step3({ data, onChange }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-navy mb-1">기본 정보를 입력해주세요</h2>
      <p className="text-sm text-warm-gray mb-6">지원 나이·지역 조건 확인에 사용돼요</p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-navy mb-1.5">만 나이</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min="18" max="80"
              value={data.age ?? ''}
              onChange={e => onChange('age', Number(e.target.value))}
              placeholder="30"
              className="w-28 border border-warm-gray/50 rounded-xl px-3 py-2.5 text-sm text-navy
                         focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
            />
            <span className="text-sm text-warm-gray">세</span>
          </div>
        </div>

        {data.business_status === '운영중' && (
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">운영 기간</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max="600"
                value={data.business_period_months ?? ''}
                onChange={e => onChange('business_period_months', Number(e.target.value))}
                placeholder="12"
                className="w-28 border border-warm-gray/50 rounded-xl px-3 py-2.5 text-sm text-navy
                           focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
              />
              <span className="text-sm text-warm-gray">개월</span>
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-semibold text-navy mb-2">지역</p>
          <div className="flex flex-col gap-2">
            <SelectCard label="화성시" desc="화성시 내 소재"
              selected={data.region === '화성시'}
              onClick={() => onChange('region', '화성시')} />
            <SelectCard label="화성시 외 경기도" desc="경기도 내 타 지역"
              selected={data.region === '경기도'}
              onClick={() => onChange('region', '경기도')} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Step4({ data, onChange }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-navy mb-1">추가 조건을 알려주세요</h2>
      <p className="text-sm text-warm-gray mb-6">더 정확한 매칭을 위해 사용돼요</p>

      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-navy mb-2">이전 창업 경험</p>
          <div className="grid grid-cols-2 gap-2">
            {['없음', '있음'].map(v => (
              <SelectCard key={v} label={v}
                selected={data.career_experience === v}
                onClick={() => onChange('career_experience', v)} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-navy mb-2">소득 분위</p>
          <div className="flex flex-col gap-2">
            {[
              { value: '일반',          desc: '일반 소득 가구' },
              { value: '차상위',        desc: '차상위 계층' },
              { value: '기초생활수급자', desc: '기초생활수급자' },
            ].map(o => (
              <SelectCard key={o.value} label={o.value} desc={o.desc}
                selected={data.asset_group === o.value}
                onClick={() => onChange('asset_group', o.value)} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-navy mb-2">결혼 여부</p>
          <div className="grid grid-cols-2 gap-2">
            {['미혼', '기혼'].map(v => (
              <SelectCard key={v} label={v}
                selected={data.marital_status === v}
                onClick={() => onChange('marital_status', v)} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-navy mb-2">부모님과 동거 여부</p>
          <div className="grid grid-cols-2 gap-2">
            <SelectCard label="동거" selected={data.living_with_parents === true}
              onClick={() => onChange('living_with_parents', true)} />
            <SelectCard label="독립" selected={data.living_with_parents === false}
              onClick={() => onChange('living_with_parents', false)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function isStepValid(step, data) {
  if (step === 1) return !!data.category
  if (step === 2) return !!data.business_status
  if (step === 3) return data.age > 0 && !!data.region
  if (step === 4) return !!data.career_experience && !!data.asset_group
                          && !!data.marital_status && data.living_with_parents !== undefined
  return false
}

const INITIAL = {
  category: '',
  business_status: '',
  age: '',
  region: '화성시',
  business_period_months: 0,
  career_experience: '',
  asset_group: '일반',
  marital_status: '',
  living_with_parents: undefined,
  annual_revenue_krw: null,
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [data, setData] = useState(INITIAL)

  function handleChange(key, value) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep(s => s + 1)
    } else {
      localStorage.setItem('mars-fit-profile', JSON.stringify(data))
      navigate('/home')
    }
  }

  return (
    <div className="min-h-screen bg-primary-bg flex flex-col">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <img src={logoImg} alt="Mars-Fit" className="h-10 object-contain" />
        <span className="text-xs text-warm-gray">{step} / {TOTAL_STEPS}</span>
      </div>

      <div className="flex-1 px-5 pt-4 pb-10 max-w-lg mx-auto w-full">
        <ProgressBar step={step} />

        {step === 1 && <Step1 data={data} onChange={handleChange} />}
        {step === 2 && <Step2 data={data} onChange={handleChange} />}
        {step === 3 && <Step3 data={data} onChange={handleChange} />}
        {step === 4 && <Step4 data={data} onChange={handleChange} />}

        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">
              이전
            </Button>
          )}
          <Button
            variant={step === TOTAL_STEPS ? 'sunset-orange' : 'navy'}
            onClick={handleNext}
            disabled={!isStepValid(step, data)}
            className="flex-1"
          >
            {step === TOTAL_STEPS ? 'Mars와 시작하기' : '다음'}
          </Button>
        </div>
      </div>
    </div>
  )
}

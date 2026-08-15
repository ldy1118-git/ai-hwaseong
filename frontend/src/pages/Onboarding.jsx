import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Upload, Check } from 'lucide-react'
import { businessTypes, regions } from '../data/mockData'

const STEPS = ['시작', '내 정보', '완료']

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex flex-col items-center gap-1`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i < current ? 'bg-hwaseong-blue text-white' :
              i === current ? 'bg-hwaseong-blue text-white ring-2 ring-blue-200' :
              'bg-gray-200 text-gray-400'
            }`}>
              {i < current ? <Check size={14} /> : i + 1}
            </div>
            <span className={`text-[10px] ${i === current ? 'text-hwaseong-blue font-semibold' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-10 h-0.5 mb-4 ${i < current ? 'bg-hwaseong-blue' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// Step 0: 창업 유형 선택
function StepType({ onSelect }) {
  const options = [
    { id: 'plan', emoji: '💡', title: '창업 계획이 있어요', desc: '업종·지역은 정했거나 고민 중이에요' },
    { id: 'explore', emoji: '🔍', title: '아직 고민 중이에요', desc: '어떤 업종이 좋을지 추천받고 싶어요' },
    { id: 'existing', emoji: '🏪', title: '이미 운영 중이에요', desc: '사업자등록증이 있어요' },
  ]
  return (
    <div className="px-6 py-4 flex flex-col gap-3">
      <h2 className="text-xl font-bold text-gray-900 mb-1">어떤 상황이신가요?</h2>
      <p className="text-sm text-gray-500 mb-2">맞춤형 정보를 드리기 위해 선택해주세요</p>
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border-2 border-transparent hover:border-hwaseong-blue hover:bg-hwaseong-light transition-all text-left"
        >
          <span className="text-3xl">{o.emoji}</span>
          <div>
            <p className="font-semibold text-gray-800">{o.title}</p>
            <p className="text-sm text-gray-500 mt-0.5">{o.desc}</p>
          </div>
          <ChevronRight size={18} className="text-gray-400 ml-auto shrink-0" />
        </button>
      ))}
    </div>
  )
}

// Step 1: 정보 입력 (계획 있음)
function StepInfo({ userType, data, onChange }) {
  const ageRanges = ['20대', '30대', '40대', '50대', '60대 이상']
  const incomeRanges = ['기초생활수급자', '차상위계층', '일반']
  const experienceOptions = ['없음', '있음 (1년 미만)', '있음 (1년 이상)']
  const personalityOptions = [
    { emoji: '🪑', label: '앉아서 하는 일', hint: '카페, 사무직, 상담' },
    { emoji: '🏃', label: '몸을 움직이는 일', hint: '음식점, 배달, 서비스' },
    { emoji: '🤝', label: '사람 만나는 일', hint: '교육, 뷰티, 소매' },
    { emoji: '🔧', label: '기술을 쓰는 일', hint: '수리, 제조, IT' },
  ]

  if (userType === 'existing') {
    return (
      <div className="px-6 py-4 space-y-5">
        <h2 className="text-xl font-bold text-gray-900">사업자 정보 입력</h2>

        {/* OCR 업로드 */}
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center gap-2 bg-gray-50">
          <Upload size={28} className="text-gray-400" />
          <p className="font-semibold text-gray-600 text-sm">사업자등록증 사진 업로드</p>
          <p className="text-xs text-gray-400">자동으로 업종·지역을 인식해요 (선택)</p>
          <button className="mt-1 text-xs text-hwaseong-blue underline">파일 선택</button>
        </div>

        <div className="text-center text-gray-400 text-sm">또는 직접 입력</div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">업종</span>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {businessTypes.map(b => (
                <button
                  key={b.id}
                  onClick={() => onChange('bizType', b.id)}
                  className={`flex flex-col items-center py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                    data.bizType === b.id ? 'border-hwaseong-blue bg-hwaseong-light text-hwaseong-blue' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  <span className="text-lg mb-0.5">{b.icon}</span>
                  {b.label}
                </button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">영업 지역</span>
            <select
              value={data.region || ''}
              onChange={e => onChange('region', e.target.value)}
              className="mt-2 w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-hwaseong-blue"
            >
              <option value="">지역 선택</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
      </div>
    )
  }

  if (userType === 'explore') {
    return (
      <div className="px-6 py-4 space-y-5">
        <h2 className="text-xl font-bold text-gray-900">어떤 일이 잘 맞으시나요?</h2>
        <p className="text-sm text-gray-500">답변을 바탕으로 어울리는 업종을 추천해드릴게요</p>
        <div className="grid grid-cols-2 gap-3">
          {personalityOptions.map(opt => (
            <button
              key={opt.label}
              onClick={() => onChange('personality', opt.label)}
              className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all ${
                data.personality === opt.label ? 'border-hwaseong-blue bg-hwaseong-light' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <span className="text-2xl mb-2">{opt.emoji}</span>
              <p className="font-semibold text-sm text-gray-800">{opt.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{opt.hint}</p>
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-sm font-semibold text-gray-700">지역 (선택)</span>
          <select
            value={data.region || ''}
            onChange={e => onChange('region', e.target.value)}
            className="mt-2 w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-hwaseong-blue"
          >
            <option value="">지역 선택 (전체)</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>
    )
  }

  // plan
  return (
    <div className="px-6 py-4 space-y-5">
      <h2 className="text-xl font-bold text-gray-900">기본 정보 입력</h2>
      <p className="text-sm text-gray-500">입력하신 정보로 맞춤 지원사업을 찾아드립니다</p>

      <label className="block">
        <span className="text-sm font-semibold text-gray-700">연령대</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {ageRanges.map(a => (
            <button
              key={a}
              onClick={() => onChange('age', a)}
              className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${
                data.age === a ? 'border-hwaseong-blue bg-hwaseong-light text-hwaseong-blue' : 'border-gray-200 text-gray-600'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-gray-700">소득 구간</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {incomeRanges.map(r => (
            <button
              key={r}
              onClick={() => onChange('income', r)}
              className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${
                data.income === r ? 'border-hwaseong-blue bg-hwaseong-light text-hwaseong-blue' : 'border-gray-200 text-gray-600'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">확인 방법: 주민센터 방문 또는 복지로 앱</p>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-gray-700">창업 경험</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {experienceOptions.map(e => (
            <button
              key={e}
              onClick={() => onChange('experience', e)}
              className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${
                data.experience === e ? 'border-hwaseong-blue bg-hwaseong-light text-hwaseong-blue' : 'border-gray-200 text-gray-600'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-gray-700">관심 업종</span>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[...businessTypes, { id: 'unknown', icon: '🤔', label: '모르겠어요' }].map(b => (
            <button
              key={b.id}
              onClick={() => onChange('bizType', b.id)}
              className={`flex flex-col items-center py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                data.bizType === b.id ? 'border-hwaseong-blue bg-hwaseong-light text-hwaseong-blue' : 'border-gray-200 text-gray-600'
              }`}
            >
              <span className="text-lg mb-0.5">{b.icon}</span>
              {b.label}
            </button>
          ))}
        </div>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-gray-700">영업 예정 지역</span>
        <select
          value={data.region || ''}
          onChange={e => onChange('region', e.target.value)}
          className="mt-2 w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-hwaseong-blue"
        >
          <option value="">지역 선택</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
    </div>
  )
}

// Step 2: 완료
function StepDone({ data, userType }) {
  const typeLabel = { plan: '창업 준비 중', explore: '업종 탐색 중', existing: '운영 중' }
  const bizLabel = businessTypes.find(b => b.id === data.bizType)?.label || '전체 업종'
  return (
    <div className="px-6 py-8 flex flex-col items-center text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <Check size={32} className="text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900">설정 완료!</h2>
      <p className="text-gray-500 text-sm leading-relaxed">
        맞춤 정보를 준비했어요.<br />대시보드에서 확인하세요.
      </p>
      <div className="bg-gray-50 rounded-2xl p-4 w-full text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">상황</span>
          <span className="font-medium text-gray-800">{typeLabel[userType]}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">업종</span>
          <span className="font-medium text-gray-800">{bizLabel}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">지역</span>
          <span className="font-medium text-gray-800">{data.region || '화성시 전체'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">매칭된 지원사업</span>
          <span className="font-bold text-hwaseong-blue">4건</span>
        </div>
      </div>
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [userType, setUserType] = useState(null)
  const [formData, setFormData] = useState({})

  function handleChange(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  function handleTypeSelect(type) {
    setUserType(type)
    setStep(1)
  }

  function handleNext() {
    if (step < 2) setStep(s => s + 1)
    else navigate('/dashboard')
  }

  function handleBack() {
    if (step === 0) navigate('/')
    else if (step === 1) { setStep(0); setUserType(null) }
    else setStep(s => s - 1)
  }

  const canNext = step === 0 ? false : step === 2 ? true : (
    userType === 'explore' ? !!formData.personality :
    userType === 'existing' ? !!formData.bizType :
    !!formData.age
  )

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button onClick={handleBack} className="p-2 -ml-2">
          <ChevronLeft size={24} className="text-gray-600" />
        </button>
        <StepIndicator current={step} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {step === 0 && <StepType onSelect={handleTypeSelect} />}
        {step === 1 && <StepInfo userType={userType} data={formData} onChange={handleChange} />}
        {step === 2 && <StepDone data={formData} userType={userType} />}
      </div>

      {/* Footer button */}
      {step > 0 && (
        <div className="px-6 py-4 bg-white border-t border-gray-100">
          <button
            onClick={handleNext}
            disabled={!canNext}
            className="w-full bg-hwaseong-blue text-white py-4 rounded-2xl font-bold text-base disabled:opacity-40 transition-opacity"
          >
            {step === 2 ? '대시보드 보러 가기 →' : '다음'}
          </button>
        </div>
      )}
    </div>
  )
}

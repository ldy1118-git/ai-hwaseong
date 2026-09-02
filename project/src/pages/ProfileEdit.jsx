import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { patchOnboarding } from '../utils/api'
import { ChevronRight, Check, X } from 'lucide-react'

const FIELDS = [
  {
    key: 'category', label: '업종', emoji: '🏷',
    type: 'choice',
    options: [
      { value: '카페',   label: '카페·음료·디저트', emoji: '☕' },
      { value: '음식점', label: '식당·밥집·분식',   emoji: '🍜' },
      { value: '소매업', label: '소매·판매',        emoji: '🛍' },
      { value: '제조업', label: '제조·공방',        emoji: '🔧' },
      { value: '기타',   label: '기타',            emoji: '🎨' },
    ],
  },
  {
    key: 'region', label: '지역', emoji: '📍',
    type: 'choice',
    options: [
      { value: '화성시', label: '화성시',            emoji: '📍' },
      { value: '경기도', label: '경기도 (화성시 외)', emoji: '🗺' },
      { value: '타지역', label: '그 외 지역',        emoji: '✈️' },
    ],
  },
  {
    key: 'age', label: '나이', emoji: '👤',
    type: 'age',
  },
  {
    key: 'career_experience', label: '창업 경험', emoji: '🔄',
    type: 'choice',
    options: [
      { value: '없음', label: '처음이에요',    emoji: '🙋' },
      { value: '있음', label: '경험이 있어요', emoji: '🔄' },
    ],
  },
  {
    key: 'asset_group', label: '소득 분위', emoji: '💰',
    type: 'choice',
    options: [
      { value: '일반',           label: '일반' },
      { value: '차상위',         label: '차상위' },
      { value: '기초생활수급자', label: '기초생활수급자' },
    ],
  },
  {
    key: 'marital_status', label: '결혼 여부', emoji: '💍',
    type: 'choice',
    options: [
      { value: '미혼', label: '미혼', emoji: '💍' },
      { value: '기혼', label: '기혼', emoji: '💑' },
    ],
  },
  {
    key: 'living_with_parents', label: '부모 동거', emoji: '🏠',
    type: 'choice',
    options: [
      { value: 'true',  label: '함께 거주', emoji: '🏠' },
      { value: 'false', label: '별거',      emoji: '🏡' },
    ],
  },
]

function displayValue(key, val) {
  if (val === undefined || val === null || val === '') return null
  if (key === 'age') return `${val}세`
  if (key === 'living_with_parents') return val ? '함께 거주' : '별거'
  if (key === 'career_experience') return val === '없음' ? '첫 창업' : '창업 경험 있음'
  return String(val)
}

function EditDrawer({ field, profile, onSave, onClose }) {
  const rawVal = profile?.[field.key]
  const [draft, setDraft] = useState(() => {
    if (rawVal === undefined || rawVal === null) return ''
    return String(rawVal)
  })
  const [ageInput, setAgeInput] = useState(() => rawVal ? String(rawVal) : '')

  function confirm() {
    if (field.type === 'age') {
      const n = parseInt(ageInput, 10)
      if (!n || n < 15 || n > 100) return
      onSave(n)
    } else if (field.key === 'living_with_parents' || field.key === 'has_employee' || field.key === 'withholding_half') {
      onSave(draft === 'true')
    } else {
      onSave(draft)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-navy">{field.label} 변경</h3>
          <button onClick={onClose} className="p-1 text-warm-text hover:text-navy">
            <X size={18} />
          </button>
        </div>

        {field.type === 'choice' && (
          <div className="flex flex-col gap-2">
            {field.options.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setDraft(opt.value)}
                className={[
                  'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
                  draft === opt.value
                    ? 'border-navy bg-navy/5 text-navy'
                    : 'border-warm-gray/30 bg-white text-gray-700 hover:border-navy/30',
                ].join(' ')}>
                <span className={[
                  'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0',
                  draft === opt.value ? 'border-navy bg-navy' : 'border-warm-gray/50',
                ].join(' ')}>
                  {draft === opt.value && <Check size={12} className="text-white" strokeWidth={3} />}
                </span>
                <span className="text-sm font-semibold">
                  {opt.emoji ? `${opt.emoji} ` : ''}{opt.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {field.type === 'age' && (
          <div>
            <input
              type="number" value={ageInput}
              onChange={e => setAgeInput(e.target.value)}
              placeholder="예: 32"
              min={15} max={100}
              className="w-full text-lg bg-gray-50 border border-navy/30 rounded-xl
                         px-4 py-3 text-navy text-center font-bold
                         focus:outline-none focus:border-navy focus:bg-white"
            />
            <p className="text-xs text-warm-text text-center mt-2">만 나이를 입력해주세요</p>
          </div>
        )}

        <button
          onClick={confirm}
          disabled={field.type !== 'age' && !draft}
          className="mt-4 w-full py-3 rounded-xl bg-navy text-white text-sm font-bold
                     disabled:opacity-40 hover:bg-navy/90 transition-colors">
          저장
        </button>
      </div>
    </div>
  )
}

export default function ProfileEdit() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile') || 'null') } catch { return null }
  })
  const [editingKey, setEditingKey] = useState(null)
  const [saved, setSaved] = useState(false)

  function handleSave(key, value) {
    const next = { ...profile, [key]: value }
    setProfile(next)
    localStorage.setItem('mars-fit-profile', JSON.stringify(next))
    setSaved(true)
    try { patchOnboarding(next) } catch {}
  }

  const editingField = FIELDS.find(f => f.key === editingKey)

  return (
    <div className="min-h-screen bg-primary-bg">
      {/* 헤더 */}
      <div className="bg-white border-b border-warm-gray/20 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/district')}
          className="tap text-sm text-warm-text hover:text-navy flex items-center gap-1">
          ← 돌아가기
        </button>
        <h1 className="text-sm font-bold text-navy">내 정보 수정</h1>
        <div className="w-16" />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 pb-24 space-y-2">
        <p className="text-xs text-warm-text mb-4">
          입력한 정보를 바탕으로 맞춤 상권과 지원사업을 추천해드려요.
        </p>

        {FIELDS.map(field => {
          const val = profile?.[field.key]
          const display = displayValue(field.key, val)
          return (
            <button key={field.key} type="button"
              onClick={() => setEditingKey(field.key)}
              className="w-full bg-white rounded-2xl border border-warm-gray/20 shadow-sm
                         px-4 py-3.5 flex items-center justify-between hover:border-navy/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{field.emoji}</span>
                <div className="text-left">
                  <p className="text-xs text-warm-text">{field.label}</p>
                  <p className={`text-sm font-bold ${display ? 'text-navy' : 'text-warm-gray/40'}`}>
                    {display ?? '미입력'}
                  </p>
                </div>
              </div>
              <ChevronRight size={16} className="text-warm-gray/40 shrink-0" />
            </button>
          )
        })}

        {saved && (
          <div className="flex items-center gap-2 justify-center pt-2 text-xs text-emerald-600 font-semibold">
            <Check size={14} /> 변경사항이 저장됐어요
          </div>
        )}

        <button
          onClick={() => navigate('/district')}
          className="mt-4 w-full py-3.5 rounded-2xl bg-navy text-white text-sm font-bold
                     hover:bg-navy/90 transition-colors">
          완료
        </button>
      </div>

      {editingField && (
        <EditDrawer
          field={editingField}
          profile={profile}
          onSave={val => handleSave(editingField.key, val)}
          onClose={() => setEditingKey(null)}
        />
      )}
    </div>
  )
}

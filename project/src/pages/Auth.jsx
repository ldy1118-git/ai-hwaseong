import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import logoImg from '../../design/logo.png'

export default function Auth() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('signup')   // 'signup' | 'login'
  const [form, setForm] = useState({ email: '', password: '', confirm: '' })
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'signup' && form.password !== form.confirm) {
      setError('비밀번호가 일치하지 않아요.')
      return
    }
    if (!form.email || !form.password) {
      setError('이메일과 비밀번호를 입력해주세요.')
      return
    }
    // TODO: 백엔드 인증 연동
    // 현재는 임시 저장 후 온보딩으로 이동
    localStorage.setItem('mars-fit-user', JSON.stringify({ email: form.email }))
    navigate('/onboarding')
  }

  const isSignup = mode === 'signup'

  return (
    <div className="min-h-screen bg-primary-bg flex flex-col items-center justify-center px-5">

      {/* 로고 */}
      <a href="#/" className="mb-8">
        <img src={logoImg} alt="Mars-Fit" className="h-14 object-contain" />
      </a>

      {/* 탭 */}
      <div className="flex w-full max-w-sm bg-warm-gray/20 rounded-2xl p-1 mb-6">
        {[['signup', '회원가입'], ['login', '로그인']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setMode(key); setError('') }}
            className={[
              'flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-150',
              mode === key
                ? 'bg-white text-navy shadow-sm'
                : 'text-warm-gray hover:text-navy',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        <div>
          <label className="block text-xs font-semibold text-navy mb-1.5">이메일</label>
          <input
            type="email" name="email"
            value={form.email} onChange={handleChange}
            placeholder="example@email.com"
            className="w-full border border-warm-gray/50 bg-white rounded-xl px-4 py-3 text-sm text-navy
                       placeholder:text-warm-gray/60
                       focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-navy mb-1.5">비밀번호</label>
          <input
            type="password" name="password"
            value={form.password} onChange={handleChange}
            placeholder="8자 이상"
            className="w-full border border-warm-gray/50 bg-white rounded-xl px-4 py-3 text-sm text-navy
                       placeholder:text-warm-gray/60
                       focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
          />
        </div>

        {isSignup && (
          <div>
            <label className="block text-xs font-semibold text-navy mb-1.5">비밀번호 확인</label>
            <input
              type="password" name="confirm"
              value={form.confirm} onChange={handleChange}
              placeholder="비밀번호를 다시 입력해주세요"
              className="w-full border border-warm-gray/50 bg-white rounded-xl px-4 py-3 text-sm text-navy
                         placeholder:text-warm-gray/60
                         focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20"
            />
          </div>
        )}

        {error && (
          <p className="text-xs text-sunset-orange font-medium">{error}</p>
        )}

        <div className="pt-2">
          <Button type="submit" variant="navy" fullWidth size="lg">
            {isSignup ? '회원가입하고 시작하기' : '로그인'}
          </Button>
        </div>
      </form>

      {/* 구분선 */}
      <div className="flex items-center gap-3 w-full max-w-sm my-5">
        <div className="flex-1 h-px bg-warm-gray/30" />
        <span className="text-xs text-warm-gray">또는</span>
        <div className="flex-1 h-px bg-warm-gray/30" />
      </div>

      <button
        onClick={() => navigate('/onboarding')}
        className="text-sm text-warm-gray hover:text-navy underline underline-offset-2 transition-colors"
      >
        로그인 없이 둘러보기
      </button>

      <p className="text-xs text-warm-gray/60 mt-8 text-center max-w-xs leading-relaxed">
        회원가입 시 화성시 소상공인 지원사업 매칭 결과가<br />자동 저장됩니다.
      </p>
    </div>
  )
}

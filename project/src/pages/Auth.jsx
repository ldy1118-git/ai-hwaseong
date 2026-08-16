import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoImg from '../../design/logo.png'
import { goToKakaoLogin } from '../utils/kakao'
import { getToken } from '../utils/api'

/**
 * 로그인은 카카오 하나만 쓴다.
 *
 * 전에는 이메일·비밀번호 폼도 있었는데 비밀번호를 검사하지도 저장하지도
 * 않는 껍데기였다(`TODO: 백엔드 인증 연동`). 아무 값이나 넣으면 통과해서,
 * 심사에서 눌러보면 바로 드러난다. 동작하지 않는 입구는 없는 게 낫다.
 *
 * 카카오만 쓰면 비밀번호를 우리가 보관하지 않아도 된다.
 */

const BENEFITS = [
  '조건을 한 번만 입력하면 계속 기억해요',
  '다른 기기에서 열어도 그대로 있어요',
  '마감이 다가오는 지원사업을 놓치지 않아요',
]

export default function Auth() {
  const navigate = useNavigate()
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  // 이미 로그인했으면 이 화면에 머물 이유가 없다. 로그인 버튼을 다시
  // 보여주면 "로그인이 안 된 건가" 하고 또 누르게 된다.
  useEffect(() => {
    if (!getToken()) return
    const done = !!localStorage.getItem('mars-fit-profile')
    navigate(done ? '/home' : '/onboarding', { replace: true })
  }, [navigate])

  async function handleKakao() {
    setError('')
    setBusy(true)
    try {
      // 성공하면 카카오 페이지로 넘어가므로 여기로 돌아오지 않는다.
      await goToKakaoLogin()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-bg flex flex-col items-center justify-center px-5 py-12">

      {/* 로고 안에 이미 Mars 캐릭터가 들어 있다. 캐릭터를 따로 또 띄우지 않는다. */}
      <a href="#/" className="mb-7">
        <img src={logoImg} alt="Mars-Fit" className="h-40 object-contain" />
      </a>

      <h1 className="text-xl font-bold text-navy text-center leading-snug mb-2">
        카카오톡으로 3초면<br />시작할 수 있어요
      </h1>
      <p className="text-sm text-warm-gray text-center mb-7">
        따로 가입하거나 비밀번호를 만들지 않아도 돼요
      </p>

      <ul className="w-full max-w-sm space-y-2.5 mb-8">
        {BENEFITS.map(text => (
          <li key={text} className="flex items-start gap-2.5">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-star-yellow/40 text-navy
                             text-xs font-bold flex items-center justify-center flex-shrink-0">
              ✓
            </span>
            <span className="text-sm text-gray-700 leading-relaxed">{text}</span>
          </li>
        ))}
      </ul>

      {/* 색과 문구는 카카오 디자인 가이드를 따른다 */}
      <button
        onClick={handleKakao}
        disabled={busy}
        className="w-full max-w-sm flex items-center justify-center gap-2 rounded-2xl
                   bg-[#FEE500] text-[#191600] font-bold py-4 text-base
                   shadow-sm hover:brightness-95 active:brightness-90 transition
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
          <path d="M12 3.5c-4.7 0-8.5 3-8.5 6.7 0 2.4 1.6 4.5 4 5.7l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.2 0 .4.1.6.1 4.7 0 8.5-3 8.5-6.7S16.7 3.5 12 3.5Z" />
        </svg>
        {busy ? '카카오로 이동 중...' : '카카오톡으로 시작하기'}
      </button>

      {error && (
        <p className="mt-3 text-xs text-sunset-orange font-medium text-center max-w-sm">
          {error}
        </p>
      )}

      <button
        onClick={() => navigate('/onboarding')}
        className="mt-6 text-sm text-warm-gray hover:text-navy underline underline-offset-2 transition-colors"
      >
        로그인 없이 둘러보기
      </button>

      <p className="text-xs text-warm-gray/70 mt-8 text-center max-w-xs leading-relaxed">
        닉네임만 받아요. 이메일·전화번호는 받지 않습니다.
      </p>
    </div>
  )
}

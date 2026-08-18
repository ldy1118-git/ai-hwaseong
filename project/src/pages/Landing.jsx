import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Button from '../components/ui/Button'
import KakaoButton from '../components/ui/KakaoButton'
import { getToken } from '../utils/api'
import logoImg  from '../../design/logo.png'
import marsImg  from '../../design/mars.png'

const FEATURES = [
  {
    title: 'AI 맞춤 매칭',
    desc:  '내 업종·나이·상황을 입력하면 신청 가능한 지원사업만 골라 보여줘요.',
    accent: 'border-t-star-yellow',
    bg: 'from-star-yellow/10 to-transparent',
    icon: '🎯',
  },
  {
    title: '신청 동행',
    desc:  '필요한 서류를 하나씩 체크하며 마감일까지 빠짐없이 준비할 수 있어요.',
    accent: 'border-t-sunset-orange',
    bg: 'from-sunset-orange/10 to-transparent',
    icon: '📋',
  },
  {
    title: '행정 용어 번역',
    desc:  '어려운 공문서 용어를 탭 한 번으로 쉬운 말로 풀어드려요.',
    accent: 'border-t-navy',
    bg: 'from-navy/10 to-transparent',
    icon: '💬',
  },
]

function FeatureSlider() {
  const [current, setCurrent] = useState(0)
  const [animating, setAnimating] = useState(false)
  const timerRef = useRef(null)

  // 사용자가 직접 고르면 타이머를 처음부터 다시 센다. 안 그러면 2번을
  // 골랐는데 남아 있던 시간만큼 뒤에 3번으로 제멋대로 넘어간다.
  const [tick, setTick] = useState(0)

  function goTo(idx) {
    if (animating || idx === current) return
    setAnimating(true)
    setTick(t => t + 1)
    setTimeout(() => {
      setCurrent(idx)
      setAnimating(false)
    }, 200)
  }

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setAnimating(true)
      setTimeout(() => {
        setCurrent(prev => (prev + 1) % FEATURES.length)
        setAnimating(false)
      }, 200)
    }, 3000)
    return () => clearInterval(timerRef.current)
  }, [tick])

  const f = FEATURES[current]

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 카드 */}
      <div
        className={`w-full bg-white rounded-2xl border-t-4 ${f.accent} px-6 py-7 shadow-sm
          bg-gradient-to-b ${f.bg} transition-opacity duration-200
          ${animating ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="text-4xl mb-3">{f.icon}</div>
        <p className="font-bold text-navy text-lg mb-2">{f.title}</p>
        <p className="text-sm text-warm-text leading-relaxed">{f.desc}</p>
      </div>

      {/* 인디케이터 */}
      <div className="flex gap-2">
        {FEATURES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all duration-300
              ${i === current
                ? 'w-6 h-2 bg-navy'
                : 'w-2 h-2 bg-warm-gray/50 hover:bg-warm-gray'
              }`}
          />
        ))}
      </div>
    </div>
  )
}

const STEPS = [
  { num: '01', label: '내 조건 입력',   desc: '업종·나이·창업 상태를 선택해요' },
  { num: '02', label: '지원사업 매칭',   desc: 'AI가 신청 가능한 사업을 추려드려요' },
  { num: '03', label: '신청까지 동행',   desc: '서류 체크리스트로 끝까지 함께해요' },
]

export default function Landing() {
  const navigate = useNavigate()

  // 로그인한 사람에게 "카카오톡으로 시작" 을 다시 보여주면 로그인이 안 된
  // 줄 알고 또 누른다. 로그인 여부는 첫 렌더에 알아야 버튼이 바뀌었다가
  // 다시 바뀌는 깜빡임이 없다.
  const [loggedIn] = useState(() => !!getToken())
  const hasProfile = !!localStorage.getItem('mars-fit-profile')

  /** 로그인 상태에 따라 CTA 를 통째로 갈아끼운다. */
  function Cta({ light = false }) {
    if (loggedIn) {
      return (
        <>
          <Button variant="sunset-orange" size="lg" fullWidth
            onClick={() => navigate(hasProfile ? '/home' : '/onboarding')}>
            {hasProfile ? '내 지원사업 보러가기' : '조건 입력하고 시작하기'}
          </Button>
          <button
            onClick={() => navigate('/onboarding')}
            className={`text-sm underline underline-offset-2 transition-colors
              ${light ? 'text-warm-text hover:text-white' : 'text-warm-text hover:text-navy'}`}
          >
            내 정보 확인하기
          </button>
        </>
      )
    }
    return (
      <>
        <KakaoButton onClick={() => navigate('/auth')} />
        <button
          onClick={() => navigate('/onboarding')}
          className={`text-sm underline underline-offset-2 transition-colors
            ${light ? 'text-warm-text hover:text-white' : 'text-warm-text hover:text-navy'}`}
        >
          로그인 없이 둘러보기
        </button>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-primary-bg flex flex-col">

      {/* 헤더 */}
      <header className="sticky top-0 z-40 bg-primary-bg/90 backdrop-blur border-b border-warm-gray/20 px-5 py-3 flex items-center">
        <img src={logoImg} alt="Mars-Fit" className="h-14 object-contain" />
      </header>

      {/* 히어로 */}
      <section className="bg-burgundy relative overflow-hidden px-5 py-16 flex flex-col items-center text-center">
        {/* 궤도 장식 원 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[480px] h-[480px] rounded-full border border-warm-gray/10" />
          <div className="absolute w-[340px] h-[340px] rounded-full border border-warm-gray/10" />
        </div>

        <p className="relative text-xs font-semibold text-star-yellow tracking-widest uppercase mb-4">
          화성시 소상공인 AI 동반자
        </p>
        <h1 className="relative text-3xl font-bold text-white leading-tight mb-4 max-w-xs">
          지원사업 찾기부터<br />
          <span className="text-star-yellow">신청까지</span><br />
          Mars가 함께해요
        </h1>
        <p className="relative text-sm text-warm-text leading-relaxed mb-8 max-w-xs">
          조건을 입력하면 나에게 딱 맞는 지원사업을 찾아드리고,<br />
          서류 준비부터 마감까지 빠짐없이 챙겨드려요.
        </p>

        {/* Mars 캐릭터 */}
        <style>{`
          @keyframes heroFloat {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-14px); }
          }
          @keyframes heroShadow {
            0%, 100% { transform: scaleX(1);   opacity: 0.18; }
            50%       { transform: scaleX(0.65); opacity: 0.08; }
          }
          @keyframes starTwinkle {
            0%, 100% { opacity: 1;   transform: scale(1); }
            50%       { opacity: 0.3; transform: scale(0.7); }
          }
        `}</style>

        <div className="relative mb-10 flex flex-col items-center">
          {/* 캐릭터 */}
          <img
            src={marsImg}
            alt="Mars 캐릭터"
            className="w-48 h-48 object-contain drop-shadow-2xl"
            style={{ animation: 'heroFloat 3s ease-in-out infinite' }}
          />
          {/* 바닥 그림자 */}
          <div
            className="w-28 h-4 bg-black/25 rounded-full blur-md -mt-2"
            style={{ animation: 'heroShadow 3s ease-in-out infinite' }}
          />

          {/* 별 장식 */}
          <svg className="absolute top-0 -right-1" width="18" height="18" viewBox="0 0 24 24" fill="#fbe281"
            style={{ animation: 'starTwinkle 2s ease-in-out infinite' }}>
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
          </svg>
          <svg className="absolute top-8 -left-4" width="11" height="11" viewBox="0 0 24 24" fill="#fbe281"
            style={{ animation: 'starTwinkle 2.4s ease-in-out infinite', animationDelay: '0.5s' }}>
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
          </svg>
          <svg className="absolute bottom-6 -right-5" width="8" height="8" viewBox="0 0 24 24" fill="#fbe281"
            style={{ animation: 'starTwinkle 1.8s ease-in-out infinite', animationDelay: '1s' }}>
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
          </svg>
        </div>

        <div className="relative flex flex-col items-center gap-3 w-full max-w-xs">
          <Cta light />
        </div>
      </section>

      {/* 핵심 기능 슬라이더 */}
      <section className="px-5 py-12 max-w-sm mx-auto w-full">
        <p className="text-xs font-bold text-warm-text uppercase tracking-widest text-center mb-6">핵심 기능</p>
        <FeatureSlider />
      </section>

      {/* 이용 순서 */}
      <section className="bg-navy px-5 py-12">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-bold text-star-yellow uppercase tracking-widest text-center mb-8">이용 방법</p>
          <div className="flex flex-col gap-6">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex items-start gap-4">
                <span className="flex-shrink-0 w-10 h-10 rounded-full bg-star-yellow/20 border border-star-yellow/40 flex items-center justify-center text-star-yellow font-bold text-sm">
                  {s.num}
                </span>
                <div className="pt-1.5">
                  <p className="font-semibold text-white">{s.label}</p>
                  <p className="text-sm text-warm-text mt-0.5">{s.desc}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="absolute ml-5 mt-10 w-px h-6 bg-warm-gray/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="px-5 py-14 flex flex-col items-center text-center">
        <img src={logoImg} alt="Mars-Fit" className="h-24 object-contain mb-4" />
        <p className="text-base font-bold text-navy mb-1">지금 바로 내 지원사업을 찾아보세요</p>
        <p className="text-sm text-warm-text mb-6">화성시 소재 소상공인이라면 누구나 무료로 이용할 수 있어요</p>
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <Cta />
        </div>
      </section>

      {/* 푸터 */}
      <footer className="border-t border-warm-gray/20 px-5 py-4 text-center">
        <p className="text-xs text-warm-text">Mars-Fit · 화성시 소상공인 AI 경영동행 서비스</p>
      </footer>

    </div>
  )
}

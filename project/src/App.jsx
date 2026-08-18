import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Landing          from './pages/Landing'
import Auth             from './pages/Auth'
import Onboarding       from './pages/Onboarding'
import Home             from './pages/Home'
import ApplicationGuide from './pages/ApplicationGuide'
import MissionControl   from './pages/MissionControl'
import NoticeDetail     from './pages/NoticeDetail'
import Schedule         from './pages/Schedule'
import BottomNav        from './components/layout/BottomNav'
import { consumeKakaoRedirect } from './utils/kakao'
import { loadOnboarding, saveOnboarding } from './utils/api'
import DevTools from './components/dev/DevTools'

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
}

const pageTransition = { duration: 0.18, ease: 'easeOut' }

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
      >
        <Routes location={location}>
          <Route path="/"           element={<Landing />} />
          <Route path="/auth"       element={<Auth />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home"       element={<Home />} />
          <Route path="/notice"     element={<NoticeDetail />} />
          <Route path="/apply"      element={<ApplicationGuide />} />
          <Route path="/mission"    element={<MissionControl />} />
          <Route path="/schedule"   element={<Schedule />} />
          <Route path="*"           element={<Landing />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * 카카오에서 돌아왔을 때 처리한다.
 *
 * HashRouter 라서 ?code= 가 해시 앞에 붙어 온다(`/?code=xxx#/`). 라우트로는
 * 못 잡으므로 앱이 뜰 때 한 번 확인한다.
 */
/** 주소에 ?code= 가 붙어 있는가. 첫 렌더 전에 알아야 해서 훅 밖에서 본다. */
function isKakaoReturn() {
  const params = new URLSearchParams(window.location.search)
  return params.has('code') || params.has('error')
}

function KakaoReturn() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  // 카카오에서 돌아온 게 확실하면 처음부터 가림막을 띄운다. 안 그러면
  // 로그인 처리가 끝날 때까지 랜딩 화면이 잠깐 스쳐 보인다.
  // (HashRouter 라 ?code= 만 붙어 오면 해시가 비어 랜딩이 그려진다)
  const [busy, setBusy]   = useState(isKakaoReturn)

  useEffect(() => {
    let cancelled = false

    consumeKakaoRedirect()
      .then(async (result) => {
        if (!result || cancelled) return

        let hasProfile = result.onboarding_completed

        try {
          if (hasProfile) {
            // 서버에 있는 걸 내려받아 화면이 바로 쓰게 한다.
            const saved = await loadOnboarding()
            if (saved?.profile) {
              localStorage.setItem('mars-fit-profile', JSON.stringify(saved.profile))
            }
          } else {
            // 둘러보기로 온보딩을 먼저 하고 나중에 로그인한 경우.
            // 브라우저에만 있던 조건을 계정에 붙여준다. 이걸 안 하면
            // 로그인하자마자 온보딩을 처음부터 다시 하게 된다.
            const local = localStorage.getItem('mars-fit-profile')
            if (local) {
              await saveOnboarding(JSON.parse(local))
              hasProfile = true
            }
          }
        } catch {
          // 프로필 동기화에 실패해도 로그인 자체는 됐다. 온보딩을 다시 하면 된다.
        }
        if (cancelled) return
        navigate(hasProfile ? '/home' : '/onboarding', { replace: true })
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setBusy(false) })

    return () => { cancelled = true }
  }, [navigate])

  if (busy) {
    return (
      <div className="fixed inset-0 z-50 bg-primary-bg flex flex-col items-center justify-center gap-3">
        <span className="w-9 h-9 rounded-full border-4 border-warm-gray/40 border-t-navy animate-spin" />
        <p className="text-sm font-semibold text-navy">로그인하고 있어요...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 px-5 py-3 bg-sunset-orange text-white text-sm flex items-center justify-between gap-3">
        <span>{error}</span>
        <button onClick={() => setError('')} className="font-bold shrink-0">닫기</button>
      </div>
    )
  }
  return null
}

export default function App() {
  return (
    <>
      <KakaoReturn />
      <DevTools />
      <AnimatedRoutes />
      <BottomNav />
    </>
  )
}

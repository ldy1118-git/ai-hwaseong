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
import District         from './pages/District'
import BottomNav        from './components/layout/BottomNav'
import { consumeKakaoRedirect, isKakaoNotifyReturn, finishKakaoNotify } from './utils/kakao'
import { loadOnboarding, saveOnboarding } from './utils/api'
import DevTools from './components/dev/DevTools'
import { pullState, startStateSync } from './utils/userState'
import { rememberScroll, restoreScroll } from './utils/scrollMemory'

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
}

// 탭 이동에 0.18초씩 두 번(나가고 들어오고)이면 0.36초다. 탭치고는 길어서
// 화면이 한 번 사라졌다 생기는 것처럼 보인다. 0.12초로 줄인다.
const pageTransition = { duration: 0.12, ease: 'easeOut' }

/**
 * 보던 자리를 기억했다 돌아올 때 되돌려준다.
 *
 * 스크롤을 **계속** 적어둔다. 떠날 때 한 번 읽으면 늦다 — 그 시점에는 새
 * 화면이 이미 그려져서, 문서가 짧아졌으면 브라우저가 스크롤을 맨 위로
 * 당겨놓은 뒤다.
 *
 * 프레임마다 적지 않고 rAF 로 한 번씩 모은다. 스크롤은 초당 수십 번 뛴다.
 */
function ScrollMemory() {
  const { pathname } = useLocation()

  useEffect(() => {
    let queued = false
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        rememberScroll(pathname, window.scrollY)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const cancel = restoreScroll(pathname)
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancel?.()
    }
  }, [pathname])

  return null
}

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
          <Route path="/district"   element={<District />} />
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

    // 카톡 알림 동의를 마치고 돌아온 경우. 같은 ?code= 로 오지만 하는 일이
    // 다르다 — 로그인 처리가 먼저 집어가면 알림은 안 켜진 채 로그인만
    // 다시 된다. state=notify 로 갈라낸다.
    if (isKakaoNotifyReturn()) {
      finishKakaoNotify()
        .then(() => { if (!cancelled) navigate('/onboarding?notify=on', { replace: true }) })
        .catch((err) => { if (!cancelled) setError(err.message) })
        .finally(() => { if (!cancelled) setBusy(false) })
      return () => { cancelled = true }
    }

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
        // 관심공고·메모·서류진행을 다른 기기 것과 합친다. 둘러보기로
        // 담아둔 것이 계정에 붙는 순간이기도 하다(`utils/userState.js`).
        try { await pullState() } catch { /* 기기 것으로 계속 쓴다 */ }

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
        <p className="text-sm font-semibold text-navy">
          {isKakaoNotifyReturn() ? '카톡 알림을 켜고 있어요...' : '로그인하고 있어요...'}
        </p>
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
  // 바뀔 때마다 서버에 올린다. 로그인 안 했으면 아무 일도 안 한다.
  // 새로고침으로 들어온 경우에도 서버 것을 한 번 받아온다 — 다른 기기에서
  // 담은 것이 이 기기에 없을 수 있다.
  useEffect(() => {
    startStateSync()
    pullState().catch(() => {})
  }, [])

  return (
    <>
      <KakaoReturn />
      <ScrollMemory />
      {/* 개발자 도구는 화면 오른쪽 위에 🛠 버튼으로 **항상** 떠 있었다.
          조건이 없어서 배포본에도 그대로 나갔다 — 시연 영상에도, 심사위원
          화면에도 찍힌다. Mock 모드 토글까지 달려 있어서 눌리면 실제 API
          대신 목업이 뜬다.

          import.meta.env.DEV 는 빌드할 때 false 로 치환되고, 그러면 이
          가지가 통째로 사라지면서 DevTools 모듈 자체가 번들에서 빠진다.
          npm run dev 로 띄우면 예전처럼 그대로 쓸 수 있다. */}
      {import.meta.env.DEV && <DevTools />}
      <AnimatedRoutes />
      <BottomNav />
    </>
  )
}

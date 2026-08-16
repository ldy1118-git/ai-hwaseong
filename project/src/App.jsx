import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import Landing          from './pages/Landing'
import Auth             from './pages/Auth'
import Onboarding       from './pages/Onboarding'
import Home             from './pages/Home'
import ApplicationGuide from './pages/ApplicationGuide'
import MissionControl   from './pages/MissionControl'
import { consumeKakaoRedirect } from './utils/kakao'
import { loadOnboarding } from './utils/api'

/**
 * 카카오에서 돌아왔을 때 처리한다.
 *
 * HashRouter 라서 ?code= 가 해시 앞에 붙어 온다(`/?code=xxx#/`). 라우트로는
 * 못 잡으므로 앱이 뜰 때 한 번 확인한다.
 */
function KakaoReturn() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  useEffect(() => {
    let cancelled = false

    consumeKakaoRedirect()
      .then(async (result) => {
        if (!result || cancelled) return
        setBusy(true)

        // 서버에 저장된 프로필이 있으면 내려받아 화면이 바로 쓰게 한다.
        if (result.onboarding_completed) {
          try {
            const saved = await loadOnboarding()
            if (saved?.profile) {
              localStorage.setItem('mars-fit-profile', JSON.stringify(saved.profile))
            }
          } catch {
            // 프로필을 못 받아도 로그인 자체는 됐다. 온보딩을 다시 하면 된다.
          }
        }
        if (cancelled) return
        navigate(result.onboarding_completed ? '/home' : '/onboarding', { replace: true })
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
      <Routes>
        <Route path="/"           element={<Landing />} />
        <Route path="/auth"       element={<Auth />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/home"       element={<Home />} />
        <Route path="/apply"      element={<ApplicationGuide />} />
        <Route path="/mission"    element={<MissionControl />} />
        <Route path="*"           element={<Landing />} />
      </Routes>
    </>
  )
}

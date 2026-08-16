import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import MarsGreeting from '../components/sections/MarsGreeting'
import OrbitDashboard from '../components/sections/OrbitDashboard'
import FloatingChatButton from '../components/ui/FloatingChatButton'

export default function Home() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('mars-fit-profile')
    if (!saved) {
      navigate('/', { replace: true })
      return
    }
    try {
      setProfile(JSON.parse(saved))
    } catch {
      navigate('/', { replace: true })
      return
    }
    setReady(true)
  }, [navigate])

  function handleChatOpen() {
    navigate('/mission')
  }

  if (!ready) return null

  const userName = profile?.category ? `${profile.category} 사장님` : '사장님'

  return (
    <div className="min-h-screen bg-primary-bg">
      <Header onAvatarClick={() => navigate('/onboarding')} />

      <main className="max-w-2xl mx-auto">
        <MarsGreeting userName={userName} />
        <OrbitDashboard userProfile={profile} />
      </main>

      <FloatingChatButton onClick={handleChatOpen} />
    </div>
  )
}

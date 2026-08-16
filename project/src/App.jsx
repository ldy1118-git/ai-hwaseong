import { Routes, Route } from 'react-router-dom'
import Landing          from './pages/Landing'
import Auth             from './pages/Auth'
import Onboarding       from './pages/Onboarding'
import Home             from './pages/Home'
import ApplicationGuide from './pages/ApplicationGuide'
import MissionControl   from './pages/MissionControl'

export default function App() {
  return (
    <Routes>
      <Route path="/"           element={<Landing />} />
      <Route path="/auth"       element={<Auth />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/home"       element={<Home />} />
      <Route path="/apply"      element={<ApplicationGuide />} />
      <Route path="/mission"    element={<MissionControl />} />
      <Route path="*"           element={<Landing />} />
    </Routes>
  )
}

import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import TaxSchedule from './pages/TaxSchedule'
import SupportPrograms from './pages/SupportPrograms'
import District from './pages/District'
import ServiceMap from './pages/ServiceMap'
import BottomNav from './components/BottomNav'
import Chatbot from './components/Chatbot'

export default function App() {
  return (
    <div className="max-w-lg mx-auto min-h-screen relative">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tax" element={<TaxSchedule />} />
        <Route path="/support" element={<SupportPrograms />} />
        <Route path="/district" element={<District />} />
        <Route path="/map" element={<ServiceMap />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
      <Chatbot />
    </div>
  )
}

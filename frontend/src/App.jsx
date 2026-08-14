import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import TaxSchedule from './pages/TaxSchedule'
import SupportPrograms from './pages/SupportPrograms'
import District from './pages/District'
import ServiceMap from './pages/ServiceMap'
import Sidebar from './components/Sidebar'
import Chatbot from './components/Chatbot'

function Layout({ children }) {
  const location = useLocation()
  const isApp = !['/', '/onboarding'].some(
    p => location.pathname === p || location.pathname.startsWith('/onboarding')
  )
  return <div className={isApp ? 'ml-60' : ''}>{children}</div>
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <Layout>
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
      </Layout>
      <Chatbot />
    </div>
  )
}

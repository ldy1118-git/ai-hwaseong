import { useState, useEffect } from 'react'
import Header from '../components/layout/Header'
import DeadlineCalendar from '../components/ui/DeadlineCalendar'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'

function calcDDay(end) {
  if (!end) return null
  return Math.ceil((new Date(end) - new Date()) / 86400000)
}

function mapMatch(r) {
  return {
    id:    r.notice_id,
    title: r.notice_title,
    score: r.match_score,
    dDay:  calcDDay(r.apply_period?.end),
    raw:   r,
  }
}

export default function Schedule() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const profile = (() => {
      try { return JSON.parse(localStorage.getItem('mars-fit-profile')) } catch { return null }
    })() ?? DEFAULT_PROFILE

    fetchMatches(profile)
      .then(r => setMatches((r?.results ?? []).map(mapMatch)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-primary-bg pb-20">
      <Header />
      <div className="max-w-4xl mx-auto px-5 pt-4">
        <h2 className="text-base font-bold text-navy mb-4">신청 마감 일정</h2>
        <DeadlineCalendar matches={matches} loading={loading} />
      </div>
    </div>
  )
}

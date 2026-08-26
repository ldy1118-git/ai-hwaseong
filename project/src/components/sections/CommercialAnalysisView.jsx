import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  School, Utensils, BookOpen, Coffee, Building2, Search, Train,
  Maximize2, X as XIcon, Sparkles, Users, CreditCard, MapPin,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiUrl } from '../../utils/api'
import marsImg   from '../../../design/mars.png'
import searchImg from '../../../design/search.png'
import findImg   from '../../../design/find.png'

// ── Leaflet 아이콘 ───────────────────────────────────────────────
const leafletIcon = L.icon({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41],
})

// ── 순수 Leaflet 지도 컴포넌트 ──────────────────────────────────
function LeafletMap({ position, onMove, radii, markers }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markerRef    = useRef(null)
  const overlayRef   = useRef(null)
  const onMoveRef    = useRef(onMove)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [position.lat, position.lng], zoom: 14, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    const marker = L.marker([position.lat, position.lng], { draggable: true, icon: leafletIcon }).addTo(map)
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng()
      onMoveRef.current({ lat, lng })
    })
    overlayRef.current = L.layerGroup().addTo(map)
    mapRef.current = map; markerRef.current = marker
    setMapReady(true)
    return () => {
      map.remove()
      mapRef.current = null; markerRef.current = null; overlayRef.current = null
      setMapReady(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markerRef.current?.setLatLng([position.lat, position.lng])
    mapRef.current?.setView([position.lat, position.lng], mapRef.current.getZoom(), { animate: true })
  }, [position.lat, position.lng])

  useEffect(() => {
    if (!mapReady || !overlayRef.current || !radii || !markers) return
    overlayRef.current.clearLayers()
    const cfgMap = Object.fromEntries(AMENITY_CONFIG.map(c => [c.key, c]))
    AMENITY_CONFIG.forEach(({ key, color }) => {
      L.circle([position.lat, position.lng], {
        radius: radii[key], color, fillColor: color,
        fillOpacity: 0.07, weight: 1.5, dashArray: '5 4', opacity: 0.6,
      }).addTo(overlayRef.current)
    })
    markers.forEach(({ lat, lng, key, popup }) => {
      const { color, char } = cfgMap[key] || {}
      if (!color) return
      const m = L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="width:16px;height:16px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:white;box-shadow:0 1px 4px rgba(0,0,0,.35)">${char}</div>`,
          className: '', iconSize: [16, 16], iconAnchor: [8, 8],
        }),
      }).addTo(overlayRef.current)
      if (popup) m.bindPopup(popup)
    })
  }, [mapReady, position.lat, position.lng, radii, markers])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}

// ── 상수 ─────────────────────────────────────────────────────────
const HWS_CENTER = { lat: 37.1999, lng: 126.8317 }

const TZ_LABELS = {
  TZ01: '자정~새벽',  TZ02: '새벽',    TZ03: '오전',
  TZ04: '오전 중반', TZ05: '점심 전후', TZ06: '오후',
  TZ07: '저녁',      TZ08: '밤',       TZ09: '늦은 밤', TZ10: '심야',
}

const AMENITY_CONFIG = [
  { key: 'restaurants', label: '음식점', Icon: Utensils,  color: '#F97316', char: '식' },
  { key: 'cafes',       label: '카페',   Icon: Coffee,    color: '#92400E', char: '카' },
  { key: 'academies',   label: '학원',   Icon: BookOpen,  color: '#8B5CF6', char: '원' },
  { key: 'schools',     label: '학교',   Icon: School,    color: '#3B82F6', char: '학' },
  { key: 'stations',    label: '지하철역', Icon: Train,   color: '#1E3A5F', char: '역' },
]

const DEFAULT_RADII = { schools: 500, restaurants: 500, academies: 500, cafes: 500, stations: 500 }

const RANGE_PRESETS = [
  { label: '가까이',  meters: 300,  walk: '도보 5분'  },
  { label: '보통',    meters: 500,  walk: '도보 10분', recommended: true },
  { label: '넓게',    meters: 1000, walk: '도보 20분' },
]

const COMPETITION_THRESHOLDS = {
  restaurants: [30, 80],
  cafes:       [15, 40],
  academies:   [15, 40],
}

function competitionLevel(key, count) {
  const [mid, high] = COMPETITION_THRESHOLDS[key] || [20, 60]
  if (count >= high) return { label: '경쟁 심함', emoji: '🔴', color: '#EF4444', bg: '#FEF2F2',
    tip: '경쟁이 치열해요. 차별화 전략이 꼭 필요해요.' }
  if (count >= mid)  return { label: '경쟁 보통', emoji: '🟡', color: '#F97316', bg: '#FFF7ED',
    tip: '어느 정도 경쟁이 있어요. 틈새를 잘 공략해보세요.' }
  return               { label: '경쟁 적음', emoji: '🟢', color: '#10B981', bg: '#F0FDF4',
    tip: '경쟁이 많지 않아요. 새로운 수요를 만들기 좋아요.' }
}

function calcFootTrafficScore(am, stationPassengers, aptDong) {
  const stationScore = (stationPassengers != null && stationPassengers > 0)
    ? stationPassengers * 0.15
    : am.stations * 650
  const aptScore = Math.round((aptDong?.total_units || 0) * 0.08)
  return Math.round(am.schools * 220 + am.restaurants * 55 + am.cafes * 90 + aptScore + stationScore)
}

function footTrafficLevel(score) {
  if (score >= 8000) return { text: '매우 활발', color: '#10B981',
    desc: '역·학교·아파트가 고루 갖춰진 핵심 상권' }
  if (score >= 4000) return { text: '활발',     color: '#3B82F6',
    desc: '점심·저녁에 사람이 모이는 상권' }
  return               { text: '안정적',   color: '#8B5CF6',
    desc: '단골 비중이 높은 주거 중심 상권' }
}

function fmtWon(won) {
  if (won >= 1_0000_0000) return `약 ${(won / 1_0000_0000).toFixed(1)}억원`
  return `약 ${Math.round(won / 10000).toLocaleString()}만원`
}

async function fetchCommercialSummary({ amenities, aptDong, cardSales, stationPassengersTotal, radii }) {
  const aptLine = aptDong && aptDong.total_units > 0
    ? `아파트: ${aptDong.dong} 내 ${aptDong.complexes}개 단지, ${aptDong.total_units.toLocaleString()}세대`
    : '아파트 정보: 없음'
  const stationLine = amenities.stations > 0
    ? `역: ${amenities.stations}개${stationPassengersTotal > 0 ? ` (일 평균 ${stationPassengersTotal.toLocaleString()}명)` : ''}`
    : '역: 없음'
  let salesLine = ''
  if (cardSales) {
    salesLine = `이 지역 카드매출: 월 약 ${Math.round(cardSales.total_sales / 1e8)}억원 / 피크: ${TZ_LABELS[cardSales.peak_tz] || cardSales.peak_tz}`
  }
  const bizTotal = amenities.restaurants + amenities.cafes + amenities.academies
  const distLine = bizTotal > 0
    ? `업종 분포: 음식점 ${amenities.restaurants}개, 카페 ${amenities.cafes}개, 학원 ${amenities.academies}개`
    : ''
  const prompt = [
    `반경 ${radii.schools}m 내 학교: ${amenities.schools}개`,
    `반경 ${radii.restaurants}m 내 ${distLine}`,
    stationLine, aptLine, salesLine,
  ].filter(Boolean).join('\n')

  const res = await fetch(apiUrl('/api/llm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 응원하는 상권 분석 도우미예요.
창업 예정 위치 데이터를 바탕으로 유동인구 규모, 카드매출 수준, 업종 분포, 경쟁 현황을 짧게 분석해주세요.
마지막에 창업 시 핵심 조언 한 문장을 덧붙여주세요.
"~해요" 처럼 친근한 말투로, 구체적인 숫자를 활용해 주세요.`,
      prompt,
    }),
  })
  const data = await res.json()
  return data.text || ''
}

// ── 단계 번호 뱃지 ────────────────────────────────────────────────
function StepBadge({ n }) {
  return (
    <span className="w-6 h-6 rounded-full bg-navy text-white text-[11px] font-black
                     flex items-center justify-center flex-shrink-0">
      {n}
    </span>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function CommercialAnalysisView() {
  const [position, setPosition]           = useState(HWS_CENTER)
  const [address, setAddress]             = useState('')
  const [searching, setSearching]         = useState(false)
  const [radii, setRadii]                 = useState(DEFAULT_RADII)
  const [activePreset, setActivePreset]   = useState(500)
  const [showDetailSliders, setShowDetailSliders] = useState(false)
  const [expanded, setExpanded]           = useState(false)
  const [apiData, setApiData]             = useState(null)
  const [llmSummary, setLlmSummary]       = useState('')
  const [llmLoading, setLlmLoading]       = useState(false)
  const [llmAsked, setLlmAsked]           = useState(false)
  const [enabledFacilities, setEnabledFacilities] = useState(
    () => Object.fromEntries(AMENITY_CONFIG.map(c => [c.key, true]))
  )
  const debounceRef = useRef(null)

  const effectiveRadii = useMemo(() => (
    Object.fromEntries(AMENITY_CONFIG.map(({ key }) => [key, enabledFacilities[key] ? radii[key] : 0]))
  ), [radii, enabledFacilities])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch('/api/commercial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: position.lat, lng: position.lng, radii: effectiveRadii }),
      })
        .then(r => r.json())
        .then(setApiData)
        .catch(() => {})
    }, 300)
  }, [position.lat, position.lng, effectiveRadii])

  useEffect(() => {
    setLlmSummary('')
    setLlmAsked(false)
  }, [position.lat, position.lng])

  const { amenities, displayMarkers, stationPassengersTotal, aptDong, cardSales } = useMemo(() => {
    const counts  = apiData?.counts  || {}
    const markers = apiData?.markers || {}
    const amenities = {
      schools: counts.schools ?? 0, restaurants: counts.restaurants ?? 0,
      academies: counts.academies ?? 0, cafes: counts.cafes ?? 0, stations: counts.stations ?? 0,
    }
    const rawPassengers = markers.stations
      ? markers.stations.reduce((s, st) => s + (st.passengers || 0), 0) : null
    const aptDong   = apiData?.apt_dong   ?? null
    const cardSales = apiData?.card_sales ?? null
    const displayMarkers = []
    ;(markers.schools || []).forEach(s =>
      displayMarkers.push({ lat: s.lat, lng: s.lng, key: 'schools', popup: `<b>${s.name}</b><br>${s.level}` })
    )
    ;(markers.stations || []).forEach(s =>
      displayMarkers.push({
        lat: s.lat, lng: s.lng, key: 'stations',
        popup: `<b>${s.name}역</b> (${s.line})${s.passengers > 0 ? `<br>일 평균 ${s.passengers.toLocaleString()}명` : ''}`,
      })
    )
    ;['restaurants', 'cafes', 'academies'].forEach(key =>
      (markers[key] || []).forEach(s => displayMarkers.push({ lat: s.lat, lng: s.lng, key }))
    )
    return { amenities, displayMarkers, stationPassengersTotal: rawPassengers, aptDong, cardSales }
  }, [apiData])

  const ftScore = useMemo(
    () => calcFootTrafficScore(amenities, stationPassengersTotal, aptDong),
    [amenities, stationPassengersTotal, aptDong]
  )
  const ftLevel  = footTrafficLevel(ftScore)
  const bizTotal = amenities.restaurants + amenities.cafes + amenities.academies

  const applyPreset = useCallback((meters) => {
    setActivePreset(meters)
    setRadii({ schools: meters, restaurants: meters, academies: meters, cafes: meters, stations: meters })
  }, [])

  const handleMarkerMove = useCallback((pos) => {
    setPosition(pos)
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json`)
      .then(r => r.json())
      .then(d => {
        if (d.address) {
          const parts = [d.address.suburb || d.address.quarter, d.address.city || d.address.county].filter(Boolean)
          setAddress(parts.join(' '))
        }
      })
      .catch(() => {})
  }, [])

  const handleSearch = useCallback(async (e) => {
    e.preventDefault()
    const q = address.trim()
    if (!q) return
    setSearching(true)
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=kr`
      )
      const data = await res.json()
      if (data[0]) setPosition({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
    } catch {}
    setSearching(false)
  }, [address])

  const setRadius = useCallback((key, value) => {
    setActivePreset(null)
    setRadii(prev => ({ ...prev, [key]: Number(value) }))
  }, [])

  const toggleFacility = useCallback((key) => {
    setEnabledFacilities(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleAskMaida = useCallback(async () => {
    setLlmLoading(true)
    setLlmSummary('')
    setLlmAsked(true)
    try {
      const text = await fetchCommercialSummary({ amenities, aptDong, cardSales, stationPassengersTotal, radii })
      setLlmSummary(text)
    } catch {
      setLlmSummary('마이다가 잠깐 연결이 끊겼어요. 다시 시도해주세요.')
    } finally {
      setLlmLoading(false)
    }
  }, [amenities, aptDong, cardSales, stationPassengersTotal, radii])

  return (
    <div className="max-w-5xl mx-auto px-4 pb-10 space-y-4">

      {/* ── 인트로 배너 ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-navy to-navy/80 rounded-2xl px-6 py-4 flex items-center gap-6">
        <div className="absolute top-2 right-32 w-1.5 h-1.5 rounded-full bg-white/20" />
        <div className="absolute top-6 right-44 w-1 h-1 rounded-full bg-white/15" />
        <img src={marsImg} alt="마이다" className="w-16 h-16 object-contain flex-shrink-0"
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }} />
        <div className="flex-1">
          <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-0.5">마이다 상권분석</p>
          <p className="text-lg font-extrabold text-white leading-snug">
            창업 예정지의 상권을 실제 데이터로 분석해드려요
          </p>
          <p className="text-[11px] text-white/70 mt-1">
            위치를 고르면 유동인구·매출·경쟁 현황을 한눈에 볼 수 있어요
          </p>
        </div>
      </div>

      {/* ── ROW 1: 지도 + 범위 설정 ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* 지도 카드 (lg: 3/5) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <StepBadge n={1} />
            <div>
              <p className="text-[13px] font-bold text-navy leading-tight">어디서 창업하고 싶으세요?</p>
              <p className="text-[10px] text-warm-text">핀을 드래그하거나 주소를 검색해보세요</p>
            </div>
          </div>

          <div className="relative rounded-xl overflow-hidden border border-warm-gray/15 flex-1" style={{ minHeight: 260 }}>
            <LeafletMap position={position} onMove={handleMarkerMove} radii={effectiveRadii}
              markers={displayMarkers.filter(m => enabledFacilities[m.key])} />
            <button onClick={() => setExpanded(true)}
              className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm border border-warm-gray/30
                         rounded-lg p-1.5 shadow hover:bg-white transition-colors"
              style={{ zIndex: 1000 }}>
              <Maximize2 size={13} className="text-navy" />
            </button>
          </div>

          {address && (
            <div className="flex items-center gap-1.5 text-[11px] text-warm-text -mt-1">
              <MapPin size={11} className="text-navy flex-shrink-0" />
              <span>선택한 위치: <strong className="text-navy">{address}</strong></span>
            </div>
          )}

          <form onSubmit={handleSearch} className="flex gap-1.5">
            <input
              type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="예: 동탄역, 병점동, 봉담읍..."
              className="flex-1 min-w-0 text-[11px] bg-gray-50 border border-warm-gray/30 rounded-xl
                         px-3 py-2 text-navy placeholder:text-warm-gray/50
                         focus:outline-none focus:border-navy focus:bg-white transition-colors"
            />
            <button type="submit" disabled={searching}
              className="flex-shrink-0 bg-navy text-white rounded-xl px-3 py-2 text-xs font-semibold
                         disabled:opacity-50 flex items-center gap-1">
              <Search size={13} />검색
            </button>
          </form>
        </div>

        {/* 범위 + 시설 카드 (lg: 2/5) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <StepBadge n={2} />
            <div>
              <p className="text-[13px] font-bold text-navy leading-tight">범위를 설정해보세요</p>
              <p className="text-[10px] text-warm-text">걸어서 이동 가능한 거리 기준</p>
            </div>
          </div>

          {/* 프리셋 */}
          <div className="grid grid-cols-3 gap-2">
            {RANGE_PRESETS.map(({ label, meters, walk, recommended }) => {
              const active = activePreset === meters
              return (
                <button key={meters} onClick={() => applyPreset(meters)}
                  className={`relative flex flex-col items-center py-3 px-1 rounded-xl border-2 transition-all
                    ${active
                      ? 'border-navy bg-navy text-white shadow-md'
                      : 'border-warm-gray/30 bg-gray-50 text-warm-text hover:border-navy/40 hover:bg-white'
                    }`}
                >
                  {recommended && (
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1.5 py-0.5 rounded-full
                      ${active ? 'bg-white text-navy' : 'bg-star-yellow text-navy'}`}>추천</span>
                  )}
                  <span className="text-sm font-extrabold">{label}</span>
                  <span className={`text-[10px] ${active ? 'text-white/80' : 'text-navy/60'}`}>{walk}</span>
                </button>
              )
            })}
          </div>

          {/* 시설 현황 */}
          <div>
            <p className="text-[11px] font-semibold text-warm-text mb-2">반경 내 시설 현황</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {AMENITY_CONFIG.map(({ key, label, Icon, color }) => {
                const enabled = enabledFacilities[key]
                return (
                  <div key={key} className={`flex items-center gap-1.5 transition-opacity ${enabled ? '' : 'opacity-35'}`}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: color + '22', border: `1.5px solid ${color}` }}>
                      <Icon size={9} style={{ color }} />
                    </div>
                    <span className="text-[10px] text-warm-text flex-1">{label}</span>
                    <span className="text-xs font-extrabold text-navy tabular-nums">{amenities[key]}</span>
                    <span className="text-[9px] text-warm-text">개</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 세부 슬라이더 */}
          <div>
            <button onClick={() => setShowDetailSliders(v => !v)}
              className="flex items-center gap-1 text-[11px] text-navy/50 hover:text-navy transition-colors">
              {showDetailSliders ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              시설 종류별로 따로 설정
            </button>
            {showDetailSliders && (
              <div className="mt-2 space-y-3">
                {AMENITY_CONFIG.map(({ key, label, Icon, color }) => {
                  const enabled = enabledFacilities[key]
                  return (
                    <div key={key} className={`transition-opacity ${enabled ? '' : 'opacity-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <Icon size={9} style={{ color: enabled ? color : '#aaa' }} />
                          <span className="text-[10px] text-warm-text">{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {enabled && (
                            <span className="text-[9px] font-semibold tabular-nums" style={{ color }}>
                              {radii[key] >= 1000 ? `${radii[key] / 1000}km` : `${radii[key]}m`}
                            </span>
                          )}
                          {/* 토글 스위치 */}
                          <button
                            onClick={() => toggleFacility(key)}
                            className="relative flex-shrink-0 rounded-full transition-colors duration-200"
                            style={{
                              width: 30, height: 17,
                              background: enabled ? color : '#d1d5db',
                            }}
                            title={enabled ? '끄기' : '켜기'}
                          >
                            <span
                              className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
                              style={{ transform: enabled ? 'translateX(13px)' : 'translateX(2px)' }}
                            />
                          </button>
                        </div>
                      </div>
                      {enabled && (
                        <input type="range" min={100} max={3000} step={50}
                          value={radii[key]} onChange={e => setRadius(key, e.target.value)}
                          className="w-full h-1.5 cursor-pointer" style={{ accentColor: color }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ROW 2: 핵심 지표 4개 ────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <StepBadge n={3} />
          <p className="text-[13px] font-bold text-navy">이 위치의 상권은 어때요?</p>
          <img src={searchImg} alt="" className="w-7 h-7 object-contain ml-auto" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          {/* 유동인구 */}
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-3">
            <div className="flex items-center gap-1 mb-1.5">
              <Users size={10} className="text-warm-text" />
              <p className="text-[10px] text-warm-text font-medium">유동인구 예측</p>
            </div>
            <p className="text-xl font-extrabold text-navy tabular-nums leading-none">
              {ftScore >= 10000
                ? `${(ftScore / 10000).toFixed(1)}만`
                : ftScore.toLocaleString()}
              <span className="text-[10px] font-normal text-warm-text ml-1">명/일</span>
            </p>
            <span className="inline-block mt-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ color: ftLevel.color, background: ftLevel.color + '18' }}>
              {ftLevel.text}
            </span>
            <p className="text-[10px] text-warm-text mt-1 leading-snug">{ftLevel.desc}</p>
          </div>

          {/* 카드매출 */}
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-3">
            <div className="flex items-center gap-1 mb-1.5">
              <CreditCard size={10} className="text-warm-text" />
              <p className="text-[10px] text-warm-text font-medium">이 지역 카드매출</p>
            </div>
            {cardSales ? (
              <>
                <p className="text-xl font-extrabold text-navy tabular-nums leading-none">
                  {Math.round(cardSales.total_sales / 1e8).toLocaleString()}
                  <span className="text-[10px] font-normal text-warm-text ml-1">억/월</span>
                </p>
                <p className="text-[10px] text-warm-text mt-2 leading-snug">
                  피크 <strong className="text-navy">{TZ_LABELS[cardSales.peak_tz] || cardSales.peak_tz}</strong>
                  {' '}({cardSales.peak_pct.toFixed(1)}%)
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-warm-text/30 mt-1">—</p>
                <p className="text-[10px] text-warm-text mt-2">화성시 집계 밖 지역이에요</p>
              </>
            )}
          </div>

          {/* 아파트 */}
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-3">
            <div className="flex items-center gap-1 mb-1.5">
              <Building2 size={10} className="text-warm-text" />
              <p className="text-[10px] text-warm-text font-medium">
                주변 아파트
                {aptDong?.dong && <span className="ml-1 font-bold text-navy">· {aptDong.dong}</span>}
              </p>
            </div>
            {aptDong && aptDong.total_units > 0 ? (
              <>
                <p className="text-xl font-extrabold text-navy tabular-nums leading-none">
                  {aptDong.total_units.toLocaleString()}
                  <span className="text-[10px] font-normal text-warm-text ml-1">세대</span>
                </p>
                <p className="text-[10px] text-warm-text mt-2">단지 {aptDong.complexes}개</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-warm-text/30 mt-1">—</p>
                <p className="text-[10px] text-warm-text mt-2">아파트 정보 없음</p>
              </>
            )}
          </div>

          {/* 역세권 */}
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-3">
            <div className="flex items-center gap-1 mb-1.5">
              <Train size={10} className="text-warm-text" />
              <p className="text-[10px] text-warm-text font-medium">역세권</p>
            </div>
            {amenities.stations > 0 ? (
              <>
                <p className="text-xl font-extrabold text-navy tabular-nums leading-none">
                  {amenities.stations}
                  <span className="text-[10px] font-normal text-warm-text ml-1">개역</span>
                </p>
                <p className="text-[10px] text-warm-text mt-2">
                  {stationPassengersTotal > 0
                    ? <>일 <strong className="text-navy">
                        {stationPassengersTotal >= 10000
                          ? `${(stationPassengersTotal / 10000).toFixed(1)}만`
                          : stationPassengersTotal.toLocaleString()}
                      </strong>명 이용</>
                    : '이용객 수 미집계'
                  }
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-warm-text/30 mt-1">—</p>
                <p className="text-[10px] text-warm-text mt-2">범위 내 역 없음</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── ROW 3: 경쟁 현황 + 마이다 분석 ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 경쟁 현황 */}
        <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
          <p className="text-[12px] font-bold text-navy mb-4">경쟁 현황 · 예상 매출</p>

          {bizTotal > 0 ? (
            <div className="space-y-4">
              {[
                { key: 'restaurants', label: '음식점', max: 200 },
                { key: 'cafes',       label: '카페',   max: 80  },
                { key: 'academies',   label: '학원',   max: 80  },
              ].map(({ key, label, max }) => {
                const count    = amenities[key]
                const pct      = Math.min((count / max) * 100, 100)
                const lvl      = competitionLevel(key, count)
                const perStore = (cardSales && count > 0)
                  ? cardSales.total_sales / count : null
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-navy font-semibold">
                        {label} <span className="tabular-nums">{count}개</span>
                      </p>
                      <div className="flex items-center gap-2">
                        {perStore != null && (
                          <span className="text-[10px] font-semibold text-navy tabular-nums">
                            {fmtWon(perStore)}/월
                          </span>
                        )}
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ color: lvl.color, background: lvl.bg }}>
                          {lvl.emoji} {lvl.label}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-warm-gray/15 rounded-full overflow-hidden mb-1">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: lvl.color }} />
                    </div>
                    <p className="text-[10px] text-warm-text">{lvl.tip}</p>
                  </div>
                )
              })}

              {amenities.schools > 0 && (
                <div className="pt-3 border-t border-warm-gray/10">
                  <p className="text-[11px] text-warm-text">
                    <School size={10} className="inline text-blue-500 mr-1 mb-0.5" />
                    학교 <strong className="text-navy">{amenities.schools}개</strong> — 하교 시간대 고객 유입 기대
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-warm-text/50 py-2">범위 안에 업체 데이터가 없어요</p>
          )}

          {cardSales && bizTotal > 0 && (
            <p className="mt-4 text-[10px] text-warm-text/55 leading-relaxed border-t border-warm-gray/10 pt-3">
              * 예상 매출은 행정동 전체 카드 소비를 반경 내 가게 수로 나눈
              데이터 기반 예상치예요. 실제 매출은 업종·규모·운영 방식에 따라
              크게 달라질 수 있어요.
            </p>
          )}
        </div>

        {/* 마이다 종합 분석 */}
        <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4 flex flex-col">
          <div className="flex items-start gap-3 mb-4">
            <StepBadge n={4} />
            <div className="flex-1">
              <p className="text-[13px] font-bold text-navy">마이다의 종합 한마디</p>
              <p className="text-[10px] text-warm-text mt-0.5">위 데이터를 보고 마이다가 분석해드려요</p>
            </div>
            <img src={findImg} alt="마이다" className="w-10 h-10 object-contain flex-shrink-0" />
          </div>

          <button onClick={handleAskMaida} disabled={llmLoading || !apiData}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
                       transition-all disabled:opacity-50 bg-navy text-white hover:bg-navy/90 active:scale-[0.99]">
            <Sparkles size={14} />
            {llmLoading ? '분석 중이에요...' : '이 위치 상권 물어보기'}
          </button>

          {llmAsked && (
            <div className="mt-4 flex-1">
              {llmLoading ? (
                <div className="space-y-2.5 animate-pulse">
                  {[1, 0.9, 0.85, 0.7].map((w, i) => (
                    <div key={i} className="h-2.5 bg-warm-gray/20 rounded-full"
                      style={{ width: `${w * 100}%` }} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{llmSummary}</p>
              )}
            </div>
          )}

          {!llmAsked && (
            <p className="mt-3 text-center text-[10px] text-warm-text/50">
              위 분석을 확인한 뒤 눌러보세요
            </p>
          )}
        </div>
      </div>

      {/* ── 확대 지도 모달 ───────────────────────────────────────── */}
      {expanded && (
        <div className="fixed inset-0 flex flex-col bg-white" style={{ zIndex: 9999 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-warm-gray/20 flex-shrink-0">
            <p className="text-sm font-bold text-navy">지도에서 위치 선택</p>
            <button onClick={() => setExpanded(false)} className="p-1 rounded-lg hover:bg-warm-gray/10">
              <XIcon size={20} className="text-navy" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LeafletMap position={position} onMove={handleMarkerMove} radii={radii} markers={displayMarkers} />
          </div>
          <div className="px-4 py-3 border-t border-warm-gray/20 flex-shrink-0 bg-white">
            <form onSubmit={handleSearch} className="flex gap-1.5">
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="예: 동탄역, 병점동, 봉담읍..."
                className="flex-1 min-w-0 text-[11px] bg-gray-50 border border-warm-gray/30 rounded-xl
                           px-3 py-2.5 text-navy placeholder:text-warm-gray/50
                           focus:outline-none focus:border-navy transition-colors"
              />
              <button type="submit" disabled={searching}
                className="flex-shrink-0 bg-navy text-white rounded-xl px-3 py-2.5 disabled:opacity-50">
                <Search size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

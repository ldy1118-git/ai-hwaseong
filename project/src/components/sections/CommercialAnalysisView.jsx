import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Info, School, Utensils, BookOpen, Coffee, Building2, Search, Train,
  Maximize2, X as XIcon,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * 상권분석 뷰.
 *
 * District.jsx 에서 떼어냈다. 그 파일 하나에 세무일정과 상권분석이 같이
 * 들어 있어서 1,000 줄이 넘었고, 두 기능을 각각 맡은 사람이 같은 파일을
 * 동시에 고치게 됐다. 세무 쪽은 District.jsx 에, 상권 쪽은 여기에 둔다.
 *
 * 지도와 주소 검색에는 API 키가 하나도 안 들어간다.
 *   타일    — OpenStreetMap
 *   주소검색 — Nominatim (/search, /reverse)
 * 다만 Nominatim 은 초당 1회를 넘기면 안 된다. 자동완성 같은 걸 붙일 때
 * 입력마다 부르지 말 것.
 */

// ── Leaflet 아이콘 CDN 고정 (Vite 번들링 우회) ───────────────────
const leafletIcon = L.icon({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  shadowSize:  [41, 41],
})

// ── 시설 마커 위치 생성 (황금각 분산) ────────────────────────────

function mockMarkerPositions(centerLat, centerLng, radiusMeters, count) {
  const latScale = radiusMeters / 111320
  const lngScale = radiusMeters / (111320 * Math.cos(centerLat * Math.PI / 180))
  return Array.from({ length: Math.min(count, 12) }, (_, i) => {
    const a = Math.abs(Math.sin((i + 1) * 137.508) * 10000)
    const b = Math.abs(Math.sin((i + 1) * 137.508 + 50) * 10000)
    const angle = (a - Math.floor(a)) * 2 * Math.PI
    const dist  = Math.sqrt(b - Math.floor(b)) * 0.88
    return {
      lat: centerLat + Math.cos(angle) * dist * latScale,
      lng: centerLng + Math.sin(angle) * dist * lngScale,
    }
  })
}

// ── 순수 Leaflet 지도 컴포넌트 ───────────────────────────────────

function LeafletMap({ position, onMove, radii, markers }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markerRef    = useRef(null)
  const overlayRef   = useRef(null)
  const onMoveRef    = useRef(onMove)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  // 지도 최초 초기화 (마운트 1회)
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
    mapRef.current    = map
    markerRef.current = marker
    setMapReady(true)
    return () => {
      map.remove()
      mapRef.current = null; markerRef.current = null; overlayRef.current = null
      setMapReady(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 외부에서 position이 바뀌면 지도·마커 동기화
  useEffect(() => {
    markerRef.current?.setLatLng([position.lat, position.lng])
    mapRef.current?.setView([position.lat, position.lng], mapRef.current.getZoom(), { animate: true })
  }, [position.lat, position.lng])

  // 시설 범위 원 + 실제 마커 그리기
  useEffect(() => {
    if (!mapReady || !overlayRef.current || !radii || !markers) return
    overlayRef.current.clearLayers()

    const cfgMap = Object.fromEntries(AMENITY_CONFIG.map(c => [c.key, c]))

    // 반경 원 (카테고리별 색상)
    AMENITY_CONFIG.forEach(({ key, color }) => {
      L.circle([position.lat, position.lng], {
        radius: radii[key],
        color,
        fillColor: color,
        fillOpacity: 0.07,
        weight: 1.5,
        dashArray: '5 4',
        opacity: 0.6,
      }).addTo(overlayRef.current)
    })

    // 실제(또는 목업) 마커
    markers.forEach(({ lat, lng, key, popup }) => {
      const { color, char } = cfgMap[key] || {}
      if (!color) return
      const m = L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="width:16px;height:16px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:white;box-shadow:0 1px 4px rgba(0,0,0,.35);line-height:1">${char}</div>`,
          className: '',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(overlayRef.current)
      if (popup) m.bindPopup(popup)
    })
  }, [mapReady, position.lat, position.lng, radii, markers])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}

// ── 상권분석 뷰 ──────────────────────────────────────────────────

const HWS_CENTER = { lat: 37.1999, lng: 126.8317 }

function seededRand(seed, min, max) {
  const x = Math.sin(seed) * 10000
  return min + Math.floor((x - Math.floor(x)) * (max - min + 1))
}

const BASE_RADIUS = 500

// 아파트만 mock (실제 위치 데이터 없음)
function getMockApartmentCount(lat, lng, radius) {
  const s  = Math.abs(Math.round(lat * 100) * 1000 + Math.round(lng * 100))
  const sc = Math.max(0.04, (radius / BASE_RADIUS) ** 1.8)
  return Math.max(0, Math.round(seededRand(s + 4, 1, 18) * sc))
}

function getFootTrafficText(am, stationPassengers) {
  const stationScore = stationPassengers != null
    ? stationPassengers * 0.15
    : am.stations * 650
  const score = am.schools * 220 + am.restaurants * 55 + am.cafes * 90
              + am.apartments * 160 + stationScore
  if (score >= 8000) {
    return `일 평균 ${(score / 10000).toFixed(1)}만명 이상이 지나갈 것으로 예상해요! 역세권·학교·아파트가 많아 출퇴근 피크가 뚜렷해요`
  }
  if (score >= 4000) {
    return `일 평균 약 ${score.toLocaleString()}명이 지나갈 것으로 예상해요! 음식점과 카페가 밀집해 점심·저녁 시간대 방문이 활발해요`
  }
  return `일 평균 약 ${score.toLocaleString()}명 수준으로 예상해요. 조용한 주거 중심 상권으로 단골 손님 비중이 높아요`
}

const AMENITY_CONFIG = [
  { key: 'schools',     label: '학교',       Icon: School,    color: '#3B82F6', char: '학' },
  { key: 'restaurants', label: '음식점',     Icon: Utensils,  color: '#F97316', char: '식' },
  { key: 'academies',   label: '학원',       Icon: BookOpen,  color: '#8B5CF6', char: '원' },
  { key: 'cafes',       label: '카페',       Icon: Coffee,    color: '#92400E', char: '카' },
  { key: 'apartments',  label: '아파트 단지', Icon: Building2, color: '#10B981', char: '아' },
  { key: 'stations',    label: '역',         Icon: Train,     color: '#1E3A5F', char: '역' },
]

const DEFAULT_RADII = { schools: 500, restaurants: 500, academies: 500, cafes: 500, apartments: 500, stations: 500 }

export default function CommercialAnalysisView() {
  const [position, setPosition]   = useState(HWS_CENTER)
  const [address, setAddress]     = useState('')
  const [searching, setSearching] = useState(false)
  const [radii, setRadii]         = useState(DEFAULT_RADII)
  const [expanded, setExpanded]   = useState(false)
  const [apiData, setApiData] = useState(null)
  const debounceRef = useRef(null)

  // 위치·반경이 바뀔 때마다 외부 서버에서 필터링된 데이터를 받아온다
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch('/api/commercial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: position.lat, lng: position.lng, radii }),
      })
        .then(r => r.json())
        .then(setApiData)
        .catch(() => {})
    }, 300)
  }, [position.lat, position.lng, radii])

  const { amenities, displayMarkers, stationPassengersTotal } = useMemo(() => {
    const aptCount = getMockApartmentCount(position.lat, position.lng, radii.apartments)
    const counts   = apiData?.counts  || {}
    const markers  = apiData?.markers || {}

    const amenities = {
      schools:     counts.schools     ?? 0,
      restaurants: counts.restaurants ?? 0,
      academies:   counts.academies   ?? 0,
      cafes:       counts.cafes       ?? 0,
      apartments:  aptCount,
      stations:    counts.stations    ?? 0,
    }

    const stationPassengersTotal = markers.stations
      ? markers.stations.reduce((sum, s) => sum + (s.passengers || 0), 0)
      : null

    const displayMarkers = []

    ;(markers.schools || []).forEach(s =>
      displayMarkers.push({ lat: s.lat, lng: s.lng, key: 'schools', popup: `<b>${s.name}</b><br>${s.level}` })
    )
    ;(markers.stations || []).forEach(s =>
      displayMarkers.push({
        lat: s.lat, lng: s.lng, key: 'stations',
        popup: `<b>${s.name}역</b> (${s.line})${s.passengers > 0 ? `<br>일 평균 ${s.passengers.toLocaleString()}명 이용` : ''}`,
      })
    )
    mockMarkerPositions(position.lat, position.lng, radii.apartments, aptCount)
      .forEach(pos => displayMarkers.push({ lat: pos.lat, lng: pos.lng, key: 'apartments' }))
    ;['restaurants', 'cafes', 'academies'].forEach(key => {
      ;(markers[key] || []).forEach(s => displayMarkers.push({ lat: s.lat, lng: s.lng, key }))
    })

    return { amenities, displayMarkers, stationPassengersTotal }
  }, [apiData, position.lat, position.lng, radii.apartments])

  const footTraffic = useMemo(() => getFootTrafficText(amenities, stationPassengersTotal), [amenities, stationPassengersTotal])

  const applyPosition = useCallback((pos) => setPosition(pos), [])

  const handleMarkerMove = useCallback((pos) => {
    applyPosition(pos)
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json`)
      .then(r => r.json())
      .then(d => {
        const addr = d.address
        if (addr) {
          const parts = [addr.road, addr.neighbourhood, addr.suburb, addr.city || addr.county].filter(Boolean)
          setAddress(parts.slice(0, 2).join(' '))
        }
      })
      .catch(() => {})
  }, [applyPosition])

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
      if (data[0]) {
        applyPosition({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
      }
    } catch {}
    setSearching(false)
  }, [address, applyPosition])

  const setRadius = useCallback((key, value) => {
    setRadii(prev => ({ ...prev, [key]: Number(value) }))
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-4 pb-8">

      {/* 목업 안내 */}
      <div className="flex items-start gap-2 bg-star-yellow/20 border border-star-yellow/50 rounded-xl px-3.5 py-2.5">
        <Info size={12} className="text-navy/50 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-warm-text leading-relaxed">
          음식점·카페·학원은 <strong className="text-navy">소상공인시장진흥공단</strong>(2026.06),
          학교는 <strong className="text-navy">경기도교육청</strong>,
          역은 <strong className="text-navy">한국철도공사</strong> 실제 데이터예요.
          아파트 단지만 목업이에요.
        </p>
      </div>

      {/* 지도 + 정보 2열 */}
      <div className="flex gap-3 items-stretch">

        {/* 좌측: 지도 + 주소 입력 */}
        <div className="flex flex-col gap-2" style={{ flex: '0 0 58%' }}>

          {/* 지도 (확대 버튼 포함) */}
          <div className="relative rounded-2xl shadow-sm" style={{ height: 300 }}>
            <div className="absolute inset-0 rounded-2xl overflow-hidden border border-warm-gray/20">
              <LeafletMap position={position} onMove={handleMarkerMove} radii={radii} markers={displayMarkers} />
            </div>
            <button
              onClick={() => setExpanded(true)}
              title="지도 크게 보기"
              className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm border border-warm-gray/30
                         rounded-lg p-1.5 shadow hover:bg-white transition-colors"
              style={{ zIndex: 1000 }}
            >
              <Maximize2 size={13} className="text-navy" />
            </button>
          </div>

          {/* 도로명주소 입력 */}
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="도로명주소 입력 후 검색"
              className="flex-1 min-w-0 text-[11px] bg-white border border-warm-gray/30 rounded-xl
                         px-3 py-2 text-navy placeholder:text-warm-gray/60
                         focus:outline-none focus:border-navy transition-colors"
            />
            <button
              type="submit"
              disabled={searching}
              className="flex-shrink-0 bg-navy text-white rounded-xl px-2.5 py-2
                         disabled:opacity-50 transition-opacity"
            >
              <Search size={14} />
            </button>
          </form>
        </div>

        {/* 우측: 시설 정보 + 범위 슬라이더 */}
        {/* District.jsx 의 Card 와 같은 모양. 파일을 가르면서 여기만 풀어썼다. */}
        <div className="flex-1 p-3 flex flex-col bg-white rounded-2xl border border-warm-gray/20 shadow-sm">
          <p className="text-[11px] font-bold text-navy mb-2">이 위치에는</p>
          <div className="space-y-3 flex-1">
            {AMENITY_CONFIG.map(({ key, label, Icon, color }) => (
              <div key={key}>
                {/* 시설명 + 개수 */}
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: color + '22', border: `1.5px solid ${color}` }}>
                    <Icon size={10} style={{ color }} />
                  </div>
                  <span className="text-[10px] text-warm-text flex-1 leading-tight">{label}</span>
                  <span className="text-xs font-extrabold text-navy">{amenities[key]}</span>
                  <span className="text-[9px] text-warm-text">개</span>
                </div>
                {/* 반경 슬라이더 */}
                <div className="pl-6 flex items-center gap-2">
                  <input
                    type="range"
                    min={100} max={3000} step={50}
                    value={radii[key]}
                    onChange={e => setRadius(key, e.target.value)}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: color }}
                  />
                  <span className="text-[9px] text-warm-text/80 w-10 text-right tabular-nums flex-shrink-0">
                    {radii[key]}m
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-warm-text mt-2">가 있어요</p>
        </div>
      </div>

      {/* 유동인구 예측 */}
      <div className="bg-navy rounded-2xl px-4 py-4">
        <p className="text-[10px] font-semibold text-white/60 mb-1">유동인구 예측</p>
        <p className="text-xs text-white leading-relaxed">
          이 위치에서는 {footTraffic}
        </p>
      </div>

      {/* 확대 지도 모달 */}
      {expanded && (
        <div className="fixed inset-0 flex flex-col bg-white" style={{ zIndex: 9999 }}>
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-warm-gray/20 flex-shrink-0">
            <p className="text-sm font-bold text-navy">상권 지도</p>
            <button onClick={() => setExpanded(false)} className="p-1 rounded-lg hover:bg-warm-gray/10">
              <XIcon size={20} className="text-navy" />
            </button>
          </div>

          {/* 지도 */}
          <div className="flex-1 min-h-0">
            <LeafletMap position={position} onMove={handleMarkerMove} />
          </div>

          {/* 하단 주소 검색 */}
          <div className="px-4 py-3 border-t border-warm-gray/20 flex-shrink-0 bg-white">
            <form onSubmit={handleSearch} className="flex gap-1.5">
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="도로명주소 입력 후 검색"
                className="flex-1 min-w-0 text-[11px] bg-white border border-warm-gray/30 rounded-xl
                           px-3 py-2.5 text-navy placeholder:text-warm-gray/60
                           focus:outline-none focus:border-navy transition-colors"
              />
              <button
                type="submit"
                disabled={searching}
                className="flex-shrink-0 bg-navy text-white rounded-xl px-3 py-2.5
                           disabled:opacity-50 transition-opacity"
              >
                <Search size={14} />
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

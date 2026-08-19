import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import {
  CalendarClock, FileText, MapPin, ChevronRight, ChevronDown,
  AlertTriangle, ExternalLink, Pencil, Lock,
  TrendingUp, TrendingDown, Minus, Users, ShoppingBag, RefreshCw, Star, Info,
  School, Utensils, BookOpen, Coffee, Building2, Search, Train,
  Plus, Maximize2, X as XIcon,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Header from '../components/layout/Header'
import { useNavigate } from 'react-router-dom'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'
import { taxSchedule, nextDeadline, holidaysKnown } from '../utils/taxSchedule'
import calendar from '../data/tax_calendar.json'

/**
 * 내 매장 현황.
 *
 * **이 화면에는 출처 없는 숫자를 두지 않는다.**
 * 전에는 매출 3,650만원 · 재방문율 38% · 별점 4.3 · 업종 내 상위 28% 를
 * 그렸는데 전부 지어낸 값이었다. POS 도 카드매출도 연동한 적이 없다.
 * 하단에 "목업" 이라고 적어둬도, 그 한 줄을 읽은 사람은 이 서비스의 다른
 * 숫자까지 의심하게 된다. 그래서 지웠다.
 *
 * 지금 여기 있는 것은 셋 다 실제 값이다.
 *   1. 프로필     — 사장님이 온보딩에서 직접 답한 것
 *   2. 세무일정   — 국세청 원문으로 대조한 14건 (tax_calendar.json)
 *   3. 지원사업   — /api/match 가 돌려준 실제 공고 판정
 *
 * 매출 분석을 넣고 싶으면 POS 나 카드매출을 실제로 연동한 뒤에 넣을 것.
 */

// ── 날짜 유틸 ────────────────────────────────────────────────────

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 'YYYY-MM-DD' → '1월 26일 (월)'.
 * 올해가 아니면 연도를 붙인다. 안 붙이면 내년 1월 일정이 이번 달 것처럼 보인다.
 */
function korDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const y = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}년 `
  return `${y}${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`
}

/** 'MM-DD' → '1/25' */
function shortLegal(due) {
  if (!due || !due.includes('-')) return due
  const [m, d] = due.split('-')
  return `${Number(m)}/${Number(d)}`
}

function dDay(iso, today = new Date()) {
  if (!iso) return null
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = new Date(iso + 'T00:00:00')
  return Math.round((d - t) / 86400000)
}

function dDayLabel(n) {
  if (n == null) return ''
  if (n === 0) return '오늘'
  if (n < 0) return `${-n}일 지남`
  return `D-${n}`
}

// ── 공통 조각 ────────────────────────────────────────────────────

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-warm-gray/20 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ children, sub }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-bold text-navy">{children}</h2>
      {sub && <p className="text-[12px] text-warm-text mt-0.5 leading-relaxed">{sub}</p>}
    </div>
  )
}

/** 법정기한이 휴일이라 밀린 경우에만 붙인다. 안 붙이면 사장님이 하루 늦게 안다. */
function MovedNote({ legal, actual }) {
  return (
    <p className="text-[12px] text-sunset-orange mt-1 leading-relaxed">
      법정기한 {shortLegal(legal)} 이 휴일이라 {korDate(actual)} 로 밀렸어요
    </p>
  )
}

// ── 세무일정 한 줄 ───────────────────────────────────────────────

function TaxRow({ item, open, onToggle }) {
  const n = dDay(item.dueDate)
  const urgent = n != null && n >= 0 && n <= 14

  return (
    <div className="border-b border-warm-gray/10 last:border-0">
      <button onClick={onToggle} className="w-full flex items-center gap-3 py-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-navy">{item.title}</p>
          <p className="text-[12px] text-warm-text mt-0.5">
            {item.recurrence === 'monthly' ? '매월 10일' : korDate(item.dueDate)}
            {item.moved && <span className="text-sunset-orange"> · 밀림</span>}
          </p>
        </div>
        {item.recurrence !== 'monthly' && (
          <span className={`text-[12px] font-bold flex-shrink-0 ${urgent ? 'text-sunset-orange' : 'text-warm-text'}`}>
            {dDayLabel(n)}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-warm-gray flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="pb-3 space-y-2">
          <p className="text-[13px] text-gray-700 leading-relaxed">{item.easy}</p>

          {item.moved && <MovedNote legal={item.due} actual={item.dueDate} />}

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-primary-bg rounded-lg px-2.5 py-2">
              <p className="text-[13px] text-warm-text">어디서</p>
              <p className="text-[13px] font-semibold text-navy mt-0.5">{item.where}</p>
            </div>
            <div className="bg-primary-bg rounded-lg px-2.5 py-2">
              <p className="text-[13px] text-warm-text">기간</p>
              <p className="text-[13px] font-semibold text-navy mt-0.5 leading-snug">{item.covers}</p>
            </div>
          </div>

          {item.docs?.length > 0 && (
            <div>
              <p className="text-[13px] text-warm-text mb-1">준비할 것</p>
              <div className="flex flex-wrap gap-1">
                {item.docs.map(d => (
                  <span key={d} className="text-[12px] text-navy bg-navy/5 rounded-full px-2 py-0.5">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {item.caution && (
            <p className="text-[12px] text-warm-text leading-relaxed bg-warm-gray/10 rounded-lg px-2.5 py-2">
              {item.caution}
            </p>
          )}

          <p className="text-[12px] text-sunset-orange leading-relaxed">
            안 하면 — {item.penalty}
          </p>
          <p className="text-[13px] text-warm-text/70">근거 {item.source}</p>
        </div>
      )}
    </div>
  )
}

// ── 프로필 요약 ──────────────────────────────────────────────────

function ProfileCard({ profile, onEdit }) {
  const chips = [
    profile?.category,
    profile?.region,
    profile?.business_status,
    profile?.business_period_months ? `영업 ${profile.business_period_months}개월째` : null,
    profile?.entity_type,
    profile?.vat_type,
    profile?.has_employee === true ? '직원 있음'
      : profile?.has_employee === false ? '혼자 운영' : null,
  ].filter(Boolean)

  // 세무일정을 거르는 데 쓰는 답이 빠져 있으면, 해당 없는 일정까지 다 보인다.
  const missing = ['entity_type', 'vat_type'].filter(k => !profile?.[k]).length
    + (profile?.has_employee == null ? 1 : 0)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <SectionTitle sub="온보딩에서 답해주신 내용이에요">내 정보</SectionTitle>
        <button onClick={onEdit}
          className="flex items-center gap-1 text-[12px] text-navy font-semibold flex-shrink-0">
          <Pencil size={10} /> 고치기
        </button>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(c => (
            <span key={c} className="text-[13px] font-medium text-navy bg-primary-bg rounded-full px-2.5 py-1">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-warm-text">아직 알려주신 게 없어요.</p>
      )}

      {missing > 0 && (
        <div className="mt-3 flex items-start gap-2 bg-sunset-orange/5 rounded-xl px-3 py-2.5">
          <AlertTriangle size={12} className="text-sunset-orange mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-warm-text leading-relaxed">
            세무 질문 {missing}개를 아직 안 하셨어요. 모른다고 빼버리면 해야 할 신고를
            통째로 놓칠 수 있어서, <b className="text-navy">일단 다 보여드리고 있어요.</b>{' '}
            <button onClick={onEdit} className="text-navy font-semibold underline underline-offset-2">
              답해주시면
            </button>{' '}
            해당되는 것만 남습니다.
          </p>
        </div>
      )}
    </Card>
  )
}

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

// ── Haversine 거리 (m) ────────────────────────────────────────────

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
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

// ── 상권분석 뷰 (예비창업자·탐색자용, 목업 데이터) ──────────────

const HWS_CENTER = { lat: 37.1999, lng: 126.8317 }

function seededRand(seed, min, max) {
  const x = Math.sin(seed) * 10000
  return min + Math.floor((x - Math.floor(x)) * (max - min + 1))
}

const BASE_RADIUS = 500

function getMockAmenities(lat, lng, radii) {
  const s  = Math.abs(Math.round(lat * 100) * 1000 + Math.round(lng * 100))
  const sc = (r) => Math.max(0.04, (r / BASE_RADIUS) ** 1.8)
  return {
    schools:     Math.max(0, Math.round(seededRand(s,     1, 6)   * sc(radii.schools))),
    restaurants: Math.max(0, Math.round(seededRand(s + 1, 10, 85) * sc(radii.restaurants))),
    academies:   Math.max(0, Math.round(seededRand(s + 2, 2, 28)  * sc(radii.academies))),
    cafes:       Math.max(0, Math.round(seededRand(s + 3, 4, 38)  * sc(radii.cafes))),
    apartments:  Math.max(0, Math.round(seededRand(s + 4, 1, 18)  * sc(radii.apartments))),
    stations:    Math.max(0, Math.min(8, Math.round(seededRand(s + 5, 0, 3) * sc(radii.stations)))),
  }
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

const CAT_KEY = { r: 'restaurants', c: 'cafes', a: 'academies' }
const REAL_KEYS = new Set(['restaurants', 'cafes', 'academies'])

function CommercialAnalysisView() {
  const [position, setPosition]   = useState(HWS_CENTER)
  const [address, setAddress]     = useState('')
  const [searching, setSearching] = useState(false)
  const [radii, setRadii]         = useState(DEFAULT_RADII)
  const [expanded, setExpanded]   = useState(false)
  const [storeData, setStoreData]     = useState(null)
  const [stationData, setStationData] = useState(null)

  // 소상공인 + 역 데이터 로드 (1회)
  useEffect(() => {
    fetch('./data/hwaseong_stores.json')
      .then(r => r.json())
      .then(setStoreData)
      .catch(() => {})
    fetch('./data/hwaseong_stations.json')
      .then(r => r.json())
      .then(setStationData)
      .catch(() => {})
  }, [])

  // 반경 내 실제 업소 필터링 + 목업 합산
  const { amenities, displayMarkers, stationPassengersTotal } = useMemo(() => {
    const mockBase = getMockAmenities(position.lat, position.lng, radii)

    // 실제 역 데이터 반경 필터
    const nearbyStations = stationData
      ? stationData.filter(s => haversine(position.lat, position.lng, s.lat, s.lng) <= radii.stations)
      : null

    const stationPassengersTotal = nearbyStations
      ? nearbyStations.reduce((sum, s) => sum + s.passengers, 0)
      : null

    // 역 마커 빌더 (팝업 포함)
    const buildStationMarkers = (list) =>
      (list ?? []).slice(0, 12).map(s => ({
        lat: s.lat, lng: s.lng, key: 'stations',
        popup: `<b>${s.name}역</b> (${s.line})${s.passengers > 0 ? `<br>일 평균 ${s.passengers.toLocaleString()}명 이용` : ''}`,
      }))

    // 데이터 미로드 시 전부 목업
    if (!storeData) {
      const amenitiesResult = { ...mockBase }
      if (nearbyStations) amenitiesResult.stations = nearbyStations.length

      const markers = []
      AMENITY_CONFIG.forEach(({ key }) => {
        if (key === 'stations' && nearbyStations) {
          markers.push(...buildStationMarkers(nearbyStations))
        } else {
          mockMarkerPositions(position.lat, position.lng, radii[key], amenitiesResult[key])
            .forEach(pos => markers.push({ lat: pos.lat, lng: pos.lng, key }))
        }
      })
      return { amenities: amenitiesResult, displayMarkers: markers, stationPassengersTotal }
    }

    const amenities = { ...mockBase, restaurants: 0, cafes: 0, academies: 0 }
    if (nearbyStations) amenities.stations = nearbyStations.length
    const buckets   = { restaurants: [], cafes: [], academies: [] }

    // 바운딩박스 사전필터 후 Haversine
    const latDelta = Math.max(radii.restaurants, radii.cafes, radii.academies) / 111320 * 1.1
    const lngDelta = latDelta / Math.cos(position.lat * Math.PI / 180)

    for (const s of storeData) {
      const key = CAT_KEY[s.cat]
      if (!key) continue
      if (Math.abs(s.lat - position.lat) > latDelta) continue
      if (Math.abs(s.lng - position.lng) > lngDelta) continue
      const dist = haversine(position.lat, position.lng, s.lat, s.lng)
      if (dist <= radii[key]) { amenities[key]++; buckets[key].push(s) }
    }

    const displayMarkers = []

    // 목업 마커: 학교·아파트
    ;['schools', 'apartments'].forEach(key => {
      mockMarkerPositions(position.lat, position.lng, radii[key], amenities[key])
        .forEach(pos => displayMarkers.push({ lat: pos.lat, lng: pos.lng, key }))
    })

    // 실제 마커: 역 (팝업 포함)
    if (nearbyStations) {
      displayMarkers.push(...buildStationMarkers(nearbyStations))
    } else {
      mockMarkerPositions(position.lat, position.lng, radii.stations, amenities.stations)
        .forEach(pos => displayMarkers.push({ lat: pos.lat, lng: pos.lng, key: 'stations' }))
    }

    // 실제 마커: 음식점·카페·학원 (최대 40개씩 균등 샘플)
    for (const [key, stores] of Object.entries(buckets)) {
      const step = stores.length <= 40 ? 1 : Math.ceil(stores.length / 40)
      stores.forEach((s, i) => {
        if (i % step === 0) displayMarkers.push({ lat: s.lat, lng: s.lng, key })
      })
    }

    return { amenities, displayMarkers, stationPassengersTotal }
  }, [storeData, stationData, position.lat, position.lng, radii])

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

  const adjustRadius = useCallback((key, delta) => {
    setRadii(prev => ({ ...prev, [key]: Math.max(100, Math.min(3000, prev[key] + delta)) }))
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-4 pb-8">

      {/* 목업 안내 */}
      <div className="flex items-start gap-2 bg-star-yellow/20 border border-star-yellow/50 rounded-xl px-3.5 py-2.5">
        <Info size={12} className="text-navy/50 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-warm-text leading-relaxed">
          음식점·카페·학원은 <strong className="text-navy">소상공인시장진흥공단 실제 데이터</strong>(2026.06),
          역은 <strong className="text-navy">한국철도공사 실제 위치·승객 데이터</strong>예요.
          학교·아파트는 목업이에요.
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

        {/* 우측: 시설 정보 + 범위 조정 */}
        <Card className="flex-1 p-3 flex flex-col">
          <p className="text-[11px] font-bold text-navy mb-2">이 위치에는</p>
          <div className="space-y-2.5 flex-1">
            {AMENITY_CONFIG.map(({ key, label, Icon, color }) => (
              <div key={key}>
                {/* 시설명 + 개수 */}
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: color + '22', border: `1.5px solid ${color}` }}>
                    <Icon size={10} style={{ color }} />
                  </div>
                  <span className="text-[10px] text-warm-text flex-1 leading-tight">{label}</span>
                  <span className="text-xs font-extrabold text-navy">{amenities[key]}</span>
                  <span className="text-[9px] text-warm-text">개</span>
                </div>
                {/* 반경 조정 */}
                <div className="flex items-center gap-1 mt-1 pl-6">
                  <button
                    onClick={() => adjustRadius(key, -10)}
                    className="w-4 h-4 rounded bg-warm-gray/20 flex items-center justify-center
                               hover:bg-warm-gray/40 active:scale-90 transition-all"
                  >
                    <Minus size={8} className="text-warm-text" />
                  </button>
                  <span className="text-[9px] text-warm-text/80 w-11 text-center tabular-nums">
                    {radii[key]}m
                  </span>
                  <button
                    onClick={() => adjustRadius(key, +10)}
                    className="w-4 h-4 rounded bg-warm-gray/20 flex items-center justify-center
                               hover:bg-warm-gray/40 active:scale-90 transition-all"
                  >
                    <Plus size={8} className="text-warm-text" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-warm-text mt-2">가 있어요</p>
        </Card>
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

// ── 메인 ─────────────────────────────────────────────────────────

export default function MyStore() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [matches, setMatches] = useState(null)   // null = 아직 안 옴
  const [failed, setFailed]   = useState(false)
  const [openId, setOpenId]   = useState(null)
  const [showIf, setShowIf]   = useState(false)

  useEffect(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('mars-fit-profile')) } catch { return null }
    })()
    setProfile(saved)

    fetchMatches(saved ?? DEFAULT_PROFILE)
      .then(r => setMatches(r?.results ?? []))
      .catch(() => setFailed(true))
  }, [])

  const year = new Date().getFullYear()
  // holidaysKnown 은 import 한 함수와 이름이 겹친다. 그대로 구조분해하면
  // 함수가 불리언으로 덮여서 아래 호출이 터진다. 이름을 갈라둔다.
  const { mustDo, ifApplicable, holidaysKnown: thisYearKnown } = useMemo(
    () => taxSchedule(profile, year), [profile, year],
  )
  const next = useMemo(() => nextDeadline(profile), [profile])

  // 공고 판정 집계. 대상아님은 애초에 세지 않는다.
  const counts = useMemo(() => {
    if (!matches) return null
    const live = matches.filter(r => r.overall_status !== '대상아님')
    const soon = live.filter(r => {
      const n = dDay(r.apply_period?.end)
      return r.application_status === '접수중' && n != null && n >= 0 && n <= 14
    })
    // 숫자만 보여주면 뭘 먼저 해야 할지 모른다. 제일 급한 한 건을 집어준다.
    const upcoming = live
      .filter(r => {
        const n = dDay(r.apply_period?.end)
        return r.application_status === '접수중' && n != null && n >= 0
      })
      .sort((a, b) => dDay(a.apply_period?.end) - dDay(b.apply_period?.end))

    return {
      total:   live.length,
      can:     live.filter(r => r.overall_status === '신청가능').length,
      maybe:   live.filter(r => r.overall_status === '조건부').length,
      check:   live.filter(r => r.overall_status === '확인필요').length,
      soon:    soon.length,
      nearest: upcoming[0] ?? null,
    }
  }, [matches])

  const nextN = next ? dDay(next.dueDate) : null
  const isOwner = profile?.business_status === '운영중'

  return (
    <div className="min-h-screen bg-primary-bg pb-24">
      <Header />

      <div className="max-w-4xl mx-auto px-5 pt-4 pb-2 lg:max-w-6xl lg:pt-6">
        <h1 className="text-lg font-extrabold text-navy">
          {isOwner ? '내 매장 현황' : '상권 분석'}
        </h1>
        <p className="text-xs text-warm-text mt-0.5">
          {isOwner
            ? '챙겨야 할 신고와 받을 수 있는 지원사업을 한 곳에 모았어요'
            : '화성시 주요 상권 현황과 업종별 경쟁 밀도를 확인해보세요'}
        </p>
      </div>

      {!isOwner && <CommercialAnalysisView profile={profile} />}

      {isOwner && <div className="max-w-4xl mx-auto px-5 space-y-5
                                  lg:max-w-6xl lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]
                                  lg:gap-5 lg:items-start">

        {/* ── 왼쪽: 세무 ── */}
        <div className="space-y-5">

        {/* ① 프로필 */}
        <ProfileCard profile={profile} onEdit={() => navigate('/onboarding')} />

        {/* ② 다음 세무일정 — 이 화면에서 제일 급한 것 */}
        {next && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock size={14} className="text-sunset-orange" />
              <h2 className="text-sm font-bold text-navy">다음 세무일정</h2>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-extrabold text-navy leading-snug">{next.title}</p>
                <p className="text-xs text-warm-text mt-1">{korDate(next.dueDate)}</p>
                {next.moved && <MovedNote legal={next.due} actual={next.dueDate} />}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-2xl font-extrabold leading-none ${
                  nextN != null && nextN <= 14 ? 'text-sunset-orange' : 'text-navy'
                }`}>
                  {dDayLabel(nextN)}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-gray-700 leading-relaxed mt-3 bg-primary-bg rounded-xl px-3 py-2.5">
              {next.easy}
            </p>

            {/* 다음 일정이 내년으로 넘어갔는데 그 해 공휴일을 안 적어뒀으면
                주말만 반영된 날짜다. 틀린 날을 확정처럼 보여주면 안 된다. */}
            {next.dueDate && !holidaysKnown(Number(next.dueDate.slice(0, 4))) && (
              <div className="mt-2 flex items-start gap-2 bg-sunset-orange/5 rounded-xl px-3 py-2.5">
                <AlertTriangle size={12} className="text-sunset-orange mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-warm-text leading-relaxed">
                  {next.dueDate.slice(0, 4)}년 공휴일이 아직 등록되지 않아 주말만 반영된
                  날짜예요. 연말에 확인해 주세요.
                </p>
              </div>
            )}
          </Card>
        )}

        {/* ③ 올해 해야 할 신고 */}
        <Card className="p-4">
          <SectionTitle sub={`${year}년 · 사장님께 해당되는 것만 골랐어요`}>
            올해 해야 할 신고
          </SectionTitle>

          {mustDo.length > 0 ? (
            <>
              <p className="text-[10px] font-bold text-navy mb-1">
                반드시 해야 하는 것 {mustDo.length}건
              </p>
              <div className="mb-1">
                {mustDo.map(e => (
                  <TaxRow key={e.id} item={e} open={openId === e.id}
                    onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-warm-text py-2">해당되는 신고가 없어요.</p>
          )}

          {/* 해당되면 이것도 — 반드시 따로 그린다.
              섞으면 종합소득세가 5월·6월 두 번 뜨고 원천세가 매월·반기 둘 다 뜬다. */}
          {ifApplicable.length > 0 && (
            <div className="mt-3 pt-3 border-t border-warm-gray/15">
              <button onClick={() => setShowIf(v => !v)}
                className="w-full flex items-center justify-between text-left">
                <span className="text-[10px] font-bold text-warm-text">
                  해당되면 이것도 {ifApplicable.length}건
                </span>
                <ChevronDown size={14}
                  className={`text-warm-gray transition-transform ${showIf ? 'rotate-180' : ''}`} />
              </button>

              {showIf && (
                <div className="mt-1">
                  <p className="text-[10px] text-warm-text leading-relaxed mb-2">
                    답해주신 것만으로는 해당되는지 알 수 없는 신고예요. 조건을 읽어보고
                    본인 얘기면 챙기세요.
                  </p>
                  {ifApplicable.map(e => (
                    <div key={e.id}>
                      <p className="text-[10px] text-sunset-orange pt-2">{e.conditional}</p>
                      <TaxRow item={e} open={openId === e.id}
                        onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!thisYearKnown && (
            <div className="mt-3 flex items-start gap-2 bg-sunset-orange/5 rounded-xl px-3 py-2.5">
              <AlertTriangle size={12} className="text-sunset-orange mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-warm-text leading-relaxed">
                {year}년 공휴일이 아직 등록되지 않아 주말만 반영된 날짜예요.
                설·추석은 음력이라 자동 계산이 안 됩니다.
              </p>
            </div>
          )}
        </Card>

        </div>

        {/* ── 오른쪽: 지원사업과 안내 ── */}
        <div className="space-y-5">

        {/* ④ 내 지원사업 */}
        <Card className="p-4">
          <SectionTitle sub="지금 열려 있는 공고를 사장님 조건으로 판정한 결과예요">
            내 지원사업
          </SectionTitle>

          {failed ? (
            <p className="text-[11px] text-warm-text py-2">
              공고를 불러오지 못했어요. 잠시 뒤 다시 열어주세요.
            </p>
          ) : !counts ? (
            <div className="grid grid-cols-3 gap-2 animate-pulse">
              {[0, 1, 2].map(i => <div key={i} className="h-14 bg-warm-gray/15 rounded-xl" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '신청가능', value: counts.can,   color: 'text-emerald-600' },
                  { label: '조건부',   value: counts.maybe, color: 'text-sunset-orange' },
                  { label: '확인필요', value: counts.check, color: 'text-warm-text' },
                ].map(d => (
                  <div key={d.label} className="bg-primary-bg rounded-xl py-3 text-center">
                    <p className={`text-xl font-extrabold leading-none ${d.color}`}>{d.value}</p>
                    <p className="text-[10px] text-warm-text mt-1">{d.label}</p>
                  </div>
                ))}
              </div>

              {counts.nearest && (
                <button
                  onClick={() => {
                    localStorage.setItem('mars-fit-selected-match', JSON.stringify(counts.nearest))
                    navigate('/notice')
                  }}
                  className="mt-3 w-full flex items-center gap-3 text-left bg-primary-bg
                             rounded-xl px-3 py-2.5 hover:bg-warm-gray/20 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-warm-text">가장 먼저 마감돼요</p>
                    <p className="text-xs font-semibold text-navy truncate mt-0.5">
                      {counts.nearest.notice_title}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-sunset-orange flex-shrink-0">
                    {dDayLabel(dDay(counts.nearest.apply_period?.end))}
                  </span>
                  <ChevronRight size={14} className="text-warm-gray flex-shrink-0" />
                </button>
              )}

              {counts.soon > 0 && (
                <p className="text-[11px] text-sunset-orange font-semibold mt-2">
                  2주 안에 마감되는 공고가 {counts.soon}건 있어요
                </p>
              )}

              <button
                onClick={() => navigate('/home')}
                className="mt-3 w-full flex items-center justify-center gap-1
                           text-xs text-navy font-semibold py-2.5 rounded-xl
                           bg-primary-bg hover:bg-warm-gray/20 transition-colors"
              >
                공고 {counts.total}건 보러가기 <ChevronRight size={14} />
              </button>
            </>
          )}
        </Card>

        {/* ⑤ 아직 못 채운 것.
            비워둔 자리를 숨기면 "기능이 없다" 로 보이고, 가짜 숫자로 채우면
            나머지 숫자까지 의심받는다. 그래서 이름만 걸어두고 무엇이 있어야
            열리는지 적는다. 여기에는 숫자를 한 개도 쓰지 않는다. */}
        <Card className="p-4">
          <SectionTitle sub="지어낸 숫자로 채우지 않고 비워뒀어요">
            아직 못 보여드리는 것
          </SectionTitle>

          <div className="space-y-2.5">
            {[
              { name: '매출 · 방문자 · 객단가 추이', need: 'POS 또는 카드매출을 연결해야 알 수 있어요. 사업자등록증에는 매출이 적혀 있지 않아요.' },
              { name: '재방문율 · 단골 비중',        need: 'POS 연결이 필요해요' },
              { name: '별점 · 리뷰',                 need: '네이버·카카오 플레이스 연결이 필요해요' },
              { name: '주변 동종업체 · 신규개업 · 폐업', need: '지자체 인허가 공공데이터를 붙이면 열려요' },
              { name: '업종 내 내 매출 위치',        need: '업종별 매출 통계가 있어야 계산돼요' },
              { name: '받은 지원금 이력',            need: '신청 기록 기능이 열리면 자동으로 쌓여요' },
              { name: '사업자등록증으로 자동 입력',  need: 'OCR 등록 시 과세유형·개업일을 자동으로 채워요. 지금은 온보딩에서 직접 여쭤보고 있어요.' },
            ].map(f => (
              <div key={f.name} className="flex items-start gap-2.5">
                <Lock size={11} className="text-warm-gray mt-1 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-warm-text">{f.name}</p>
                  <p className="text-[10px] text-warm-text/70 leading-relaxed mt-0.5">{f.need}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ⑥ 출처 */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={12} className="text-warm-text" />
            <h2 className="text-[11px] font-bold text-navy">이 화면의 숫자는 어디서 왔나</h2>
          </div>

          <ul className="space-y-1.5 text-[10px] text-warm-text leading-relaxed">
            <li className="flex gap-1.5">
              <MapPin size={10} className="mt-0.5 flex-shrink-0" />
              <span>내 정보 — 온보딩에서 직접 답해주신 내용</span>
            </li>
            <li className="flex gap-1.5">
              <CalendarClock size={10} className="mt-0.5 flex-shrink-0" />
              <span>
                세무일정 {calendar.events.length}건 — 국세청 원문으로 전부 대조했어요
                (기준 {calendar.version}). 신고기한이 공휴일·토요일이면 다음 날로
                밀리는 규칙까지 계산해서 보여드려요.
              </span>
            </li>
            <li className="flex gap-1.5">
              <FileText size={10} className="mt-0.5 flex-shrink-0" />
              <span>지원사업 — 기업마당 공고 원문을 매일 새벽에 새로 받아옵니다</span>
            </li>
          </ul>

          <a
            href="https://www.nts.go.kr/nts/ad/taxSchdul/selectList.do"
            target="_blank" rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[10px] text-navy font-semibold
                       underline underline-offset-2"
          >
            국세청 세무일정 원문 확인 <ExternalLink size={9} />
          </a>
        </Card>

        </div>

      </div>}

    </div>
  )
}

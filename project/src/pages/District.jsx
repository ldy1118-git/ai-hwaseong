import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Users, ShoppingBag, Zap } from 'lucide-react'
import Header from '../components/layout/Header'

// ── 목업 데이터 ─────────────────────────────────────────────────────
const REGIONS = ['동탄', '향남', '남양읍', '봉담']
const CATEGORIES = ['전체', '카페·음료', '음식점', '소매업', '미용·뷰티', '기타']

const METRICS = {
  동탄: {
    '전체':     { visitors: 12400, revenue: 3820, competition: 87, trend: 'up',   trendPct: 12 },
    '카페·음료': { visitors: 3200,  revenue: 2100, competition: 92, trend: 'up',   trendPct: 8  },
    '음식점':   { visitors: 4800,  revenue: 4500, competition: 78, trend: 'up',   trendPct: 5  },
    '소매업':   { visitors: 2900,  revenue: 3100, competition: 65, trend: 'flat', trendPct: 0  },
    '미용·뷰티': { visitors: 980,   revenue: 2800, competition: 55, trend: 'down', trendPct: -3 },
    '기타':     { visitors: 520,   revenue: 1800, competition: 40, trend: 'up',   trendPct: 2  },
  },
  향남: {
    '전체':     { visitors: 6800,  revenue: 2950, competition: 62, trend: 'down', trendPct: -8 },
    '카페·음료': { visitors: 1400,  revenue: 1800, competition: 58, trend: 'flat', trendPct: 1  },
    '음식점':   { visitors: 2600,  revenue: 3200, competition: 70, trend: 'down', trendPct: -5 },
    '소매업':   { visitors: 1800,  revenue: 2400, competition: 48, trend: 'down', trendPct: -6 },
    '미용·뷰티': { visitors: 620,   revenue: 2200, competition: 42, trend: 'up',   trendPct: 4  },
    '기타':     { visitors: 380,   revenue: 1400, competition: 30, trend: 'flat', trendPct: 0  },
  },
  남양읍: {
    '전체':     { visitors: 5200,  revenue: 2600, competition: 45, trend: 'up',   trendPct: 6  },
    '카페·음료': { visitors: 1100,  revenue: 2300, competition: 50, trend: 'up',   trendPct: 14 },
    '음식점':   { visitors: 2000,  revenue: 3000, competition: 55, trend: 'up',   trendPct: 3  },
    '소매업':   { visitors: 1400,  revenue: 2100, competition: 38, trend: 'flat', trendPct: 0  },
    '미용·뷰티': { visitors: 440,   revenue: 1900, competition: 32, trend: 'up',   trendPct: 7  },
    '기타':     { visitors: 260,   revenue: 1200, competition: 22, trend: 'flat', trendPct: 0  },
  },
  봉담: {
    '전체':     { visitors: 4100,  revenue: 2200, competition: 38, trend: 'flat', trendPct: 1  },
    '카페·음료': { visitors: 820,   revenue: 1900, competition: 42, trend: 'up',   trendPct: 5  },
    '음식점':   { visitors: 1600,  revenue: 2700, competition: 45, trend: 'flat', trendPct: -1 },
    '소매업':   { visitors: 1100,  revenue: 1800, competition: 30, trend: 'down', trendPct: -4 },
    '미용·뷰티': { visitors: 360,   revenue: 1700, competition: 25, trend: 'up',   trendPct: 3  },
    '기타':     { visitors: 220,   revenue: 1100, competition: 18, trend: 'flat', trendPct: 0  },
  },
}

const TREND_MONTHS = ['3월', '4월', '5월', '6월', '7월', '8월']
const VISITOR_TREND = {
  동탄:   [10200, 10800, 11400, 11900, 12100, 12400],
  향남:   [7600,  7200,  7000,  6900,  6850,  6800],
  남양읍: [4700,  4900,  5000,  5100,  5150,  5200],
  봉담:   [4000,  4050,  4100,  4080,  4090,  4100],
}

const ALERTS = {
  동탄:   [
    { type: 'up',   text: '카페·음료 방문자 8% 증가 (전월 대비)' },
    { type: 'info', text: '동탄역 인근 신규 점포 14개 오픈' },
  ],
  향남:   [
    { type: 'down', text: '소매업 매출 6% 감소 (전월 대비)' },
    { type: 'info', text: '향남2지구 재개발 영향으로 유동인구 변동' },
  ],
  남양읍: [
    { type: 'up',   text: '카페 신규 수요 지속 증가 중' },
    { type: 'info', text: '남양읍 도시재생 사업 진행 중' },
  ],
  봉담:   [
    { type: 'info', text: '봉담읍 상권 변동 없이 안정세 유지' },
    { type: 'down', text: '소매업 경쟁 심화 추세 관찰됨' },
  ],
}

// ── 실제 행정구역 GeoJSON 기반 SVG 경로 (viewBox 500×282) ────────────
// 출처: 통계청 2018 행정구역 경계, WGS84→SVG 변환 (Douglas-Peucker eps=0.8)
const GEO_PATHS = {
  '봉담읍': { path: 'M 331.7,55.6 L 332.3,60.1 L 340.0,64.8 L 343.7,75.3 L 347.9,77.9 L 348.3,81.8 L 350.5,85.1 L 348.9,85.7 L 348.6,88.6 L 353.0,95.2 L 352.5,101.4 L 348.0,99.2 L 343.7,101.9 L 340.7,99.0 L 329.4,100.5 L 326.8,103.6 L 328.0,107.1 L 326.0,113.5 L 327.2,117.4 L 326.6,119.6 L 321.8,123.8 L 323.3,130.4 L 321.9,137.6 L 322.0,140.8 L 323.8,143.8 L 323.5,149.8 L 320.6,151.0 L 315.7,148.4 L 313.6,150.4 L 310.6,150.6 L 311.2,146.2 L 315.0,143.4 L 317.2,137.4 L 316.8,135.2 L 312.5,133.6 L 308.7,134.0 L 303.7,140.2 L 300.3,137.4 L 300.7,129.2 L 306.5,127.1 L 303.8,124.8 L 301.9,119.9 L 304.8,116.3 L 304.0,107.1 L 300.1,105.0 L 293.7,105.7 L 289.4,104.1 L 290.4,101.2 L 293.7,98.2 L 295.3,89.9 L 291.5,82.2 L 296.4,76.9 L 295.1,71.9 L 298.8,65.9 L 298.4,61.3 L 305.1,60.0 L 307.9,60.9 L 307.3,63.3 L 308.1,64.3 L 311.3,62.0 L 312.5,55.9 L 317.7,57.4 L 322.2,61.0 L 323.9,60.7 L 325.1,58.3 L 329.0,57.7 L 331.7,55.6 Z', cx: 323.1, cy: 95.1 },
  '남양읍': { path: 'M 224.5,18.0 L 221.2,21.9 L 222.7,23.4 L 229.5,26.5 L 234.5,31.4 L 238.0,28.8 L 242.0,31.2 L 245.1,35.3 L 239.3,43.6 L 239.6,46.3 L 234.2,49.2 L 234.3,56.5 L 231.8,63.0 L 234.2,64.4 L 235.9,69.4 L 243.4,67.2 L 244.8,69.7 L 250.4,71.9 L 251.1,71.2 L 251.5,77.7 L 253.7,78.5 L 254.9,82.2 L 257.2,84.5 L 259.8,84.4 L 263.2,86.5 L 263.3,92.1 L 258.8,103.9 L 259.8,106.9 L 257.4,108.8 L 256.5,111.7 L 259.4,116.1 L 259.5,119.0 L 261.5,119.1 L 262.6,121.4 L 260.8,126.8 L 258.4,129.9 L 247.8,136.1 L 247.5,137.8 L 243.6,141.5 L 236.3,144.2 L 228.2,143.8 L 218.5,145.4 L 217.3,142.0 L 214.0,140.6 L 207.3,144.4 L 200.3,142.2 L 209.9,137.4 L 212.3,132.7 L 210.2,124.0 L 208.2,122.5 L 208.8,119.2 L 211.0,117.8 L 211.8,107.5 L 214.5,101.0 L 212.3,104.4 L 210.4,103.6 L 206.5,97.4 L 211.1,88.2 L 215.4,84.0 L 213.3,79.3 L 213.4,76.5 L 208.5,68.9 L 206.9,67.0 L 201.0,65.0 L 197.4,58.6 L 197.7,54.5 L 206.1,56.1 L 205.2,45.7 L 209.0,41.9 L 207.0,35.5 L 207.7,33.6 L 211.2,31.2 L 220.6,35.2 L 222.2,34.3 L 219.2,30.3 L 216.6,22.4 L 217.7,18.5 L 220.3,17.0 L 221.9,16.3 L 224.5,18.0 Z', cx: 227.8, cy: 82.5 },
  '향남읍': { path: 'M 306.2,150.3 L 310.9,147.9 L 310.6,150.6 L 313.6,150.4 L 315.7,148.4 L 320.6,151.0 L 323.5,149.8 L 323.8,143.8 L 328.3,145.7 L 328.8,148.6 L 332.4,151.1 L 341.1,149.4 L 347.6,150.9 L 350.7,152.3 L 350.8,158.5 L 354.4,162.9 L 361.2,163.6 L 361.7,168.0 L 363.2,169.4 L 354.2,171.0 L 352.3,172.7 L 346.1,172.6 L 344.1,175.6 L 344.3,179.1 L 342.6,182.6 L 337.9,185.2 L 330.5,183.1 L 329.5,191.6 L 327.5,192.4 L 323.9,193.4 L 322.6,190.7 L 316.9,185.5 L 313.7,185.9 L 312.6,189.0 L 308.3,191.7 L 309.3,208.1 L 298.7,210.7 L 290.5,217.4 L 290.1,219.1 L 286.9,220.6 L 276.8,222.1 L 272.7,202.0 L 274.0,197.2 L 277.0,192.2 L 279.2,191.1 L 280.4,187.6 L 278.5,183.7 L 281.8,172.8 L 279.5,167.9 L 282.4,160.2 L 283.4,157.9 L 285.2,158.1 L 293.1,144.1 L 298.0,147.6 L 297.2,153.0 L 301.1,153.4 L 306.2,150.3 Z', cx: 317.4, cy: 174 },
  '우정읍': { path: 'M 170.8,249.1 L 168.6,247.8 L 164.4,249.0 L 168.6,247.8 L 170.8,249.1 Z M 162.2,241.6 L 158.5,242.9 L 162.2,241.6 Z M 33.2,227.0 L 34.2,227.7 L 30.2,229.0 L 26.0,235.4 L 25.8,233.9 L 30.2,226.5 L 31.9,225.5 L 33.2,227.0 Z M 29.2,216.6 L 29.9,220.8 L 29.2,216.6 Z M 15.4,177.5 L 19.6,181.0 L 20.2,187.7 L 18.3,192.4 L 17.4,180.4 L 15.4,177.5 Z M 222.8,154.5 L 232.2,163.5 L 235.8,163.2 L 235.4,165.0 L 233.3,164.7 L 236.8,174.0 L 224.6,175.8 L 225.0,183.0 L 228.9,188.0 L 235.3,188.5 L 239.4,192.0 L 234.9,194.3 L 235.8,199.1 L 234.7,202.2 L 228.2,209.2 L 225.4,210.5 L 224.6,209.0 L 221.9,208.7 L 220.4,210.1 L 218.9,213.3 L 219.6,215.3 L 222.9,215.5 L 223.4,217.6 L 211.2,226.2 L 210.9,231.8 L 215.2,236.0 L 214.7,238.0 L 221.8,240.4 L 222.4,245.0 L 221.5,246.0 L 223.5,252.9 L 223.5,258.6 L 221.4,262.4 L 223.4,265.4 L 223.4,272.2 L 212.2,272.2 L 210.3,260.8 L 206.2,257.0 L 176.0,256.5 L 175.5,251.9 L 170.9,249.2 L 172.9,249.2 L 175.9,238.9 L 181.4,232.9 L 126.4,178.7 L 128.7,179.0 L 128.5,180.2 L 181.5,232.3 L 191.5,228.5 L 192.1,224.5 L 186.3,225.8 L 185.2,221.0 L 187.3,220.4 L 186.5,210.6 L 192.0,189.6 L 191.4,187.4 L 188.7,187.4 L 182.6,180.4 L 184.2,174.3 L 190.6,165.6 L 192.5,163.8 L 193.0,165.4 L 194.7,164.7 L 196.2,161.0 L 200.8,158.5 L 203.9,160.6 L 204.4,163.4 L 210.2,164.2 L 211.0,159.0 L 215.0,155.2 L 222.8,154.5 Z', cx: 152.9, cy: 210.4 },
  '매송면': { path: 'M 289.7,11.8 L 293.3,13.1 L 300.1,12.6 L 302.5,17.5 L 307.7,21.4 L 310.4,25.5 L 309.4,30.6 L 312.2,40.3 L 315.9,44.2 L 324.1,43.6 L 326.6,45.2 L 328.7,51.8 L 331.2,53.6 L 331.6,55.2 L 329.8,57.0 L 325.1,58.3 L 323.9,60.7 L 322.2,61.0 L 317.7,57.4 L 312.5,55.9 L 311.3,62.0 L 307.9,64.4 L 307.9,60.9 L 305.1,60.0 L 298.4,61.3 L 292.1,57.1 L 288.5,57.3 L 284.1,49.7 L 281.3,50.3 L 279.4,44.7 L 272.3,43.0 L 269.6,40.7 L 264.6,41.5 L 262.5,34.8 L 261.2,35.2 L 257.9,32.0 L 256.0,31.9 L 257.1,29.4 L 262.6,29.6 L 270.5,25.3 L 261.9,29.2 L 260.7,26.8 L 261.4,21.1 L 269.2,22.7 L 273.1,17.7 L 281.4,20.6 L 289.7,11.8 Z', cx: 292.1, cy: 39.7 },
  '비봉면': { path: 'M 246.5,34.0 L 247.7,34.8 L 246.3,36.6 L 248.0,41.3 L 251.2,44.0 L 250.6,39.7 L 252.6,37.2 L 251.4,35.6 L 256.0,31.9 L 257.9,32.0 L 261.2,35.2 L 262.5,34.8 L 264.6,41.5 L 269.6,40.7 L 272.3,43.0 L 279.4,44.7 L 281.3,50.3 L 284.1,49.7 L 288.5,57.3 L 292.1,57.1 L 298.4,61.3 L 298.8,65.9 L 295.1,71.9 L 296.4,76.9 L 291.5,82.2 L 295.3,89.9 L 294.3,95.8 L 293.7,98.2 L 289.1,103.2 L 286.6,102.9 L 284.6,104.3 L 280.5,99.9 L 275.6,100.1 L 273.1,103.8 L 270.7,103.8 L 269.0,100.7 L 263.3,97.2 L 261.0,97.2 L 264.0,89.2 L 263.2,86.5 L 259.8,84.4 L 257.2,84.5 L 254.9,82.2 L 253.7,78.5 L 251.5,77.7 L 251.1,71.2 L 250.4,71.9 L 244.8,69.7 L 243.4,67.2 L 235.2,68.9 L 234.2,64.4 L 231.8,63.0 L 234.3,56.5 L 234.2,49.2 L 239.6,46.3 L 239.3,43.6 L 246.5,34.0 Z', cx: 267.6, cy: 65 },
  '마도면': { path: 'M 204.3,66.8 L 206.9,67.0 L 211.9,73.7 L 215.4,84.0 L 211.1,88.2 L 206.5,97.4 L 208.2,101.5 L 212.3,104.4 L 210.0,114.7 L 201.8,125.8 L 198.9,125.7 L 197.1,130.0 L 185.2,129.5 L 176.4,127.3 L 174.2,127.9 L 173.9,131.3 L 172.0,132.0 L 170.0,127.6 L 162.4,124.8 L 158.8,121.6 L 158.4,119.6 L 153.9,119.6 L 151.9,118.1 L 150.3,114.5 L 151.2,111.5 L 154.3,108.3 L 153.2,104.0 L 160.1,98.7 L 160.5,95.3 L 171.8,91.6 L 173.3,92.5 L 175.6,91.7 L 177.1,86.8 L 179.9,87.8 L 179.7,89.9 L 182.3,92.0 L 185.1,87.4 L 193.4,87.8 L 194.6,85.7 L 193.4,83.4 L 193.6,79.2 L 200.0,72.1 L 200.7,69.3 L 204.3,66.8 Z', cx: 182.5, cy: 101.5 },
  '송산면': { path: 'M 188.3,40.4 L 188.7,41.9 L 186.0,40.2 L 188.1,39.5 L 188.3,40.4 Z M 170.1,13.8 L 170.1,15.7 L 172.5,16.4 L 172.6,18.5 L 169.8,19.7 L 165.1,18.7 L 166.8,14.8 L 170.3,12.9 L 170.1,13.8 Z M 104.8,10.5 L 110.1,10.7 L 110.2,24.4 L 115.6,25.9 L 120.1,20.9 L 127.0,21.5 L 123.9,27.2 L 120.3,29.4 L 117.8,28.9 L 121.7,41.7 L 123.7,43.9 L 126.3,43.6 L 129.2,39.8 L 136.2,40.0 L 142.5,43.2 L 146.2,42.8 L 150.7,45.7 L 157.9,44.7 L 164.4,51.2 L 169.4,46.5 L 170.3,47.4 L 172.9,45.8 L 173.9,47.3 L 181.9,47.0 L 182.2,51.6 L 186.7,51.4 L 187.8,55.1 L 189.2,55.1 L 189.6,52.2 L 195.0,52.8 L 196.2,63.2 L 199.8,66.5 L 200.8,70.8 L 193.6,79.2 L 194.2,87.2 L 185.1,87.4 L 182.3,92.0 L 179.7,89.9 L 179.9,87.8 L 177.1,86.8 L 175.6,91.7 L 173.3,92.5 L 171.8,91.6 L 160.5,95.3 L 160.1,98.7 L 153.5,103.4 L 148.8,99.4 L 144.2,105.6 L 139.9,98.7 L 140.3,96.1 L 137.0,93.7 L 126.4,96.5 L 118.7,103.4 L 110.3,100.5 L 109.0,101.0 L 106.6,106.0 L 102.8,105.2 L 109.5,77.8 L 108.4,70.2 L 99.7,56.2 L 99.3,50.6 L 100.5,50.0 L 98.6,43.0 L 99.8,40.1 L 103.6,36.6 L 104.2,31.9 L 102.3,28.5 L 88.4,15.9 L 98.7,23.8 L 99.0,22.1 L 107.0,19.9 L 109.7,15.6 L 109.9,11.7 L 99.8,10.7 L 88.7,14.2 L 85.8,17.9 L 89.0,13.8 L 100.2,10.4 L 104.8,10.5 Z', cx: 133.8, cy: 46.5 },
  '서신면': { path: 'M 75.9,168.7 L 81.3,171.4 L 93.7,171.9 L 103.0,176.0 L 101.2,177.5 L 97.1,174.2 L 96.5,177.2 L 94.1,177.0 L 91.4,174.5 L 85.1,174.8 L 83.9,172.8 L 75.5,173.5 L 72.7,175.1 L 71.8,174.2 L 74.0,168.4 L 75.3,167.5 L 75.9,168.7 Z M 106.4,142.3 L 103.2,147.7 L 97.0,152.2 L 103.7,146.9 L 106.4,142.3 Z M 106.4,142.3 L 107.3,140.6 L 106.4,142.3 Z M 80.5,116.6 L 81.9,119.8 L 87.2,121.1 L 84.9,126.9 L 78.1,136.9 L 76.0,122.9 L 77.5,119.2 L 80.5,116.6 Z M 137.8,94.7 L 140.3,96.1 L 139.9,98.7 L 143.3,105.2 L 144.2,105.6 L 148.8,99.4 L 153.4,103.1 L 154.3,108.3 L 151.2,111.5 L 150.3,114.5 L 151.9,118.1 L 153.9,119.6 L 158.4,119.6 L 158.8,121.6 L 162.4,124.8 L 170.9,128.2 L 171.8,131.8 L 173.6,131.7 L 174.1,133.3 L 169.8,141.8 L 166.0,144.3 L 162.0,144.9 L 162.7,147.8 L 161.1,151.9 L 159.1,154.8 L 154.9,156.7 L 153.1,160.9 L 149.7,162.5 L 143.5,161.4 L 139.9,165.7 L 140.7,168.8 L 141.7,168.2 L 142.5,169.4 L 137.5,172.8 L 137.2,170.1 L 132.4,171.1 L 131.4,176.1 L 126.9,177.4 L 126.7,178.5 L 123.7,174.4 L 119.5,175.0 L 120.4,174.0 L 126.4,174.8 L 127.4,173.2 L 125.7,165.1 L 120.6,155.3 L 123.5,152.8 L 123.6,150.7 L 113.4,151.4 L 109.1,155.5 L 113.4,151.3 L 124.4,149.7 L 128.1,144.2 L 134.9,142.2 L 136.0,143.3 L 132.3,137.5 L 125.8,134.5 L 116.2,138.7 L 112.6,138.0 L 107.3,140.6 L 107.9,139.6 L 104.2,140.8 L 101.2,139.9 L 101.7,138.4 L 107.3,135.6 L 109.7,132.1 L 107.3,127.7 L 104.1,115.2 L 106.6,116.2 L 105.4,116.4 L 106.6,119.7 L 108.9,119.5 L 114.5,108.6 L 116.3,107.5 L 113.7,105.4 L 108.8,106.1 L 104.6,110.6 L 105.4,111.3 L 104.3,112.7 L 101.7,113.6 L 101.3,111.0 L 104.9,106.4 L 101.8,105.8 L 106.6,106.0 L 109.0,101.0 L 110.3,100.5 L 118.7,103.4 L 126.4,96.5 L 132.3,94.4 L 137.0,93.7 L 137.8,94.7 Z M 133.8,93.5 L 133.0,92.5 L 134.5,90.7 L 133.8,93.5 Z', cx: 114.5, cy: 142.7 },
  '팔탄면': { path: 'M 264.1,97.7 L 269.0,100.7 L 271.3,104.1 L 273.1,103.8 L 275.6,100.1 L 280.8,99.9 L 284.6,104.3 L 286.6,102.9 L 288.7,103.1 L 290.8,105.0 L 300.1,105.0 L 304.0,107.1 L 304.8,116.3 L 301.9,119.9 L 303.8,124.8 L 306.5,127.1 L 300.7,129.2 L 300.3,137.4 L 303.7,140.2 L 307.8,134.4 L 311.2,133.6 L 316.8,135.2 L 317.2,137.4 L 314.9,143.6 L 311.2,146.2 L 310.9,147.9 L 301.1,153.4 L 297.2,153.0 L 298.0,147.6 L 293.1,144.1 L 291.7,145.6 L 285.2,158.1 L 283.4,157.9 L 279.5,167.9 L 281.8,172.8 L 278.5,183.7 L 280.4,187.6 L 279.2,191.1 L 277.0,192.2 L 274.0,197.2 L 272.0,194.4 L 271.4,190.4 L 263.3,187.0 L 260.4,179.8 L 254.3,175.4 L 250.5,170.2 L 250.5,164.9 L 245.0,160.5 L 245.4,155.9 L 249.8,152.9 L 243.9,148.0 L 243.6,145.5 L 236.9,144.0 L 243.6,141.4 L 247.5,137.8 L 247.8,136.1 L 258.0,130.2 L 260.8,126.8 L 262.5,120.6 L 261.5,119.1 L 259.5,119.0 L 259.4,116.1 L 256.5,111.7 L 257.4,108.8 L 259.8,106.9 L 258.8,103.9 L 260.8,97.4 L 264.1,97.7 Z', cx: 276, cy: 139.5 },
  '장안면': { path: 'M 230.0,144.0 L 240.4,144.0 L 243.6,145.5 L 243.9,148.0 L 249.8,152.9 L 245.4,155.9 L 245.0,160.5 L 250.5,164.9 L 250.5,170.2 L 254.3,175.4 L 260.4,179.8 L 263.3,187.0 L 270.7,189.7 L 272.3,191.7 L 272.0,194.4 L 274.0,197.2 L 272.8,202.9 L 276.6,219.4 L 275.4,228.7 L 255.1,264.5 L 252.4,267.6 L 245.6,271.4 L 239.8,272.2 L 223.4,272.2 L 223.4,265.4 L 221.4,262.4 L 223.5,258.6 L 223.5,252.9 L 221.5,246.0 L 222.4,245.0 L 221.9,240.7 L 214.7,238.0 L 215.2,236.0 L 210.9,231.8 L 211.2,226.2 L 223.4,217.6 L 222.9,215.5 L 219.6,215.3 L 218.9,213.3 L 220.4,210.1 L 221.9,208.7 L 224.6,209.0 L 225.4,210.5 L 228.2,209.2 L 234.7,202.2 L 235.8,199.1 L 234.9,194.3 L 239.4,192.0 L 235.3,188.5 L 227.4,187.0 L 224.6,181.5 L 224.6,175.8 L 236.8,174.0 L 233.3,164.7 L 235.4,165.0 L 235.8,163.2 L 232.2,163.5 L 223.2,153.9 L 226.3,150.2 L 220.0,149.1 L 218.5,145.4 L 230.0,144.0 Z', cx: 238.1, cy: 197.2 },
  '양감면': { path: 'M 363.3,172.6 L 360.4,175.9 L 362.3,177.4 L 363.3,176.4 L 363.0,177.6 L 359.8,177.5 L 360.7,180.2 L 364.3,181.0 L 360.6,182.6 L 362.7,185.0 L 361.9,194.1 L 362.9,196.6 L 360.6,200.6 L 364.2,204.5 L 363.0,205.6 L 361.5,203.1 L 357.0,202.8 L 361.3,211.1 L 360.7,212.4 L 356.9,212.8 L 358.8,215.8 L 361.8,217.2 L 361.3,219.5 L 352.7,217.7 L 345.8,218.6 L 340.9,216.3 L 337.6,221.3 L 325.9,220.4 L 324.5,224.1 L 325.0,227.0 L 319.3,227.9 L 312.7,226.1 L 310.4,221.0 L 304.1,223.8 L 300.0,223.2 L 297.7,220.4 L 293.2,219.7 L 292.5,216.1 L 298.4,210.9 L 309.3,208.1 L 308.3,191.7 L 312.6,189.0 L 313.7,185.9 L 316.9,185.5 L 322.6,190.7 L 323.9,193.4 L 329.5,191.6 L 330.7,183.0 L 337.9,185.2 L 342.6,182.6 L 344.3,179.1 L 344.1,175.6 L 346.1,172.6 L 352.3,172.7 L 354.2,171.0 L 361.9,169.2 L 363.2,169.4 L 363.3,172.6 Z', cx: 346.6, cy: 199.5 },
  '정남면': { path: 'M 340.7,99.0 L 342.7,101.7 L 348.0,99.2 L 349.7,99.4 L 353.3,102.6 L 360.1,102.9 L 368.6,109.1 L 365.9,114.0 L 367.7,115.7 L 364.2,118.6 L 363.2,118.1 L 364.4,116.5 L 363.5,115.6 L 360.5,118.8 L 360.5,120.9 L 365.2,122.9 L 368.5,126.6 L 377.2,127.7 L 383.1,130.4 L 386.7,136.3 L 387.1,138.4 L 385.0,141.6 L 390.6,157.6 L 376.8,163.1 L 365.2,164.9 L 362.1,168.5 L 361.2,163.6 L 354.7,163.2 L 350.8,158.5 L 350.7,152.3 L 341.1,149.4 L 332.4,151.1 L 328.8,148.6 L 328.3,145.7 L 323.0,142.9 L 321.9,137.6 L 323.3,130.4 L 321.8,123.8 L 326.6,119.6 L 327.2,117.4 L 326.0,113.5 L 328.0,107.1 L 326.8,103.6 L 329.4,100.5 L 340.7,99.0 Z', cx: 356.4, cy: 131.9 },
  '진안동': { path: 'M 403.1,94.0 L 404.2,95.9 L 401.7,99.1 L 401.7,101.2 L 396.0,99.6 L 397.0,99.1 L 397.4,95.1 L 401.0,92.5 L 403.1,94.0 Z M 396.0,53.4 L 393.5,62.5 L 397.9,65.8 L 397.4,70.5 L 402.3,77.2 L 406.5,79.9 L 403.7,83.6 L 407.0,86.4 L 404.7,87.8 L 405.0,89.7 L 403.1,89.2 L 402.4,87.7 L 404.2,84.5 L 398.3,80.2 L 399.3,82.0 L 395.5,84.3 L 396.8,86.2 L 393.4,87.2 L 389.7,91.2 L 390.0,93.2 L 387.9,90.9 L 382.5,93.1 L 380.7,90.1 L 385.7,87.0 L 381.6,81.9 L 383.8,78.6 L 381.5,72.9 L 381.6,68.6 L 386.6,67.4 L 394.2,55.7 L 394.6,56.5 L 394.3,53.5 L 396.0,53.4 Z', cx: 396.2, cy: 81.3 },
  '병점1동': { path: 'M 394.0,88.4 L 397.5,94.4 L 397.0,99.1 L 395.4,99.8 L 391.7,97.5 L 381.2,97.0 L 382.2,92.1 L 382.5,93.1 L 387.9,90.9 L 389.8,93.3 L 389.7,91.2 L 393.3,87.3 L 394.0,88.4 Z', cx: 389.8, cy: 94.3 },
  '병점2동': { path: 'M 398.3,80.2 L 404.2,84.5 L 401.0,88.1 L 401.0,92.5 L 397.4,95.1 L 393.3,87.3 L 396.8,86.2 L 395.5,84.3 L 399.3,82.0 L 398.3,80.2 Z', cx: 399, cy: 87.1 },
  '반월동': { path: 'M 414.0,59.9 L 415.8,69.5 L 420.1,71.1 L 421.1,73.5 L 419.0,72.9 L 415.5,75.8 L 417.0,85.1 L 412.3,86.1 L 410.3,78.4 L 409.3,77.5 L 406.5,79.9 L 402.5,77.4 L 397.4,70.5 L 397.9,66.3 L 402.8,65.3 L 404.3,66.1 L 403.7,68.1 L 414.0,59.9 Z', cx: 408.5, cy: 68.8 },
  '기배동': { path: 'M 354.7,66.2 L 356.3,66.0 L 356.2,67.7 L 361.9,70.0 L 363.2,73.3 L 365.0,72.6 L 366.6,69.1 L 372.2,72.6 L 370.4,72.9 L 370.9,74.2 L 366.6,75.4 L 365.9,80.5 L 362.8,79.8 L 350.5,85.1 L 348.3,81.8 L 347.9,77.9 L 343.9,75.6 L 341.9,69.9 L 347.4,69.6 L 349.9,67.0 L 352.9,67.7 L 354.7,66.2 Z', cx: 354.1, cy: 72.7 },
  '화산동': { path: 'M 350.7,93.0 L 348.6,88.6 L 349.1,85.3 L 362.8,79.8 L 365.9,80.5 L 366.6,75.4 L 370.9,74.2 L 371.2,72.5 L 374.7,72.4 L 380.5,74.4 L 381.6,73.2 L 383.8,78.6 L 381.6,81.9 L 385.7,87.0 L 380.7,90.1 L 382.3,92.0 L 381.0,96.3 L 384.7,97.7 L 378.8,101.3 L 370.1,103.9 L 371.5,109.0 L 370.4,110.7 L 360.1,102.9 L 352.8,102.2 L 351.9,99.7 L 353.0,95.2 L 350.7,93.0 Z', cx: 371.1, cy: 90.9 },
  '동탄1동': { path: 'M 419.3,73.0 L 430.4,81.9 L 427.4,88.1 L 428.6,92.9 L 426.4,96.9 L 412.9,99.5 L 412.5,98.3 L 408.8,97.9 L 408.8,92.3 L 411.8,86.0 L 417.0,85.1 L 415.5,75.8 L 419.3,73.0 Z', cx: 421.7, cy: 87.6 },
  '동탄2동': { path: 'M 426.4,97.4 L 426.4,112.2 L 419.3,109.5 L 417.6,112.4 L 413.8,112.1 L 413.1,110.2 L 414.3,105.7 L 412.9,99.5 L 424.4,96.8 L 426.4,97.4 Z', cx: 421.6, cy: 106.2 },
  '동탄3동': { path: 'M 409.3,77.5 L 412.3,86.1 L 408.8,92.3 L 409.5,98.0 L 406.7,100.0 L 402.1,100.7 L 401.7,99.1 L 404.2,95.8 L 401.0,92.5 L 400.9,88.4 L 402.4,86.8 L 403.1,89.2 L 405.0,89.7 L 404.7,87.8 L 407.0,86.4 L 403.7,83.6 L 409.3,77.5 Z', cx: 404.6, cy: 90.4 },
  '동탄4동': { path: 'M 449.0,112.5 L 443.1,111.3 L 438.5,106.0 L 438.3,93.0 L 451.8,94.0 L 454.9,94.7 L 454.8,95.6 L 462.0,96.3 L 462.8,101.5 L 458.1,101.2 L 454.1,103.5 L 455.3,105.6 L 451.7,107.6 L 449.0,112.5 Z', cx: 451.9, cy: 101.8 },
  '동탄5동': { path: 'M 453.7,79.3 L 466.7,82.9 L 471.6,80.0 L 477.2,78.7 L 477.8,84.0 L 482.2,90.9 L 478.4,98.9 L 467.4,101.8 L 464.5,100.7 L 462.8,101.5 L 462.0,96.3 L 454.8,95.6 L 454.9,94.7 L 451.7,94.0 L 428.5,93.0 L 427.4,88.1 L 430.4,81.9 L 442.7,78.9 L 453.7,79.3 Z', cx: 456.1, cy: 89.3 },
  '동탄6동': { path: 'M 464.5,100.7 L 467.4,101.8 L 478.4,98.9 L 480.3,99.9 L 484.9,106.5 L 483.8,111.5 L 484.7,116.3 L 482.5,119.0 L 479.6,120.0 L 478.0,124.0 L 475.8,125.6 L 464.0,126.5 L 464.8,130.1 L 460.4,134.0 L 461.6,143.2 L 460.0,148.5 L 449.6,149.4 L 442.0,151.9 L 439.5,147.7 L 438.0,139.3 L 435.3,136.3 L 421.0,132.4 L 417.6,127.2 L 417.6,112.4 L 419.3,109.5 L 426.4,112.2 L 426.5,95.7 L 428.5,93.0 L 438.3,93.0 L 438.5,106.0 L 441.3,109.9 L 445.2,112.1 L 449.0,112.5 L 451.7,107.6 L 455.3,105.6 L 454.1,103.5 L 456.3,102.0 L 464.5,100.7 Z', cx: 446.1, cy: 117.4 },
  '새솔동': { path: 'M 231.3,16.1 L 234.6,25.0 L 240.7,25.7 L 242.0,29.8 L 246.1,34.4 L 245.1,35.3 L 242.0,31.2 L 238.0,28.8 L 234.5,31.4 L 229.5,26.5 L 221.5,22.3 L 222.2,19.7 L 224.5,18.0 L 221.9,16.3 L 217.4,18.5 L 217.5,9.6 L 225.4,10.8 L 231.3,16.1 Z', cx: 231, cy: 23.5 },
}

// 데이터 있는 상권 구역 — METRICS 키와 매핑
const DATA_DISTRICTS = {
  동탄:  { dists: ['동탄1동','동탄2동','동탄3동','동탄4동','동탄5동','동탄6동'], lx: 451, ly: 102 },
  향남:  { dists: ['향남읍'],  lx: 317, ly: 174 },
  남양읍: { dists: ['남양읍'], lx: 228, ly: 82  },
  봉담:  { dists: ['봉담읍'], lx: 323, ly: 92  },
}
// 데이터 없는 보조 구역 (지도 맥락용)
const CONTEXT_NAMES = ['우정읍','매송면','비봉면','마도면','송산면','서신면','팔탄면','장안면','양감면','정남면','진안동','병점1동','병점2동','반월동','기배동','화산동','새솔동']

const TREND_MARK = { up: '↑', flat: '→', down: '↓' }

// ── 서브 컴포넌트 ────────────────────────────────────────────────────

function TrendBadge({ trend, pct }) {
  if (trend === 'up') return (
    <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-bold">
      <TrendingUp size={13} /> +{pct}%
    </span>
  )
  if (trend === 'down') return (
    <span className="flex items-center gap-0.5 text-sunset-orange text-xs font-bold">
      <TrendingDown size={13} /> {pct}%
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 text-warm-text text-xs font-bold">
      <Minus size={13} /> 보합
    </span>
  )
}

function MetricCard({ icon: Icon, label, value, unit, sub, accent }) {
  const color = accent === 'navy' ? 'text-navy' : accent === 'orange' ? 'text-sunset-orange' : 'text-emerald-600'
  return (
    <div className="bg-white rounded-2xl p-4 border border-warm-gray/20 shadow-sm flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} className="text-warm-text" />
        <span className="text-[11px] text-warm-text font-medium">{label}</span>
      </div>
      <p className={`text-xl font-extrabold ${color} leading-none`}>
        {value.toLocaleString()}
        <span className="text-xs font-medium text-warm-text ml-0.5">{unit}</span>
      </p>
      <p className="text-[10px] text-warm-text mt-1">{sub}</p>
    </div>
  )
}

function BarChart({ data, months }) {
  const max = Math.max(...data)
  return (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((v, i) => {
        const isLast = i === data.length - 1
        const pct = Math.round((v / max) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t-md" style={{ height: `${pct}%` }}>
              <div className={`w-full h-full rounded-t-md ${isLast ? 'bg-navy' : 'bg-navy/30'}`} />
            </div>
            <span className={`text-[9px] font-medium ${isLast ? 'text-navy' : 'text-warm-gray'}`}>
              {months[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function AlertItem({ type, text }) {
  const styles = {
    up:   { dot: 'bg-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
    down: { dot: 'bg-sunset-orange', text: 'text-sunset-orange', bg: 'bg-sunset-orange/5 border-sunset-orange/20' },
    info: { dot: 'bg-navy/40', text: 'text-navy', bg: 'bg-navy/5 border-navy/10' },
  }
  const s = styles[type]
  return (
    <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 border ${s.bg}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot} mt-1 flex-shrink-0`} />
      <p className={`text-xs font-medium ${s.text} leading-relaxed`}>{text}</p>
    </div>
  )
}

// ── 화성시 행정구역 지도 (실제 통계청 경계 기반) ─────────────────────────
function HwaseongMap({ region, setRegion }) {
  // region → 어느 GEO_PATHS 키들이 선택됐는지
  const selDists = new Set(DATA_DISTRICTS[region]?.dists ?? [])

  // 구역별 fill/stroke 결정
  function distStyle(name) {
    // 어느 데이터 구역에 속하는지 확인
    let ownerRegion = null
    for (const [rk, rv] of Object.entries(DATA_DISTRICTS)) {
      if (rv.dists.includes(name)) { ownerRegion = rk; break }
    }
    if (!ownerRegion) {
      return { fill: '#D5C9B5', stroke: '#B5A68E', width: 0.6 }
    }
    const sel = ownerRegion === region
    return {
      fill:   sel ? '#2a3c77' : '#F0E8D8',
      stroke: sel ? '#1a2860' : '#C4A878',
      width:  sel ? 1.4 : 0.9,
      cursor: 'pointer',
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-navy">화성시 상권 지도</h2>
        <p className="text-[10px] text-warm-text mt-0.5">지역을 탭해 상세 데이터를 확인하세요 · 통계청 2018 행정구역 기반</p>
      </div>

      <svg viewBox="0 0 500 282" className="w-full" style={{ display: 'block' }}>
        <defs>
          {/* 서해 파문 패턴 */}
          <pattern id="seaWave" x="0" y="0" width="18" height="9" patternUnits="userSpaceOnUse">
            <path d="M 0,4.5 Q 4.5,0 9,4.5 Q 13.5,9 18,4.5"
              fill="none" stroke="#4E9FC8" strokeWidth="0.6" opacity="0.5" />
          </pattern>
          <clipPath id="seaClip">
            <rect x="0" y="0" width="200" height="282" />
          </clipPath>
        </defs>

        {/* 배경: 인접 시군 */}
        <rect width="500" height="282" fill="#E8E2D4" />

        {/* 서해 (서쪽 200px 이내 — 해안 구역들이 덮어씌움) */}
        <rect x="0" y="0" width="200" height="282" fill="#9EC8E0" opacity="0.92" />
        <rect x="0" y="0" width="200" height="282" fill="url(#seaWave)" clipPath="url(#seaClip)" />

        {/* 보조 구역 (클릭 가능) */}
        {CONTEXT_NAMES.map(name => {
          const g = GEO_PATHS[name]
          if (!g) return null
          const sel = name === region
          return (
            <path key={name} d={g.path}
              fill={sel ? '#2a3c77' : '#D5C9B5'}
              stroke={sel ? '#1a2860' : '#B5A68E'}
              strokeWidth={sel ? 1.4 : 0.6}
              strokeLinejoin="round" fillRule="evenodd"
              style={{ cursor: 'pointer', transition: 'fill 0.18s' }}
              onClick={() => setRegion(name)}
            />
          )
        })}

        {/* 4개 데이터 상권 구역 */}
        {Object.entries(DATA_DISTRICTS).map(([rk, rv]) => {
          const sel = rk === region
          const fill   = sel ? '#2a3c77' : '#F0E8D8'
          const stroke = sel ? '#1a2860' : '#C4A878'
          return rv.dists.map(name => {
            const g = GEO_PATHS[name]
            if (!g) return null
            return (
              <path key={name} d={g.path}
                fill={fill} stroke={stroke}
                strokeWidth={sel ? 1.4 : 0.9}
                strokeLinejoin="round" fillRule="evenodd"
                style={{ cursor: 'pointer', transition: 'fill 0.18s' }}
                onClick={() => setRegion(rk)}
              />
            )
          })
        })}

        {/* 인접 시 라벨 */}
        <text x="250" y="8" textAnchor="middle" fontSize="6.5" fill="#9A8A70" opacity="0.9" fontStyle="italic">수원시</text>
        <text x="496" y="130" textAnchor="end" fontSize="6" fill="#9A8A70" opacity="0.85" fontStyle="italic" transform="rotate(90,496,130)">용인·오산시</text>
        <text x="370" y="279" textAnchor="middle" fontSize="6.5" fill="#9A8A70" opacity="0.9" fontStyle="italic">평택시</text>
        {/* 서해 라벨 */}
        <text x="22" y="130" textAnchor="middle" fontSize="8.5" fill="#2A6FA8" fontWeight="700" opacity="0.85" transform="rotate(-90,22,130)">서  해</text>

        {/* 보조 구역 이름 */}
        {CONTEXT_NAMES.map(name => {
          const g = GEO_PATHS[name]
          if (!g) return null
          const sel = name === region
          const halo = sel ? '#1a2860' : undefined
          return (
            <g key={name} style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {sel && (
                <text x={g.cx} y={g.cy}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="7.5" fontWeight="900"
                  stroke="#1a2860" strokeWidth="3" strokeLinejoin="round" fill="none"
                >{name}</text>
              )}
              <text x={g.cx} y={g.cy}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={sel ? 7.5 : 5.5} fontWeight={sel ? '900' : '600'}
                fill={sel ? 'white' : '#7A6A52'} opacity={sel ? 1 : 0.8}
              >{name}</text>
            </g>
          )
        })}

        {/* 데이터 상권 라벨 + 트렌드 화살표 */}
        {Object.entries(DATA_DISTRICTS).map(([rk, rv]) => {
          const sel  = rk === region
          const m    = METRICS[rk]['전체']
          const halo = sel ? '#1a2860' : '#F0E8D8'
          const fill = sel ? 'white' : '#162040'
          const trendFill = m.trend === 'up'
            ? (sel ? '#6EE7B7' : '#065F46')
            : m.trend === 'down'
            ? (sel ? '#FCA5A5' : '#991B1B')
            : (sel ? '#CBD5E1' : '#475569')
          // 동탄은 작은 폰트 (여러 동 합침)
          const fs = rk === '동탄' ? 8 : 9

          return (
            <g key={rk} style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {/* 구역명 halo */}
              <text x={rv.lx} y={rv.ly - 5}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={fs} fontWeight="900"
                stroke={halo} strokeWidth="3" strokeLinejoin="round" fill="none"
              >{rk === '봉담' ? '봉담읍' : rk === '향남' ? '향남읍' : rk}</text>
              <text x={rv.lx} y={rv.ly - 5}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={fs} fontWeight="900" fill={fill}
              >{rk === '봉담' ? '봉담읍' : rk === '향남' ? '향남읍' : rk}</text>
              {/* 트렌드 화살표 halo */}
              <text x={rv.lx} y={rv.ly + 9}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="12" fontWeight="900"
                stroke={halo} strokeWidth="2.5" fill="none"
              >{TREND_MARK[m.trend]}</text>
              <text x={rv.lx} y={rv.ly + 9}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="12" fontWeight="900" fill={trendFill}
              >{TREND_MARK[m.trend]}</text>
            </g>
          )
        })}

        {/* 방위 */}
        <g transform="translate(482,265)">
          <circle r="10" fill="white" stroke="#C4B09A" strokeWidth="1" opacity="0.95" />
          <polygon points="0,-6.5 2.2,-1.8 0,-3.5 -2.2,-1.8" fill="#2a3c77" />
          <polygon points="0,6.5 2.2,1.8 0,3.5 -2.2,1.8" fill="#C4B09A" />
          <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
            fontSize="5.5" fontWeight="900" fill="#2a3c77">N</text>
        </g>
      </svg>

      {/* 범례 */}
      <div className="px-4 pb-3 pt-2 border-t border-warm-gray/10 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-navy inline-block" />
          <span className="text-[10px] text-warm-text">선택 지역</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-extrabold text-emerald-700">↑</span>
          <span className="text-[10px] text-warm-text ml-0.5">증가세</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-extrabold text-red-700">↓</span>
          <span className="text-[10px] text-warm-text ml-0.5">감소세</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 font-extrabold">→</span>
          <span className="text-[10px] text-warm-text ml-0.5">보합</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm inline-block" style={{ background: '#D5C9B5' }} />
          <span className="text-[10px] text-warm-text">데이터 준비 중</span>
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────────
export default function District() {
  const [region,   setRegion]   = useState('동탄')
  const [category, setCategory] = useState('전체')

  const isDataRegion = region in METRICS
  const metrics = isDataRegion ? METRICS[region][category] : null
  const trend   = isDataRegion ? VISITOR_TREND[region] : null
  const alerts  = isDataRegion ? ALERTS[region] : null

  return (
    <div className="min-h-screen bg-primary-bg pb-24">
      <Header />

      <div className="max-w-4xl mx-auto px-5 pt-4 pb-2">
        <h1 className="text-lg font-extrabold text-navy">화성시 상권 비교</h1>
        <p className="text-xs text-warm-text mt-0.5">업종·지역별 상권 현황을 한눈에 비교하세요</p>
      </div>

      {/* 지역 탭 */}
      <div className="sticky top-[68px] z-30 bg-primary-bg/95 backdrop-blur-sm border-b border-warm-gray/20">
        <div className="max-w-4xl mx-auto px-5">
          <div className="flex gap-1 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {REGIONS.map(r => (
              <button key={r} onClick={() => setRegion(r)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all
                  ${region === r
                    ? 'bg-navy text-white shadow-sm'
                    : 'bg-white text-warm-text border border-warm-gray/30 hover:border-navy/40'}`}
              >{r}</button>
            ))}
            {!isDataRegion && (
              <span className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold bg-navy text-white shadow-sm">
                {region}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 pt-4 space-y-5">

        <HwaseongMap region={region} setRegion={setRegion} />

        {isDataRegion ? (<>
          {/* 업종 필터 */}
          <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-all
                  ${category === c
                    ? 'bg-sunset-orange text-white'
                    : 'bg-white text-warm-text border border-warm-gray/30 hover:border-sunset-orange/40'}`}
              >{c}</button>
            ))}
          </div>

          {/* 핵심 지표 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-navy">{region} · {category} 핵심 지표</h2>
              <TrendBadge trend={metrics.trend} pct={metrics.trendPct} />
            </div>
            <div className="flex gap-2">
              <MetricCard icon={Users}       label="월 방문자"  value={metrics.visitors}    unit="명"   sub="추정 월간 유동인구"    accent="navy"    />
              <MetricCard icon={ShoppingBag} label="평균 매출"  value={metrics.revenue}     unit="만원" sub="업종 월 평균 추정"    accent="emerald" />
              <MetricCard icon={Zap}         label="경쟁 강도"  value={metrics.competition} unit="%"   sub="포화도 (높을수록 경쟁)" accent={metrics.competition >= 75 ? 'orange' : 'navy'} />
            </div>
          </div>

          {/* 6개월 추이 */}
          <div className="bg-white rounded-2xl p-4 border border-warm-gray/20 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-navy">방문자 추이</h2>
              <span className="text-[10px] text-warm-text">최근 6개월</span>
            </div>
            <BarChart data={trend} months={TREND_MONTHS} />
            <p className="text-[10px] text-warm-text mt-2 text-right">* 전체 업종 기준 추정치입니다</p>
          </div>

          {/* 상권 변화 알림 */}
          <div>
            <h2 className="text-sm font-bold text-navy mb-2">최근 상권 변화</h2>
            <div className="space-y-2">
              {alerts.map((a, i) => <AlertItem key={i} type={a.type} text={a.text} />)}
            </div>
          </div>
        </>) : (
          /* 데이터 준비 중 패널 */
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-navy/8 flex items-center justify-center mx-auto">
              <span className="text-2xl">🗺️</span>
            </div>
            <div>
              <p className="text-sm font-bold text-navy">{region} 상권 데이터 수집 중</p>
              <p className="text-xs text-warm-text mt-1">
                현재 동탄·향남읍·남양읍·봉담읍 상권 데이터를 제공합니다.<br />
                {region} 데이터는 소상공인시장진흥공단 API 연동 후 제공될 예정입니다.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-1">
              {REGIONS.map(r => (
                <button key={r} onClick={() => setRegion(r)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-primary-bg text-navy border border-navy/20 hover:bg-navy hover:text-white transition-all">
                  {r} 보기
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-center py-2">
          <p className="text-[10px] text-warm-gray">
            상권 데이터는 추정치입니다 · 소상공인시장진흥공단 상권정보시스템 연동 예정
          </p>
        </div>

      </div>
    </div>
  )
}

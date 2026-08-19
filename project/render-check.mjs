/**
 * 화면이 실제로 그려지는지 확인한다.  실행:  node render-check.mjs
 *
 * `npm run build` 는 이걸 못 잡는다. 빌드는 import 가 실재하는지만 보고,
 * JS 는 타입을 안 본다. 실제로 한 번 그려봐야 나오는 오류가 있다.
 * 실제로 이렇게 잡았다 — 내 매장 화면이 열리자마자 죽고 있었는데
 * 빌드는 통과하고 있었다 (holidaysKnown 이름 겹침).
 *
 * useEffect 는 서버 렌더에서 안 돈다. 그래서 여기서 보는 것은 "첫 화면이
 * 터지지 않는가" 까지다. fetch 결과에 따라 달라지는 부분은 못 본다.
 */
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'

function makeLS(seed = {}) {
  return { _d: { ...seed },
    getItem(k){ return this._d[k] ?? null },
    setItem(k,v){ this._d[k]=v }, removeItem(k){ delete this._d[k] } }
}
globalThis.fetch = async () => ({ ok:true, status:200, json: async () => ({ count:0, results:[] }) })
globalThis.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} })

/* leaflet 을 가짜로 바꿔치기한다.
 *
 * District 는 모듈 최상단에서 L.icon() 을 부른다. 그래서 import 되는 순간
 * leaflet 이 window 를 찾다 죽고, 컴포넌트는 실행조차 안 됐다. 어제 이
 * 화면이 열리자마자 터진 원인은 지도가 아니라 컴포넌트 본체였는데
 * (holidaysKnown 이름 겹침) 그걸 여기서 못 보게 되는 것이 문제였다.
 *
 * 지도는 useEffect 안에서 만들어지고 useEffect 는 서버 렌더에서 안 돈다.
 * 그러니 L 을 껍데기로 바꿔도 확인하려는 것(첫 화면이 터지지 않는가)은
 * 그대로 볼 수 있다. 지도가 실제로 그려지는지는 여전히 브라우저에서만 안다. */
const leafletStub = `
  const chain = () => new Proxy(() => chain(), {
    get: (_, k) => (k === 'then' ? undefined : chain()),
    apply: () => chain(),
  });
  const L = chain();
  export default L;
  export const icon = L.icon, map = L.map, marker = L.marker, tileLayer = L.tileLayer;
`
const stubLeaflet = {
  name: 'stub-leaflet',
  // vite 가 먼저 node_modules 의 진짜 leaflet 을 집어가지 않게 앞에 세운다.
  // 이게 없으면 대역이 무시되고 예전처럼 window 에서 죽는다.
  enforce: 'pre',
  resolveId(id) {
    if (id === 'leaflet') return '\0leaflet-stub'
    if (id.startsWith('leaflet/') && id.endsWith('.css')) return '\0leaflet-css'
    return null
  },
  load(id) {
    if (id === '\0leaflet-stub') return leafletStub
    if (id === '\0leaflet-css') return 'export default ""'
    return null
  },
}

const vite = await createServer({
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
  plugins: [stubLeaflet],
  // 외부 패키지로 넘기면 플러그인을 안 타고 그대로 node_modules 를 읽는다.
  ssr: { noExternal: ['leaflet'] },
})
const { MemoryRouter } = await vite.ssrLoadModule('react-router-dom')

const PROFILE = JSON.stringify({ category:'카페', region:'동탄2동', business_status:'운영중',
  business_period_months:12, entity_type:'개인', vat_type:'간이과세', has_employee:false, age:30 })

const CASES = [
  ['Landing  (로그아웃)', '/src/pages/Landing.jsx', '/',         {}],
  ['Landing  (로그인)',   '/src/pages/Landing.jsx', '/',         { 'mars-fit-token':'t', 'mars-fit-profile':PROFILE }],
  ['Auth',                '/src/pages/Auth.jsx',    '/auth',     {}],
  ['District',            '/src/pages/District.jsx','/district', { 'mars-fit-profile':PROFILE }],
  ['Home',                '/src/pages/Home.jsx',    '/home',     { 'mars-fit-profile':PROFILE }],
  ['ApplicationGuide',    '/src/pages/ApplicationGuide.jsx','/apply',{ 'mars-fit-profile':PROFILE }],
  ['Schedule',            '/src/pages/Schedule.jsx','/schedule', { 'mars-fit-profile':PROFILE }],
  ['NoticeDetail',        '/src/pages/NoticeDetail.jsx','/notice',{ 'mars-fit-profile':PROFILE }],
  ['MissionControl',      '/src/pages/MissionControl.jsx','/mission',{ 'mars-fit-profile':PROFILE }],
  ['Onboarding',          '/src/pages/Onboarding.jsx','/onboarding',{ 'mars-fit-profile':PROFILE }],
]

let bad = 0
for (const [name, mod, path, seed] of CASES) {
  globalThis.localStorage = makeLS(seed)
  try {
    const { default: C } = await vite.ssrLoadModule(mod)
    const html = renderToString(
      React.createElement(MemoryRouter, { initialEntries:[path] }, React.createElement(C)))
    const kakao = html.includes('FEE500') ? ' [카카오노랑]' : ''
    const start = html.includes('카카오톡으로 시작') ? ' [카카오CTA]' : ''
    console.log(`✅ ${name.padEnd(20)} ${String(html.length).padStart(6)}자${kakao}${start}`)
  } catch (e) {
    // leaflet 은 import 되는 순간 window 를 만진다. 컴포넌트가 실행되기도
    // 전에 여기서 멈추므로 SSR 로는 이 화면을 볼 방법이 없다. 실제 앱은
    // 브라우저에서만 도니까 이건 고장이 아니다 — 다만 **이 화면은 자동으로
    // 지켜지지 않는다.** 배포하면 손으로 한 번 눌러봐야 한다.
    if (/window is not defined|document is not defined/.test(e.message)) {
      console.log(`⚠️  ${name.padEnd(19)} 브라우저 전용 — SSR 점검 불가. 손으로 눌러볼 것`)
    } else {
      bad++
      console.log(`❌ ${name.padEnd(20)} ${e.constructor.name}: ${e.message}`)
    }
  }
}
console.log(bad ? `\n터진 화면 ${bad}개` : '\n전부 렌더 성공')
await vite.close()

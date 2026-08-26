/**
 * 화면을 폰 크기로 찍어본다.
 *
 *   node scripts/shots.mjs                     기본(폰 390x844) 전 화면
 *   node scripts/shots.mjs --w 768 --h 1024    태블릿
 *   node scripts/shots.mjs --only home,district
 *   node scripts/shots.mjs --viewport            처음 보이는 한 화면만
 *
 * **눈으로 못 보면 모바일을 고칠 수 없다.** 이 서버에 브라우저가 없는 줄
 * 알았는데 playwright 가 받아둔 크롬이 있었다. npm 패키지는 없어서 CDP
 * (크롬 디버깅 규약)에 직접 붙는다 — node 22 의 전역 WebSocket 이면 된다.
 *
 * 온보딩을 안 하면 홈이 안 열리므로 localStorage 에 프로필을 심고 간다.
 * 찍는 곳은 배포된 사이트라 데이터도 진짜다.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CHROME = join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome')
const SITE = process.env.SHOTS_SITE || 'https://ai-hwaseong-ten.vercel.app'
const PORT = 9333

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const W = Number(arg('w', 390))
const H = Number(arg('h', 844))
const OUT = arg('out', '/tmp/shots')
const only = arg('only', '')
/* 기본은 페이지 전체를 편 그림이다. --viewport 를 주면 **처음 보이는 한
   화면만** 찍는다. 안쪽에 스크롤 상자가 있는 화면(일정의 「상시 접수」)은
   전체로 찍으면 그 상자까지 펴져서 실제보다 열 배 길게 나온다. */
const VIEWPORT_ONLY = argv.includes('--viewport')

/* 운영중 사장님. 예비창업자면 세무일정이 통째로 안 나와서 그 화면을 못 본다. */
const PROFILE = {
  path: 'C', age: 45, region: '화성시',
  business_status: '운영중', category: '음식점',
  career_experience: '있음', asset_group: '일반',
  business_period_months: 24, marital_status: '기혼',
  living_with_parents: false, entity_type: '개인',
  vat_type: '일반과세', has_employee: true, withholding_half: false,
}

const PAGES = [
  ['landing',  '/',            0],
  ['home',     '/#/home',      1],
  ['district', '/#/district',  1],
  ['schedule', '/#/schedule',  1],
  ['apply',    '/#/apply',     1],
  ['mission',  '/#/mission',   1],
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  mkdirSync(OUT, { recursive: true })
  const chrome = spawn(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
    `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' })

  let ws
  for (let i = 0; i < 40 && !ws; i++) {
    await sleep(250)
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const tabs = await r.json()
      const page = tabs.find(t => t.type === 'page')
      if (page) ws = page.webSocketDebuggerUrl
    } catch { /* 아직 안 떴다 */ }
  }
  if (!ws) { chrome.kill(); throw new Error('크롬이 안 떴다') }

  const sock = new WebSocket(ws)
  await new Promise((ok, no) => { sock.onopen = ok; sock.onerror = no })

  let id = 0
  const waiters = new Map()
  const events = []
  sock.onmessage = e => {
    const msg = JSON.parse(e.data)
    if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id) }
    else if (msg.method) events.push(msg)
  }
  const send = (method, params = {}) => new Promise(ok => {
    const n = ++id
    waiters.set(n, ok)
    sock.send(JSON.stringify({ id: n, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 2, mobile: true,
  })
  // 손가락 입력으로 인식되게 한다. hover 로만 열리는 것이 있으면 여기서 드러난다.
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  const picked = only ? only.split(',').map(s => s.trim()) : null
  const report = []

  for (const [name, path, needProfile] of PAGES) {
    if (picked && !picked.includes(name)) continue

    await send('Page.navigate', { url: SITE + (needProfile ? '/' : path) })
    await sleep(1500)
    if (needProfile) {
      await send('Runtime.evaluate', {
        expression: `localStorage.setItem('mars-fit-profile', ${JSON.stringify(JSON.stringify(PROFILE))});`
                  + `location.hash = ${JSON.stringify(path.replace('/#', ''))};`,
      })
      await sleep(600)
      await send('Page.reload', { ignoreCache: false })
    }
    // 매칭·LLM 이 돌아올 때까지 기다린다. 안 기다리면 빈 화면만 찍힌다.
    await sleep(6000)

    // 가로로 삐져나온 것이 있는지 같이 잰다 — 모바일에서 제일 흔한 사고다.
    const probe = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const vw = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll('*')]
          .map(el => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.right > vw + 1 || r.left < -1))
          .slice(0, 6)
          .map(({ el, r }) => (el.tagName.toLowerCase()
            + (el.className && typeof el.className === 'string'
                ? '.' + el.className.split(/\\s+/).filter(Boolean).slice(0, 3).join('.') : '')
            + ' → ' + Math.round(r.left) + '~' + Math.round(r.right)));
        /* **보이는 크기가 아니라 실제로 눌리는 크기를 잰다.**
           누를 자리를 넓힐 때 여백 대신 안 보이는 덮개(::after)를 깐다 —
           여백을 늘리면 데스크탑 배치까지 바뀌기 때문이다. 덮개는 가짜
           요소라 getBoundingClientRect 에 안 잡히므로 따로 읽는다.

           elementFromPoint 로 찍어보는 방법을 먼저 썼는데 **화면 밖에
           있는 것에는 null 이 온다.** 접힌 목록처럼 아래쪽에 있는 버튼이
           전부 「작다」로 잘못 나왔다. */
        const box = el => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el, '::after');
          if (cs.content === 'none' || cs.position !== 'absolute') return r;
          return { width: Math.max(r.width, parseFloat(cs.width) || 0),
                   height: Math.max(r.height, parseFloat(cs.height) || 0),
                   real: r };
        };
        const small = [...document.querySelectorAll('button,a,[role=button],input,select')]
          .map(el => ({ el, r: el.getBoundingClientRect(), b: box(el) }))
          .filter(({ r, b }) => r.width > 0 && r.height > 0 && (b.height < 40 || b.width < 40))
          .slice(0, 8)
          .map(({ el, r }) => (el.tagName.toLowerCase()
            + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 14) + '"'
            + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)));
        return { vw, scrollW: document.documentElement.scrollWidth, over, small,
                 title: (document.querySelector('h1,h2')||{}).textContent?.trim().slice(0,30) || '' };
      })()`,
    })
    const info = probe.result?.result?.value || {}

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !VIEWPORT_ONLY })
    if (shot.result?.data) {
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.result.data, 'base64'))
    }
    report.push({ name, ...info })
    console.log(`  ${name.padEnd(9)} 폭 ${info.vw}/${info.scrollW}`
      + (info.scrollW > info.vw ? '  ← 가로 스크롤 생김 ❌' : '  ✅')
      + (info.over?.length ? `\n    삐져나옴: ${info.over.join(' | ')}` : '')
      + (info.small?.length ? `\n    작은 버튼: ${info.small.join(' | ')}` : ''))
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  sock.close()
  chrome.kill()
  console.log(`\n  ${OUT} 에 저장`)
}

main().catch(e => { console.error(e.message); process.exit(1) })

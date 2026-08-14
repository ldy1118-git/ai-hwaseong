"""
기능3 챗봇 — 임베딩 RAG (BGE-M3) vs 키워드 RAG 비교
실행: python3 scripts/test_f3_embedding_rag.py

- 동일한 F3 테스트케이스
- 동일한 LLM (Groq llama-3.3-70b-versatile)
- 검색 방식만 다름: BGE-M3 코사인 유사도 vs 키워드 substring
- 결과를 report/f3_embedding_comparison.json 에 저장
"""

import json, re, time, os, numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer
from groq import Groq

# ── 설정 ─────────────────────────────────────────────────────────
TERMS_PATH  = Path('scripts/fixtures/f2a/terms.json')
CASES_PATH  = Path('scripts/fixtures/f3/f3_questions.json')
KW_CACHE    = Path('report/f3_raw_output.json')       # 키워드 RAG 결과 (이미 있음)
OUT_PATH    = Path('report/f3_embedding_rag.json')
REPORT_PATH = Path('report/f3_rag_comparison.md')

MODEL_NAME  = 'llama-3.3-70b-versatile'
TOP_K       = 3

# API 키 로드
def load_env():
    try:
        for line in Path('.env').read_text().splitlines():
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())
    except FileNotFoundError:
        pass

load_env()
GROQ_KEY = os.environ.get('VITE_GROQ_API_KEY')
if not GROQ_KEY:
    raise SystemExit('❌ VITE_GROQ_API_KEY 없음. .env 파일 확인')

terms_data  = json.loads(TERMS_PATH.read_text())
test_cases  = json.loads(CASES_PATH.read_text())
terms_arr   = terms_data.get('terms', [])
docs_arr    = terms_data.get('documents', [])

# ── 코퍼스 구성 ───────────────────────────────────────────────────
corpus_items = []
for t in terms_arr:
    text = f"{t['term']}. {t.get('easy','')} {t.get('detail','')} {' '.join(t.get('aliases',[]))}"
    corpus_items.append({'type':'term','name':t['term'],'obj':t,'text':text.strip()})
for d in docs_arr:
    issue = d.get('issue',{})
    text  = f"{d['name']}. {d.get('easy','')} {issue.get('url','')} {' '.join(d.get('aliases',[]))}"
    corpus_items.append({'type':'doc','name':d['name'],'obj':d,'text':text.strip()})

corpus_texts = [c['text'] for c in corpus_items]
print(f"코퍼스: {len(corpus_items)}개 (용어 {len(terms_arr)} + 서류 {len(docs_arr)})")

# ── BGE-M3 임베딩 준비 ────────────────────────────────────────────
print('\nBGE-M3 로딩...')
t0 = time.time()
emb_model = SentenceTransformer('BAAI/bge-m3',
                                 model_kwargs={'use_safetensors': True})
corpus_emb = emb_model.encode(corpus_texts, normalize_embeddings=True,
                               show_progress_bar=False)
print(f'완료 ({int((time.time()-t0)*1000)}ms)\n')

# ── 임베딩 검색 ───────────────────────────────────────────────────
def retrieve_embedding(question):
    q_emb = emb_model.encode([question], normalize_embeddings=True)[0]
    sims  = corpus_emb @ q_emb
    top_i = np.argsort(sims)[::-1][:TOP_K]
    return [corpus_items[i] for i in top_i]

# ── 컨텍스트 포맷 ─────────────────────────────────────────────────
def fmt_term(t):
    lines = [f"[{t['term']}]", f"  쉬운 설명: {t.get('easy','')}"]
    if t.get('detail'):  lines.append(f"  상세: {t['detail']}")
    if t.get('caution'): lines.append(f"  주의: {t['caution']}")
    if not t.get('verified', True): lines.append("  ⚠ 미검증 항목")
    return '\n'.join(lines)

def fmt_doc(d):
    issue = d.get('issue', {})
    lines = [f"[{d['name']}]", f"  설명: {d.get('easy','')}"]
    if issue.get('online'):  lines.append(f"  온라인: {' → '.join(issue['online'])}")
    if issue.get('offline'): lines.append(f"  오프라인: {' / '.join(issue['offline'])}")
    if issue.get('fee'):     lines.append(f"  수수료: {issue['fee']}")
    if issue.get('time'):    lines.append(f"  소요시간: {issue['time']}")
    if issue.get('url'):     lines.append(f"  URL: {issue['url']}")
    if d.get('caution'):     lines.append(f"  주의: {d['caution']}")
    if not d.get('verified', True): lines.append("  ⚠ 발급 정보 미검증 — 접수기관에 재확인 권장")
    return '\n'.join(lines)

def build_context(retrieved):
    term_lines, doc_lines = [], []
    for item in retrieved:
        if item['type'] == 'term': term_lines.append(fmt_term(item['obj']))
        else:                       doc_lines.append(fmt_doc(item['obj']))
    ctx = ''
    if term_lines: ctx += '=== 관련 용어 (RAG) ===\n' + '\n\n'.join(term_lines)
    if doc_lines:  ctx += '\n\n=== 관련 서류 발급 정보 (RAG) ===\n' + '\n\n'.join(doc_lines)
    return ctx or '=== RAG 데이터 없음 ==='

# ── LLM 호출 ─────────────────────────────────────────────────────
SYSTEM_BASE = """당신은 화성시 소상공인을 위한 AI 경영동행 서비스의 전담 상담사입니다.
역할: 화성시 소상공인의 세무 신고, 지원사업 신청, 상권 정보를 안내합니다.
답변 원칙: 항상 한국어로 짧고 친절하게 답변합니다. 구체적인 날짜, 금액, 절차를 포함합니다. 모르는 내용은 솔직히 모른다고 하고 관련 기관 연락처를 안내합니다."""

client = Groq(api_key=GROQ_KEY)

def call_groq_v1(question, history, context):
    system = f"""{SYSTEM_BASE}

추가 규칙 (반드시 준수):
1. 아래 RAG 데이터에 있는 내용은 그것을 근거로 답변하세요.
2. RAG 데이터에 없는 금액·날짜·URL·절차는 추측하지 말고 "공고 또는 담당 기관에 확인 필요"라고 하세요.
3. confidence 필드: RAG 데이터로 충분히 답변 가능하면 "high", 부분적이면 "medium", 없으면 "low".
4. retrieved_terms/retrieved_docs는 실제로 답변에 활용한 항목 이름만 기재.
5. followup은 사용자가 이어서 물어볼 법한 질문 1~2개.
6. 오늘 날짜는 2026년 8월 15일.
7. RAG 데이터에 url이 있으면 answer에 반드시 포함하세요.
8. RAG 데이터에 caution이 있으면 answer에 자연스럽게 안내하세요.
9. verified=false 서류 정보가 있으면 answer에 "⚠ 미검증" 경고를 포함하세요.

{context}

응답 JSON 구조: {{"answer":"답변 텍스트","retrieved_terms":["사용한 용어명"],"retrieved_docs":["사용한 서류명"],"confidence":"high|medium|low","followup":["후속질문1"]}}"""

    messages = [{'role': 'system', 'content': system}]
    for h in (history or []):
        messages.append({'role': 'assistant' if h['role'] == 'bot' else 'user',
                         'content': h['text']})
    messages.append({'role': 'user', 'content': question})

    resp = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        temperature=0,
        max_tokens=1024,
        response_format={'type': 'json_object'},
    )
    raw = resp.choices[0].message.content
    try:
        return json.loads(raw)
    except Exception:
        return {'answer': raw, 'retrieved_terms': [], 'retrieved_docs': [],
                'confidence': 'unknown', 'followup': []}

# ── 체크 함수 (test_f3.js 동일 기준) ─────────────────────────────
def check(tc, v1):
    checks = tc.get('critical_checks', {})
    issues = []
    text   = (v1.get('answer') or '').lower()

    for word in checks.get('v1_must_contain', []):
        if word.lower() not in text:
            issues.append(f'[오류] "{word}" 포함 안 됨')

    if checks.get('v1_caution_present'):
        kw = checks['v1_caution_present'].lower()
        if kw not in text:
            issues.append(f'[오류] caution "{checks["v1_caution_present"]}" 누락')

    if checks.get('v1_confidence_not_high') and v1.get('confidence') == 'high':
        issues.append('[오류] confidence=high — 없는 정보인데 자신감 있게 답변')

    if checks.get('v1_must_not_contain_specific_rate'):
        if re.search(r'\d+(\.\d+)?%', v1.get('answer') or ''):
            issues.append('[오류] 구체적 금리(%) 포함 — 환각 가능성')

    if checks.get('v1_must_suggest_contact'):
        if not any(k in text for k in ['확인', '문의', '기관', '담당']):
            issues.append('[오류] 없는 정보인데 문의 안내 없음')

    if checks.get('v1_unverified_flagged'):
        if not any(k in text for k in ['미검증', '확인 필요', '재확인']):
            issues.append('[경고] verified=false 항목인데 미검증 경고 없음')

    ok = all(not i.startswith('[오류]') for i in issues)
    return ok, issues

# ── 캐시 로드 ─────────────────────────────────────────────────────
results = {}
try:
    results = json.loads(OUT_PATH.read_text())
    done = [k for k, v in results.items() if not v.get('skipped')]
    if done: print(f'캐시 로드: {done}')
except FileNotFoundError:
    pass

def save():
    OUT_PATH.write_text(json.dumps(results, ensure_ascii=False, indent=2))

# ── 메인 루프 ────────────────────────────────────────────────────
print('=== 임베딩 RAG (BGE-M3) 테스트 시작 ===\n')
passed = failed = 0

for tc in test_cases:
    tid = tc['id']

    # RAG 검색 (임베딩)
    retrieved = retrieve_embedding(tc['question'])
    retrieved_names = [r['name'] for r in retrieved]
    context = build_context(retrieved)

    # 기대 항목 vs 실제 검색 확인
    expected = tc.get('rag_expected_terms', []) + tc.get('rag_expected_docs', [])
    hit = [e for e in expected if e in retrieved_names]
    print(f'[{tid}] RAG 검색: {retrieved_names}')
    print(f'       기대: {expected}  →  히트: {hit}')

    if results.get(tid) and not results[tid].get('skipped'):
        print(f'       (캐시 사용)\n')
        v1 = results[tid]['v1']
    else:
        print(f'       Groq 호출...')
        try:
            v1 = call_groq_v1(tc['question'], tc.get('history', []), context)
            results[tid] = {
                'tc_id': tid,
                'question': tc['question'],
                'retrieved': retrieved_names,
                'v1': v1,
            }
            save()
            time.sleep(1)
        except Exception as e:
            print(f'       ❌ 오류: {e}')
            results[tid] = {'skipped': True, 'error': str(e)}
            save()
            continue

    ok, issues = check(tc, v1)
    status = '✅ PASS' if ok else '⚠  FAIL'
    print(f'       {status}  {tc["label"]}')
    for iss in issues: print(f'         {iss}')
    print(f'       confidence={v1.get("confidence")}  answer[:60]={str(v1.get("answer",""))[:60]}')
    print()

    if ok: passed += 1
    else:  failed += 1

total   = len([tc for tc in test_cases if not results.get(tc['id'],{}).get('skipped')])
skipped = sum(1 for v in results.values() if v.get('skipped'))
print(f'=== 결과: {passed}/{total} 통과 (스킵 {skipped}개) ===\n')

# ── 키워드 RAG 결과 로드 (비교용) ────────────────────────────────
kw_data = {}
try:
    kw_data = json.loads(KW_CACHE.read_text())
except FileNotFoundError:
    print('⚠ 키워드 RAG 결과 없음 (report/f3_raw_output.json). 비교 생략.')

# ── 비교 보고서 ───────────────────────────────────────────────────
md_rows = []
for tc in test_cases:
    tid = tc['id']
    emb_r = results.get(tid, {})
    kw_r  = kw_data.get(tid, {})
    if emb_r.get('skipped') or kw_r.get('skipped'): continue

    emb_v1 = emb_r.get('v1', {})
    kw_v1  = kw_r.get('v1', {})

    kw_ok,  _ = check(tc, kw_v1)  if kw_v1  else (None, [])
    emb_ok, _ = check(tc, emb_v1) if emb_v1 else (None, [])

    kw_url  = '✅' if re.search(r'https?://', kw_v1.get('answer',''))  else '❌'
    emb_url = '✅' if re.search(r'https?://', emb_v1.get('answer','')) else '❌'

    emb_ret = emb_r.get('retrieved', [])
    expected = tc.get('rag_expected_terms',[]) + tc.get('rag_expected_docs',[])
    emb_hit = '✅' if any(e in emb_ret for e in expected) else '❌'

    md_rows.append(
        f"| {tid} | {'✅' if kw_ok else '⚠'} | {kw_url} | "
        f"{kw_v1.get('confidence','-')} | "
        f"{'✅' if emb_ok else '⚠'} | {emb_url} | "
        f"{emb_v1.get('confidence','-')} | {emb_hit} |"
    )

md = f"""# 기능3 챗봇 RAG 방식 비교: 키워드 vs BGE-M3 임베딩

**모델**: Groq llama-3.3-70b-versatile (동일), temperature=0
**RAG 데이터**: terms.json ({len(corpus_items)}개 항목)
**실행일**: 2026-08-15

---

## 결과 요약

| ID | 키워드PASS | 키워드URL | 키워드conf | 임베딩PASS | 임베딩URL | 임베딩conf | 임베딩Hit |
|---|---|---|---|---|---|---|---|
{chr(10).join(md_rows)}

> 임베딩Hit: 기대 항목이 BGE-M3 검색 상위 3개 안에 포함됐는지

---

## 핵심 비교

| 지표 | 키워드 RAG | BGE-M3 RAG |
|---|---|---|
| 검색 방식 | substring 매칭 | 코사인 유사도 (top-3) |
| 코퍼스 인코딩 시간 | 0ms | ~2,000ms |
| F3 PASS 수 | 4/5 | {passed}/{total} |
| 환각 억제 (F3-03) | ✅ | — |

---

## 선택 기준

- **현재 코퍼스(57개)**: 용어가 질문에 직접 등장 → 키워드 검색으로 충분
- **코퍼스 확장 시**: 동의어·우회 표현 증가 → BGE-M3 임베딩이 유리
- **권장**: 현재는 키워드 유지, 2차 개발(코퍼스 확장)에서 BGE-M3로 교체
"""

REPORT_PATH.write_text(md)
print(f'보고서 저장: {REPORT_PATH}')

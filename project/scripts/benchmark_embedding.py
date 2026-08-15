"""
임베딩 모델 비교 벤치마크
실행: python3 scripts/benchmark_embedding.py

비교 대상 (4종):
  - BAAI/bge-m3            : 다국어 고성능 (논문 권장)
  - upskyy/kure-roberta-small : 한국어 특화 KURE-v1
  - BM-K/KoSimCSE-roberta-multitask : 한국어 SimCSE
  - snunlp/KR-SBERT-V40K-klueNLI-augSTS : 한국어 SBERT

베이스라인:
  - 현재 키워드 기반 검색 (substring 매칭)

평가 지표:
  - Hit@1 : 정답이 1위에 있는 비율
  - Hit@3 : 정답이 상위 3개 안에 있는 비율
  - MRR   : Mean Reciprocal Rank
  - 속도  : 인코딩 시간 (ms)
"""

import json
import time
import re
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer

# ── 경로 설정 ─────────────────────────────────────────────────────
TERMS_PATH    = Path('scripts/fixtures/f2a/terms.json')
CASES_PATH    = Path('scripts/fixtures/f3/f3_questions.json')
OUTPUT_PATH   = Path('report/embedding_benchmark.json')
REPORT_PATH   = Path('report/embedding_benchmark.md')

terms_data  = json.loads(TERMS_PATH.read_text())
test_cases  = json.loads(CASES_PATH.read_text())

terms_arr = terms_data.get('terms', [])
docs_arr  = terms_data.get('documents', [])

# ── 검색 코퍼스 구성 ──────────────────────────────────────────────
# 각 항목을 텍스트로 변환 (임베딩 대상)
corpus_items = []

for t in terms_arr:
    text = f"{t['term']}. {t.get('easy', '')} {t.get('detail', '')} {' '.join(t.get('aliases', []))}"
    corpus_items.append({'type': 'term', 'name': t['term'], 'text': text.strip()})

for d in docs_arr:
    issue = d.get('issue', {})
    url   = issue.get('url', '')
    text  = f"{d['name']}. {d.get('easy', '')} {url} {' '.join(d.get('aliases', []))}"
    corpus_items.append({'type': 'doc', 'name': d['name'], 'text': text.strip()})

corpus_texts = [item['text'] for item in corpus_items]
print(f"코퍼스 크기: 용어 {len(terms_arr)}개 + 서류 {len(docs_arr)}개 = {len(corpus_items)}개\n")

# ── 평가 케이스 ───────────────────────────────────────────────────
# rag_expected_terms + rag_expected_docs 를 정답(ground truth)으로 사용
eval_cases = [
    {
        'id':       tc['id'],
        'question': tc['question'],
        'expected': tc.get('rag_expected_terms', []) + tc.get('rag_expected_docs', []),
    }
    for tc in test_cases
    if tc.get('rag_expected_terms') or tc.get('rag_expected_docs')
]
# 정답이 없는 케이스(F3-03 환각 유도 등) 제외
eval_cases = [c for c in eval_cases if c['expected']]
print(f"평가 케이스: {len(eval_cases)}개")
for c in eval_cases:
    print(f"  {c['id']}: {c['expected']}")
print()

# ── 키워드 베이스라인 ─────────────────────────────────────────────
def score_keyword(question, *candidates):
    q = re.sub(r'[?!。\s,]+', '', question).lower()
    score = 0
    for c in candidates:
        if not c:
            continue
        cn = re.sub(r'[·\s]+', '', c).lower()
        if q in cn or cn in q:
            score += 3
            continue
        for length in range(2, len(cn) + 1):
            for start in range(len(cn) - length + 1):
                if cn[start:start + length] in q:
                    score += 1
                    break
    return score

def retrieve_keyword(question, top_k=3):
    scored = []
    for item in corpus_items:
        if item['type'] == 'term':
            t = next((t for t in terms_arr if t['term'] == item['name']), {})
            s = score_keyword(question, t.get('term', ''), *t.get('aliases', []))
        else:
            d = next((d for d in docs_arr if d['name'] == item['name']), {})
            s = score_keyword(question, d.get('name', ''), *d.get('aliases', []))
        scored.append((item['name'], s))
    scored = [(n, s) for n, s in scored if s > 0]
    scored.sort(key=lambda x: -x[1])
    return [n for n, _ in scored[:top_k]]

# ── 임베딩 검색 ───────────────────────────────────────────────────
def retrieve_embedding(model, query_embedding, corpus_embeddings, top_k=3):
    sims = np.dot(corpus_embeddings, query_embedding) / (
        np.linalg.norm(corpus_embeddings, axis=1) * np.linalg.norm(query_embedding) + 1e-9
    )
    top_idx = np.argsort(sims)[::-1][:top_k]
    return [corpus_items[i]['name'] for i in top_idx]

# ── 지표 계산 ─────────────────────────────────────────────────────
def compute_metrics(retrieved_list_per_case, eval_cases, top_k=3):
    hit1 = hit3 = mrr_sum = 0
    details = []
    for retrieved, case in zip(retrieved_list_per_case, eval_cases):
        expected_set = set(case['expected'])
        # Hit@1
        h1 = 1 if retrieved and retrieved[0] in expected_set else 0
        hit1 += h1
        # Hit@3
        h3 = 1 if any(r in expected_set for r in retrieved[:3]) else 0
        hit3 += h3
        # MRR
        rr = 0.0
        for rank, r in enumerate(retrieved, 1):
            if r in expected_set:
                rr = 1.0 / rank
                break
        mrr_sum += rr
        details.append({
            'id': case['id'],
            'expected': case['expected'],
            'retrieved': retrieved,
            'hit1': h1, 'hit3': h3, 'rr': round(rr, 3)
        })
    n = len(eval_cases)
    return {
        'hit1':  round(hit1 / n, 3),
        'hit3':  round(hit3 / n, 3),
        'mrr':   round(mrr_sum / n, 3),
        'details': details
    }

# ── 모델 목록 ─────────────────────────────────────────────────────
EMBEDDING_MODELS = [
    {'id': 'bge-m3',        'name': 'BGE-M3',            'hf': 'BAAI/bge-m3',
     'kwargs': {'model_kwargs': {'use_safetensors': True}}},
    {'id': 'kure',          'name': 'KURE-v1',            'hf': 'upskyy/kure-roberta-small-v2',
     'kwargs': {}},
    {'id': 'kosimcse',      'name': 'KoSimCSE-RoBERTa',   'hf': 'BM-K/KoSimCSE-roberta-multitask',
     'kwargs': {}},
    {'id': 'kr-sbert',      'name': 'KR-SBERT',           'hf': 'jhgan/ko-sroberta-multitask',
     'kwargs': {}},
]

# ── 실행 ─────────────────────────────────────────────────────────
all_results = {}

# 키워드 베이스라인
print('[ 키워드 베이스라인 ]')
kw_retrieved = [retrieve_keyword(c['question']) for c in eval_cases]
kw_metrics   = compute_metrics(kw_retrieved, eval_cases)
all_results['keyword'] = {'name': '키워드 베이스라인', 'metrics': kw_metrics, 'encode_ms': 0}
print(f"  Hit@1={kw_metrics['hit1']:.3f}  Hit@3={kw_metrics['hit3']:.3f}  MRR={kw_metrics['mrr']:.3f}")
print()

# 임베딩 모델들
for m in EMBEDDING_MODELS:
    print(f'[ {m["name"]} ] 로딩 중...')
    try:
        t0 = time.time()
        model = SentenceTransformer(m['hf'], **m.get('kwargs', {}))
        load_ms = int((time.time() - t0) * 1000)

        # 코퍼스 인코딩
        t1 = time.time()
        corpus_emb = model.encode(corpus_texts, normalize_embeddings=True, show_progress_bar=False)
        encode_ms = int((time.time() - t1) * 1000)

        # 쿼리 인코딩 + 검색
        retrieved_list = []
        for case in eval_cases:
            q_emb = model.encode([case['question']], normalize_embeddings=True)[0]
            retrieved_list.append(retrieve_embedding(model, q_emb, corpus_emb))

        metrics = compute_metrics(retrieved_list, eval_cases)
        all_results[m['id']] = {
            'name':      m['name'],
            'hf':        m['hf'],
            'load_ms':   load_ms,
            'encode_ms': encode_ms,
            'metrics':   metrics,
        }
        print(f"  Hit@1={metrics['hit1']:.3f}  Hit@3={metrics['hit3']:.3f}  MRR={metrics['mrr']:.3f}  인코딩={encode_ms}ms")

        # 케이스별 검색 결과
        for detail in metrics['details']:
            mark = '✅' if detail['hit1'] else ('🟡' if detail['hit3'] else '❌')
            print(f"    {mark} {detail['id']}: 기대={detail['expected']}  검색={detail['retrieved']}")
        print()

    except Exception as e:
        print(f"  ❌ 오류: {e}\n")
        all_results[m['id']] = {'name': m['name'], 'error': str(e)}

# ── JSON 저장 ─────────────────────────────────────────────────────
OUTPUT_PATH.write_text(json.dumps(all_results, ensure_ascii=False, indent=2))
print(f'JSON 저장: {OUTPUT_PATH}')

# ── 마크다운 보고서 ───────────────────────────────────────────────
rows = []
for key, r in all_results.items():
    if 'error' in r:
        rows.append(f"| {r['name']} | 오류 | — | — | — |")
        continue
    m = r['metrics']
    enc = r.get('encode_ms', 0)
    rows.append(f"| {r['name']} | {m['hit1']:.3f} | {m['hit3']:.3f} | {m['mrr']:.3f} | {enc}ms |")

md = f"""# 임베딩 모델 비교 벤치마크

**실행일**: 2026-08-15
**평가 데이터**: terms.json ({len(terms_arr)}개 용어 + {len(docs_arr)}개 서류)
**평가 질문**: F3 테스트케이스 {len(eval_cases)}건 (rag_expected 항목 있는 케이스)
**검색 방식**: 코사인 유사도, top-3 반환

---

## 결과 요약

| 모델 | Hit@1 | Hit@3 | MRR | 코퍼스 인코딩 |
|---|---|---|---|---|
{chr(10).join(rows)}

> Hit@1: 정답이 1위로 검색된 비율
> Hit@3: 정답이 상위 3개 안에 있는 비율
> MRR: Mean Reciprocal Rank (순위 역수 평균)

---

## 케이스별 상세

"""

for key, r in all_results.items():
    if 'error' in r or 'metrics' not in r:
        continue
    md += f"### {r['name']}\n\n"
    md += "| 케이스 | 기대 항목 | 검색 결과 | Hit@1 | RR |\n"
    md += "|---|---|---|---|---|\n"
    for d in r['metrics']['details']:
        mark = '✅' if d['hit1'] else ('🟡' if d['hit3'] else '❌')
        md += f"| {d['id']} | {', '.join(d['expected'])} | {', '.join(d['retrieved'][:3])} | {mark} | {d['rr']} |\n"
    md += "\n"

REPORT_PATH.write_text(md)
print(f'보고서 저장: {REPORT_PATH}')

// 카테고리 자동 추천 — 할일마다 카테고리를 일일이 고르기 귀찮아서 도입.
// 외부 서비스 없이 **이미 카테고리를 붙여 둔 항목들의 제목**에서 배운다.
//   ① 제목에 카테고리 이름이 그대로 들어 있으면 그 카테고리 ('산업스터디 기사올리기' → 산업스터디)
//   ② 아니면 제목 단어가 과거에 어느 카테고리에 많이 쓰였는지 ('지삿 6회' → 예전 '지삿 5회'가 GSAT)
// 애매하면(1등이 2등의 두 배가 안 되면) 추천하지 않는다 — 틀리게 붙는 것보다 비어 있는 게 낫다.

// 한글은 맥 등에서 자모가 쪼개진 형태(NFD)로 저장되기도 해서, 눈에는 같아도 includes 가 실패했다
// ('산업스터디' 카테고리가 '산업스터디 기사올리기' 에 안 붙음) → 비교 전에 항상 NFC 로 맞추고
// 보이지 않는 글자(zero-width 등)도 뗀다.
const clean = s => String(s ?? '').normalize('NFC').replace(/[\u200b-\u200f\u2060\ufeff]/g, '').toLowerCase();
const norm = s => clean(s).replace(/\s+/g, '');

// '지삿 6회' → ['지삿'], '에이치씨엠 지원?' → ['에이치씨엠', '지원']
// 숫자·문장부호를 떼고 한 글자짜리는 버린다(조사·'회' 같은 잡음).
export function titleTokens(title) {
  return clean(title)
    .split(/[\s·,./?!()[\]{}:;'"~\-_+]+/)
    .map(w => w.replace(/\d+(회|차|번|개|장|일|주|시|분)?/g, ''))
    .filter(w => w.length >= 2);
}

// rows: [{ title, cat: { id } | null }] — 목록의 행(할일 + 카테고리 태스크), 완료한 것도 학습에 쓴다
export function buildCategoryIndex(rows) {
  const index = new Map(); // token -> Map(catId -> count)
  for (const r of rows) {
    if (!r.cat) continue;
    for (const t of new Set(titleTokens(r.title))) {
      if (!index.has(t)) index.set(t, new Map());
      const m = index.get(t);
      m.set(r.cat.id, (m.get(r.cat.id) ?? 0) + 1);
    }
  }
  return index;
}

// categories: 지금 고를 수 있는(완료 안 된) 카테고리 [{ id, name }]
// 돌려주는 값: 카테고리 id 또는 null
export function suggestCategory(title, index, categories) {
  if (!categories.length) return null;
  const active = new Set(categories.map(c => c.id));

  const t = norm(title);
  const byName = categories
    .filter(c => norm(c.name).length >= 2 && t.includes(norm(c.name)))
    .sort((a, b) => norm(b.name).length - norm(a.name).length);
  if (byName.length) return byName[0].id;

  // 같은 단어는 1점, 앞부분만 같은 단어는 0.5점 — 한국어는 붙여 쓰는 일이 많아서
  // ('기사올리기' ↔ 예전 '기사', '지삿6회차풀이' ↔ '지삿')
  const score = new Map();
  const add = (m, w) => { for (const [id, n] of m) if (active.has(id)) score.set(id, (score.get(id) ?? 0) + n * w); };
  for (const tok of new Set(titleTokens(title))) {
    const exact = index.get(tok);
    if (exact) { add(exact, 1); continue; }
    for (const [known, m] of index) {
      if (tok.startsWith(known) || known.startsWith(tok)) add(m, 0.5);
    }
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [best, second] = ranked;
  if (second && best[1] < second[1] * 2) return null;
  return best[0];
}

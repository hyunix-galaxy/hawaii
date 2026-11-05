// 추천 음식 카드 사진 중계 — 구글 지도(Places API New) 키는 Vercel 비밀 설정(GOOGLE_PLACES_KEY)에만 있음
//   요청: /api/food-photo?q=<카드의 장소 검색어>  →  { img, author, authorUri, mapsUri }
//   허용 목록(_food-queries.mjs)에 있는 검색어만 처리 (build.sh가 index.html의 추천 음식에서 자동 생성)
import QUERIES from './_food-queries.mjs';

const ALLOWED = new Set(QUERIES);
const ORIGINS = /^https:\/\/(hawaii-seven\.vercel\.app|hawaii-[a-z0-9-]+-aniac1\.vercel\.app)(\/|$)/;

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '');
  const from = req.headers.origin || req.headers.referer || '';
  if (!ALLOWED.has(q)) return res.status(400).json({ error: 'unknown place' });
  if (from && !ORIGINS.test(from)) return res.status(403).json({ error: 'forbidden' });
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return res.status(500).json({ error: 'no key' });
  try {
    const s = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.photos,places.googleMapsUri' },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1, languageCode: 'ko', locationBias: { circle: { center: { latitude: 21.45, longitude: -157.97 }, radius: 50000 } } })
    });
    if (!s.ok) return res.status(502).json({ error: 'search ' + s.status });
    const place = ((await s.json()).places || [])[0];
    const ph = place && place.photos && place.photos[0];
    if (!ph) { res.setHeader('Cache-Control', 's-maxage=3600'); return res.status(200).json({ img: null, mapsUri: (place && place.googleMapsUri) || '' }); }
    const m = await fetch(`https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=320&maxHeightPx=320&skipHttpRedirect=true&key=${key}`);
    if (!m.ok) return res.status(502).json({ error: 'photo ' + m.status });
    const { photoUri } = await m.json();
    const a = (ph.authorAttributions || [])[0] || {};
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ img: photoUri || null, author: a.displayName || '', authorUri: a.uri || '', mapsUri: place.googleMapsUri || '' });
  } catch (e) {
    return res.status(502).json({ error: 'fetch failed' });
  }
}

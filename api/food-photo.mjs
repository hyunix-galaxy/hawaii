// 추천 음식 카드 사진 중계 — 구글 지도(Places API New) 키는 Vercel 비밀 설정(GOOGLE_PLACES_KEY)에만 있음
//   1) 사진 목록: /api/food-photo?q=<카드의 장소 검색어>
//        &i=<보여 줄 사진 번호>를 붙이면 그 사진 주소(img)도 한 번에 돌려줌 (왕복 1번 절약)
//        → { mapsUri, photos: [{ name, author, authorUri }], i, img }   (장소 번호가 있으면 '장소 정보' 1회, 없으면 '장소 검색' 1회 · 6시간 재사용)
//   2) 사진 한 장: /api/food-photo?q=<검색어>&p=<목록의 name>
//        → { img }                                             (사진 1회 · 장소 검색은 다시 하지 않음)
//   허용 목록(_food-queries.mjs)에 있는 검색어만 처리 (build.sh가 index.html의 추천 음식 query + 일정 mapQuery에서 자동 생성)
import QUERIES from './_food-queries.mjs';
import PLACE_IDS from './_place-ids.mjs';

const ALLOWED = new Set(QUERIES);
const ORIGINS = /^https:\/\/(hawaii-seven\.vercel\.app|hawaii-[a-z0-9-]+-aniac1\.vercel\.app)(\/|$)/;
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

async function photoUri(key, name) {
  const m = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&maxHeightPx=800&skipHttpRedirect=true&key=${key}`);
  if (!m.ok) { const e = new Error('photo ' + m.status); e.status = m.status; throw e; }
  return (await m.json()).photoUri || null;
}

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '');
  const p = String((req.query && req.query.p) || '');
  const from = req.headers.origin || req.headers.referer || '';
  if (!ALLOWED.has(q)) return res.status(400).json({ error: 'unknown place' });
  if (from && !ORIGINS.test(from)) return res.status(403).json({ error: 'forbidden' });
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return res.status(500).json({ error: 'no key' });
  try {
    if (p) {
      if (!PHOTO_NAME.test(p)) return res.status(400).json({ error: 'bad photo' });
      let img;
      try { img = await photoUri(key, p); } catch (e) { console.log('google photo', e.status, q); return res.status(e.status === 429 ? 429 : 502).json({ error: e.message }); }
      res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=3600');
      return res.status(200).json({ img });
    }
    let place = null;
    const gid = PLACE_IDS[q];
    if (gid) {
      const d = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(gid)}`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,photos,googleMapsUri' } });
      if (d.ok) place = await d.json();
      else console.log('google details', d.status, q);
    }
    if (!place) {
    const s = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.photos,places.googleMapsUri' },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1, languageCode: 'ko', locationBias: { circle: { center: { latitude: 21.45, longitude: -157.97 }, radius: 50000 } } })
    });
    if (!s.ok) { console.log('google search', s.status, q); return res.status(s.status === 429 ? 429 : 502).json({ error: 'search ' + s.status }); }
    place = ((await s.json()).places || [])[0];
    if (place && place.id) console.log('place-id', JSON.stringify([q, place.id]));
    }
    const photos = ((place && place.photos) || []).slice(0, 10).map(ph => {
      const a = (ph.authorAttributions || [])[0] || {};
      return { name: ph.name, author: a.displayName || '', authorUri: a.uri || '' };
    });
    const want = req.query && req.query.i != null ? Math.max(0, Math.min(photos.length - 1, parseInt(req.query.i, 10) || 0)) : -1;
    let img = null;
    if (want >= 0 && photos[want]) { try { img = await photoUri(key, photos[want].name); } catch (e) { console.log('google photo', e.status, q); } }
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json({ mapsUri: (place && place.googleMapsUri) || '', photos, i: want, img });
  } catch (e) {
    return res.status(502).json({ error: 'fetch failed' });
  }
}

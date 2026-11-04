// 하와이 포털 서비스 워커
// - 화면(HTML): 네트워크 우선, 3초 안에 응답이 없으면(약한 신호) 저장본을 먼저 보여 줌
// - 같은 사이트 파일(스타일·지도 이미지·라이브러리): 저장본을 바로 쓰고 뒤에서 새 파일로 갱신
//   → 같은 이름으로 이미지를 바꿔도 다음번 열 때 반영됨
// - 글꼴·배경 사진·지도 타일: 한 번 받으면 저장해 두고 재사용 (현지 데이터 절약 · 오프라인)
// - Supabase(정산 데이터)·날씨 API: 저장하지 않음 (항상 최신)
const VERSION = '202611041345';
const CACHE = 'hawaii-portal-' + VERSION;
const RUNTIME = 'hawaii-runtime-v1';
const TILES = 'hawaii-tiles-v1';
const TILE_LIMIT = 400;
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/tailwind.css?v=' + VERSION,
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/vendor/supabase.js',
  '/road-legs.json?v=' + VERSION,
  '/resort-map-v.webp',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hawaii-portal-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirstWithTimeout(req, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const fallback = () => caches.match('/index.html').then((hit) => hit);
    const timer = setTimeout(() => {
      fallback().then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } });
    }, ms);
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)); }
      clearTimeout(timer);
      if (!settled) { settled = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fallback().then((hit) => { if (!settled) { settled = true; resolve(hit || Response.error()); } });
    });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then((c) => c.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
}

function cacheFirst(req, cacheName, limit) {
  return caches.open(cacheName).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      c.put(req, res.clone());
      if (limit) c.keys().then((keys) => { if (keys.length > limit) keys.slice(0, keys.length - limit).forEach((k) => c.delete(k)); });
    }
    return res;
  })));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 실시간 데이터는 항상 네트워크
  if (url.hostname.endsWith('supabase.co') && !url.pathname.includes('/storage/v1/object/public/site-assets/')) return;
  if (url.hostname.includes('open-meteo.com')) return;

  // 화면(HTML)
  if (req.mode === 'navigate' || (url.origin === self.location.origin && url.pathname.endsWith('.html'))) {
    event.respondWith(networkFirstWithTimeout(req, 3000));
    return;
  }

  // 같은 사이트 파일 + 고해상도 영문 지도
  if (url.origin === self.location.origin || url.pathname.includes('/storage/v1/object/public/site-assets/')) {
    event.respondWith(staleWhileRevalidate(req, CACHE));
    return;
  }

  // 글꼴(jsDelivr) · 배경 사진(Unsplash)
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'images.unsplash.com') {
    event.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  // 지도 타일 (최근 400장까지)
  if (url.hostname.endsWith('tile.openstreetmap.org') || url.hostname === 'server.arcgisonline.com') {
    event.respondWith(cacheFirst(req, TILES, TILE_LIMIT));
  }
});

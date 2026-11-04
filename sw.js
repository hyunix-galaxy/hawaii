// 하와이 포털 서비스 워커
// - 화면(HTML)은 항상 네트워크 우선 → 수정·재배포 내용이 바로 반영되고, 오프라인일 때만 저장본 사용
// - 지도 이미지·아이콘 등 정적 파일은 저장본 우선 (현지 데이터 절약)
// - Supabase(정산 데이터)·날씨 API는 저장하지 않음
const CACHE = 'hawaii-portal-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 실시간 데이터는 항상 네트워크
  if (url.hostname.endsWith('supabase.co') && !url.pathname.includes('/storage/v1/object/public/site-assets/')) return;
  if (url.hostname.includes('open-meteo.com')) return;

  // 화면(HTML): 네트워크 우선, 실패 시 저장본
  if (req.mode === 'navigate' || (url.origin === self.location.origin && url.pathname.endsWith('.html'))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 같은 사이트 정적 파일 + 고해상도 영문 지도: 저장본 우선
  const isStatic = url.origin === self.location.origin ||
    url.pathname.includes('/storage/v1/object/public/site-assets/');
  if (isStatic) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});

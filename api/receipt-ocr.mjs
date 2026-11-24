// 영수증 사진 자동 인식 (Claude 비전) — 정산 탭 '영수증 촬영'에서 사용
//   POST /api/receipt-ocr   body: { code: '<입장 코드 6자리>', image: '<JPEG base64, data: 머리말 없이>' }
//   → { merchant, total, subtotal, tax, tip, tipHandwritten, tipBlank, date, model }
//   · Anthropic 키는 Vercel 비밀 설정(ANTHROPIC_API_KEY)에만 있음 — 브라우저로는 나가지 않음
//   · 입장 코드는 Supabase check_trip_code 로 확인 (틀린 횟수 제한도 그쪽 규칙을 그대로 따름)
//   · 사진은 인식에만 쓰고 여기서는 저장하지 않음

const MODELS = ['claude-sonnet-5-5', 'claude-sonnet-4-6']; // 앞 모델이 안 되면 다음 모델로
const MAX_B64 = 4 * 1024 * 1024;                           // 화면에서 1600px로 줄여 보내므로 넉넉함
const ORIGINS = /^https:\/\/(hawaii-seven\.vercel\.app|hawaii-[a-z0-9-]+-aniac1\.vercel\.app)(\/|$)/;

// 같은 서버 인스턴스 안에서만 세는 간단한 호출 제한 (남용 방지용 1차 방어)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 20;
  const a = (hits.get(ip) || []).filter(t => now - t < win);
  a.push(now); hits.set(ip, a);
  if (hits.size > 5000) hits.clear();
  return a.length > max;
}

const PROMPT = `You read a photo of a receipt from a trip to Hawaii (USD). The photo may contain a printed receipt, a credit-card slip with a handwritten tip and total, or both.
Return ONLY a JSON object, no prose, with these keys:
{
  "merchant": string|null,        // store or restaurant name as printed (short, e.g. "Marukame Udon Waikiki")
  "subtotal": number|null,        // before tax
  "tax": number|null,
  "tip": number|null,             // tip/gratuity actually added (printed service charge or handwritten tip)
  "tipHandwritten": boolean,      // true if the tip or final total was written by hand
  "tipBlank": boolean,            // true if a card slip has an empty TIP line and no written total
  "total": number|null,           // the FINAL amount the customer paid: handwritten total if present, otherwise the grand total / amount charged
  "date": string|null             // purchase date as MM/DD/YYYY if visible
}
Rules: never invent numbers; use null when unreadable. Ignore "suggested tip" tables (15%/18%/20% examples) unless one is clearly circled or written in. If several totals appear, prefer the handwritten total, then the card "AMOUNT"/"TOTAL" charged, then GRAND TOTAL. Amounts are plain numbers without "$".`;

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
}

async function checkCode(code) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { error: 'no supabase' };
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/check_trip_code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_code: code })
  });
  if (r.ok) return { ok: (await r.json()) === true };
  const t = await r.text();
  if (/P0429|too_many_attempts/.test(t)) return { locked: true };
  return { error: 'code check ' + r.status };
}

async function readReceipt(apiKey, image) {
  let lastErr = null;
  for (const model of MODELS) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: PROMPT }
        ] }]
      })
    });
    if (r.status === 404 || r.status === 400) { lastErr = new Error(model + ' ' + r.status); console.log('anthropic', model, r.status, (await r.text()).slice(0, 200)); continue; }
    if (!r.ok) { const e = new Error('anthropic ' + r.status); e.status = r.status; throw e; }
    const out = await r.json();
    const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json');
    return { data: JSON.parse(m[0]), model };
  }
  throw lastErr || new Error('no model');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const from = req.headers.origin || req.headers.referer || '';
  if (from && !ORIGINS.test(from)) return res.status(403).json({ error: 'forbidden' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'too many' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  const code = String(body.code || '');
  const image = String(body.image || '');
  if (!/^\d{6}$/.test(code)) return res.status(401).json({ error: 'code' });
  if (!image || image.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(image)) return res.status(400).json({ error: 'image' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'no key' });

  try {
    const c = await checkCode(code);
    if (c.locked) return res.status(429).json({ error: 'locked' });
    if (c.error) return res.status(502).json({ error: c.error });
    if (!c.ok) return res.status(401).json({ error: 'code' });

    const { data, model } = await readReceipt(apiKey, image);
    const merchant = typeof data.merchant === 'string' ? data.merchant.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    const dm = String(data.date || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    return res.status(200).json({
      merchant,
      total: num(data.total),
      subtotal: num(data.subtotal),
      tax: num(data.tax),
      tip: num(data.tip),
      tipHandwritten: data.tipHandwritten === true,
      tipBlank: data.tipBlank === true,
      date: dm ? `${+dm[1]}/${+dm[2]}/${dm[3]}` : null,
      model
    });
  } catch (e) {
    console.log('receipt-ocr', e.message);
    return res.status(e.status === 429 ? 429 : 502).json({ error: 'read failed' });
  }
}

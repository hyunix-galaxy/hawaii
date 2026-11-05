// index.html의 추천 음식(FOOD_PICKS)에서 query 값을 모아 api/_food-queries.mjs 를 만든다
import fs from 'node:fs';
const html = fs.readFileSync(process.argv[2], 'utf8');
const start = html.indexOf('const FOOD_PICKS = [');
const end = html.indexOf('\n  ];', start);
const block = html.slice(start, end);
const qs = [...block.matchAll(/query:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)].map(m => (m[1] ?? m[2]).replace(/\\(.)/g, '$1'));
fs.writeFileSync(process.argv[3], '// 자동 생성 (build.sh) — 직접 고치지 마세요\nexport default ' + JSON.stringify([...new Set(qs)], null, 1) + ';\n');
console.log('food queries:', qs.length);

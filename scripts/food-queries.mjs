// index.html의 추천 음식(FOOD_PICKS) query + 일정의 mapQuery 값을 모아 api/_food-queries.mjs 를 만든다 (사진 중계 허용 목록)
import fs from 'node:fs';
const html = fs.readFileSync(process.argv[2], 'utf8');
const lit = (m) => (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
const start = html.indexOf('const FOOD_PICKS = [');
const end = html.indexOf('\n  ];', start);
const block = html.slice(start, end);
const food = [...block.matchAll(/query:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)].map(lit);
const plan = [...html.matchAll(/mapQuery:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)].map(lit);
const all = [...new Set(food.concat(plan))];
fs.writeFileSync(process.argv[3], '// 자동 생성 (build.sh) — 직접 고치지 마세요\nexport default ' + JSON.stringify(all, null, 1) + ';\n');
console.log('food queries:', food.length, '· plan places:', new Set(plan).size, '· total:', all.length);

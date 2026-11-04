#!/usr/bin/env bash
# 배포 전 실행: 화면 스타일(tailwind.css) 다시 만들기 + 저장소(서비스 워커) 버전 올리기
set -e
cd "$(dirname "$0")"
BUILD=$(date -u +%Y%m%d%H%M)
npx --yes tailwindcss@3.4.17 -c tailwind.config.js -i tailwind.in.css -o tailwind.css --minify
sed -i -E "s#/tailwind\.css\?v=[A-Za-z0-9_]+#/tailwind.css?v=${BUILD}#" index.html
sed -i -E "s#^const VERSION = '[^']*';#const VERSION = '${BUILD}';#" sw.js
echo "build ${BUILD}"

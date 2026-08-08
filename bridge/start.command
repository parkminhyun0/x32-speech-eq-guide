#!/bin/zsh
set -e
cd "$(dirname "$0")/.."

clear
printf "\nX32 Read-Only Bridge · 내일 현장 테스트\n"
printf "========================================\n\n"

if ! command -v node >/dev/null 2>&1; then
  printf "Node.js가 없습니다. Node.js 22 LTS를 먼저 설치하세요.\n"
  printf "설치 후 이 파일을 다시 실행하세요.\n\n"
  read "?Enter를 누르면 종료합니다."
  exit 1
fi

printf "Node: "
node --version
printf "\n의존성 확인과 앱 빌드를 시작합니다.\n"
npm install --no-audit --no-fund
npm run bridge:start

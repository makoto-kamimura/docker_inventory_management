# Next.js 16 (React 19) 用イメージ。
# WEB_MODE=production (default): コンテナ起動時に `next build` → `next start`
# WEB_MODE=dev               : `next dev` でホットリロード
# どちらも HOST=0.0.0.0 / PORT=3000 が Next.js 16 のデフォルト。
FROM node:22-alpine

WORKDIR /app

# 依存関係インストール (キャッシュ層)
COPY package.json package-lock.json ./
RUN npm ci

# ソース。compose 側で bind mount するため上書きされる想定。
# それでも image 単体で動くようコピーしておく。
COPY . .

EXPOSE 3000

# WEB_MODE で起動方法を切替。
# - production: 起動毎に build が走る (ソースが bind mount されるため安全側)。
# - dev       : next dev で HMR。
CMD ["sh", "-c", "if [ \"$WEB_MODE\" = \"dev\" ]; then npm run dev; else npm run build && npm run start; fi"]

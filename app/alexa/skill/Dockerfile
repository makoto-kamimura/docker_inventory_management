# Alexa スキルの自サーバー (方式 B)。ハンドラーは Lambda (方式 A) と同じ lib/ を使う
# ビルドコンテキスト: app/alexa/skill/
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# lockfile どおりに入れる (起動のたびに npm install しない)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js server.js ./
COPY lib ./lib

USER node
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3002}/healthz >/dev/null || exit 1

CMD ["node", "server.js"]

FROM ghcr.io/puppeteer/puppeteer:25

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prerender-server.js ./
COPY src/ ./src/
COPY config.json.sample ./

ENV NODE_ENV=production \
    LOG_LEVEL=info \
    CACHE_DIR=/app/cache

RUN mkdir -p /app/cache

EXPOSE 3001

CMD ["node", "prerender-server.js"]

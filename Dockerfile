# syntax=docker/dockerfile:1
FROM node:22-slim AS base

# Chromium and its runtime dependencies (used by Puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxrandr2 \
      libxshmfence1 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Install dependencies (separate layer so it caches unless package.json changes)
COPY package.json bun.lock* package-lock.json* ./
RUN npm install --omit=dev

# Copy application source
COPY server.js ./
COPY server/ ./server/
COPY src/ ./src/
COPY public/ ./public/

# Create runtime directories owned by appuser before dropping privileges
# data/ and uploads/ are mounted as volumes; mkdir ensures the mount points exist
RUN useradd -m appuser \
    && mkdir -p data uploads/slides uploads/temp \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

CMD ["node", "server.js"]

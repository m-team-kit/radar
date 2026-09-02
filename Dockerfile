# syntax=docker/dockerfile:1

# --- Dependencies ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Runtime ---
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY scripts/set-env.mjs ./scripts/set-env.mjs
# Bootstrap a default config so the container can start; mount your own
# config and set RADAR_CONFIG to override it.
COPY config/radar.example.yaml ./config/radar.example.yaml
COPY config/radar.example.yaml ./config/radar.yaml
ENV RADAR_CONFIG=/app/config/radar.yaml
RUN mkdir -p /app/data && chown -R node:node /app
EXPOSE 3000
USER node
CMD ["node", "--import", "./scripts/set-env.mjs", "build"]

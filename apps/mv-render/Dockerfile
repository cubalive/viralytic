# mv-render worker — Node 22 + ffmpeg. Standalone service (no @viralytic
# workspace deps), run via tsx at runtime (no dist build). Build context is
# this folder (apps/mv-render) — set the Railway service Root Directory here.
# Node 22 (not 20): @supabase/realtime-js needs native WebSocket (Node 22+).
FROM node:22-slim

# ffmpeg is required for assembly; ca-certificates for HTTPS fetches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps with npm (runs esbuild's build script — pnpm v11 refuses to,
# which broke the build). Standalone: no workspace deps.
COPY package.json ./
RUN npm install

# App source (tsconfig + src). Runs via tsx — no compile step.
COPY . .

# Worker: no HTTP port, just the infinite poll loop.
CMD ["npm", "start"]

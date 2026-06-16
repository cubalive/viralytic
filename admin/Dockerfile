# Worker de producción (Railway). Node + ffmpeg + fuentes (incl. chino).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      fonts-dejavu-core \
      fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Fuentes para el texto en pantalla (Linux)
ENV FONT_LATIN=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
ENV FONT_CJK=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
ENV NODE_ENV=production

EXPOSE 8080
CMD ["npx", "tsx", "src/worker.ts"]

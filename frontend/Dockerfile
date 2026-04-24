FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .

EXPOSE 3000
CMD ["sh", "-c", "npm install && npm run dev -- --hostname 0.0.0.0 --port 3000"]

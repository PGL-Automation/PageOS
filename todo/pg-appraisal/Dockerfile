FROM node:20-bookworm-slim

# better-sqlite3 compiles natively; needs build tools at install time
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# data volume holds the SQLite DB and the code sheet
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8080
# Seed once on first run:  docker compose run --rm app npm run seed
CMD ["node", "server/server.js"]

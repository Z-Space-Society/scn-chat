FROM node:24-slim

# better-sqlite3 falls back to building from source when no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

ENV DATA_DIR=/data \
  DATABASE_URL=sqlite:/data/scn-chat.sqlite
VOLUME /data
EXPOSE 3000
CMD ["pnpm", "start"]

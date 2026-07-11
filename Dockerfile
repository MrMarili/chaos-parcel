# Chaos Parcel — multi-stage image for Render Free (SPA + WebSocket)
FROM node:20-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY client ./client
COPY server ./server

RUN pnpm --filter @chaos-parcel/shared build \
  && pnpm --filter @chaos-parcel/client build \
  && pnpm --filter @chaos-parcel/server build

# --- runtime ---
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV SERVE_CLIENT=true
ENV HOST=0.0.0.0

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY client/package.json ./client/
COPY server/package.json ./server/

# Production deps only (workspace links still needed for @chaos-parcel/shared)
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/dist ./server/dist

# shared package "main" points at dist — ensure package.json exports are intact
WORKDIR /app/server

# Render injects PORT (default 10000)
EXPOSE 10000
CMD ["node", "dist/index.js"]

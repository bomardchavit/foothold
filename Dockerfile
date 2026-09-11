# Foothold server. Build from the repo root: docker build -t foothold .
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared/package.json packages/shared/
# The desktop shell is not part of the server image; skipping its postinstall keeps Electron out of the build.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --no-audit --no-fund --omit=optional

FROM deps AS build
ARG GIT_SHA=""
ARG BUILD_TIME=""
ENV GIT_SHA=$GIT_SHA BUILD_TIME=$BUILD_TIME
COPY . .
RUN npm run build -w apps/web

FROM node:22-bookworm-slim AS run
ARG GIT_SHA=""
ENV NODE_ENV=production GIT_SHA=$GIT_SHA STORAGE_DIR=/data/storage
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /data/storage
COPY --from=build /app ./
EXPOSE 3000
# Migrations run at boot so a deploy never needs a separate step.
CMD ["sh", "-c", "npm run db:migrate -w apps/web && npm run start -w apps/web"]

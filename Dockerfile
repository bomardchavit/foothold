# Foothold web app (Next.js) — build with `docker build -t foothold .` from the repo root.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build -w apps/web

FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate -w apps/web && npm run start -w apps/web"]

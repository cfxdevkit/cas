# Build context: ../  (the "repos" directory containing conflux-cas and conflux-sdk)
# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN npm install -g pnpm@9
WORKDIR /repos

# Copy workspace manifests
COPY conflux-cas/pnpm-workspace.yaml ./conflux-cas/pnpm-workspace.yaml
COPY conflux-cas/package.json         ./conflux-cas/package.json
COPY conflux-cas/pnpm-lock.yaml       ./conflux-cas/pnpm-lock.yaml
COPY conflux-cas/shared/package.json  ./conflux-cas/shared/package.json
COPY conflux-cas/contracts/package.json ./conflux-cas/contracts/package.json
COPY conflux-cas/backend/package.json   ./conflux-cas/backend/package.json
# SDK (local path dep)
COPY conflux-sdk/package.json ./conflux-sdk/package.json

WORKDIR /repos/conflux-cas
RUN pnpm install --frozen-lockfile --filter @conflux-cas/backend

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /repos
COPY conflux-sdk ./conflux-sdk
COPY conflux-cas/shared   ./conflux-cas/shared
COPY conflux-cas/contracts ./conflux-cas/contracts
COPY conflux-cas/backend   ./conflux-cas/backend
COPY conflux-cas/tsconfig.base.json ./conflux-cas/tsconfig.base.json

WORKDIR /repos/conflux-case
RUN pnpm --filter @conflux-cas/shared build
RUN pnpm --filter @conflux-cas/backend build

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=builder /repos/conflux-cas/backend/dist        ./dist
COPY --from=builder /repos/conflux-cas/backend/package.json ./package.json
COPY --from=builder /repos/conflux-cas/node_modules         ./node_modules

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]

# Build context: ../  (the "repos" directory containing conflux-cas and conflux-sdk)
# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN npm install -g pnpm@9
WORKDIR /repos

COPY conflux-cas/pnpm-workspace.yaml  ./conflux-cas/pnpm-workspace.yaml
COPY conflux-cas/package.json          ./conflux-cas/package.json
COPY conflux-cas/pnpm-lock.yaml        ./conflux-cas/pnpm-lock.yaml
COPY conflux-cas/shared/package.json   ./conflux-cas/shared/package.json
COPY conflux-cas/frontend/package.json ./conflux-cas/frontend/package.json
COPY conflux-sdk/package.json          ./conflux-sdk/package.json

WORKDIR /repos/conflux-cas
RUN pnpm install --frozen-lockfile --filter @conflux-cas/frontend

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /repos
COPY conflux-sdk              ./conflux-sdk
COPY conflux-cas/shared       ./conflux-cas/shared
COPY conflux-cas/frontend     ./conflux-cas/frontend
COPY conflux-cas/tsconfig.base.json ./conflux-cas/tsconfig.base.json

WORKDIR /repos/conflux-cas
RUN pnpm --filter @conflux-cas/shared build
RUN pnpm --filter @conflux-cas/frontend build

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN npm install -g pnpm@9
WORKDIR /app
COPY --from=builder /repos/conflux-cas/frontend/.next          ./.next
COPY --from=builder /repos/conflux-cas/frontend/public         ./public
COPY --from=builder /repos/conflux-cas/frontend/package.json   ./package.json
COPY --from=builder /repos/conflux-cas/node_modules            ./node_modules

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "node_modules/.bin/next", "start", "-p", "3000"]

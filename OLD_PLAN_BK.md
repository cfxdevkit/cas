# Project Plan: conflux-sdk + conflux-cas

**Date:** 2026-02-19  
**Bounty:** #08 – Conflux Automation Site ($1,000)  
**Timeline:** 4 weeks  

---

## Executive Summary

Two repositories will be created from the existing `conflux-devkit` monorepo:

| Repo | Purpose | Status |
|------|---------|--------|
| `conflux-sdk` | Clean reusable library derived from `conflux-devkit`; published as `@cfxdevkit/sdk` | New (extracted & refactored) |
| `conflux-cas` | Conflux Automation Site – the actual bounty deliverable | New (empty, to be built) |

`conflux-cas` will consume `@cfxdevkit/sdk` as an external npm dependency, keeping the two concerns separated.

---

## Part 1 — `conflux-sdk` (Common Library)

### What it is

A single, well-scoped npm package (`@cfxdevkit/sdk`) that extracts the production-useful pieces of `conflux-devkit` and exposes them as a public API.  
It replaces the messy multi-package monorepo with one clean publishable library.

### What to keep / extract

| Source package | Modules to extract | Notes |
|---|---|---|
| `@conflux-devkit/core` | `ClientManager`, `CoreClient`, `EspaceClient`, chain configs, types, utils | Keep 100% – this is already clean |
| `@conflux-devkit/contracts` | `ContractDeployer`, `ContractReader`, `ContractWriter`, standard ABIs | Keep 100% |
| `@conflux-devkit/wallet` | `SessionKeyManager`, `TransactionBatcher`, `EmbeddedWalletManager` | Keep – useful for permit handling in CAS |
| `@conflux-devkit/backend` | `KeystoreService`, `EncryptionService`, `AuthService`, `SwapService`, `WalletService`, `TransactionService` | Extract only services; drop CLI/MCP/DevNode/plugin-devnode routes |
| `@conflux-devkit/ui-headless` | React hooks (`useConflux`, `useWallet`, `useBalance`, etc.) and headless providers | Keep – useful for CAS frontend |

### What to DROP (not included in the SDK)

- `plugin-devnode` (local devnode management – dev-only tooling)
- Backend CLI binary and MCP server
- Frontend (the devkit dashboard)
- Docker/devcontainer setup files
- All dev-node-specific routes and services
- WebSocket streaming server (too opinionated; CAS will have its own)

### Repository Structure

```
conflux-sdk/
├── package.json                  # Single npm package: @cfxdevkit/sdk
├── tsconfig.json
├── tsup.config.ts               # bundled ESM + CJS + .d.ts
├── biome.json
├── vitest.config.ts
├── README.md
├── LICENSE                      # Apache 2.0
├── CHANGELOG.md
├── src/
│   ├── index.ts                 # Main barrel export
│   ├── clients/                 # From @conflux-devkit/core
│   │   ├── core.ts
│   │   ├── evm.ts
│   │   ├── manager.ts
│   │   └── index.ts
│   ├── config/                  # Chain configs
│   │   ├── chains.ts
│   │   └── index.ts
│   ├── contracts/               # From @conflux-devkit/contracts
│   │   ├── abis/
│   │   ├── deployer.ts
│   │   ├── reader.ts
│   │   ├── writer.ts
│   │   └── index.ts
│   ├── wallet/                  # From @conflux-devkit/wallet
│   │   ├── session-keys.ts
│   │   ├── batcher.ts
│   │   ├── embedded.ts
│   │   └── index.ts
│   ├── services/                # From @conflux-devkit/backend (services only)
│   │   ├── keystore.ts
│   │   ├── encryption.ts
│   │   ├── auth.ts
│   │   ├── swap.ts
│   │   ├── wallet.ts
│   │   ├── transaction.ts
│   │   └── index.ts
│   ├── hooks/                   # From @conflux-devkit/ui-headless
│   │   ├── useConflux.ts
│   │   ├── useWallet.ts
│   │   ├── useBalance.ts
│   │   ├── useContract.ts
│   │   └── index.ts
│   ├── providers/               # React context providers
│   │   ├── ConfluxProvider.tsx
│   │   └── index.ts
│   └── types/
│       └── index.ts
└── tests/
    ├── clients.test.ts
    ├── contracts.test.ts
    ├── services.test.ts
    └── hooks.test.ts
```

### Subpath Exports (package.json)

```json
{
  "exports": {
    ".":            "dist/index.js",        // full barrel
    "./clients":    "dist/clients/index.js",
    "./config":     "dist/config/index.js",
    "./contracts":  "dist/contracts/index.js",
    "./wallet":     "dist/wallet/index.js",
    "./services":   "dist/services/index.js",
    "./hooks":      "dist/hooks/index.js",
    "./providers":  "dist/providers/index.js"
  }
}
```

### SDK Phase Steps

#### SDK-1: Repository bootstrap
- Init repo `conflux-sdk` with pnpm, TypeScript 5, Biome, Vitest
- Copy `tsconfig.base.json` and dev tooling from `conflux-devkit`
- Set up `tsup.config.ts` for single-package build (ESM + CJS + types)

#### SDK-2: Copy & clean `clients` module
- Copy `packages/core/src/clients/` → `src/clients/`
- Copy `packages/core/src/config/` → `src/config/`
- Copy `packages/core/src/types/` → `src/types/`
- Copy `packages/core/src/utils/` → `src/utils/`
- Remove all dev-node references and plugin hooks
- Fix import paths (`.js` extensions, no workspace aliases)
- Verify: `tsc --noEmit` passes

#### SDK-3: Copy & clean `contracts` module
- Copy `packages/contracts/src/` → `src/contracts/`
- Flatten directory (no sub-index files needed)
- Keep: `abis/`, `deployer/`, `interaction/`, `types/`
- Remove Solidity compiler wrapper (heavy dep; CAS will use Hardhat directly)
- Verify build passes

#### SDK-4: Copy & clean `wallet` module
- Copy `packages/wallet/src/` → `src/wallet/`
- Keep session-keys, batching, embedded wallet
- Simplify types; remove unfinished stubs

#### SDK-5: Extract `services` module
- Copy only the service files from `packages/backend/src/services/`:
  - `keystore-service.ts` → `src/services/keystore.ts`
  - `encryption-service.ts` → `src/services/encryption.ts`
  - `wallet-service.ts` → `src/services/wallet.ts`
  - `transaction-service.ts` → `src/services/transaction.ts`
  - `swap-service.ts` → `src/services/swap.ts`
- Remove all Express/route/auth coupling from these services
- Make them standalone, framework-agnostic classes

#### SDK-6: Copy & clean `hooks` module
- Copy `packages/ui-headless/src/hooks/` → `src/hooks/`
- Copy `packages/ui-headless/src/providers/` → `src/providers/`
- Strip Mantine/ConnectKit-specific imports; make them wagmi/viem-only
- Mark React modules as side-effect-free

#### SDK-7: Single barrel `src/index.ts`
- Re-export everything with clear namespacing
- Add JSDoc to all public symbols

#### SDK-8: Tests
- Unit tests for all modules (≥70% coverage as per bounty rules)
- Integration test that creates a `ClientManager` against eSpace testnet RPC

#### SDK-9: Documentation
- `README.md` with installation, quick-start, API reference
- Architecture diagram (Mermaid)
- Publish workflow (GitHub Actions → npm)

---

## Part 2 — `conflux-cas` (Conflux Automation Site)

### Architecture

```
conflux-cas/
├── contracts/        # Solidity – Hardhat project
├── worker/           # Node.js execution worker service
├── backend/          # Express API (job CRUD, auth, DB)
├── frontend/         # Next.js 14 app (App Router)
├── shared/           # Shared TypeScript types used across all layers
├── docs/             # Architecture diagrams, deployment guide
├── docker-compose.yml
└── .env.example
```

External dependency: `@cfxdevkit/sdk` from `conflux-sdk` repo.

### Layers

#### Layer 1 – Smart Contracts (`contracts/`)
Solidity on Conflux eSpace (EVM-compatible).  
Framework: Hardhat + OpenZeppelin 5.

```
contracts/
├── hardhat.config.ts
├── package.json
├── contracts/
│   ├── AutomationManager.sol    # Core job manager
│   ├── PriceAdapter.sol         # On-chain DEX price query interface
│   ├── PermitHandler.sol        # EIP-2612 permit validation helper
│   └── interfaces/
│       ├── IAutomationManager.sol
│       └── IPriceAdapter.sol
├── scripts/
│   ├── deploy.ts
│   └── verify.ts
└── test/
    ├── AutomationManager.test.ts
    └── PermitHandler.test.ts
```

**`AutomationManager.sol` interface:**

```solidity
struct Job {
    address owner;
    JobType jobType;      // LIMIT_BUY | LIMIT_SELL | DCA
    address tokenIn;
    address tokenOut;
    uint256 amountPerExecution;
    uint256 targetPrice;   // 0 for DCA jobs
    uint256 interval;      // seconds between executions (DCA)
    uint256 maxSlippage;   // bps
    uint256 executions;    // total executions done
    uint256 maxExecutions; // 0 = unlimited
    uint256 lastExecuted;
    bool active;
}

function createJob(Job calldata params, bytes calldata permitSig) external;
function cancelJob(uint256 jobId) external;
function executeJob(uint256 jobId) external;   // called by worker
function pause() external onlyOwner;           // global pause
function unpause() external onlyOwner;
```

Safety properties:
- `Pausable` from OpenZeppelin (global circuit breaker)
- Per-job cancel (owner-only)
- Slippage guard: revert if actual price deviates > `maxSlippage` bps
- No token custody: approvals/permits are per-execution, not deposited
- `ReentrancyGuard` on `executeJob`
- Executor role (only approved worker address can call `executeJob`)

#### Layer 2 – Execution Worker (`worker/`)

Node.js service (TypeScript, ESM).  
Uses `@cfxdevkit/sdk` for chain interaction.

```
worker/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts             # entrypoint
│   ├── WorkerConfig.ts      # env-based config loader
│   ├── JobPoller.ts         # polls contract for active jobs
│   ├── PriceChecker.ts      # DEX price queries (Swappi / Flux)
│   ├── Executor.ts          # submits executeJob tx
│   ├── RetryQueue.ts        # in-memory retry with exponential backoff
│   ├── AuditLogger.ts       # structured JSON logs to DB
│   ├── SafetyGuard.ts       # pre-execution checks (pause, slippage)
│   └── cli.ts               # CLI: run | pause | status
└── tests/
    └── Executor.test.ts
```

**Worker lifecycle:**
1. Load config from env (`CONFLUX_RPC_URL`, `PRIVATE_KEY_EXECUTOR`, `DATABASE_URL`)
2. Boot `JobPoller` – subscribes to contract events + polls on interval
3. For each active job: `SafetyGuard.check()` → `PriceChecker.meetsCondition()` → `Executor.submit()`
4. On success: write audit log
5. On failure: push to `RetryQueue` (max 3 attempts, 30s backoff)
6. CLI commands: `worker run`, `worker pause`, `worker resume`, `worker status`

**Safety Controls (priority, per bounty spec):**
- `SafetyGuard` reads global pause flag from both on-chain and DB before any execution
- Max slippage enforced at contract level AND pre-checked in worker before sending tx
- Gas estimation before every tx; guard against gas price spikes (configurable `MAX_GAS_PRICE_GWEI`)
- Any failed tx is logged with full context: job ID, tx hash, error, gas used
- Worker halts all executions if ≥5 consecutive errors (circuit breaker)

#### Layer 3 – Backend API (`backend/`)

Express + TypeScript. Manages job CRUD, user auth, DB.

```
backend/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── db/
│   │   ├── schema.ts          # Drizzle ORM schema (Postgres / SQLite)
│   │   └── migrations/
│   ├── routes/
│   │   ├── jobs.ts            # CRUD: GET/POST/DELETE /api/jobs
│   │   ├── executions.ts      # GET /api/executions
│   │   ├── auth.ts            # POST /api/auth/nonce, /api/auth/verify
│   │   └── admin.ts           # POST /api/admin/pause, /api/admin/resume
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification
│   │   └── rateLimit.ts
│   ├── services/
│   │   ├── JobService.ts
│   │   ├── ExecutionService.ts
│   │   └── AdminService.ts    # pause/resume, global state
│   └── sse/
│       └── JobUpdates.ts      # SSE channel for live job state
└── tests/
    ├── jobs.test.ts
    └── executions.test.ts
```

Auth: Sign-In With Ethereum (SIWE) → JWT.  
DB: Drizzle ORM with SQLite default (configurable to Postgres).

#### Layer 4 – Frontend (`frontend/`)

Next.js 14 (App Router) + Tailwind CSS + wagmi v2.

```
frontend/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard (job list, state)
│   │   ├── create/
│   │   │   └── page.tsx          # Strategy Builder
│   │   ├── job/[id]/
│   │   │   └── page.tsx          # Job detail + history
│   │   └── admin/
│   │       └── page.tsx          # Global pause / audit log
│   ├── components/
│   │   ├── StrategyBuilder/
│   │   │   ├── LimitOrderForm.tsx
│   │   │   ├── DCAForm.tsx
│   │   │   └── Preview.tsx
│   │   ├── Dashboard/
│   │   │   ├── JobCard.tsx
│   │   │   ├── JobTable.tsx
│   │   │   └── ExecutionHistory.tsx
│   │   ├── SafetyPanel/
│   │   │   ├── GlobalPauseButton.tsx
│   │   │   └── AuditLog.tsx
│   │   └── shared/
│   │       ├── WalletButton.tsx
│   │       └── NetworkBadge.tsx
│   ├── hooks/
│   │   ├── useJobs.ts
│   │   ├── useJobSSE.ts          # SSE consumer for live updates
│   │   └── useAutomationManager.ts  # wagmi contract hooks
│   ├── lib/
│   │   ├── wagmi.ts              # wagmi config for Conflux eSpace
│   │   ├── api.ts                # backend API client
│   │   └── contracts.ts          # ABI + address constants
│   └── types/
│       └── index.ts
└── tests/
    └── StrategyBuilder.test.tsx
```

#### Layer 5 – Shared Types (`shared/`)

```
shared/
├── package.json       # @conflux-cas/shared (local workspace package)
├── src/
│   ├── types/
│   │   ├── job.ts       # Job, JobType, JobStatus
│   │   ├── execution.ts # ExecutionRecord, ExecutionStatus
│   │   └── index.ts
│   └── index.ts
```

---

## Step-by-Step Execution Plan

### Week 1 — SDK extraction + project scaffolding

| Step | Task | Output |
|------|------|--------|
| 1 | Init `conflux-sdk` repo; add tooling (pnpm, TS, Biome, Vitest, tsup) | Buildable empty package |
| 2 | Extract & clean `clients` + `config` + `types` from `core` | `src/clients/`, `src/config/` |
| 3 | Extract & clean `contracts` module | `src/contracts/` |
| 4 | Extract & clean `wallet` module | `src/wallet/` |
| 5 | Extract & clean `services` (framework-agnostic) | `src/services/` |
| 6 | Extract & clean `hooks` + `providers` | `src/hooks/`, `src/providers/` |
| 7 | Write barrel `src/index.ts`; run full build + type-check | Published-ready bundle |
| 8 | Scaffold `conflux-cas` monorepo structure (shared, contracts, backend, worker, frontend) | Repo skeleton |

### Week 2 — Smart contracts + worker core

| Step | Task | Output | Status |
|------|------|--------|--------|
| 9 | Write `AutomationManager.sol` + `IAutomationManager.sol` | Core contract | ✅ Done |
| 10 | Write `PriceAdapter.sol` (Swappi integration) | Price oracle | ✅ Done (`SwappiPriceAdapter.sol`) |
| 11 | Write `PermitHandler.sol` | EIP-2612 support | ✅ Done |
| 12 | Hardhat deploy scripts + local network test | Contracts deployed locally | ✅ Done |
| 13 | Contract tests (≥70% coverage) | Passing Hardhat tests | ✅ Done (12/12) |
| 14 | Bootstrap `worker/`: `JobPoller`, `PriceChecker`, `Executor` | Worker can find and attempt jobs | ✅ Done |
| 15 | Implement `SafetyGuard` + `AuditLogger` | Safety controls working | ✅ Done (18/18 tests) |
| 16 | Implement `RetryQueue` + circuit breaker | Robust retry logic | ✅ Done |

### Week 3 — Backend API + frontend shell

| Step | Task | Output | Status |
|------|------|--------|--------|
| 17 | DB schema (jobs, executions, audit_logs tables) + Drizzle migrations | DB ready | ✅ Done |
| 18 | SIWE auth routes + JWT middleware | Auth working | ✅ Done |
| 19 | Job CRUD routes + `JobService` | API for job management | ✅ Done |
| 20 | Execution history routes + SSE channel | Live updates | ✅ Done |
| 21 | Admin routes (pause/resume) + `AdminService` | Safety controls exposed via API | ⬜ Pending (W4) |
| 22 | Backend tests (≥70% coverage) | Passing tests | ✅ Done (16/16 integration tests) |
| 23 | Next.js app scaffold; wagmi config for Conflux eSpace | Frontend connects to wallet | ✅ Done |
| 24 | Strategy Builder forms (LimitOrder + DCA) + preview + validation | Users can create jobs | ✅ Done |

### Week 4 — Dashboard, integration, testing, docs

| Step | Task | Output | Status |
|------|------|--------|--------|
| 25 | Dashboard: JobTable + JobCard + status indicators | Job list UI | ✅ Done |
| 26 | Job detail page + ExecutionHistory | Per-job view | ✅ Done |
| 27 | Safety panel: GlobalPause + AuditLog | Admin UI | ✅ Done (SafetyPanel component) |
| 28 | SSE consumer hook (`useJobSSE`) for live updates | Real-time dashboard | ✅ Done (inline in Dashboard.tsx) |
| 29 | SIWE login flow in frontend (`useAuth` hook) | JWT stored in localStorage | ✅ Done |
| 30 | KeeperClient viem implementation | Worker sends real txns | ✅ Done |
| 31 | DB-backed JobStore wiring worker → backend DB | Worker reads live jobs | ✅ Done |
| 32 | Worker main entrypoint with env config + graceful shutdown | Worker runs standalone | ✅ Done |
| 33 | Backend integration tests (supertest + in-memory SQLite) | ≥70% coverage | ✅ Done (16/16 passing) |
| 34 | Admin routes (pause/resume) + `AdminService` | Safety controls via API | ✅ Done |
| 35 | `.env.example` + `drizzle.config.ts` | Config documented | ✅ Done |
| 36 | Docker Compose: all services orchestrated together | One-command startup | ✅ Done |
| 37 | SDK: write tests + README + architecture diagram | SDK documented | ✅ Done (previous session) |
| 38 | CAS: write README, architecture diagram, deployment guide | Bounty docs | ✅ Done |
| 39 | Final review: acceptance criteria checklist, security audit | Submission ready | ⬜ Pending |
| 40 | On-chain Swappi pool discovery → searchable token dropdowns | `GET /pools` + `usePoolTokens` + `TokenSelect` | ✅ Done |
| 41 | On-chain job registration wiring (`createLimitOrder` → `JobCreated` → `onChainJobId`) | Contract `jobExists` guard satisfied end-to-end | ✅ Done |
| 42 | End-to-end limit order execution bug fixes | Zero-address wallet prompt fixed; ERC-20 approve step added; custom-error ABI; transient revert handling; retry-exhaustion UI; cache-first token loading | ✅ Done |

---

## Acceptance Criteria Mapping

| Bounty Requirement | Implementation |
|---|---|
| Strategies require explicit approvals / permits; no arbitrary custody | `AutomationManager` uses EIP-2612 permit per execution; never holds tokens |
| Limit orders execute only when price crosses target ± slippage | `SafetyGuard.check()` + on-chain slippage revert in `AutomationManager` |
| DCA jobs run on schedule with retry logic | `JobPoller` timer + `RetryQueue` (3 attempts, exponential backoff) |
| Global pause and per-job cancel persists across restarts | On-chain `Pausable`, DB flag, worker reads both on startup |
| Dashboard reflects job state + execution history | SSE-driven `JobTable`, `ExecutionHistory` page |

---

## Key Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| SDK package style | Single `@cfxdevkit/sdk` with subpath exports | Simpler for external consumers vs managing multiple packages |
| CAS blockchain layer | Conflux eSpace (EVM-compatible) | Bounty spec targets eSpace; wagmi/viem support |
| CAS database | Drizzle ORM + SQLite default / Postgres configurable | Zero-install default; production upgrade path |
| Worker scheduling | Native `setInterval` + contract event subscription | No queue infra needed for MVP; easy to swap for BullMQ later |
| Frontend auth | SIWE → JWT | Standard Web3 auth; no password management |
| SSE vs WebSocket | SSE for dashboard updates | Simpler, one-directional; sufficient for job state updates |
| Testing | Vitest everywhere (SDK + backend + worker); Playwright for frontend E2E | Consistent tooling |

---

## Dependencies

### `conflux-sdk`
```
cive, viem, @wagmi/core, react (peer), typescript, tsup, vitest, biome
```

### `conflux-cas/contracts`
```
hardhat, @openzeppelin/contracts, @nomicfoundation/hardhat-toolbox, typescript
```

### `conflux-cas/worker`
```
@cfxdevkit/sdk, drizzle-orm, better-sqlite3, commander, pino, typescript
```

### `conflux-cas/backend`
```
express, @cfxdevkit/sdk, drizzle-orm, better-sqlite3, siwe, jsonwebtoken, zod, typescript
```

### `conflux-cas/frontend`
```
next, react, tailwindcss, wagmi, viem, @cfxdevkit/sdk (hooks/providers), zod, typescript
```

---

## File / Repo Summary

```
repos/
├── conflux-sdk/        ← NEW: clean library extracted from conflux-devkit
├── conflux-cas/        ← NEW: automation site built using conflux-sdk
│   ├── shared/
│   ├── contracts/
│   ├── worker/
│   ├── backend/
│   └── frontend/
└── conflux-devkit/     ← EXISTING: kept as-is; source for extraction
```

The `conflux-devkit` repo is NOT deleted or modified during this process.  
It serves as the reference for extraction and can be archived after `conflux-sdk` is published.

---

## Notes

- **Non-custodial first**: every architectural decision in CAS must ensure no private key or token custody is handed to the server. The executor wallet only calls `executeJob` — it has no spending rights without a valid on-chain permit.
- **Safety controls are priority**: per the bounty assignment message, `SafetyGuard` and the circuit breaker in the worker are to be implemented before any UI work.
- **Exploratory bounty**: evaluation is 40% architecture/safety, 30% functionality, 30% docs. Prioritize clarity and correctness over feature completeness.

---

## Deviation Log

### SDK Extraction (Week 1)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D1 | SDK-6 | `ui-headless` hooks/providers **NOT extracted** | All hooks depend on a DevKit backend `apiUrl` — they're API proxies, not wagmi-native. A rewrite would take as long as writing new hooks. CAS frontend will use wagmi directly. |
| D2 | SDK-5 | `wallet-service.ts` and `transaction-service.ts` **NOT included** | Both take `private devkit: any` (DevKit manager); they are DevKit-specific facades, not standalone services. `ClientManager` from `clients` serves the same purpose directly. |
| D3 | SDK-5 | `setup-service.ts` **NOT included** | Specific to the DevKit setup wizard and DevNode plugin; has no use in CAS. |
| D4 | SDK-5 | `contract-service.ts` **NOT included** | Takes `_clientManager: any` with `// TODO` stubs; unfinished code not suitable for SDK. |
| D5 | SDK-1 | Added `@scure/bip32` and `@scure/bip39` as direct dependencies | These BIP deps were transitive in `conflux-devkit` (via `cive`), but become direct in the SDK because `derivation.ts` imports them explicitly. |
| D6 | SDK-3 | `contracts/types.ts` must be structured as `contracts/types/index.ts` | Deployer, reader, and writer all import from `'../types/index.js'` (subdirectory pattern). Flat file triggered wrong resolution. |
| D7 | SDK-4 | `wallet/wallet-types.ts` must be structured as `wallet/types/index.ts` | Session-keys, batching, embedded modules all import from `'../types/index.js'`. |
| D8 | SDK-5 | Removed keystore.ts lines 936–1119 (backward-compat block) | The block used `declare module './keystore-service.js'` augmentation (old filename) and added legacy methods for DevKit routes. Clean SDK has no legacy routes. |
| D9 | SDK-7 | Added `moduleResolution: "bundler"` in tsconfig | Using `"node"` caused resolution issues with ESM subpath imports (`@scure/bip39/wordlists/english.js`); `"bundler"` is the correct mode for tsup. |
| D10 | SDK-7 | Fixed `@scure/bip39/wordlists/english` → `.js` extension | TypeScript DTS build failed without explicit `.js` extension in the import; consistent with ESM package exports map. |

### CAS Contracts + Worker (Week 2)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D11 | W2-3 | `ISwappiRouter` and `ISwappiFactory` moved to **file scope** in `SwappiPriceAdapter.sol` | Solidity does not support nested interface declarations inside a contract body (syntax error on Solidity ≥ 0.8). Both interfaces are now declared at the top of the file, before the `SwappiPriceAdapter` contract. |
| D12 | W2-7 | Hardhat chai v6 incompatible with `hardhat-toolbox` v5 | `@nomicfoundation/hardhat-toolbox` v5 requires `chai@^4` (not v6). Added `chai@^4.5.0` and `@types/chai@^4.3.16` explicitly in `contracts/package.json`. |
| D13 | W2-7 | Pino v9 logger API: bindings must be **first argument** | `logger.info(bindings, message)` – NOT `logger.info(message, bindings)`. All worker files (`executor.ts`, `job-poller.ts`, `price-checker.ts`, `audit-logger.ts`, `safety-guard.ts`) had the argument order wrong; corrected during type-check. |

### CAS Backend + Frontend (Week 3)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D14 | W3 | Express v5 requires explicit `Express` app type and `Router as RouterType` alias | TypeScript `TS2742` portability error: "inferred type cannot be named without reference to…". Fixed by annotating `const app: Express = express()` and `const router: RouterType = Router()` throughout all route files. Also required `req.params.id as string` cast; in Express v5 params are `string | string[]`. |
| D15 | W3-4 | wagmi connectors removed from `providers.tsx` | Importing `metaMask`, `injected`, etc. from `wagmi/connectors` triggered deep `TS2742` portability errors caused by pnpm phantom-dep resolution of wagmi internal types. Workaround: use bare `createConfig({ chains, transports })` with no `connectors`; wallet extension connectors (MetaMask, Rabby) are auto-injected via the EIP-1193 provider at runtime. WalletConnect requires a project ID to be added in Week 4. |
| D16 | W3 | `migrate.ts` accesses `db.client` (drizzle internal) | The drizzle `BetterSQLite3Database` exposes `.client` for raw access in v0.33; this works but depends on drizzle-orm internal API. A cleaner approach (pass raw `sqlite` instance separately, or use `drizzle-kit push`) should be adopted before production. |
| D17 | W3 | `next.config.cjs` and `tailwind.config.cjs` use CommonJS | `frontend/` could not use `.ts` config files because Next.js 14 config loader does not respect the workspace `tsconfig.json` `moduleResolution: "bundler"` setting. CJS variants are stable and bypass this issue. |
### CAS Integration + Docker (Week 4)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D18 | W4-33 | `cancelJob` DELETE route checked `!job` (falsy) but never handled `'forbidden'` string | The string `'forbidden'` is truthy so it fell through to `res.json({ job })` with status 200. Added an explicit `result === 'forbidden'` guard returning 403 before the null/404 check. |
| D19 | W4-32 | Worker `tsup.config.ts` only listed `src/index.ts` as an entry; `src/main.ts` was not compiled | Docker CMD `node dist/main.js` would fail at runtime. Added `src/main.ts` to the `entry` array so it is compiled as a separate entrypoint. |
| D20 | W4 | `contracts/hardhat.config.ts` imports `dotenv` but it was absent from devDependencies | TypeScript TS2307 "Cannot find module 'dotenv'" during `pnpm -r type-check`. Fixed by adding `dotenv` to `contracts` devDeps. |
| D21 | W4-36 | Frontend `vitest run` exits with code 1 when no test files exist | Vitest's default behaviour is to fail when the include glob matches nothing. Added `vitest.config.ts` with `passWithNoTests: true` and `@vitejs/plugin-react` / `jsdom` devDependencies. |

### User-Testable Wiring

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D22 | W4-34 | `layout.tsx` had `'use client'` + `metadata` export simultaneously | Next.js App Router silently ignores `metadata` when `'use client'` is present; the page title was never set. Removed `'use client'` — layout is a server component rendering client sub-components, which is valid in App Router. |
| D23 | W4 | Frontend used `localStorage.getItem('cas_token')` but `useAuth` stores `cas_jwt` | Token key mismatch meant Dashboard and JobCard could never read the JWT. Standardised all components on `cas_jwt`. |
| D24 | W4 | `StrategyBuilder` sent human-readable values but backend schema requires wei strings | `LimitOrderSchema` validates `amountIn`, `minAmountOut`, `targetPrice` as digit-only strings. Added `parseUnits` from viem to convert; derived `minAmountOut = expected * (10000 - slippageBps) / 10000n`. |
| D25 | W4 | `EventSource` does not support custom `Authorization` headers | Browser `EventSource` has no header API. Added `?token=` query param fallback in `sse/events.ts`; JWT is validated from query string when no header is present. |
| D26 | W4 | Next.js had no proxy for `/api/*` → backend | Components called `/api/jobs` etc. but no rewrite rule existed, causing 404s. Added `async rewrites()` to `next.config.cjs` forwarding `/api/:path*` → `BACKEND_URL/:path*`. |

### On-Chain Pool Discovery + UX Polish

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D27 | Step 40 | Original plan used free-text address inputs for Token In / Token Out; replaced with on-chain Swappi pool discovery | Free-text addresses are error-prone for users. Swappi is a Uniswap V2 fork: factory exposes `allPairs` — all 198 testnet pairs are enumerable. New `GET /pools` backend route resolves token symbol/name/decimals and caches for 30 min. New `usePoolTokens` frontend hook fetches `/api/pools` and resolves per-wallet `balanceOf`. New `TokenSelect` searchable dropdown replaces both token inputs; Token Out auto-filters to tokens sharing a pool with selected Token In. |
| D28 | Step 40 | Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`) is **not deployed** on Conflux eSpace testnet | The canonical Multicall3 address returns `"0x"` bytecode on Conflux eSpace testnet. Cannot use `client.multicall()` with `multicallAddress`. Backend `pools.ts` and frontend `usePoolTokens` both switched to `Promise.allSettled` of individual `readContract` calls with `batch: true` on the HTTP transport — viem coalesces concurrent reads into a single JSON-RPC batch request at the transport layer, achieving the same round-trip count without needing the on-chain aggregator. |
| D29 | Step 40 | Backend `pools.ts` initially kept tokens with failed metadata as `'Unknown'`/`addr.slice(0,8)` | Conflux eSpace testnet Swappi has some pair slots pointing to non-ERC20 contracts or bare LP pair addresses that implement no `symbol()`/`name()`. These appeared as junk entries in the dropdown. Fixed: tokens are now excluded if **any** of the three metadata calls (`symbol`, `name`, `decimals`) fail or return empty. Pairs referencing a dropped token are also pruned. |
| D30 | Step 40 | `Token In` dropdown showed all tokens regardless of wallet balance | With working `balanceOf` resolution (post-D28 fix), the Token In list filters to tokens the user actually holds (`balanceWei > 0`). Falls back to the full token list when the wallet holds nothing (empty testnet wallet) so the UI remains usable during development. |
| D31 | UX | `useAccount()` / `useConnect()` cause React hydration mismatch on all wallet-gated pages | wagmi reads its persisted connection state from `localStorage` on the client but the server always returns `isConnected: false`. Any render branch on `isConnected` differed between server HTML and first client paint, producing React's "Expected server HTML to contain a matching `<div>`" warning. Fixed across four components by adding a `mounted` state flag (initialized `false`, set `true` in `useEffect`). Until mounted, each component renders a neutral placeholder (empty div or skeleton) identical to what the server produces. Affected: `NavBar`, `DashboardPage`, `CreatePage`, `StrategyBuilder` (already fixed previously as part of pool loading). |
| D32 | Step 26 | `GET /jobs/:id/executions` backend sub-route was missing | Plan listed exec history as part of the job detail page but no API route existed. Added `GET /:id/executions` to `backend/src/routes/jobs.ts` — queries the `executions` table filtered by `job_id` after verifying ownership. `JobCard` updated with `Details →` link and `formatUnits` display. `frontend/src/app/job/[id]/page.tsx` created: shows all strategy params, status, last error, and full execution history table with Conflux explorer tx links. |
| D33 | Testnet deploy | Deploy script had wrong Swappi factory address (`0x36b40…`) with bad EIP-55 checksum | The factory used in pool discovery (`0x36b83e0d…`, confirmed working with 198 pairs) differed from the one in `deploy.ts`. Updated deploy script to use the correct checksummed address. Also fixed root `package.json` `contracts:deploy` — it was invoking pnpm's own `deploy` sub-command instead of the package script; fixed to `pnpm --filter … run deploy`. |
| D34 | Tooling | Added `scripts/gen-key.mjs` — generates secp256k1 key pair with 0x-prefixed output | Clarified that `EXECUTOR_PRIVATE_KEY` and `DEPLOYER_PRIVATE_KEY` both require the `0x` prefix (viem `privateKeyToAccount` requires it; `.env.example` comment was wrong). Script uses `@noble/curves` + `@noble/hashes` already present in the pnpm store. |
| D35 | Step 40 / UX | Token In dropdown did not include native CFX | Swappi pools use WCFX (wrapped CFX) internally, so CFX didn't appear as a pool token. Added a synthetic "CFX (native)" entry using `CFX_NATIVE_ADDRESS = 0xEeee…EEeE` (EIP-7528 sentinel). Its balance is fetched via `client.getBalance()` (not `balanceOf`). The WCFX ERC-20 entry is renamed to "wCFX" to distinguish it. `getPairedTokens()` maps CFX sentinel → WCFX for pair lookups and filters out wCFX from results. `resolveTokenInAddress()` maps sentinel → WCFX before submitting a strategy to the backend (WCFX address: testnet `0x2ED3dddae5B2F321AF0806181FBFA6D049Be47d8` from `router.WETH()`). |

### On-Chain Execution Wiring (Step 41)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D36 | W4 / Step 41 | `GET /api/system/status` returned 404 | The status route was registered as `router.get('/')` but the router was mounted at `/system`, so the effective path was `/system` — not `/system/status` as the frontend expected. Fixed to `router.get('/status')`. |
| D37 | W4 / Step 41 | Worker and backend wrote/read different SQLite files | Both used a relative `./data/cas.db` path but resolved it from different CWDs (`worker/` vs `backend/`). Fixed both to resolve from the project root via `import.meta.url` / `__dirname`, always landing at `conflux-cas/data/cas.db`. |
| D38 | W4 / Step 41 | Worker heartbeat crashed: `TypeError: Cannot read properties of undefined (reading 'prepare')` | `updateHeartbeat()` tried to access the raw SQLite instance through a drizzle-orm internal accessor (`session?.db ?? .client`) which is `undefined` in the installed drizzle version. Fixed by storing the raw `better-sqlite3` instance as `private sqlite` in `DbJobStore`'s constructor and using it directly for the upsert. |
| D39 | W4 / Step 41 | Worker threw `SqliteError: no such table: jobs` on first run | The worker opened a fresh SQLite file without running any DDL. Backend migrations ran via `migrate()` only in the backend process; the worker had no equivalent. Fixed by executing `CREATE TABLE IF NOT EXISTS` for all tables (`jobs`, `executions`, `nonces`, `worker_heartbeat`) directly in `DbJobStore`'s constructor, mirroring the backend DDL. |
| D40 | W4 / Step 41 | `SafetyGuard` blocked every job with violation `"Job is not active (status: pending)"` | The guard required `job.status === 'active'` before execution, but newly created jobs always start as `'pending'` and the worker is where they transition to `'active'`. The guard rejected them before they could ever be activated. Fixed the guard to allow both `'pending'` and `'active'`; added `JobStore.markActive()` + `DbJobStore` implementation; `Executor.processTick()` calls `markActive()` for pending jobs before evaluating price conditions. |
| D41 | Step 41 | Fundamental architectural gap: `StrategyBuilder` never called `createLimitOrder()` on-chain | `POST /api/jobs` stored a DB record with a UUID, but `AutomationManager.executeLimitOrder()` has a `jobExists(jobId)` modifier that checks an on-chain `mapping(bytes32 => Job)`. The contract generates its own `bytes32 jobId = keccak256(abi.encodePacked(msg.sender, jobType, block.timestamp, tokenIn, tokenOut, amountIn))` during `createLimitOrder()` — completely separate from the DB UUID. The keeper was passing a padded UUID that could never match. Fixed by: (1) adding `onChainJobId: string \| null` to `BaseJob` in `shared/`; (2) having `StrategyBuilder` call `createLimitOrder()` / `createDCAJob()` via `writeContractAsync` first, parse the `JobCreated(bytes32 indexed jobId, …)` event log on the receipt, then POST with `onChainJobId`; (3) backend stores it in a new `on_chain_job_id TEXT` column; (4) worker passes `onChainJobId` directly as bytes32 to execution calls; (5) executor skips jobs where `onChainJobId` is null with a warning. |
| D42 | Step 41 | `bytes32` size error in keeper: `Size of bytes bytes36 does not match expected size bytes32` | `uuidToBytes32()` helper right-padded a 128-bit UUID to 256 bits correctly, but this was the wrong value entirely — the contract's `jobId` is a keccak256 hash of creation parameters, not a padded UUID. The encoding error was a symptom of the deeper gap documented in D41. Helper removed; keeper now uses `onChainJobId` verbatim as a `0x`-prefixed 64-hex-char string. |
| D43 | Step 41 | `privateKeyToAccount` was imported from `viem` main entry but not exported there | viem v2 moved account utilities to a dedicated subpath. `import { privateKeyToAccount } from 'viem'` compiled in some versions but failed with TS2724 in the installed viem v2.46. Fixed to `import { privateKeyToAccount } from 'viem/accounts'`. |
| D44 | Step 41 | `KeeperClientImpl` method signatures didn't match the `KeeperClient` interface defined in `executor.ts` | The interface declared `executeLimitOrder(jobId, owner, params): Promise<{ txHash: string }>` (3 args, object return), but the implementation had `executeLimitOrder(jobId, tokenIn, tokenOut, amountIn, minAmountOut, owner): Promise<string>` (6 args, string return). TypeScript only caught this late because the impl class never explicitly declared `implements IKeeperClient`. Rewrote the implementation to accept `(jobId, owner, params)`, derive `tokenIn`/`amountIn` from the structured params, and return `{ txHash }`. Also added `chain: undefined, account: this.account` to `writeContract` calls to satisfy viem v2's strict `chain` requirement. |
| D45 | Step 41 | `cancelJob` service returned `Promise<Job \| null>` — the `'forbidden'` literal was in the route but absent from the service | The route code checked `result === 'forbidden'` but `cancelJob`'s return type annotation was `Promise<Job \| null>`, making the comparison unreachable (TS2367). The service also performed no ownership check — it filtered by `owner` in the WHERE clause, silently returning `null` instead of `'forbidden'` for someone else's job. Fixed: return type widened to `Promise<Job \| null \| 'forbidden'>`; service now fetches the row first, returns `'forbidden'` on owner mismatch, then updates with `inArray(status, ['pending','active'])`. |
| D46 | Step 41 | `ALTER TABLE jobs ADD COLUMN on_chain_job_id` cannot use `IF NOT EXISTS` in SQLite | SQLite's `ALTER TABLE` does not support `ADD COLUMN IF NOT EXISTS` (unlike PostgreSQL). Re-running `migrate()` on an existing database would throw `SqliteError: duplicate column name`. Fixed by wrapping the `ALTER TABLE` in a try/catch that re-throws unless the error message matches `/duplicate column/i`. Same pattern applied in both `backend/src/db/migrate.ts` and `worker/src/db-job-store.ts`. |
| D47 | Step 42 | Next.js never loaded root `.env` — `NEXT_PUBLIC_AUTOMATION_MANAGER_ADDRESS` was always `undefined` | Next.js reads `.env` files from its own project root (`frontend/`), not the monorepo root. `NEXT_PUBLIC_AUTOMATION_MANAGER_ADDRESS` was only defined in `conflux-cas/.env`, so `contracts.ts` always fell back to `0x0000…0000`, causing MetaMask to show `To: 0x0000…0000` and be unable to decode any ABI. Fixed by adding a `loadRootEnv()` function at the top of `frontend/next.config.cjs` that reads `../.env` via Node.js `fs` and injects any missing `NEXT_PUBLIC_*` keys into `process.env` before Next.js initialises its env replacement. |
| D48 | Step 42 | ERC-20 `approve` step was missing from `StrategyBuilder` — `AutomationManager` calls `safeTransferFrom` at execution time | `AutomationManager.executeLimitOrder()` and `executeDCASwap()` both call `IERC20(tokenIn).safeTransferFrom(job.owner, address(this), amountIn)` (lines 242, 289 of the contract). This requires the user to have pre-approved the manager contract before the keeper can ever execute. The `StrategyBuilder` never did this. Fixed: before calling `createLimitOrder`/`createDCAJob`, the component now reads the current `allowance(owner, manager)` via `publicClient.readContract` and, if insufficient, prompts `approve(manager, MAX_UINT256)` and waits for the receipt. A `txStep` state string is displayed to the user through each sub-step (allowance check → approve prompt → approval confirmation → register on-chain → on-chain confirmation → saving). |
| D49 | Step 42 | Worker keeper ABI had no custom error fragments — contract reverts showed as `"revert: "` (empty) | The `AUTOMATION_MANAGER_ABI` in `worker/src/keeper-client.ts` only listed function signatures; it had none of the 11 custom error definitions from `AutomationManager.sol`. viem could not decode the revert selector, so every contract revert was logged as an empty string — masking the real reason. Fixed by adding all 11 error fragments (`PriceConditionNotMet`, `JobNotActive`, `InvalidParams`, etc.) to the keeper ABI. |
| D50 | Step 42 | `PriceConditionNotMet` revert caused `markFailed` — permanent job failure on a transient race condition | When the off-chain `PriceChecker` decides the limit-order condition is met and submits the tx, the on-chain `SwappiPriceAdapter.getPrice()` can return a different spot by the time the tx is mined (testnet thin liquidity amplifies this). The executor's catch block called `markFailed` for every error, so `PriceConditionNotMet` permanently failed the job instead of silently skipping until the next tick. Fixed: added two named checks in the catch block — if the error message contains `PriceConditionNotMet` or `DCAIntervalNotReached`, log at `debug` level and return without calling `markFailed` or `incrementRetry`. |
| D51 | Step 42 | Retry exhaustion (`SafetyGuard` `maxRetries` violation) was invisible in the UI | When `job.retries >= job.maxRetries` the SafetyGuard blocks execution each tick with a WARN log but the job's DB status stays `active` — the user sees a green "active" badge with no indication the strategy is stuck. Fixed: `JobCard` now shows an amber banner "⚠ Blocked — max retries reached (N/N)" when `retries >= maxRetries` and status is still active/pending; for partially-retried jobs a dimmer "Retries: N/N" line is shown. The job detail page (`/job/[id]`) shows a full orange banner explaining the situation and suggesting cancel + recreate, with the last error inline. |
| D52 | Step 42 | Token list loading was slow and unreliable — a single slow RPC call could drop tokens from the list | `usePoolTokens` fetched `/api/pools` then N individual `balanceOf` RPC calls on every mount with no caching; a slow or unresponsive RPC call stalled or silently dropped individual tokens, and a manual refresh was the only recovery. Rewritten with a two-phase stale-while-revalidate approach: (1) token metadata + pair topology are stored in `localStorage` (`cas_pool_meta_v1`, TTL 10 min) and read synchronously on mount so the dropdown renders instantly with cached tokens; (2) `balancesLoading` is a separate flag — tokens are selectable while on-chain balances are still resolving in the background; (3) each individual balance call is wrapped in `withTimeout(8 s, fallback=0n)` so a single unresponsive node cannot stall the rest of the list; (4) an `AbortController` is threaded through all async work so unmounting or wallet changes never set stale state. |
| D53 | Step 42 | Worker price source was a hardcoded mock (always 1e18), so limit-order price conditions were never met | `main.ts` wired a `MOCK_PRICE_SOURCE` that returned `1_000_000_000_000_000_000n` unconditionally, noted as a "Week 3 TODO". A job with `targetPrice: "4000000000000000000"` and `direction: "gte"` could never satisfy `1e18 >= 4e18`, causing the executor to silently skip every tick. Fixed: introduced `createSwappiPriceSource(publicClient, routerAddress)` which calls `getAmountsOut(1e18, [tokenIn, tokenOut])` on the Swappi UniswapV2-compatible router via viem `readContract`, returning `amounts[1]` as the 1e18-scaled price. Falls back to `0n` + WARN log on RPC error. Also upgraded both condition-not-met `logger.debug` calls in `executor.ts` to `logger.info` with `currentPrice`, `targetPrice`, `direction` (limit orders) and `secsRemaining` (DCA) so the wait reason is visible at the default log level. |
| D54 | Step 42 | Retries could overshoot `maxRetries` (e.g. `6/5`) — two cooperating bugs | (1) `incrementRetry()` was called unconditionally in the catch block even when `job.retries` was already at `maxRetries`, so the DB counter kept climbing past the cap. (2) `retryQueue.enqueue(job)` passed the original in-memory job reference, which holds the retry count from the moment of enqueue (the previous tick), not the current DB value. `SafetyGuard.check()` reads `job.retries` from this stale object, so `retries >= maxRetries` never fired for queued retries. Fixed: (a) guard `incrementRetry` with `if (job.retries < job.maxRetries)`; (b) only `enqueue` when `nextRetries < maxRetries`; (c) spread `{ ...job, retries: nextRetries }` into the retry queue so SafetyGuard receives the correct current count. |
| D56 | Step 42 | `JobNotActive` revert caused a spurious `markFailed` loop — already-executed on-chain jobs were never synced to the DB | When a limit order execution succeeds on-chain (`job.status → EXECUTED`) but the worker crashes or the DB is wiped before `markExecuted()` is called, subsequent ticks still see `status='active'` in the DB and attempt `executeLimitOrder` again. The contract reverts with `JobNotActive` (the job is already `EXECUTED` on-chain). The catch block did not recognise this error, so it fell through to `markFailed` + retry-increment, burning all `maxRetries` and leaving the job as `failed` in the UI. Root cause confirmed via on-chain `getJob()`: status = `EXECUTED` (1). Fix: added a `JobNotActive` guard in the catch block (after `PriceConditionNotMet` / `DCAIntervalNotReached`) that calls `markExecuted(job.id, 'chain-sync')` and returns, treating the revert as a DB-sync signal rather than a failure. Also added `markCancelled()` to the `JobStore` interface and `DbJobStore` for future use when the worker can distinguish CANCELLED from EXECUTED via an on-chain `getJob()` call. |
| D57 | Step 41/42 | `waitForTransactionReceipt` threw "could not be found" before strategy was registered — the tx was confirmed but viem gave up polling too early | `publicClient.waitForTransactionReceipt()` used viem's default 4 s polling interval with no explicit timeout. On Conflux eSpace testnet the RPC can take 5–15 s to expose a receipt after the tx is accepted into a block, so viem exhausted its default polling window and threw the "Transaction receipt with hash … could not be found." error before the receipt was available. The transaction was actually confirmed; the strategy was never saved to the DB. Fixed: (1) `providers.tsx`: set `pollingInterval: 2_000` globally in `wagmiConfig` and switched `transports` from bare `http()` to explicit `http('https://evmtestnet.confluxrpc.com')` to prevent any URL resolution ambiguity. (2) `StrategyBuilder.tsx`: both `waitForTransactionReceipt` calls (approve + createLimitOrder/createDCAJob) now pass `{ pollingInterval: 2_000, timeout: 120_000 }` — poll every 2 s for up to 2 min. (3) The waiting step label now includes the truncated tx hash so users can find it on ConfluxScan. (4) A timeout-specific error message is shown explaining the tx may still confirm, instead of surfacing the raw viem error. |
| D55 | UX | Tokens disappeared on background refresh; token pair selection was flaky | Two cooperating bugs: (1) Background `/api/pools` refresh sometimes returns fewer tokens than the previous fetch (RPC hiccup on the backend). `setTokens()` blindly replaced the visible list with the shorter result, so tokens the user could previously select disappeared. `fetchBalances()` similarly rebuilt from the shorter fresh list. (2) `getPairedTokens()` compared pair addresses with `===` without `.toLowerCase()` normalisation — any case mismatch made a valid pair invisible. Fixed: (frontend) added `knownTokensRef` / `knownPairsRef` Maps that accumulate all ever-seen tokens and pairs; entries are never removed. `fetchBalances()` always works off the full accumulated set. `readCacheIgnoreTTL()` seeds these maps on mount even from expired cache, ensuring the user always sees the historical maximum. All address comparisons in `getPairedTokens()` use `.toLowerCase()`. (backend) Added `_permanentTokens` / `_permanentPairs` Maps that persist across the process lifetime; `mergeIntoPermanent()` is called after every successful `fetchPools()`. On RPC failure the route returns the permanent map instead of 502. `/refresh` resets only the TTL guard, not the permanent maps. |
| D58 | Frontend UX | `wagmi/connectors` barrel import in NavBar pulled in `@metamask/sdk` → `@react-native-async-storage/async-storage` (React Native-only), causing a webpack warning on every page load | `wagmi/connectors` re-exports every connector including `metaMask`. Fixed by importing `injected` from `wagmi` main entry instead, which sources it from `@wagmi/core` without touching MetaMask SDK. |
| D59 | RPC quota | `pollingInterval: 2_000` on wagmiConfig caused 30+ `eth_blockNumber` calls per minute — every wagmi hook subscribed at 2s globally | Raised global `pollingInterval` to `30_000ms`. `waitForTransactionReceipt` calls in `StrategyBuilder` already pass their own per-call `pollingInterval: 2_000` override so receipt polling is unaffected. Added `staleTime: 30_000` + `gcTime: 60_000` to QueryClient to stop React Query refetching on every window focus. Added `batch: { wait: 16 }` to HTTP transports so concurrent `readContract` calls in `usePoolTokens` are coalesced into a single JSON-RPC batch request. |
| D60 | RPC quota | `Promise.allSettled([396 promises])` in `GET /pools` fired all 396 RPC calls simultaneously — at `batchSize:20` that produced 20 concurrent HTTP requests; testnet allows ~5 → `"Request exceeds defined limit"` on most chunks | Replaced all three `Promise.allSettled` blocks in `fetchPools()` (allPairs, token0/token1, metadata) with a `chunkedSettled<T>(thunks, label)` helper that processes `CALLS_PER_CHUNK = 10` thunks at a time (= 1 HTTP batch request), awaiting `CHUNK_DELAY_MS = 500ms` between sequential groups. A concise warning including the first rejection reason is logged for every failing chunk. At cache-miss the full fetch now takes ~11s but the result is cached for 30 minutes. |
| D61 | RPC quota | Thundering-herd: on a cold cache (server start, 30min TTL expiry, HMR) all concurrent `GET /pools` requests each spawned their own `fetchPools()` chain in parallel, multiplying scheduled RPC chunks and colliding on the same testnet quota | Added `_inflight: Promise<PoolsResponse> \| null` module-level variable. The route handler only creates a new `fetchPools()` promise when `_inflight` is null; subsequent concurrent requests `await` the same in-flight promise and share its result. The variable is cleared in `.finally()` so the next cold-cache request starts fresh. Effect: at most one `chunkedSettled` chain runs at any moment, regardless of how many concurrent HTTP requests hit the route. |

---

## Testnet Deployment Guide

### What is deployed on-chain vs off-chain

| Concern | Deployed where | Required for |
|---|---|---|
| `AutomationManager.sol` | Conflux eSpace testnet | Worker to execute jobs |
| `SwappiPriceAdapter.sol` | Conflux eSpace testnet | Worker price checks |
| `PermitHandler.sol` | Conflux eSpace testnet | On-chain permit validation |
| Backend API | Local / Docker | Strategy creation, auth, dashboard |
| Worker | Local / Docker | Job execution |
| Frontend | Local / Docker | UI |

**Strategy creation and dashboard work today without contract deployment.**  
The contract is only required for the worker to execute swaps.

### Step-by-step: deploy contracts to testnet

#### Prerequisites
1. A funded Conflux eSpace testnet wallet (get CFX at https://faucet.confluxnetwork.org/eSpace)
2. Export the private key (64 hex chars, no `0x`)

#### 1. Create `.env` from the example
```bash
cd /home/slaptop/Documents/repos/conflux-cas
cp .env.example .env
```

Edit `.env`:
```env
DEPLOYER_PRIVATE_KEY=<your_64_hex_private_key>
JWT_SECRET=$(openssl rand -hex 32)   # run separately and paste result
EXECUTOR_PRIVATE_KEY=<same_or_different_funded_wallet>
```

#### 2. Deploy contracts
```bash
cd contracts
pnpm install
pnpm exec hardhat run scripts/deploy.ts --network espaceTestnet
```

Expected output:
```
Deploying to espaceTestnet with account: 0x…
Balance: 10.0 CFX

[1/3] Deploying SwappiPriceAdapter…
  SwappiPriceAdapter: 0xABC…
[2/3] Deploying AutomationManager…
  AutomationManager: 0xDEF…
[3/3] Deploying PermitHandler…
  PermitHandler: 0x123…

=== Deployment Summary ===
{
  "network": "espaceTestnet",
  "AutomationManager": "0xDEF…",
  ...
}
```

#### 3. Update `.env` with deployed addresses
```env
AUTOMATION_MANAGER_ADDRESS=0xDEF…                   # from deploy output
NEXT_PUBLIC_AUTOMATION_MANAGER_ADDRESS=0xDEF…       # same address
```

#### 4. Start all services
```bash
cd /home/slaptop/Documents/repos/conflux-cas
pnpm run dev:backend   # port 3001
pnpm run dev:frontend  # port 3000
# worker (optional, needed for execution):
pnpm run dev:worker
```

Or with Docker:
```bash
docker compose up --build
```

### Full workflow on testnet

```
1. Open http://localhost:3000
2. Connect MetaMask (Conflux eSpace Testnet, chainId 71)
3. Click "Sign In" → sign SIWE message → JWT stored
4. Go to /create
   - Token In: select from your wallet holdings (balanceOf > 0)
   - Token Out: auto-filtered to paired tokens
   - Set amount + target price
   - Click "Create Strategy" → POST /api/jobs → job stored in SQLite
5. Go to /dashboard → job card shows (status: pending)
6. Worker picks up job → calls SwappiPriceAdapter.getPrice()
   → if condition met → calls AutomationManager.executeJob()
   → tx hash stored → status → executed
7. Click "Details →" on the job card → /job/:id
   → shows full params + execution history with tx links
```

### Testnet contract addresses

| Contract | Testnet address |
|---|---|
| Swappi Router | `0x873789aaF553FD0B4252d0D2b72C6331c47aff2E` |
| Swappi Factory | `0x36B83E0D41D1dd9C73a006F0c1cbC1F096E69E34` |
| SwappiPriceAdapter | `0xD2Cc2a7Eb4A5792cE6383CcD0f789C1A9c48ECf9` ✅ deployed 2026-02-19 |
| AutomationManager | `0x9D5B131e5bA37A238cd1C485E2D9d7c2A68E1d0F` ✅ deployed 2026-02-19 |
| PermitHandler | `0x0D566aC9Dd1e20Fc63990bEEf6e8abBA876c896B` ✅ deployed 2026-02-19 |

# Conflux Automation Site (CAS)

Non-custodial limit order and DCA (dollar-cost averaging) automation on
**Conflux eSpace** — users sign strategies once with their wallet; a keeper
network executes trades autonomously without ever holding private keys.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
│  Next.js 14 App Router  (port 3000)                             │
│  • Connect Wallet (wagmi + MetaMask/WalletConnect)              │
│  • SIWE sign-in → JWT stored in localStorage                    │
│  • Create limit-order / DCA strategy                            │
│  • Live dashboard via SSE (EventSource)                         │
│  • Safety panel — admin pause/resume                             │
└───────────────────┬─────────────────────────────────────────────┘
                    │  /api/*  (App Router catch-all proxy)
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Express Backend  (port 3001)                   │
│  REST  POST /auth/challenge | /auth/verify                      │
│        POST /jobs              (create strategy)                │
│        GET  /jobs              (list user jobs)                 │
│        GET  /jobs/:id          (single job)                     │
│        DELETE /jobs/:id        (cancel job)                     │
│        GET  /admin/status      (pause state)                    │
│        POST /admin/pause       (admin only)                     │
│        POST /admin/resume      (admin only)                     │
│  SSE   GET  /events            (real-time job updates)          │
│  SQLite database via better-sqlite3                             │
└───────────────────┬─────────────────────────────────────────────┘
                    │  Shared SQLite file (/data/cas.db)
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│               Keeper Worker  (background process)               │
│  Poll pending jobs → check price oracle → call executeJob()     │
│  on AutomationManager Solidity contract via EXECUTOR_PRIVATE_KEY│
│  (keeper wallet does NOT hold user funds)                       │
└───────────────────┬─────────────────────────────────────────────┘
                    │  on-chain
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│          AutomationManager.sol  (Conflux eSpace Testnet)        │
│  • registerJob / cancelJob / executeJob                         │
│  • Slippage guard (minAmountOut)                                 │
│  • Non-custodial: users pre-approve token allowance only        │
└─────────────────────────────────────────────────────────────────┘
```

### Packages

| Package | Description |
|---------|-------------|
| `shared` | Shared TypeScript types and Zod schemas |
| `contracts` | Hardhat project — `AutomationManager.sol` + deployment scripts |
| `backend` | Express API server + SQLite persistence + SSE event stream |
| `worker` | Keeper daemon — polls jobs, checks prices, submits on-chain txs |
| `frontend` | Next.js 14 App Router frontend (wagmi, viem, Tailwind CSS) |

---

## Prerequisites

- **Node.js ≥ 18**, **pnpm ≥ 8**
- **MetaMask** (or any EIP-1193 wallet) with some testnet CFX
  - Add network: Conflux eSpace Testnet, Chain ID `71`, RPC `https://evmtestnet.confluxrpc.com`
  - Faucet: <https://faucet.confluxnetwork.org/>
- (Optional) WalletConnect Project ID from <https://cloud.walletconnect.com>

---

## Quick Start (Local Dev)

### 1 — Clone and install

```bash
git clone <repo-url> conflux-cas
cd conflux-cas
pnpm install
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum set:

```dotenv
JWT_SECRET=<run: openssl rand -hex 32>
# For the worker to execute on-chain (optional for UI testing):
# EXECUTOR_PRIVATE_KEY=<64-char hex, no 0x>
# AUTOMATION_MANAGER_ADDRESS=<deployed contract address>
```

All other defaults work for local development.

### 3 — Start the backend

```bash
# Terminal 1
pnpm run dev:backend
# → http://localhost:3001
```

### 4 — Start the frontend

```bash
# Terminal 2
pnpm run dev:frontend
# → http://localhost:3000
```

### Alternative — start all services concurrently

If you prefer a single command to launch backend, frontend, and worker together during development, use the root `dev` script which runs all three in parallel (uses `concurrently`):

```bash
# single terminal
pnpm dev
# → runs backend, frontend, worker concurrently with coloured prefixes
```

### 5 — Open the app

Visit <http://localhost:3000>, connect your MetaMask wallet, and sign in.
 
> **Note:** The backend and worker share the same SQLite file (`./data/cas.db`).
> 
> **Dashboard:** The Dashboard now displays strategies in a compact horizontal table (`JobRow` per strategy) and receives live updates via Server-Sent Events. Token symbols/decimals are resolved from a local `cas_pool_meta_v1` cache (no extra RPC on render). The SSE client auto-reconnects on error (5s) and there is a 30s fallback poll to re-fetch jobs in case events are missed.
> The worker is optional for UI testing — jobs will be created and listed but
> not executed on-chain until the worker is running.

### (Optional) Start the worker

```bash
# Terminal 3 — requires EXECUTOR_PRIVATE_KEY + deployed contract
pnpm run dev:worker
```

---

## User Flow

```
1. Go to http://localhost:3000
2. Click "Connect Wallet" → approve MetaMask popup
3. Click "Sign In" → sign the SIWE message (no gas, off-chain)
4. Click "Create Strategy" in the nav
5. Fill in: token pair, amount, target price (limit order) or interval (DCA)
6. Submit → strategy appears on the Dashboard as "pending"
7. When price conditions are met, the keeper executes the trade
8. Dashboard updates in real-time via Server-Sent Events
9. Safety page → toggle Global Pause to halt all keeper activity
```

---

## Running Tests

```bash
# All packages
pnpm test

# Individual packages
pnpm --filter @conflux-cas/backend test   # 16 integration tests
pnpm --filter @conflux-cas/worker test    # 18 unit tests
pnpm contracts:test                       # 12 Hardhat tests

# Type-check all packages
pnpm type-check
```

---

## Contract Deployment

### Pre-flight check

```bash
# Validate private key, derive deployer address, show live CFX balance
pnpm contracts:check-wallet
```

Requires `DEPLOYER_PRIVATE_KEY` in `.env`. Needs ≥ 0.1 CFX (testnet) / ≥ 0.5 CFX (mainnet).

### Testnet

```bash
# .env: NETWORK=testnet  (default)
pnpm contracts:deploy
# Outputs deployed addresses — copy them to .env
```

### Mainnet

```bash
# .env: NETWORK=mainnet, DEPLOYER_PRIVATE_KEY=<key>
pnpm contracts:deploy:mainnet
# Prints a ready-to-paste .env snippet after a successful deploy
```

### Compiling only

```bash
pnpm contracts:compile
```

---

## Deployed Contracts

### eSpace Mainnet (chain ID 1030)

| Contract | Address |
|---|---|
| `AutomationManager` | `0x9D5B131e5bA37A238cd1C485E2D9d7c2A68E1d0F` |
| `SwappiPriceAdapter` | `0xD2Cc2a7Eb4A5792cE6383CcD0f789C1A9c48ECf9` |
| `PermitHandler` | `0x0D566aC9Dd1e20Fc63990bEEf6e8abBA876c896B` |
| Swappi V2 Router | `0xE37B52296b0bAA91412cD0Cd97975B0805037B84` |
| Swappi V2 Factory | `0xe2a6f7c0ce4d5d300f97aa7e125455f5cd3342f5` (from `router.factory()`; prev `0x20b45b8a...` had no code) |

### eSpace Testnet (chain ID 71)

| Contract | Address |
|---|---|
| `AutomationManager` | `0x9D5B131e5bA37A238cd1C485E2D9d7c2A68E1d0F` |
| `SwappiPriceAdapter` | `0xD2Cc2a7Eb4A5792cE6383CcD0f789C1A9c48ECf9` |
| `PermitHandler` | `0x0D566aC9Dd1e20Fc63990bEEf6e8abBA876c896B` |
| Swappi V2 Router | `0x873789aaF553FD0B4252d0D2b72C6331c47aff2E` |
| Swappi V2 Factory | `0x36B83E0D41D1dd9C73a006F0c1cbC1F096E69E34` |

---

## Contract Verification

```bash
pnpm contracts:verify           # testnet
pnpm contracts:verify:mainnet   # mainnet
```

> **⚠️ viaIR + ConfluxScan limitation**
>
> The contracts are compiled with `viaIR: true`. ConfluxScan's API has a known
> bug where it cannot match constructor arguments for viaIR-compiled bytecode,
> causing a `constructor_args_not_match` error for `AutomationManager` and
> `SwappiPriceAdapter`. This is a ConfluxScan backend limitation, not an error
> in the deployment.
>
> **Sourcify** (enabled in `hardhat.config.ts`) verifies correctly and produces
> `full_match` results. The verified sources are publicly accessible at:
>
> - [AutomationManager on Sourcify](https://repo.sourcify.dev/contracts/full_match/1030/0x9D5B131e5bA37A238cd1C485E2D9d7c2A68E1d0F/)
> - [SwappiPriceAdapter on Sourcify](https://repo.sourcify.dev/contracts/full_match/1030/0xD2Cc2a7Eb4A5792cE6383CcD0f789C1A9c48ECf9/)
> - [PermitHandler on ConfluxScan](https://evm.confluxscan.org/address/0x0D566aC9Dd1e20Fc63990bEEf6e8abBA876c896B#code) ✅ (no constructor args → verifies fine)

---

## Docker Compose (Production-like)

> **Important:** the build context is the **parent `repos/` directory** so
> both `conflux-cas/` and `conflux-sdk/` are visible during the build.

```bash
# From inside conflux-cas/
cp .env.example .env
# (fill in JWT_SECRET, EXECUTOR_PRIVATE_KEY, AUTOMATION_MANAGER_ADDRESS)

docker compose up --build
# backend  → localhost:3001
# frontend → localhost:3000
```

Services communicate over Docker's internal network; the frontend proxies
`/api/*` to the backend via the App Router catch-all route handler.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Non-custodial** | Users pre-approve token allowance; keeper only calls `executeJob`, never holds funds |
| **SIWE authentication** | Standard wallet-based auth, no passwords; JWT valid 24 h |
| **SQLite + better-sqlite3** | Zero-dependency persistence, sync API, easy local dev; swap for Postgres in production |
| **SSE not WebSocket** | Simpler, works through HTTP/2, no socket management; read-only server→client stream |
| **App Router catch-all proxy** | `src/app/api/[...path]/route.ts` reliably intercepts `/api/*` before any page routing; avoids unreliable `next.config.cjs` rewrite ordering in dev |
| **Keeper is separate process** | Worker can be scaled, replaced, or paused independently from the API server |
| **Global Pause circuit breaker** | In-memory flag lets an admin halt all on-chain activity instantly without DB access |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | ✅ | — | 32-byte hex string for JWT signing |
| `DATABASE_PATH` | | `./data/cas.db` | SQLite file path |
| `PORT` | | `3001` | Backend HTTP port |
| `CORS_ORIGIN` | | `http://localhost:3000` | Allowed CORS origin(s) |
| `EXECUTOR_PRIVATE_KEY` | Worker only | — | Keeper wallet private key (no `0x`) |
| `NETWORK` | | `testnet` | `testnet` or `mainnet` |
| `AUTOMATION_MANAGER_ADDRESS` | Worker/Backend | see above | Deployed AutomationManager address |
| `PRICE_ADAPTER_ADDRESS` | Backend | see above | Deployed SwappiPriceAdapter address |
| `PERMIT_HANDLER_ADDRESS` | Backend | see above | Deployed PermitHandler address |
| `CONFLUX_ESPACE_TESTNET_RPC` | | `https://evmtestnet.confluxrpc.com` | Testnet RPC URL |
| `CONFLUX_ESPACE_MAINNET_RPC` | | `https://evm.confluxrpc.com` | Mainnet RPC URL |
| `DEPLOYER_PRIVATE_KEY` | Deploy scripts | — | Deployer wallet key (`0x`-prefixed) |
| `CONFLUXSCAN_API_KEY` | Verification | `no-key` | Get free key at evmapi.confluxscan.org |
| `BACKEND_URL` | Frontend prod | `http://localhost:3001` | Backend origin for proxy |
| `NEXT_PUBLIC_WC_PROJECT_ID` | | — | WalletConnect project ID |
| `NEXT_PUBLIC_NETWORK` | | `testnet` | Chain for wallet connection (`testnet`/`mainnet`) |
| `NEXT_PUBLIC_AUTOMATION_MANAGER_ADDRESS` | Frontend | see above | AutomationManager address exposed to browser |

---

## Project Structure

```
conflux-cas/
├── shared/          # Zod schemas, shared TypeScript types
├── contracts/       # Solidity + Hardhat (AutomationManager.sol)
├── backend/         # Express API: auth, jobs, SSE, admin
│   └── src/
│       ├── routes/  # auth.ts, jobs.ts, admin.ts
│       ├── services/ # job-service, keeper-client, admin-service
│       ├── sse/     # Real-time event stream
│       └── auth/    # SIWE + JWT middleware
├── worker/          # Keeper daemon: price checks + on-chain execution
│   └── src/
│       ├── checker.ts   # Price oracle + condition evaluation
│       ├── executor.ts  # On-chain execution via ethers.js
│       └── main.ts      # Poll loop
├── frontend/        # Next.js 14 App Router
│   └── src/app/
│       ├── api/[...path]/ # Backend proxy route handler
│       ├── create/        # Strategy builder page
│       ├── dashboard/     # Live job dashboard
│       └── safety/        # Admin pause/resume
└── docker-compose.yml
```

---

## License

MIT — see [LICENSE](./LICENSE)

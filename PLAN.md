# Project Plan: conflux-sdk + conflux-cas

**Bounty:** #08 – Conflux Automation Site ($1,000)  
**Last updated:** 2026-02-22

---

## Overview

Two repositories are being built from the existing `conflux-devkit` monorepo:

| Repo | Purpose | Status |
|------|---------|--------|
| `conflux-sdk` | Clean reusable library derived from `conflux-devkit` | ✅ Done |
| `conflux-cas` | Conflux Automation Site — the bounty deliverable | ✅ In progress |

### Documentation

| Document | Content | Update frequency |
|---|---|---|
| [conflux-cas/docs/ARCHITECTURE.md](conflux-cas/docs/ARCHITECTURE.md) | Static reference — layers, contracts, deployment guide, key decisions | Updated only when architecture changes |
| [conflux-cas/docs/DEVIATIONS.md](conflux-cas/docs/DEVIATIONS.md) | Living changelog of all implementation deviations (D1–D65+) | Updated every session |

---

## Step-by-Step Execution Plan

### Week 1 — SDK extraction + project scaffolding

| Step | Task | Status |
|------|------|--------|
| 1 | Init `conflux-sdk` repo; add tooling (pnpm, TS, Biome, Vitest, tsup) | ✅ Done |
| 2 | Extract & clean `clients` + `config` + `types` from `core` | ✅ Done |
| 3 | Extract & clean `contracts` module | ✅ Done |
| 4 | Extract & clean `wallet` module | ✅ Done |
| 5 | Extract & clean `services` (framework-agnostic) | ✅ Done |
| 6 | Extract & clean `hooks` + `providers` | ⬜ Skipped (see D1) |
| 7 | Write barrel `src/index.ts`; run full build + type-check | ✅ Done |
| 8 | Scaffold `conflux-cas` monorepo structure | ✅ Done |

### Week 2 — Smart contracts + worker core

| Step | Task | Status |
|------|------|--------|
| 9 | Write `AutomationManager.sol` + `IAutomationManager.sol` | ✅ Done |
| 10 | Write `SwappiPriceAdapter.sol` | ✅ Done |
| 11 | Write `PermitHandler.sol` | ✅ Done |
| 12 | Hardhat deploy scripts + local network test | ✅ Done |
| 13 | Contract tests (12/12 passing) | ✅ Done |
| 14 | Bootstrap `worker/`: `JobPoller`, `PriceChecker`, `Executor` | ✅ Done |
| 15 | Implement `SafetyGuard` + `AuditLogger` | ✅ Done |
| 16 | Implement `RetryQueue` + circuit breaker | ✅ Done |

### Week 3 — Backend API + frontend shell

| Step | Task | Status |
|------|------|--------|
| 17 | DB schema + Drizzle migrations | ✅ Done |
| 18 | SIWE auth routes + JWT middleware | ✅ Done |
| 19 | Job CRUD routes + `JobService` | ✅ Done |
| 20 | Execution history routes + SSE channel | ✅ Done |
| 21 | Admin routes (pause/resume) + `AdminService` | ✅ Done |
| 22 | Backend tests (16/16 passing) | ✅ Done |
| 23 | Next.js app scaffold; wagmi config for Conflux eSpace | ✅ Done |
| 24 | Strategy Builder forms (LimitOrder + DCA) | ✅ Done |

### Week 4 — Dashboard, integration, testing, docs

| Step | Task | Status |
|------|------|--------|
| 25 | Dashboard: JobTable + JobCard + status indicators | ✅ Done |
| 26 | Job detail page + ExecutionHistory | ✅ Done |
| 27 | Safety panel: GlobalPause + AuditLog | ✅ Done |
| 28 | SSE consumer hook (`useJobSSE`) for live updates | ✅ Done |
| 29 | SIWE login flow in frontend (`useAuth` hook) | ✅ Done |
| 30 | KeeperClient viem implementation | ✅ Done |
| 31 | DB-backed JobStore wiring worker → backend DB | ✅ Done |
| 32 | Worker main entrypoint + graceful shutdown | ✅ Done |
| 33 | Backend integration tests (supertest + in-memory SQLite) | ✅ Done |
| 34 | Admin routes (pause/resume) | ✅ Done |
| 35 | `.env.example` + `drizzle.config.ts` | ✅ Done |
| 36 | Docker Compose: all services orchestrated | ✅ Done |
| 37 | SDK: tests + README + architecture diagram | ✅ Done |
| 38 | CAS: README, architecture diagram, deployment guide | ✅ Done |
| 39 | **Final review: acceptance criteria checklist, security audit** | ⬜ Pending |
| 40 | On-chain Swappi pool discovery → searchable token dropdowns | ✅ Done (D27–D35) |
| 41 | On-chain job registration wiring (`createLimitOrder` → `JobCreated` → `onChainJobId`) | ✅ Done (D36–D46) |
| 42 | End-to-end execution bug fixes | ✅ Done (D47–D61) |
| 43 | Uniswap-style strategy builder UI redesign | ✅ Done (D63) |
| 44 | CFX / wCFX transparent pair handling on both sides | ✅ Done (D64) |
| 45 | Pair-change field reset + price loading shimmer | ✅ Done (D65) |
| 46 | Frontend RPC flood fix (`batchSize`, chunked balance fetching) | ✅ Done (D62) |
| 47 | DCA tick progress tracking (`markDCATick`; `swapsCompleted` in DB) | ✅ Done (D66) |
| 48 | "Details →" link on all JobCards | ✅ Done (D67) |
| 49 | Cold-start token list + balance regression fix | ✅ Done (D68) |
| 50 | **Phase 1 — Lint hardening:** Biome 2.x workspace root config; 0 errors · 45 warnings | ✅ Done (D80) |
| 51 | **Phase 2 — Test coverage:** MockRouter.sol; +17 contract tests; +22 executor tests → 137/137 | ✅ Done (D81) |
| 52 | **Phase 3 — SDK automation extraction:** `@cfxdevkit/sdk/automation` module; CAS thin re-exports; 170/170 tests | ✅ Done (D82) |

---

## Acceptance Criteria

| Bounty Requirement | Status |
|---|---|
| Strategies require explicit approvals; no arbitrary custody | ✅ `approve(manager)` step in UI; `safeTransferFrom` at execution time |
| Limit orders execute only when price crosses target ± slippage | ✅ `SafetyGuard.check()` off-chain + `PriceConditionNotMet` on-chain revert |
| DCA jobs run on schedule with retry logic | ✅ `JobPoller` timer + `RetryQueue` (exponential backoff) |
| Global pause + per-job cancel persists across restarts | ✅ On-chain `Pausable`; DB `system_state.paused`; worker reads both on startup |
| Dashboard reflects job state + execution history | ✅ SSE-driven `JobTable`; `/job/[id]` execution history with ConfluxScan tx links |

---

## Pending

- **Step 39** — Final review, acceptance criteria walkthrough, security audit, submission checklist

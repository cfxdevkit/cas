# Conflux Automation Site — Deviation Log

> **Living changelog.** Append a new section every time implementation diverges from the plan.  
> Entries are grouped by phase and numbered sequentially.  
> For static architecture reference, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## SDK Extraction (Week 1)

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

---

## CAS Contracts + Worker (Week 2)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D11 | W2-3 | `ISwappiRouter` and `ISwappiFactory` moved to **file scope** in `SwappiPriceAdapter.sol` | Solidity does not support nested interface declarations inside a contract body. Both interfaces are now declared at the top of the file, before the `SwappiPriceAdapter` contract. |
| D12 | W2-7 | Hardhat chai v6 incompatible with `hardhat-toolbox` v5 | `@nomicfoundation/hardhat-toolbox` v5 requires `chai@^4` (not v6). Added `chai@^4.5.0` and `@types/chai@^4.3.16` explicitly in `contracts/package.json`. |
| D13 | W2-7 | Pino v9 logger API: bindings must be **first argument** | `logger.info(bindings, message)` — NOT `logger.info(message, bindings)`. All worker files had the argument order wrong; corrected during type-check. |

---

## CAS Backend + Frontend (Week 3)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D14 | W3 | Express v5 requires explicit `Express` app type and `Router as RouterType` alias | TypeScript `TS2742` portability error. Fixed by annotating `const app: Express = express()` and `const router: RouterType = Router()` throughout. Also `req.params.id as string`; in Express v5 params are `string \| string[]`. |
| D15 | W3-4 | wagmi connectors removed from `providers.tsx` | Importing from `wagmi/connectors` triggered deep `TS2742` errors from pnpm phantom-dep resolution. Workaround: bare `createConfig({ chains, transports })` with no `connectors`; wallet connectors are auto-injected via EIP-1193 at runtime. |
| D16 | W3 | `migrate.ts` accesses `db.client` (drizzle internal) | `BetterSQLite3Database` exposes `.client` in v0.33; works but depends on a drizzle internal API. |
| D17 | W3 | `next.config.cjs` and `tailwind.config.cjs` use CommonJS | Next.js 14 config loader does not respect workspace `tsconfig.json` `moduleResolution: "bundler"`. CJS bypasses the issue. |

---

## CAS Integration + Docker (Week 4)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D18 | W4-33 | `cancelJob` DELETE route never handled the `'forbidden'` string | The string is truthy so it fell through to `res.json({ job })` with status 200. Added an explicit `result === 'forbidden'` guard returning 403 before the null/404 check. |
| D19 | W4-32 | Worker `tsup.config.ts` only listed `src/index.ts`; `src/main.ts` was not compiled | `docker CMD node dist/main.js` would fail at runtime. Added `src/main.ts` to the `entry` array. |
| D20 | W4 | `contracts/hardhat.config.ts` imported `dotenv` but it was absent from devDependencies | TS2307 "Cannot find module 'dotenv'". Fixed by adding `dotenv` to `contracts` devDeps. |
| D21 | W4-36 | Frontend `vitest run` exits with code 1 when no test files exist | Vitest fails when include glob matches nothing. Added `vitest.config.ts` with `passWithNoTests: true`. |

---

## User-Testable Wiring

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D22 | W4-34 | `layout.tsx` had `'use client'` + `metadata` export simultaneously | Next.js App Router silently ignores `metadata` when `'use client'` is present. Removed `'use client'` — layout is a server component rendering client sub-components. |
| D23 | W4 | Frontend used `localStorage.getItem('cas_token')` but `useAuth` stores `cas_jwt` | Token key mismatch — Dashboard and JobCard never read the JWT. Standardised all components on `cas_jwt`. |
| D24 | W4 | `StrategyBuilder` sent human-readable values but backend schema requires wei strings | `LimitOrderSchema` validates `amountIn`, `minAmountOut`, `targetPrice` as digit-only strings. Added `parseUnits` from viem; derived `minAmountOut = expected * (10000 - slippageBps) / 10000n`. |
| D25 | W4 | `EventSource` does not support custom `Authorization` headers | Added `?token=` query param fallback in `sse/events.ts`; JWT is validated from query string when no header is present. |
| D26 | W4 | Next.js had no proxy for `/api/*` → backend | Added `async rewrites()` to `next.config.cjs` forwarding `/api/:path*` → `BACKEND_URL/:path*`. |

---

## On-Chain Pool Discovery + UX Polish

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D27 | Step 40 | Free-text address inputs replaced with on-chain Swappi pool discovery | `GET /pools` backend route enumerates all factory pairs; new `usePoolTokens` hook + `TokenSelect` searchable dropdown. |
| D28 | Step 40 | Multicall3 is **not deployed** on Conflux eSpace testnet | Canonical `0xcA11bde…` returns `"0x"` bytecode. Switched to `Promise.allSettled` of individual `readContract` calls with `batch: true` on the HTTP transport. |
| D29 | Step 40 | Tokens with failed metadata kept as `'Unknown'` | Some Swappi pair slots point to non-ERC20 contracts. Tokens are now excluded if any of `symbol`/`name`/`decimals` fails. |
| D30 | Step 40 | Token In dropdown showed all tokens regardless of wallet balance | Token In list now filters to tokens the user holds (`balanceWei > 0`). Falls back to full list when wallet is empty. |
| D31 | UX | `useAccount()` causes React hydration mismatch on wallet-gated pages | wagmi reads `localStorage` state on the client; server always returns `isConnected: false`. Fixed with `mounted` flag (initialized `false`, set in `useEffect`). Affected: `NavBar`, `DashboardPage`, `CreatePage`, `StrategyBuilder`. |
| D32 | Step 26 | `GET /jobs/:id/executions` sub-route was missing | Added to `backend/src/routes/jobs.ts`; `JobCard` → Details link; `frontend/src/app/job/[id]/page.tsx` created. |
| D33 | Testnet deploy | Deploy script had wrong Swappi factory address | Updated to correct checksummed address (`0x36B83E0D41D1dd9C73a006F0c1cbC1F096E69E34`). Fixed root `package.json` `contracts:deploy` command (was invoking pnpm's own `deploy` sub-command). |
| D34 | Tooling | Added `scripts/gen-key.mjs` for secp256k1 key pair generation | Clarified that `EXECUTOR_PRIVATE_KEY` + `DEPLOYER_PRIVATE_KEY` require `0x` prefix; `.env.example` comment was wrong. |
| D35 | Step 40 / UX | Token In dropdown did not include native CFX | Swappi uses WCFX internally. Added synthetic `CFX (native)` entry using `CFX_NATIVE_ADDRESS = 0xEeee…EEeE`. Balance via `getBalance()`. `getPairedTokens()` maps CFX→wCFX for lookups; `resolveTokenInAddress()` maps sentinel→WCFX before submitting to backend. |

---

## On-Chain Execution Wiring (Step 41)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D36 | Step 41 | `GET /api/system/status` returned 404 | Route registered as `router.get('/')` but mounted at `/system`, making effective path `/system` not `/system/status`. Fixed to `router.get('/status')`. |
| D37 | Step 41 | Worker and backend wrote/read different SQLite files | Both used relative `./data/cas.db` but resolved from different CWDs. Fixed both to use `import.meta.url` / `__dirname` to always land at `conflux-cas/data/cas.db`. |
| D38 | Step 41 | Worker heartbeat crashed on `db.client` internal accessor | drizzle-orm `.client` internal is `undefined` in installed version. Fixed by storing raw `better-sqlite3` instance directly in `DbJobStore`. |
| D39 | Step 41 | Worker threw `no such table: jobs` on first run | Worker opened a fresh SQLite file without DDL. Fixed: `CREATE TABLE IF NOT EXISTS` for all tables in `DbJobStore` constructor. |
| D40 | Step 41 | `SafetyGuard` blocked every job with `"Job is not active (status: pending)"` | Guard required `status === 'active'` but new jobs start `'pending'`; worker transitions them. Fixed to allow both; added `JobStore.markActive()`. |
| D41 | Step 41 | `StrategyBuilder` never called `createLimitOrder()` on-chain | `AutomationManager` has `jobExists(jobId)` modifier keyed on a keccak256 hash; the DB UUID could never match. Fixed: (1) `onChainJobId` field in `shared/`; (2) frontend calls contract first → parses `JobCreated` event → POSTs with `onChainJobId`; (3) backend stores it; (4) worker passes it verbatim; (5) executor skips jobs with null `onChainJobId`. |
| D42 | Step 41 | `bytes32` size error — `uuidToBytes32()` helper produced `bytes36` | Symptom of D41 (wrong value entirely). Helper removed; keeper uses `onChainJobId` verbatim. |
| D43 | Step 41 | `privateKeyToAccount` not exported from `viem` main entry | viem v2 moved account utilities to a subpath. Fixed to `import { privateKeyToAccount } from 'viem/accounts'`. |
| D44 | Step 41 | `KeeperClientImpl` method signatures didn't match `KeeperClient` interface | Mismatched arg count and return type. Rewrote implementation to `(jobId, owner, params)` returning `{ txHash }`; added `chain: undefined, account` to `writeContract` calls. |
| D45 | Step 41 | `cancelJob` service never returned `'forbidden'` | Service filtered by `owner` in the WHERE clause, returning `null` on mismatch. Fixed: fetches row first, returns `'forbidden'` on owner mismatch, then updates with status guard. |
| D46 | Step 41 | `ALTER TABLE jobs ADD COLUMN` fails on existing DB (`duplicate column name`) | SQLite's `ALTER TABLE` has no `IF NOT EXISTS`. Wrapped in try/catch ignoring `/duplicate column/i`. Applied in both `migrate.ts` and `db-job-store.ts`. |
| D47 | Step 42 | `NEXT_PUBLIC_AUTOMATION_MANAGER_ADDRESS` always `undefined` in Next.js | Next.js reads `.env` from `frontend/`, not monorepo root. Added `loadRootEnv()` in `frontend/next.config.cjs` to inject missing `NEXT_PUBLIC_*` keys from `../.env` at startup. |
| D48 | Step 42 | ERC-20 `approve` step was missing — keeper's `safeTransferFrom` always reverted | `StrategyBuilder` now reads `allowance(owner, manager)`; if insufficient, calls `approve(manager, MAX_UINT256)` with step labels before registering on-chain. |
| D49 | Step 42 | Worker keeper ABI had no custom error fragments — reverts showed as `"revert: "` | Added all 11 custom error fragments to `AUTOMATION_MANAGER_ABI` in `keeper-client.ts`. |
| D50 | Step 42 | `PriceConditionNotMet` revert caused `markFailed` — transient race condition made jobs permanently fail | Spot price shifts between off-chain check and on-chain execution (thin testnet liquidity). Fixed: `PriceConditionNotMet` + `DCAIntervalNotReached` in catch → `return` without `markFailed`. |
| D51 | Step 42 | Retry exhaustion was invisible in the UI | `JobCard` now shows amber "⚠ Blocked — max retries reached (N/N)" banner when `retries >= maxRetries`. Job detail page shows orange banner with last error and cancel suggestion. |
| D52 | Step 42 | Token list loading was slow — a slow RPC call could drop tokens | Rewritten with stale-while-revalidate: metadata cached in `localStorage` (TTL 10 min) for instant render; balances resolve in background with `withTimeout(8 s, fallback=0n)` per call; `AbortController` prevents stale state. |
| D53 | Step 42 | Worker price source was a hardcoded mock (always 1e18) | Replaced with `createSwappiPriceSource` — calls `getAmountsOut(1e18, [tokenIn, tokenOut])` on the Swappi router. Falls back to `0n` + WARN on RPC error. |
| D54 | Step 42 | Retries could overshoot `maxRetries` (e.g. 6/5) | Two cooperating bugs: (1) `incrementRetry` called past cap; (2) retry queue held stale job reference. Fixed: guard `incrementRetry` with `if (retries < maxRetries)`; spread `{ ...job, retries: nextRetries }` into queue. |
| D55 | UX | Tokens disappeared on background refresh; pair selection was flaky | (1) Background `/api/pools` refresh sometimes returned fewer tokens (RPC hiccup) — `setTokens()` replaced the list with the shorter result. (2) `getPairedTokens()` compared addresses without `.toLowerCase()`. Fixed: `knownTokensRef`/`knownPairsRef` accumulate and never shrink; address comparisons `.toLowerCase()`; backend `_permanentTokens`/`_permanentPairs` Maps survive restarts. |
| D56 | Step 42 | `JobNotActive` revert caused spurious `markFailed` loop | On-chain `EXECUTED` job retried in DB after crash → `JobNotActive` revert → `markFailed`. Fixed: `JobNotActive` in catch → `markExecuted('chain-sync')`. |
| D57 | Step 41/42 | `waitForTransactionReceipt` threw "could not be found" before strategy was registered | Conflux eSpace testnet RPC can take 5–15 s to expose a receipt; viem's default polling timed out. Fixed: `pollingInterval: 2_000, timeout: 120_000` on both `waitForTransactionReceipt` calls; global `pollingInterval: 30_000` to avoid flooding. |
| D58 | Frontend UX | `wagmi/connectors` barrel import pulled in `@metamask/sdk` → React Native dep | Switched to `import { injected } from 'wagmi'` (sources from `@wagmi/core`). |
| D59 | RPC quota | `pollingInterval: 2_000` globally caused 30+ `eth_blockNumber` calls/min | Raised global to `30_000ms`. Per-call overrides for `waitForTransactionReceipt`. Added `staleTime: 30_000` + `gcTime: 60_000` to React Query. Added `batch: { wait: 16 }` to HTTP transports. |
| D60 | RPC quota | `Promise.allSettled([396 promises])` in `GET /pools` fired all calls simultaneously | Replaced with `chunkedSettled<T>(thunks, label)` helper: 10 thunks per chunk, 500 ms between chunks. |
| D61 | RPC quota | Thundering-herd: cold cache caused multiple concurrent `fetchPools()` chains | Added `_inflight: Promise<PoolsResponse> \| null` module-level guard. Only one `fetchPools()` chain runs at a time; concurrent requests share the same promise. |

---

## UI Redesign + RPC Flood Fix (Session 2026-02-20)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D62 | Frontend / RPC quota | `size: 20` key on viem HTTP transport was silently ignored — batch coalescing never activated; `Promise.all` of ~100 balance calls flooded testnet; duplicate `fetchBalances` effect fired on every address change | viem v2 uses `batchSize` (not `size`). Fixed in `providers.tsx`, `usePoolTokens.ts`, `useTokenPrice.ts`. `fetchBalances` rewritten to sequential chunks of 5 with 100 ms delay between chunks. Duplicate `useEffect` that re-fired `fetchBalances` on every `userAddress` change removed. Effective RPC rate cut from ~100 concurrent calls to ≤5 in-flight at any moment. |
| D63 | Frontend UX | Limit Order + DCA forms redesigned from a plain HTML grid to a Uniswap-style interface | User requested. Full `StrategyBuilder.tsx` rewrite (893 lines). Key changes: `TokenPill` + `TokenSelectButton` replace old `TokenSelect` dropdowns; `AmountPanel` contains amount input + USD row + balance chip; `SwapArrow` divider; tab bar (Limit Order / DCA) replaces radio buttons; target-price presets (Market, +1%, +5%, +10%) + loading shimmer; DCA *Every N [min/hr/day]* + *Over M [days/wks/mos]* layout; expiry quick-picks (1h / 1d / 1w / 1m / ∞); slippage preset row (0.1 / 0.5 / 1.0 / custom). |
| D64 | Frontend UX | CFX native (sentinel `0xEeee…`) was absent from one side of every pair — selecting CFX on Token In showed no paired tokens on Token Out, and vice versa | `getPairedTokens()` mapped CFX sentinel → wCFX for pair lookups but then resolved the counterpart token without re-injecting CFX for the wCFX position. Fixed: after resolving paired tokens, any entry whose address matches wCFX is replaced with the CFX native synthetic entry. `resolveTokenInAddress()` is now applied to **both** `tokenIn` and `tokenOut` before every contract call and every backend POST: wCFX address is sent at the protocol level while the UI consistently shows "CFX". |
| D65 | Frontend UX | Stale `amountIn`/`amountPerSwap`/`targetPrice` values persisted when the user switched token pair; `priceLoading` state was computed but never wired into UI | (1) Added `prevPairRef = useRef<string>('')` tracking `${tokenIn}-${tokenOut}`; a `useEffect` compares on every pair change and resets the three amount/price fields plus the `txStep` error. (2) `priceLoading` from `useTokenPrice` wired into: shimmer placeholder replacing the target-price input while loading; preset buttons disabled during fetch; USD equivalent rows showing `…` instead of a stale value. |

---

## Mainnet Router & Factory Fixes (2026-02-21)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D71 | Mainnet deploy | Swappi "v1" router addresses (`0x62B0873055Bf896CD869C105F5C9e585C0F3D7e7` and `0x62B0873055Bf896CD869C1A9EB6A4c9B4e2C270A`) have **zero bytecode** on Conflux eSpace mainnet | Both were treated as historical rollback targets when execution started failing, but an `eth_getCode` check confirmed both are undeployed EOA addresses. Only `0xE37B52296b0bAA91412cD0Cd97975B0805037B84` (Swappi v2) has deployed code (38k bytes). Updated all 6 source locations back to v2. |
| D72 | Mainnet deploy | Swappi factory `0x20b45b8a60E3a5051D9CE6e63Ad7614D3fa5ED54` stored in `deploy.ts`, `verify.ts`, and the deployed `SwappiPriceAdapter` has **zero bytecode** on mainnet | The factory address was copied from docs/notes without on-chain verification. The real factory address is obtained from `router.factory()` = `0xE2a6F7c0ce4d5d300F97aA7E125455f5cd3342F5` (844 pairs). Because `SwappiPriceAdapter.getPrice()` called `factory.getPair()` on a dead address, it always returned `address(0)` and silently returned `price=0`. For "trigger below" orders this made the price condition trivially true while the actual swap still failed downstream. Fixed in `deploy.ts` and `verify.ts`; `setFactory()` called on the deployed adapter (tx `0xf120a152...`, block 141639060). |
| D73 | Mainnet deploy | `SwappiPriceAdapter` has an `onlyOwner` `setFactory()` function specifically for this scenario, but there was no runnable script to call it | Created `contracts/scripts/fix-price-adapter-factory.ts` + `pnpm fix-adapter-factory` npm script. Script validates signer == owner, checks current vs expected factory, submits the tx, and confirms. |
| D74 | Worker keeper | Swap calldata deadline was `now + 300s` (5 min), causing `require(success, "Swap failed")` reverts on mainnet when block confirmation took longer than the deadline | Conflux eSpace mainnet can take several minutes to confirm a tx under load. Raised deadline to `now + 1800s` (30 min) in `keeper-client.ts \u2192 buildSwapCalldata()`. The correct rule: **never set a Uniswap-style swap deadline shorter than 10 min on any production EVM chain**. |

> **Lesson:** before changing any mainnet contract address, run `eth_getCode` against it first. A zero-code response (`"0x"`) means the address is an EOA or undeployed contract and will silently swallow all calls. See *Mainnet Address Verification* in [ARCHITECTURE.md](./ARCHITECTURE.md) for the canonical on-chain check commands.

---

_Append new deviations below this line as they occur._

## Token Icons (2026-02-21)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D78 | Frontend UX | Token selectors showed a coloured first-letter circle for every token — no real logos | GeckoTerminal's `?include=base_token,quote_token` pool response already carries `included[].attributes.image_url` for each token; no extra API call is needed. Changed: (1) `TokenInfo` in `backend/src/routes/pools.ts` gains `logoURI?: string`; (2) `fetchPoolsFromGecko` maps `image_url → logoURI` and backfills the field on duplicate entries across pages; (3) `PoolMeta` and `TokenWithBalance` in `usePoolTokens.ts` gain `logoURI?: string`; (4) localStorage cache key bumped to `cas_pool_meta_v2` (old cache shape lacked `logoURI`); (5) `metaToTokens` propagates `logoURI` explicitly; (6) `cfxEntryFrom(knownTokens)` helper builds the synthetic CFX native entry borrowing the wCFX `logoURI` so both CFX and wCFX show the same icon; (7) `TokenPill` component now renders `<img>` inside a `w-5 h-5 rounded-full bg-white overflow-hidden ring-1 ring-slate-600/50` wrapper — `bg-white` gives transparent/dark logos a consistent bright backing, `object-contain` prevents cropping, `overflow-hidden` clips bleeds; `onError` falls back to the existing coloured-letter circle. |
| D79 | Frontend UX | "When 1 [icon] TOKEN is worth" header in the Limit Order panel wrapped across multiple lines when the token icon was added | The surrounding `<span>` was block-level; the `TokenPill` and symbol text broke onto separate lines. Fixed by changing the `<span>` to `inline-flex items-center gap-1` and removing the `&nbsp;` separators. |

## CFX → wCFX Auto-wrap & Utility Panel (2026-02-21)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D75 | Frontend UX | Users holding native CFX could create a valid limit order or DCA job but execution always failed with `SafeERC20FailedOperation` because `AutomationManager.executeLimitOrder` calls `safeTransferFrom` on the WCFX ERC-20 (`tokenIn`), not on native CFX | Native CFX and WCFX are separately tracked assets. The user sees "0.93 CFX" in their wallet but has zero WCFX balance; `safeTransferFrom` fails silently at the contract level. Three changes: (1) **Auto-wrap on submit** — `StrategyBuilder.handleSubmit` now reads the user's WCFX balance before the approval step; if it is less than `requiredAllowance`, it calls `WCFX.deposit{value: shortfall}()` automatically, showing "Wrapping N CFX → wCFX…" as the step label; (2) **WCFX utility panel** — a collapsible row ("`wCFX in wallet: 0.000000 ▼ manage`") appears between the Sell/Allocate panel and the swap arrow whenever CFX is `tokenIn`. It surfaces current WCFX balance, an amber "⟳ N CFX will auto-wrap" warning when the entered amount exceeds the WCFX balance, and a Wrap/Unwrap sub-panel with tabs, amount field, Max button, and confirm button; (3) **Unlimited approval now shown for CFX path** — the approval toggle was previously hidden for native CFX; since the submit path always ends with a WCFX `approve()` call, the toggle is now shown unconditionally. Added `WCFX_ABI` (deposit, withdraw, balanceOf, allowance, approve) to `frontend/src/lib/contracts.ts`. |
| D76 | Worker / Dashboard | Execution History always showed `—` for Amount Out; stale retry error message persisted on the job card even after the retry resolved with `chain-sync` | `markExecuted` and `markDCATick` wrote `amountOut: null` unconditionally and never cleared `lastError`. Fixed: added `decodeAmountOut(logs, owner)` helper in `keeper-client.ts` that walks receipt logs in reverse and returns the raw decimal string from the last ERC-20 `Transfer(→owner)` event (the tokenOut amount). Updated `KeeperClient` interface and both execute methods to return `{ txHash, amountOut }`. Updated `JobStore.markExecuted` and `markDCATick` signatures to accept `amountOut?`; both now persist it in `executions.amount_out` and set `last_error = null`. |
| D77 | Local dev / wallet compat | Wallet extensions that enforce secure-origin policy (OKX, Bitget) rejected connections from `http://localhost:3000` with "Security risk detected — site is requesting use of a different domain (https://localhost:3000)" | Wallets compare the page origin against the HTTPS equivalent and block on mismatch. Two fixes: (1) Added `pnpm dev:https` script (`next dev --experimental-https`) to `frontend/package.json`; root `pnpm dev` now uses `dev:https` for frontend by default. Next.js auto-generates a self-signed cert (browser prompts once; `mkcert -install` + `mkcert` eliminates the warning). (2) Backend `CORS_ORIGIN` was hardcoded to `http://localhost:3000` in `.env`, blocking the new `https://localhost:3000` origin. Changed to comma-separated `http://localhost:3000,https://localhost:3000`; `backend/src/index.ts` now splits the env var into an array and uses a function-based `cors()` origin handler. |
| D78 | Frontend UX | Token icons were absent from the `TokenPill` swap pair labels — users had to remember symbols | GeckoTerminal's `/pools/{network}/{address}` response embeds `included[].attributes.image_url` for each token in the pool. The `fetchPoolsFromGecko` call in `pool-service.ts` now captures `image_url` and stores it as `logoURI` in the `TokenInfo` backend type (and in `cas_pool_meta_v2` cache). A `cfxEntryFrom()` helper borrows `wCFX`'s `logoURI` for the native-CFX pseudo-token. `TokenPill` renders a `<img>` inside a `bg-white rounded-full overflow-hidden ring-1` container with `object-contain` + `onError` fallback. Cache key bumped to `v2`. |
| D79 | Frontend auth / state desync | `useAuth()` was a plain hook — NavBar and `page.tsx` each called it as an independent instance; `login()` in NavBar updated NavBar's local `token` state but NOT `page.tsx`'s state. The two components only stayed in sync by accident (both re-reading localStorage on the next render). Additionally, the sign-in step required two manual user actions: connect wallet, then click "Sign In". | Replaced `useAuth` hook with an `AuthProvider` context (`frontend/src/lib/auth-context.tsx`). Single `token` state lives in the provider; all consumers call `useAuthContext()` for a shared reference. Auto-sign guard: `autoSignedForRef = useRef<string|null>(null)` fires `login()` once per `address` when `isConnected && !token`. User rejection sets `error` state; "Sign In" retry button appears in both NavBar and `page.tsx`. `page.tsx` now uses a 4-state machine: not-connected → wrong-network → signing-spinner → rejected-retry → authenticated. All direct `localStorage.getItem('cas_jwt')` calls removed from `Dashboard.tsx`, `JobCard.tsx`, `StrategyBuilder.tsx`, and `job/[id]/page.tsx`. Old `hooks/useAuth.ts` deleted. |

## DCA Execution Tracking (2026-02-20)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D66 | Step 41/42 | DCA job set to `status: 'executed'` after the **first** swap — `swapsCompleted` never incremented | `_processDCA` called `markExecuted()`, which unconditionally sets `status: 'executed'` and never touches `params_json`. A 10-swap DCA job was permanently closed after 1 swap; Progress showed "0 / 10" because the count was never written. Fixed: added `markDCATick(jobId, txHash, newSwapsCompleted, nextExecution)` to the `JobStore` interface and `DbJobStore`. It updates `swapsCompleted` + `nextExecution` in `params_json`, inserts an execution record, and sets `status: 'executed'` only when `swapsCompleted >= totalSwaps`, keeping the job `active` between swaps. `_processDCA` now calls `markDCATick` after a successful on-chain tick. |
| D67 | Dashboard UX | "Details →" link was completely absent from `JobCard` | The component had no `<Link href="/job/[id]">` at all. Added at the bottom of every card regardless of job status. |
| D68 | Frontend UX regression | Cold start: token list empty after 72s wait; wallet balances not shown | `usePoolTokens` Step-B only called `setTokens([...metaToTokens])` in the `!userAddress` branch. With a wallet connected, `setLoading(false)` fired before `setTokens`, so the UI rendered with `loading=false, tokens=[]`. Balances only appeared after ALL `fetchBalances` chunks completed (several more seconds). On partial RPC timeout the balance amounts were permanently 0. Fix: replaced the conditional `setTokens` with a functional update that always fires after the backend responds — cold start initialises from zero-balance metadata, warm start preserves existing enriched balances so there is no flash-to-zero. |
| D69 | Dashboard live updates + layout | Dashboard never updated when the worker executed jobs; layout was a stack of tall cards | **Updates**: the worker writes directly to SQLite, bypassing the REST API, so `pushJobUpdate()` in `events.ts` was never called for worker-triggered state changes. Fix: added `getJobsUpdatedSince(sinceMs)` to `JobService` (drizzle `gte` on `updatedAt`) and a 15 s `setInterval` poller in `events.ts` that queries `updated_at > lastPoll - 2 s` and calls `pushJobUpdate` for each changed job. **Layout**: rewrote `Dashboard.tsx` as a compact table — `JobRow` renders status/type/pair/amount/progress+next/retries/created/actions in one row; Active + History sections; SSE `onerror` 5 s reconnect; 30 s fallback re-fetch; token symbols from `cas_pool_meta_v1` localStorage (no extra RPC). |
| D70 | UX: unified single page | Landing page was a static hero with two nav links; Create and Dashboard lived on separate pages | Rewrote `page.tsx` as a unified single-page app: (1) not connected → hero with prominent **Connect Wallet** CTA; (2) connected but unsigned → **Sign In with Wallet** CTA with wallet address shown; (3) authenticated → `StrategyBuilder` centered at top + `Dashboard` table below, separated by a divider. `/create` and `/dashboard` now redirect to `/`. Removed Create Strategy and Dashboard links from `NavBar` since everything lives on the home route. |

## Quality Hardening (2026-02-22)

| # | Step | Deviation | Reason |
|---|------|-----------|--------|
| D80 | Tooling | Biome config was split between `conflux-sdk` and `conflux-cas` with duplicate rule sets | Unified under a single `biome.json` at the workspace root (`/repos/biome.json`); both project configs now extend with `"root": false, "extends": "//"`. Fixed 69 lint errors across 21 files (type="button" on 17 buttons, htmlFor/id wiring in SafetyPanel, StrategyBuilder checkbox `div→input[type="checkbox"]`, CSS overrides block, optional-chain-assignment patterns). Final state: **0 errors · 45 warnings** (all intentional: `noNonNullAssertion`, `noExplicitAny`, `noSvgWithoutTitle`, `noImgElement`). |
| D81 | Testing | Execution-layer tests were completely absent — 98 tests covered types, DB, and API only; the worker executor and contract execution paths had 0 coverage | Added `contracts/contracts/mocks/MockRouter.sol` — a configurable swap simulator that lets Hardhat tests fully exercise `executeLimitOrder` and `executeDCATick` without a live DEX. Added 17 contract tests: happy-path executions, `TooManyJobs`, `JobNotFound`, `JobNotActive`, `expireJob`. Added `worker/src/executor.test.ts` with 22 tests covering `JobNotFound` (remote-cancel detection), `JobNotActive`, transient-error retry, safety-guard block, dry-run mode, successful execution, and retry exhaustion. Test total: **137/137 passing**. |
| D82 | Architecture | Worker utilities (`SafetyGuard`, `RetryQueue`, `PriceChecker`) and `AUTOMATION_MANAGER_ABI` were duplicated inside the CAS worker; `@conflux-cas/shared` re-declared the same `Job`, `SafetyConfig`, etc. types that had no SDK home | Extracted a new `@cfxdevkit/sdk/automation` sub-module (7 source files + tests) with an injectable `AutomationLogger` interface so the SDK ships without a pino dependency. All three worker utility classes are now SDK-canonical; worker files became one-line re-exports. `@conflux-cas/shared` type files became thin re-exports from `@cfxdevkit/sdk/automation`. `AUTOMATION_MANAGER_ABI` removed from `keeper-client.ts` and imported from the SDK. 33 new SDK tests added. **Total: 170/170 passing.** Also resolved a pre-existing esbuild build failure in `keystore.ts` (12 optional-chain-on-assignment-target TS errors). |

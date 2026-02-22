# Conflux Automation Site — User Manual

> **App URL (local dev):** http://localhost:3000  
> **Prerequisites:** MetaMask (or compatible EIP-1193 wallet) + some testnet CFX

---

## Network Setup

Before using the app, add **Conflux eSpace Testnet** to MetaMask:

| Field | Value |
|-------|-------|
| Network name | Conflux eSpace Testnet |
| RPC URL | https://evmtestnet.confluxrpc.com |
| Chain ID | 71 |
| Currency symbol | CFX |
| Block explorer | https://evmtestnet.confluxscan.io |

Get free testnet CFX at https://faucet.confluxnetwork.org/

---

## User Stories

---

### Story 1 — Connect Wallet and Sign In

**As a user, I want to connect my wallet so the app knows who I am.**

1. Open http://localhost:3000 — you see the **home page** with the tagline and two buttons.
2. In the top-right corner of the nav bar, click **Connect Wallet**.
3. Select MetaMask in the wallet modal and approve the connection.
4. The button changes to show your truncated address (e.g. `0xd8dA…6045`).
5. Click the address button again → click **Sign In**.
6. MetaMask shows a **Sign-In With Ethereum** message — click **Sign**. No gas is spent; this is an off-chain signature.
7. The app stores a JWT in your browser. You are now authenticated for 24 hours.

> **What happens behind the scenes:** The app requests a one-time challenge from the backend, you sign it with your wallet, and the backend issues a JWT. No password, no custody.

---

### Story 2 — Create a Limit Order

**As a user, I want to buy Token B when Token A reaches my target price.**

1. Click **Create Strategy** in the nav bar (or the hero button on the home page).
   - If your wallet is not connected, you see a prompt — connect first (Story 1).
2. On the **Create Strategy** page, the form defaults to **Limit Order** mode.
3. Fill in the fields:

   | Field | What to enter | Example |
   |-------|--------------|---------|
   | **Token In** | Address of the token you are selling | `0xabc…` (your ERC-20) |
   | **Token Out** | Address of the token you are buying | `0xdef…` |
   | **Amount In** | Human-readable amount to sell | `100` |
   | **Target Price** | Desired rate (Token Out per Token In) | `1.05` |
   | **Direction** | When to fire | `Execute when price ≥ target` |
   | **Expires in** | Days until the order expires (optional) | `7` |
   | **Max Slippage** | Drag slider — shown as a percentage | `0.5%` |

4. Click **Submit Order**.
5. On success, a **"View Dashboard →"** button appears. Click it to see your new job.

> **Important:** Before the keeper can execute the trade, you must `approve` the Token In contract to allow the AutomationManager contract to spend your tokens (standard ERC-20 allowance — not yet automated in the UI, use Etherscan or a separate script).

---

### Story 3 — Create a DCA Strategy

**As a user, I want to buy Token B in small recurring amounts over time.**

1. Click **Create Strategy** in the nav bar.
2. Click the **DCA** tab at the top of the form.
3. Fill in the fields:

   | Field | What to enter | Example |
   |-------|--------------|---------|
   | **Token In** | Address of the token you are spending | `0xabc…` |
   | **Token Out** | Address of the token you are accumulating | `0xdef…` |
   | **Amount Per Swap** | How much to spend each interval | `10` |
   | **Interval (hours)** | Time between each execution | `24` |
   | **Total Swaps** | How many times to execute | `10` |
   | **Max Slippage** | Drag slider | `1%` |

4. Click **Submit DCA**.
5. On success, click **"View Dashboard →"**.

> A DCA of `10` tokens every `24` hours for `10` swaps will spend a total of `100` tokens over 10 days.

---

### Story 4 — Monitor Strategies on the Dashboard

**As a user, I want to see all my active and historical strategies.**

1. Click **Dashboard** in the nav bar.
   - If your wallet is not connected, you see a prompt — connect first.
2. The dashboard loads your jobs and subscribes to a **live event stream** (SSE). Updates appear automatically — no page refresh needed.
3. Each job card shows:

   | Field | Meaning |
   |-------|---------|
   | **Job ID** | Unique identifier |
   | **Type** | `limit_order` or `dca` |
   | **Status badge** | See table below |
   | **Token In → Token Out** | The token pair |
   | **Amount** | Amount per execution |
   | **Created** | Timestamp |
   | **Cancel button** | Only visible for `pending` / `active` jobs |

4. **Job status lifecycle:**

   | Status | Colour | Meaning |
   |--------|--------|---------|
   | `pending` | Yellow | Waiting for price condition to be met |
   | `active` | Green | Currently being processed by the keeper |
   | `completed` | Blue | Successfully executed on-chain |
   | `cancelled` | Grey | Cancelled by you or expired |
   | `failed` | Red | Execution failed (insufficient allowance, gas, etc.) |

---

### Story 5 — Cancel a Strategy

**As a user, I want to cancel a pending strategy before it executes.**

1. Go to the **Dashboard**.
2. Find the job you want to cancel — it must have status `pending` or `active`.
3. Click the **Cancel** button on the job card.
4. The card status immediately updates to `cancelled` via the live event stream.

> Once a job is `completed` or already `cancelled`, it cannot be undone.

---

### Story 6 — Use the Safety Panel (Admin)

**As an admin, I want to pause all keeper activity instantly.**

1. Click **Safety** in the nav bar.
2. You must be signed in (JWT in localStorage). If not, the toggle has no effect.
3. The panel shows the **Global Pause** toggle:
   - **OFF** (default) — the keeper worker is running normally.
   - **ON** — all keeper execution is halted immediately; no new on-chain transactions will be submitted.
4. Toggle **Global Pause** to `ON` to halt the keeper.
5. Toggle back to `OFF` to resume normal operation.

> The pause state is in-memory on the backend. It resets to `OFF` if the backend process restarts.

---

## Wallet Management & Custody Model

### Your keys stay yours

CAS is **fully non-custodial**. The app and the keeper never hold, import, or store your private key. The wallet is only used on your device for two things:

| Action | When | Gas cost |
|--------|------|----------|
| **Sign In with Ethereum (SIWE)** | Once per session | None — off-chain signature |
| **ERC-20 `approve()` call** | Once per token, before first execution | Yes — on-chain transaction |

Everything else — monitoring prices, submitting the swap transaction — is done by the **keeper wallet** (`EXECUTOR_PRIVATE_KEY` in `.env`), which is a separate server-side wallet that only has permission to call `executeJob` on the contract. It cannot move your tokens arbitrarily.

---

### What the app stores in your browser

| Item | Storage | Expires |
|------|---------|---------|
| JWT (session token) | `localStorage` key `cas_jwt` | 24 hours |
| Wallet connection state | wagmi / MetaMask internal | Until you disconnect |

The JWT is a signed token that identifies your wallet address to the backend. If you clear localStorage or the 24-hour window passes, you will be prompted to sign in again — your strategies are unaffected.

---

### Required user interactions after a strategy is created

Once a strategy is submitted, the keeper handles execution automatically. However, there are two situations that still require your action:

#### 1 — Token approval (one-time per token, required before first execution)

The AutomationManager contract must be authorised to spend your Token In. This is a standard ERC-20 `approve()` call and must be done **before** the strategy fires.

**How to approve (current manual step):**

1. Find the AutomationManager contract address in your `.env` → `AUTOMATION_MANAGER_ADDRESS`.
2. Go to the Token In contract on [Conflux eSpace Testnet explorer](https://evmtestnet.confluxscan.io).
3. Use the **Write Contract** → `approve(spender, amount)` function:
   - `spender` = the AutomationManager address
   - `amount` = at least the total amount your strategy will spend (use `uint256` max for unlimited: `115792089237316195423570985008687907853269984665640564039457584007913129639935`)
4. Sign the transaction in MetaMask.

> A future version of the UI will guide you through the approval inline during strategy creation.

#### 2 — Re-signing after session expiry

The JWT expires after **24 hours**. If this happens while viewing the dashboard:

- New jobs won't load (the backend returns 401).
- The SSE stream disconnects.

Simply click your wallet address in the nav → **Sign In** to get a fresh JWT. Your existing strategies are unaffected — the keeper continues executing them regardless of whether you are signed in.

#### 3 — Cancellation (optional, user-triggered)

If you want to stop a strategy before it executes, you must actively cancel it from the Dashboard (Story 5). Strategies do **not** cancel themselves if the price never reaches the target — they remain `pending` until they either execute, expire (if you set an expiry), or you cancel them manually.

---

## How Prices Are Monitored

Price monitoring is handled entirely by the **keeper worker** — a background server process. Your browser and wallet are not involved after strategy creation.

### The poll loop

The worker runs a tick on a fixed interval (default **15 seconds**, configurable via `WORKER_POLL_INTERVAL_MS`):

```
every 15 s:
  1. Load all pending/active jobs from the database
  2. For each job → check price condition (or DCA timer)
  3. If condition met → run SafetyGuard checks
  4. If guard passes → submit on-chain tx via the keeper wallet
  5. Update job status in the database → SSE event pushed to browser
```

### Price source

Prices are read **on-chain** from the **Swappi DEX** (Conflux eSpace's primary AMM). The `PriceChecker` calls the `SwappiPriceAdapter` contract via a `readContract` call — a free, gas-less read that queries the current pool reserves to calculate a spot price scaled to `1e18`.

> **Current state:** The worker boots with a placeholder price source that returns `1:1` (`1e18`) for all pairs. In production the `MOCK_PRICE_SOURCE` in `main.ts` must be replaced with a live `readContract` call to the deployed `SwappiPriceAdapter` contract. The interface (`PriceSource`) and all surrounding logic are fully wired.

### Condition evaluation

| Strategy type | Trigger condition |
|---------------|-------------------|
| **Limit Order (gte)** | `currentPrice ≥ targetPrice` (price rose to or above target) |
| **Limit Order (lte)** | `currentPrice ≤ targetPrice` (price fell to or below target) |
| **DCA** | `Date.now() ≥ nextExecution` (interval timer elapsed) |

Prices are represented as `uint256` integers scaled by `1e18` — the same format used on-chain. When you enter `1.05` as a target price in the form, the frontend converts it to `1050000000000000000` (`parseUnits("1.05", 18)`) before sending it to the backend.

### SafetyGuard circuit breakers

Even when a price condition is met, the keeper runs a second set of off-chain checks before submitting any transaction:

| Check | Default limit | What it prevents |
|-------|--------------|-----------------|
| **Global Pause** | — | All execution (toggled from the Safety page) |
| **Max swap USD** | $10,000 per swap | Accidentally large trades |
| **Max retries** | 5 attempts | Stuck jobs consuming gas indefinitely |
| **Max gas price** | 1,000 Gwei | Executing during network congestion spikes |
| **Job expiry** | Set per strategy | Stale orders firing long after creation |
| **DCA interval** | Set per strategy | DCA ticking faster than the configured interval |

If any check fails, the job is **not** executed that tick and the worker logs a safety violation. It will be re-evaluated on the next poll cycle.

### What happens on execution

1. The keeper wallet calls `executeJob(jobId, swappiRouter, swapCalldata)` on the `AutomationManager` contract.
2. The contract verifies the job exists, the caller is authorised, and the `minAmountOut` slippage guard is satisfied.
3. The contract pulls Token In from your wallet (using the allowance you pre-approved) and routes the swap through Swappi.
4. Token Out is sent directly to your wallet address.
5. The keeper marks the job `completed` in the database and broadcasts an SSE event — your Dashboard updates live.

### Retry behaviour

If an execution fails (e.g. insufficient allowance, gas spike, RPC timeout):

- The job is placed on an **in-memory retry queue** with exponential back-off.
- It will be retried on subsequent ticks up to `maxRetries` (default: 5).
- After 5 failures the job is marked `failed` and no further attempts are made.

---

## Navigation Reference

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Conflux Automation   Create Strategy  Dashboard  Safety  │
│                                              [Connect Wallet]│
└─────────────────────────────────────────────────────────────┘
```

| Nav Link | URL | Requires wallet |
|----------|-----|-----------------|
| Logo / home | `/` | No |
| Create Strategy | `/create` | Yes (connected) |
| Dashboard | `/dashboard` | Yes (connected) |
| Safety | `/safety` | Yes (signed in) |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Connect your wallet" shown on Create/Dashboard | Click **Connect Wallet** in the nav and approve MetaMask |
| Strategy submission returns "Not signed in" | Click your address → **Sign In** and sign the SIWE message |
| Dashboard shows no jobs / spinner forever | Make sure the backend is running on port 3001: `pnpm run dev:backend` |
| Live updates stop coming | Refresh the page — SSE reconnects automatically |
| Job stays `pending` forever | The keeper worker needs `EXECUTOR_PRIVATE_KEY` and a deployed `AUTOMATION_MANAGER_ADDRESS` in `.env`, then: `pnpm run dev:worker` |
| Trade executes but fails with `failed` status | Check your token allowance — you must `approve()` the AutomationManager contract to spend your Token In |
| Safety toggle has no effect | You must be signed in with a valid JWT; sign in first |

import { defineConfig } from '@wagmi/cli';
import { hardhat } from '@wagmi/cli/plugins';

/**
 * @wagmi/cli codegen config
 *
 * Reads compiled Hardhat artifacts from ./artifacts and emits type-safe
 * `as const` ABI + bytecode exports to the SDK's automation source tree.
 *
 * Run after compilation:
 *   pnpm compile && pnpm wagmi:generate
 *
 * The generated file is committed to conflux-sdk — it is the single source
 * of truth for ABI + bytecode used by the SDK, worker, and frontend.
 */
export default defineConfig({
  out: '../conflux-sdk/src/automation/generated.ts',
  plugins: [
    hardhat({
      project: './',
      // Explicit allowlist — only our 3 contracts, none of the OpenZeppelin
      // transitive artifacts or mock contracts
      include: [
        'AutomationManager.json',
        'SwappiPriceAdapter.json',
        'PermitHandler.json',
      ],
    }),
  ],
});

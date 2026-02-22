import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from '@wagmi/cli';
import { hardhat } from '@wagmi/cli/plugins';
import type { Plugin } from '@wagmi/cli';

/**
 * Custom plugin — appends `as const` bytecode exports for each contract so
 * that `@cfxdevkit/sdk/automation` can expose them for programmatic deploys
 * without pulling in Hardhat as a dependency.
 */
function hardhatBytecodePlugin(contractNames: string[]): Plugin {
  return {
    name: 'hardhat-bytecode',
    async run() {
      const lines: string[] = [
        '',
        '// ─── Deployment bytecode ─────────────────────────────────────────────────────',
        '// Used by conflux-cas/scripts/deploy.ts via viem deployContract.',
        '// Regenerate with: pnpm contracts:codegen',
      ];
      for (const name of contractNames) {
        const artifactPath = resolve(
          `./artifacts/contracts/${name}.sol/${name}.json`,
        );
        const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8')) as {
          bytecode: string;
        };
        const varName =
          name.charAt(0).toLowerCase() + name.slice(1) + 'Bytecode';
        lines.push(
          `export const ${varName} = '${artifact.bytecode}' as const;`,
        );
      }
      return { content: lines.join('\n') };
    },
  };
}

/**
 * @wagmi/cli codegen config
 *
 * Reads compiled Hardhat artifacts from ./artifacts and emits type-safe
 * `as const` ABI + bytecode exports to the SDK's automation source tree.
 *
 * Run after compilation:
 *   pnpm compile && pnpm wagmi:generate
 *   — or —
 *   pnpm contracts:codegen   (from monorepo root)
 *
 * The generated file is committed to conflux-sdk — single source of truth
 * for ABI + bytecode used by the SDK, worker, and frontend.
 */
export default defineConfig({
  out: '../conflux-sdk/src/automation/generated.ts',
  plugins: [
    hardhat({
      project: './',
      // Explicit allowlist — only our 3 production contracts
      include: [
        'AutomationManager.json',
        'SwappiPriceAdapter.json',
        'PermitHandler.json',
      ],
    }),
    hardhatBytecodePlugin([
      'AutomationManager',
      'SwappiPriceAdapter',
      'PermitHandler',
    ]),
  ],
});


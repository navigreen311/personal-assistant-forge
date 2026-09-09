/**
 * CommonJS stand-in for `uuid@13` in the real-database test lane.
 *
 * `uuid@13` is `"type": "module"` and ships **no** CommonJS build, so any test
 * that transitively imports it dies with `SyntaxError: Unexpected token 'export'`
 * — at *import*, not at an assertion, which makes it read like a broken test
 * rather than a module-format problem. P-11 hit it first and worked around it
 * inside its own module; P-05 hit it second. Nine packages each inventing a
 * workaround is exactly the divergence this run exists to avoid, so it is solved
 * once, here, and wired up in `jest.db.config.ts`.
 *
 * `transformIgnorePatterns` alone does not fix it: this project's `transform`
 * only matches `.tsx?`, so `.js` files under `node_modules` are never
 * transformed regardless of what is ignored.
 *
 * `crypto.randomUUID()` is a real RFC-4122 version-4 generator — the same thing
 * `uuid.v4()` returns — so production behaviour is unchanged and only the test
 * lane resolves differently. **`src/` still imports the real `uuid`.**
 *
 * Only `v4` is re-exported, because `grep -rhoE "import \{[^}]*\} from 'uuid'"`
 * across `src/` returns exactly `v4` and nothing else, in all 46 files that use
 * it. If a future package needs `v1`/`v5`/`validate`, add it here rather than
 * reaching for a local workaround.
 */

import { randomUUID } from 'node:crypto';

export function v4(): string {
  return randomUUID();
}

export default { v4 };

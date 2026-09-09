import type { Config } from 'jest';

/**
 * Real-database Jest config.
 *
 * Separate from jest.config.ts on purpose. The default suite is 320 files, 186
 * of which call jest.mock('@/lib/db') -- they must keep running with no database
 * present, so they stay where they are and this config only collects tests/db/.
 *
 * A suite that stubs Prisma cannot observe a missing tenant check, an unstarted
 * worker, or an audit log that is never written. Those are the audit's BLOCKERs,
 * so they need a suite that talks to a real Postgres. This is that suite.
 *
 * Run with `npm run test:db`. Requires DATABASE_URL and applied migrations.
 * --runInBand is set in the script: these tests share one database and must not
 * race each other.
 *
 * P-01 lands the harness in tests/helpers/db.ts.
 * P-04..P-14 each add a cross-tenant refusal test here.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/db'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // uuid@13 is ESM-only with no CommonJS build; see tests/helpers/uuid-cjs-shim.ts
    // for why this is a mapping rather than transformIgnorePatterns.
    '^uuid$': '<rootDir>/tests/helpers/uuid-cjs-shim.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testTimeout: 30000,
};

export default config;

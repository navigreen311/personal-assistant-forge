import type { Config } from 'jest';

// P-25: the unit suite must not touch a shared Redis.
//
// `.github/workflows/ci.yml` gives the unit job no Redis service on purpose,
// and says why at length: the offline-queue tests here exist to prove the
// documented in-memory degradation path actually degrades. On a developer box
// running Memurai they took the other branch instead, and joined a Redis key
// space shared with every other jest process on the machine -- which is how
// three concurrent runs of this suite produced 16 failing lanes out of 18, and
// three concurrent full runs failed 16 of 21, in files nobody had edited. See
// tests/helpers/redis.ts for the measurements and the mechanism.
//
// Set before the config object so it is in `process.env` when jest forks its
// workers, which inherit it, and before `globalSetup` reads it.
process.env.PAF_TEST_REDIS_ISOLATION = 'none';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  // P-00: tests/db holds the real-database suites added by P-01. They need
  // a live Postgres, so the default run must not collect them -- otherwise
  // every developer without a database sees new failures. Run them with
  // `npm run test:db` (jest.db.config.ts).
  testPathIgnorePatterns: ['<rootDir>/tests/db/'],
  // Sets REDIS_URL to the explicit "no Redis" value, so this suite opens no
  // Redis connection at all. See tests/helpers/redis.ts.
  globalSetup: '<rootDir>/tests/helpers/redis.ts',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};

export default config;

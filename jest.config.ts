import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  // P-00: tests/db holds the real-database suites added by P-01. They need
  // a live Postgres, so the default run must not collect them -- otherwise
  // every developer without a database sees new failures. Run them with
  // `npm run test:db` (jest.db.config.ts).
  testPathIgnorePatterns: ['<rootDir>/tests/db/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};

export default config;

import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: false,
    }],
    '^.+\\.js$': ['ts-jest', {
      useESM: false,
    }],
  },
  transformIgnorePatterns: [
    '<rootDir>/node_modules/(?!uuid)',
  ],
};

export default config;

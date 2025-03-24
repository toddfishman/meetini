/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['./src/lib/smartScheduling/__tests__/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node']
};

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!@aits/)'
  ],
  moduleNameMapper: {
    '^@aits/(.*)$': '<rootDir>/../$1/src'
  },
  testTimeout: 60000, // 60s timeout for integration tests
  setupFilesAfterEnv: ['<rootDir>/src/setup.ts']
};

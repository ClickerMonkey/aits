module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testTimeout: 9999999,
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__integration__/**/*.test.ts'
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
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
    '!src/**/__integration__/**',
    '!src/index.ts',
    '!src/test.ts',  // Exclude development test file
    '!src/types.ts'  // Exclude type-only file
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};

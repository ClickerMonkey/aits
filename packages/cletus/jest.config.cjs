module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testTimeout: 30000,
  testMatch: [
    '**/__tests__/**/*.test.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.m?jsx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@aeye|uuid|file-type)/)'
  ],
  moduleNameMapper: {
    '^@aeye/(.*)$': '<rootDir>/../$1/src',
    '^file-type$': '<rootDir>/src/__mocks__/file-type.ts'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
    '!src/index.ts'
  ],
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};

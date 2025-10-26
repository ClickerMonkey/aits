# AITS Test Coverage

Documentation for measuring and improving test coverage across the AITS monorepo.

## Quick Start

### Run Coverage for All Packages

```bash
# From root directory
npm run test:coverage
```

### Run Coverage for Specific Package

```bash
# Core package
cd packages/core
npm run test:coverage

# AI package
cd packages/ai
npm run test:coverage

# OpenAI package (unit tests only, excludes integration)
cd packages/openai
npm run test:coverage
```

## Current Coverage Status

### @aits/core (23 tests)

| File | Statements | Branches | Functions | Lines | Status |
|------|-----------|----------|-----------|-------|--------|
| **tool.ts** | 88% | 80% | 80% | 92% | ✅ Well tested |
| **common.ts** | 42% | 43% | 26% | 45% | ⚠️ Needs more tests |
| **types.ts** | 0% | 0% | 0% | 0% | ❌ No tests (type definitions) |
| **agent.ts** | 0% | 0% | 0% | 0% | ❌ No tests |
| **prompt.ts** | 0% | 0% | 0% | 0% | ❌ No tests |
| **Overall** | **10%** | **11%** | **14%** | **10%** | ❌ Below 80% threshold |

**Priority Actions:**
1. Add tests for `agent.ts` - Core agent functionality
2. Add tests for `prompt.ts` - Template rendering with Handlebars
3. Increase `common.ts` coverage - Utility functions

### @aits/ai (27 tests)

| File | Statements | Branches | Functions | Lines | Status |
|------|-----------|----------|-----------|-------|--------|
| **registry.ts** | 74% | 56% | 76% | 74% | ✅ Well tested |
| **modelDetection.ts** | 8% | 0% | 0% | 8% | ❌ Needs tests |
| **ai.ts** | 0% | 0% | 0% | 0% | ❌ No tests (main class) |
| **apis/** | 0% | 0% | 0% | 0% | ❌ No tests (API layer) |
| **Overall** | **17%** | **16%** | **6%** | **17%** | ❌ Below 75% threshold |

**Priority Actions:**
1. Add tests for `ai.ts` - Main AI class with providers
2. Add tests for `apis/base.ts` - Base API functionality
3. Add tests for `apis/chat.ts` - Chat API
4. Add tests for `modelDetection.ts` - Tier detection logic

### @aits/openai (27 tests, 3 skipped)

| File | Statements | Branches | Functions | Lines | Status |
|------|-----------|----------|-----------|-------|--------|
| **openai.ts** | 36% | 28% | 65% | 36% | ⚠️ Moderate coverage |
| **types.ts** | 63% | 100% | 40% | 63% | ⚠️ Type utilities |
| **Overall** | **37%** | **28%** | **63%** | **37%** | ❌ Below 70% threshold |

**Coverage Gaps:**
- Streaming implementations (image, audio)
- Error handling paths
- Edge cases (rate limits, invalid responses)
- Tool call handling (Zod schema conversion)

**Note:** Integration tests with real API calls would cover more, but don't count toward unit test coverage.

## Coverage Tools

### Built-in (Jest)

Jest includes coverage reporting out of the box. No additional packages needed!

```bash
npm run test:coverage
```

**Output:**
- Terminal summary table
- Detailed HTML report in `coverage/` directory
- LCOV format for CI integration

### View HTML Coverage Report

After running coverage:

```bash
# Core package
cd packages/core
npm run test:coverage
open coverage/lcov-report/index.html  # macOS
# or
start coverage/lcov-report/index.html  # Windows
```

### Coverage Files Generated

```
packages/*/
├── coverage/
│   ├── lcov-report/        # HTML report (visual)
│   │   └── index.html
│   ├── lcov.info           # LCOV format (for CI tools)
│   ├── coverage-final.json # Raw coverage data
│   └── clover.xml          # Clover format
```

## Coverage Configuration

Coverage thresholds are set in each package's `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 80,   // 80% of branches covered
    functions: 80,  // 80% of functions covered
    lines: 80,      // 80% of lines covered
    statements: 80  // 80% of statements covered
  }
}
```

**Current Thresholds:**
- **@aits/core**: 80% (strict)
- **@aits/ai**: 75% (moderate)
- **@aits/openai**: 70% (relaxed, complex provider logic)

## Understanding Coverage Metrics

### Statement Coverage
**Percentage of executable statements that were run.**

```typescript
function example(x: number) {
  if (x > 0) {
    return "positive";  // ← Statement 1
  }
  return "non-positive"; // ← Statement 2
}

// Test: example(1) → 50% coverage (only statement 1)
// Need: example(-1) → 100% coverage (both statements)
```

### Branch Coverage
**Percentage of conditional paths that were tested.**

```typescript
function check(a: boolean, b: boolean) {
  if (a && b) {  // ← 4 branches: T&T, T&F, F&T, F&F
    return "both";
  }
  return "not both";
}

// Need tests for all combinations to reach 100%
```

### Function Coverage
**Percentage of functions that were called.**

```typescript
function used() { return 1; }
function unused() { return 2; }

// Test calling only used() → 50% function coverage
```

### Line Coverage
**Percentage of lines that were executed.**

Similar to statement coverage but counts by line numbers.

## Improving Coverage

### 1. Identify Gaps

```bash
cd packages/core
npm run test:coverage
```

Look for:
- **Uncovered Line #s** - Specific lines not tested
- **Red lines** in HTML report - Not executed
- **Yellow lines** in HTML report - Partially covered

### 2. Add Tests for Uncovered Code

Example: `agent.ts` has 0% coverage

```typescript
// Create: packages/core/src/__tests__/agent.test.ts

import { Agent } from '../agent';

describe('Agent', () => {
  it('should create agent with tools', () => {
    const agent = new Agent({
      name: 'test',
      description: 'Test agent',
      tools: []
    });

    expect(agent.name).toBe('test');
  });

  // Add more tests...
});
```

### 3. Test Edge Cases

Focus on:
- Error conditions
- Boundary values
- Optional parameters
- Different code paths (if/else)
- Async operations
- Streaming responses

### 4. Re-run Coverage

```bash
npm run test:coverage
```

Watch the percentages increase! 🎉

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Coverage

on: [push, pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:coverage

      # Upload to Codecov
      - uses: codecov/codecov-action@v3
        with:
          files: |
            packages/core/coverage/lcov.info
            packages/ai/coverage/lcov.info
            packages/openai/coverage/lcov.info
```

### Coverage Services (Optional)

Install external coverage visualization tools:

#### Codecov
```bash
npm install --save-dev codecov
```

#### Coveralls
```bash
npm install --save-dev coveralls
```

#### Istanbul (nyc)
Already included via Jest, no need to install separately.

## Coverage vs Quality

### ⚠️ Important Notes

**High coverage ≠ Good tests**

```typescript
// 100% coverage but bad test
it('should work', () => {
  const result = complexFunction(input);
  expect(result).toBeDefined(); // Too vague!
});

// Better test (same coverage)
it('should calculate correct total', () => {
  const result = complexFunction({ a: 1, b: 2 });
  expect(result.total).toBe(3);
  expect(result.breakdown).toEqual({ a: 1, b: 2 });
});
```

**Focus on:**
1. Testing behavior, not implementation
2. Edge cases and error paths
3. Real-world scenarios
4. Regression tests for bugs

**Don't chase:**
1. 100% coverage at all costs
2. Coverage for type definitions
3. Coverage for trivial getters/setters
4. Coverage for generated code

## Package Scripts Reference

```json
{
  "scripts": {
    "test": "jest",                           // Run all tests
    "test:coverage": "jest --coverage",       // Run with coverage
    "test:watch": "jest --watch",            // Watch mode
    "test:unit": "jest --testPathIgnorePatterns=__integration__",
    "test:integration": "jest --testPathPattern=__integration__"
  }
}
```

## FAQ

### Q: Why is my coverage report empty?

**A:** Make sure you have tests that actually call the code:
```bash
# Check if tests are running
npm test

# If tests pass but 0% coverage, your tests might be mocked too aggressively
```

### Q: How do I exclude files from coverage?

**A:** Update `jest.config.js`:
```javascript
coveragePathIgnorePatterns: [
  '/node_modules/',
  '/dist/',
  '/__tests__/',
  '/types.ts'  // Exclude specific file
]
```

### Q: Can I see coverage for integration tests?

**A:** Yes, but it's less useful since they test real APIs:
```bash
cd packages/openai
jest --coverage --testPathPattern=__integration__
```

### Q: Should I aim for 100% coverage?

**A:** Generally no. Aim for:
- **80-90%** for core logic (agents, tools, prompts)
- **70-80%** for complex providers (OpenAI, etc.)
- **60-70%** for integration layers
- Don't worry about type files, test utilities, or generated code

### Q: How do I see what specific lines aren't covered?

**A:** Open the HTML report:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

Red lines = not executed
Yellow lines = partially covered (some branches not tested)
Green lines = fully covered

## Next Steps

1. **Run coverage**: `npm run test:coverage`
2. **Check HTML report**: Open `coverage/lcov-report/index.html`
3. **Identify gaps**: Look for red/yellow lines
4. **Write tests**: Add tests for uncovered code
5. **Repeat**: Re-run coverage to see improvements

## Resources

- [Jest Coverage Documentation](https://jestjs.io/docs/configuration#collectcoverage-boolean)
- [Istanbul Coverage](https://istanbul.js.org/)
- [Codecov](https://codecov.io/)
- [Coveralls](https://coveralls.io/)

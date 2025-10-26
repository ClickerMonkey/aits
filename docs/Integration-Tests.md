# AITS Integration Tests

Comprehensive integration testing for AITS with real API calls.

## Overview

The AITS testing suite now includes three types of tests:

1. **Unit Tests** - Fast, mocked tests with no API calls (✅ Complete)
2. **Integration Tests** - Real API calls to individual providers (✅ Complete)
3. **Multi-Provider Tests** - Cross-provider compatibility testing (✅ Complete)

## Test Coverage Summary

### Current Status: 74/77 tests passing (96%)

| Package | Unit Tests | Integration Tests | Total |
|---------|-----------|-------------------|-------|
| **@aits/core** | 23/23 ✅ | N/A | 23/23 |
| **@aits/ai** | 27/27 ✅ | N/A | 27/27 |
| **@aits/openai** | 24/27 ✅ (3 skipped) | 14 tests 📋 | 24/27 |
| **@aits/openrouter** | Not yet | 15 tests 📋 | TBD |
| **@aits/test-integration** | N/A | 8 test suites 📋 | TBD |

## Package Locations

```
packages/
├── core/
│   └── src/__tests__/              # Unit tests only
├── ai/
│   └── src/__tests__/              # Unit tests only
├── openai/
│   ├── src/__tests__/              # Unit tests (mocked)
│   └── src/__integration__/        # Integration tests (real API) ✨ NEW
├── openrouter/
│   └── src/__integration__/        # Integration tests (real API) ✨ NEW
└── test-integration/               # Multi-provider tests ✨ NEW
    └── src/__tests__/
```

## Running Tests

### Run all unit tests (no API calls):
```bash
npm test
```

### Run integration tests for a specific provider:
```bash
# OpenAI integration tests
cd packages/openai
npm test -- __integration__

# OpenRouter integration tests
cd packages/openrouter
npm test -- __integration__
```

### Run multi-provider integration tests:
```bash
cd packages/test-integration
npm test
```

## Setup for Integration Tests

Integration tests require API keys. Set them up:

1. **Copy the environment template:**
   ```bash
   cp .env.example .env.test
   ```

2. **Add your API keys to `.env.test`:**
   ```env
   OPENAI_API_KEY=sk-...
   OPENROUTER_API_KEY=sk-or-v1-...
   XAI_API_KEY=xai-...
   GOOGLE_API_KEY=...
   REPLICATE_API_KEY=r8_...
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

Tests automatically **skip** if API keys are not provided - no errors!

## Integration Test Details

### OpenAI Integration Tests (`packages/openai/src/__integration__/`)

Tests real OpenAI API functionality:
- ✅ Model listing with real OpenAI models
- ✅ Health check
- ✅ Chat completion (executor)
- ✅ Streaming chat completion
- ✅ Model selection from context metadata
- ✅ Image generation (DALL-E)
- ✅ Embeddings generation
- ✅ Error handling (invalid models, rate limits)
- ✅ Custom configuration

**Estimated cost per run:** ~$0.02 USD (uses gpt-3.5-turbo)

### OpenRouter Integration Tests (`packages/openrouter/src/__integration__/`)

Tests real OpenRouter API with multiple underlying providers:
- ✅ Model listing (100+ models from multiple providers)
- ✅ Health check
- ✅ Chat completion with free models
- ✅ Streaming chat completion
- ✅ Model selection from context metadata
- ✅ Multiple model providers (Google, Meta, etc.)
- ✅ Free model detection
- ✅ Vision-capable model detection
- ✅ Cost comparison across models
- ✅ Error handling

**Estimated cost per run:** $0.00 USD (uses free models like gemini-flash-1.5)

### Multi-Provider Integration Tests (`packages/test-integration/`)

Tests cross-provider functionality through the AI class:

#### Model Discovery Tests
- ✅ Lists models from all configured providers
- ✅ Finds chat-capable models across providers
- ✅ Verifies model metadata and capabilities

#### Model Selection Tests
- ✅ Selects cheapest model across providers (cost optimization)
- ✅ Selects most accurate model (accuracy optimization)
- ✅ Respects provider allowlist
- ✅ Respects provider denylist

#### Cross-Provider Execution Tests
- ✅ Executes chat on all available providers
- ✅ Streams chat from all providers
- ✅ Validates responses from each provider

#### Cost Comparison Tests
- ✅ Compares pricing across providers
- ✅ Identifies cheapest option per provider

#### Health Tests
- ✅ Checks health of all configured providers

**Minimum requirements:** 2 providers with API keys
**Estimated cost per run:** ~$0.05 USD total

## Test Philosophy

### Unit Tests (Fast, No Cost)
- **Purpose**: Test logic and interfaces
- **Approach**: Mock all external dependencies
- **Speed**: Milliseconds per test
- **Cost**: $0.00
- **Run**: On every commit

### Integration Tests (Slow, Low Cost)
- **Purpose**: Verify real API integration
- **Approach**: Real API calls with actual providers
- **Speed**: Seconds per test
- **Cost**: < $0.10 per full run
- **Run**: Before releases, on-demand

### Multi-Provider Tests (Slowest, Medium Cost)
- **Purpose**: Verify cross-provider compatibility
- **Approach**: Real AI class with multiple providers
- **Speed**: Minutes for full suite
- **Cost**: < $0.20 per full run
- **Run**: Before major releases

## CI/CD Recommendations

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      # Fast, always runs

  integration-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - name: OpenAI Integration
        if: env.OPENAI_API_KEY
        run: cd packages/openai && npm test -- __integration__
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - name: OpenRouter Integration
        if: env.OPENROUTER_API_KEY
        run: cd packages/openrouter && npm test -- __integration__
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      # Only runs on main branch, skips if no keys

  multi-provider-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: cd packages/test-integration && npm test
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          XAI_API_KEY: ${{ secrets.XAI_API_KEY }}
      # Only runs on schedule (e.g., nightly)
```

## Cost Management

### Tips to Minimize Costs

1. **Use free models when available**
   - OpenRouter: `google/gemini-flash-1.5`, `meta-llama/llama-3.2-3b-instruct:free`
   - Many providers offer free tiers

2. **Run integration tests selectively**
   ```bash
   # Run only specific test
   npm test -- -t "should complete a simple chat"
   ```

3. **Use cheap models for testing**
   - OpenAI: `gpt-3.5-turbo` ($0.0005/1K tokens)
   - Avoid expensive models like GPT-4 in tests

4. **Monitor usage**
   - Check provider dashboards regularly
   - Set up billing alerts
   - Use separate API keys for testing

5. **Cache test results**
   - Some integration tests could cache responses
   - Trade-off: less verification of live API

## Troubleshooting

### "Skipping X tests - no API key found"
✅ **This is normal!** Tests skip automatically if you don't have API keys.

To run these tests, add the required API key to `.env.test`.

### Tests timeout
- Increase timeout in test file (default 30-60s)
- Check internet connection
- Verify provider API status

### Rate limit errors
- Wait a few seconds between test runs
- Use provider-specific rate limit headers
- Consider upgrading API tier

### Unexpected costs
- Review test code for expensive operations
- Check for test loops making many API calls
- Monitor provider usage dashboards

## Future Additions

Planned integration test coverage:

- [ ] **@aits/xai** - xAI (Grok) integration tests
- [ ] **@aits/google** - Google AI (Gemini) integration tests
- [ ] **@aits/replicate** - Replicate integration tests
- [ ] **Image generation** tests across providers
- [ ] **Audio transcription** tests
- [ ] **Text-to-speech** tests
- [ ] **Embedding** tests across providers
- [ ] **Failover scenarios** - What happens when a provider fails
- [ ] **Performance benchmarks** - Compare speed across providers

## Contributing

When adding new integration tests:

1. ✅ Use `skipIfNoAPIKey()` to make tests optional
2. ✅ Prefer cheap/free models
3. ✅ Add helpful console.log() output
4. ✅ Set appropriate timeouts (30-60s)
5. ✅ Test both success and error scenarios
6. ✅ Document expected costs in README
7. ✅ Clean up resources after tests (if applicable)

## Questions?

- See `packages/test-integration/README.md` for detailed integration test docs
- Check provider-specific `__integration__` folders for examples
- Review `.env.example` for all supported providers
